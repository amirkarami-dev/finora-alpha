using System.Globalization;
using Finora.BuildingBlocks.Domain;
using Finora.Erp.Application;
using Finora.Erp.Domain;
using Microsoft.EntityFrameworkCore;

namespace Finora.Erp.Infrastructure.Trade;

/// <summary>
/// Trade documents: six types, three statuses, and the conversion chain between them.
///
/// <para>
/// Every operation loads the whole invoice set. The chain rules are inherently global — what one
/// contract line has left depends on the deepest confirmed document of every other chain — and a
/// trading desk has hundreds of documents, not millions. Expressing these walks in SQL would be
/// possible and would be the first place a subtle divergence hid.
/// </para>
/// </summary>
public sealed class InvoiceService(ErpDbContext db)
{
    private static class Codes
    {
        public const string InvoiceNotFound = "invoice-not-found";
        public const string ContractNotFound = "contract-not-found";
        public const string ContractItemNotFound = "contract-item-not-found";
        public const string NotDraft = "not-draft";
        public const string NoItems = "no-items";
        public const string MissingLmePrice = "missing-lme-price";
        public const string MissingContainer = "missing-container";
        public const string NotConfirmed = "not-confirmed";
        public const string HasSuccessor = "has-successor";
        public const string InvalidTarget = "invalid-target";
        public const string CancelBlockedSuccessor = "cancel-blocked-successor";
        public const string CancelBlockedInventoryDoc = "cancel-blocked-inventory-doc";
        public const string LineInUse = "line-in-use";
        public const string InvoiceCancelled = "invoice-cancelled";
        public const string InvalidStatus = "invalid-status";
        public const string InvalidDiscount = "invalid-discount";
        public const string DuplicateNumber = "duplicate-number";
        public const string WeightsInvalid = "weights-invalid";
    }

    /* ---------------------------------- Reads ----------------------------------- */

    public async Task<IReadOnlyList<Invoice>> ListAsync(CancellationToken cancellationToken = default) =>
        await Query().AsNoTracking().ToListAsync(cancellationToken);

    private IQueryable<Invoice> Query() => db.Invoices.Include(i => i.Items).OrderBy(i => i.Id);

    /// <summary>Everything, tracked, for an operation that has to walk the chains and write.</summary>
    private async Task<List<Invoice>> LoadAllAsync(CancellationToken cancellationToken) =>
        await db.Invoices.Include(i => i.Items).ToListAsync(cancellationToken);

    /* --------------------------------- Creating --------------------------------- */

    public async Task<Invoice> CreateAsync(InvoiceInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        var type = ParseType(input.InvoiceType);
        var contract = await db.Contracts
            .SingleOrDefaultAsync(c => c.Id == input.ContractId, cancellationToken)
            ?? throw new NotFoundException(Codes.ContractNotFound);

        var currency = ParseCurrency(input.Currency);
        var exchangeRate = currency == Currency.USD
            ? 1m
            : (input.ExchangeRate ?? await FxRateAsync(cancellationToken));

        Invoice invoice = null!;
        await UniqueRetry.SaveWithOneRetryAsync(db, async () =>
        {
            // Re-read on every attempt: a retry follows a collision on the number, and the
            // second mint must see whatever the other writer just saved.
            var all = await LoadAllAsync(cancellationToken);
            invoice = new Invoice
            {
                Id = NextInvoiceId(all, type),
                InvoiceNumber = NextNumber(all, input.InvoiceDate),
                InvoiceType = type,
                // Npgsql only accepts offset-zero values for `timestamptz`; the instant is
                // unchanged, only its representation. The number above is computed from the
                // original offset, so Gulf-time month boundaries are unaffected.
                InvoiceDate = input.InvoiceDate.ToUniversalTime(),
                ContractId = contract.Id,
                // Copied once, never re-read. Reassigning the contract later must not silently
                // re-bill every document raised against it.
                CustomerId = contract.CustomerId,
                Status = InvoiceStatus.DRAFT,
                Currency = currency,
                ExchangeRate = exchangeRate,
                Description = Blank(input.Description),
            };

            db.Invoices.Add(invoice);
        }, Codes.DuplicateNumber, cancellationToken);

        return await SingleAsync(invoice.Id, cancellationToken);
    }

    public async Task<Invoice> UpdateHeaderAsync(
        string id, InvoiceHeaderPatch patch, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(patch);

        // The whole patch runs inside the mint-and-add lambda, not just the number: a collision
        // clears the change tracker, so anything set on `invoice` before that point would be
        // silently lost on retry unless it is re-applied to a freshly loaded entity too.
        await UniqueRetry.SaveWithOneRetryAsync(db, async () =>
        {
            var all = await LoadAllAsync(cancellationToken);
            var invoice = Find(all, id);
            RequireDraft(invoice);

            if (patch.InvoiceDate is { } date)
            {
                invoice.InvoiceDate = date.ToUniversalTime();

                // A DRAFT's number carries the month it was minted in. Moving the date to
                // another month would leave that promise broken — a document numbered 2609...
                // dated in October — so the number is re-minted in the destination month's own
                // sequence. Staying within the same month leaves the number untouched.
                var newMonth = date.ToOffset(Numbering.GulfOffset)
                    .ToString("yyMM", CultureInfo.InvariantCulture);
                if (!invoice.InvoiceNumber.StartsWith(newMonth, StringComparison.Ordinal))
                {
                    invoice.InvoiceNumber = NextNumber(all, date);
                }
            }

            if (patch.Currency is not null)
            {
                invoice.Currency = ParseCurrency(patch.Currency);
                invoice.ExchangeRate = invoice.Currency == Currency.USD
                    ? 1m
                    : (patch.ExchangeRate ?? await FxRateAsync(cancellationToken));
            }
            else if (patch.ExchangeRate is { } rate && invoice.Currency != Currency.USD)
            {
                invoice.ExchangeRate = rate;
            }

            if (patch.Description is not null)
            {
                invoice.Description = Blank(patch.Description);
            }
        }, Codes.DuplicateNumber, cancellationToken);

        return await SingleAsync(id, cancellationToken);
    }

    /* ----------------------------------- Lines ---------------------------------- */

    /// <summary>
    /// Adds lines, all or nothing.
    ///
    /// <para>
    /// Validated in a full pass before anything is written, because a call that added two lines
    /// and then refused the third would leave a document the user never asked for. Each entry is
    /// measured against the ceiling INCLUDING the entries staged before it in the same call —
    /// without that, three lines of forty tonnes each pass individually against a hundred-tonne
    /// contract line.
    /// </para>
    /// </summary>
    public async Task<Invoice> AddItemsAsync(
        string id, IReadOnlyList<InvoiceItemInput> items, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(items);

        var all = await LoadAllAsync(cancellationToken);
        var invoice = Find(all, id);
        RequireDraft(invoice);

        var contract = await LoadContractAsync(invoice.ContractId, cancellationToken);
        var side = InvoiceMath.SideOf(invoice.InvoiceType);

        // Resolved up front, so a bad weight on the third line refuses the whole post before
        // the first line is staged — same all-or-nothing as the contract guard below.
        var resolved = items
            .Select(i => ResolveWeights(invoice.InvoiceType, i.QuantityMt, i.GrossMt, i.TareMt))
            .ToList();
        var quantities = resolved.Select(r => r.QuantityMt).ToList();
        var staged = new Dictionary<string, decimal>(StringComparer.Ordinal);

        for (var index = 0; index < items.Count; index++)
        {
            var entry = items[index];
            var contractItem = contract.Items.SingleOrDefault(i => i.Id == entry.ContractItemId)
                ?? throw new NotFoundException(Codes.ContractItemNotFound);

            var check = ContractQuantityGuard.Check(
                all, contractItem, side, invoice.Id, quantities[index],
                extraOnDocMt: staged.GetValueOrDefault(contractItem.Id));

            if (check.Exceeds)
            {
                throw ContractQuantityGuard.Exceeded(check, contractItem.Product);
            }

            staged[contractItem.Id] = staged.GetValueOrDefault(contractItem.Id) + quantities[index];
        }

        for (var index = 0; index < items.Count; index++)
        {
            var entry = items[index];
            var contractItem = contract.Items.Single(i => i.Id == entry.ContractItemId);

            var line = new InvoiceItem
            {
                Id = NextItemId(all),
                InvoiceId = invoice.Id,
                ContractItemId = contractItem.Id,
                // Reuse the chain's identity when this document was converted from one that
                // already carried this good; otherwise mint. Evaluated per line, against the
                // collection as it stands, so a second line for the same good gets its own.
                ReferenceDocumentItemId =
                    InvoiceMath.ChainReferenceDocumentItemId(all, invoice, contractItem.Id)
                    ?? Guid.CreateVersion7().ToString(),
                // Pricing is a snapshot taken now, never a live read of the contract. Editing a
                // contract line's LME must not silently reprice a confirmed, paid, printed invoice.
                Product = contractItem.Product,
                QuantityMt = quantities[index],
                GrossMt = resolved[index].GrossMt,
                TareMt = resolved[index].TareMt,
                LmePercent = contractItem.LmePercent,
                LmeFixed = contractItem.LmeFixed,
                FixedPrice = contractItem.FixedLmePrice,
                Premium = contractItem.Premium,
                ContainerId = Blank(entry.ContainerId),
                Description = Blank(entry.Description),
            };

            InvoiceMath.RecomputeItemAmount(line);
            invoice.Items.Add(line);
        }

        InvoiceMath.RecomputeInvoiceTotals(invoice);
        await SaveAndRecomputeRemainingAsync(cancellationToken);
        return await SingleAsync(invoice.Id, cancellationToken);
    }

    /// <summary>
    /// Edits one line.
    ///
    /// <para>
    /// The quantity ceiling is checked only when the quantity goes UP. That is deliberate, not an
    /// oversight: the edit form posts every field back, so a rival document confirming in the
    /// meantime would otherwise make an unrelated container correction impossible to save.
    /// Lowering a quantity, or resubmitting it unchanged, can never make an overshoot worse.
    /// </para>
    /// </summary>
    public async Task<Invoice> UpdateItemAsync(
        string id, string itemId, InvoiceItemPatch patch, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(patch);

        var all = await LoadAllAsync(cancellationToken);
        var invoice = Find(all, id);
        RequireDraft(invoice);

        var line = invoice.Items.SingleOrDefault(i => i.Id == itemId)
            ?? throw new NotFoundException("invoice-item-not-found");

        // On an invoice type the weights are the input and the net follows; on an order the
        // quantity is the input. A patch that names none of them leaves the line's quantities.
        var priced = InvoiceMath.IsPricedType(invoice.InvoiceType);
        var touchesQuantity = priced
            ? patch.GrossMt is not null || patch.TareMt is not null
            : patch.QuantityMt is not null;

        if (touchesQuantity)
        {
            var (quantity, gross, tare) = ResolveWeights(
                invoice.InvoiceType,
                patch.QuantityMt,
                patch.GrossMt ?? line.GrossMt,
                patch.TareMt ?? line.TareMt);

            if (quantity > line.QuantityMt)
            {
                var contract = await LoadContractAsync(invoice.ContractId, cancellationToken);
                var contractItem = contract.Items.SingleOrDefault(i => i.Id == line.ContractItemId);
                var check = ContractQuantityGuard.Check(
                    all, contractItem, InvoiceMath.SideOf(invoice.InvoiceType), invoice.Id, quantity,
                    excludeInvoiceItemIds: [line.Id]);

                if (check.Exceeds)
                {
                    throw ContractQuantityGuard.Exceeded(check, line.Product);
                }
            }

            line.QuantityMt = quantity;
            line.GrossMt = gross;
            line.TareMt = tare;
        }

        if (patch.ContainerId is not null)
        {
            line.ContainerId = Blank(patch.ContainerId);
        }

        if (patch.Description is not null)
        {
            line.Description = Blank(patch.Description);
        }

        if (patch.DiscountPercent is { } discount)
        {
            line.DiscountPercent = RequireDiscountInRange(discount);
        }

        InvoiceMath.RecomputeItemAmount(line);
        InvoiceMath.RecomputeInvoiceTotals(invoice);
        await SaveAndRecomputeRemainingAsync(cancellationToken);
        return await SingleAsync(invoice.Id, cancellationToken);
    }

    /// <summary>
    /// Removes a line.
    ///
    /// <para>
    /// The browser checks only that the document is a draft. This also refuses when something
    /// downstream is keyed to the line: a warehouse receipt, a booked cost, a claim or a payment
    /// allocation. Removing it there leaves those rows pointing at an identity nothing resolves —
    /// received stock with no source line, and a charge that can no longer be edited because its
    /// own good is gone.
    /// </para>
    /// </summary>
    public async Task<Invoice> RemoveItemAsync(
        string id, string itemId, CancellationToken cancellationToken = default)
    {
        var all = await LoadAllAsync(cancellationToken);
        var invoice = Find(all, id);
        RequireDraft(invoice);

        var line = invoice.Items.SingleOrDefault(i => i.Id == itemId)
            ?? throw new NotFoundException("invoice-item-not-found");

        var reference = line.ReferenceDocumentItemId;
        var usedBy = new List<string>();

        if (await db.InventoryDocumentItems.AnyAsync(
                i => i.ReferenceDocumentItemId == reference, cancellationToken))
        {
            usedBy.Add("warehouse");
        }

        if (await db.ChargeAllocations.AnyAsync(
                a => a.ReferenceDocumentItemId == reference, cancellationToken))
        {
            usedBy.Add("charges");
        }

        if (await db.ClaimItems.AnyAsync(
                c => c.ReferenceDocumentItemId == reference, cancellationToken))
        {
            usedBy.Add("claims");
        }

        if (await db.PaymentItemAllocations.AnyAsync(
                a => a.ReferenceDocumentItemId == reference, cancellationToken))
        {
            usedBy.Add("payments");
        }

        if (usedBy.Count > 0)
        {
            throw new DomainException(Codes.LineInUse, new Dictionary<string, object?>
            {
                ["product"] = line.Product,
                ["usedBy"] = usedBy,
            });
        }

        invoice.Items.Remove(line);
        db.InvoiceItems.Remove(line);

        InvoiceMath.RecomputeInvoiceTotals(invoice);
        await SaveAndRecomputeRemainingAsync(cancellationToken);
        return await SingleAsync(invoice.Id, cancellationToken);
    }

    /// <summary>
    /// Applies the day's quotation.
    ///
    /// <para>The price lands on floating lines only — a fixed line keeps what its contract locked.
    /// The discount, when given, applies to every line; omitted, existing per-line discounts are
    /// left alone rather than cleared.</para>
    /// </summary>
    public async Task<Invoice> ApplyLmePriceAsync(
        string id, ApplyLmePriceInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        var all = await LoadAllAsync(cancellationToken);
        var invoice = Find(all, id);
        RequireDraft(invoice);

        var discount = input.DiscountPercent is { } value ? RequireDiscountInRange(value) : (decimal?)null;

        foreach (var line in invoice.Items)
        {
            line.LmeDate = input.LmeDate;
            if (!line.LmeFixed)
            {
                line.LmePrice = input.LmePrice;
            }

            if (discount is not null)
            {
                line.DiscountPercent = discount;
            }

            InvoiceMath.RecomputeItemAmount(line);
        }

        InvoiceMath.RecomputeInvoiceTotals(invoice);
        await db.SaveChangesAsync(cancellationToken);
        return await SingleAsync(invoice.Id, cancellationToken);
    }

    /* --------------------------------- Lifecycle -------------------------------- */

    /// <summary>
    /// Confirms a draft. Guards in order: still a draft, has lines, priced, containers assigned,
    /// and within the contract.
    ///
    /// <para>
    /// The quantity re-check groups this document's lines by contract line and tests each group's
    /// total once. Checked line by line, three lines of thirty tonnes each pass against a
    /// forty-tonne remainder and jointly overshoot by fifty.
    /// </para>
    /// </summary>
    public async Task<Invoice> ConfirmAsync(string id, CancellationToken cancellationToken = default)
    {
        var all = await LoadAllAsync(cancellationToken);
        var invoice = Find(all, id);
        RequireDraft(invoice);

        if (invoice.Items.Count == 0)
        {
            throw new DomainException(Codes.NoItems);
        }

        if (InvoiceMath.IsPricedType(invoice.InvoiceType))
        {
            if (invoice.Items.Any(i => !i.LmeFixed && i.LmePrice is null))
            {
                throw new DomainException(Codes.MissingLmePrice);
            }

            var withoutContainer = invoice.Items
                .Where(i => string.IsNullOrEmpty(i.ContainerId))
                .Select(i => i.Product)
                .ToList();

            if (withoutContainer.Count > 0)
            {
                // Line order, duplicates kept: the dialog lists one entry per line, not per good.
                throw new DomainException(Codes.MissingContainer, new Dictionary<string, object?>
                {
                    ["products"] = withoutContainer,
                });
            }
        }

        var contract = await LoadContractAsync(invoice.ContractId, cancellationToken);
        var side = InvoiceMath.SideOf(invoice.InvoiceType);

        foreach (var group in invoice.Items.GroupBy(i => i.ContractItemId, StringComparer.Ordinal))
        {
            var contractItem = contract.Items.SingleOrDefault(i => i.Id == group.Key);
            var check = ContractQuantityGuard.Check(
                all, contractItem, side, invoice.Id,
                requestedMt: group.Sum(i => i.QuantityMt),
                excludeInvoiceItemIds: group.Select(i => i.Id).ToList());

            if (check.Exceeds)
            {
                throw ContractQuantityGuard.Exceeded(check, group.First().Product);
            }
        }

        invoice.Status = InvoiceStatus.CONFIRMED;
        await SaveAndRecomputeRemainingAsync(cancellationToken);
        return await SingleAsync(invoice.Id, cancellationToken);
    }

    /// <summary>
    /// Cancels a document, returning its quantity to the contract.
    ///
    /// <para>
    /// Refused while a live successor exists — the chain must be unwound from the tip — and while
    /// a warehouse document still draws on it. Without the second guard, cancelling frees the
    /// contract quantity while the receipt keeps its claim on the goods, and a replacement
    /// document mints a fresh line identity that can receive the same metal twice.
    /// </para>
    /// </summary>
    public async Task<Invoice> CancelAsync(string id, CancellationToken cancellationToken = default)
    {
        var all = await LoadAllAsync(cancellationToken);
        var invoice = Find(all, id);

        if (invoice.Status == InvoiceStatus.CANCELLED)
        {
            return await SingleAsync(invoice.Id, cancellationToken);
        }

        if (InvoiceMath.FindSuccessor(all, invoice.Id) is not null)
        {
            throw new DomainException(Codes.CancelBlockedSuccessor);
        }

        if (await db.InventoryDocuments.AnyAsync(
                d => d.InvoiceId == invoice.Id && d.Status != DocumentStatus.CANCELLED, cancellationToken))
        {
            throw new DomainException(Codes.CancelBlockedInventoryDoc);
        }

        invoice.Status = InvoiceStatus.CANCELLED;
        await SaveAndRecomputeRemainingAsync(cancellationToken);
        return await SingleAsync(invoice.Id, cancellationToken);
    }

    /// <summary>
    /// Creates the next document in the chain.
    ///
    /// <para>
    /// Lines are copied whole. Every field carries across — above all the chain-stable line
    /// identity, which is what keeps a cost booked against the provisional attached to the invoice
    /// it becomes, and what stops the warehouse receiving the same metal twice. Prices carry only
    /// from a provisional; an order has none to give.
    /// </para>
    /// </summary>
    public async Task<Invoice> ConvertAsync(
        string id, string targetType, CancellationToken cancellationToken = default)
    {
        var all = await LoadAllAsync(cancellationToken);
        var source = Find(all, id);
        var target = ParseType(targetType);

        if (source.Status != InvoiceStatus.CONFIRMED)
        {
            throw new DomainException(Codes.NotConfirmed);
        }

        if (InvoiceMath.FindSuccessor(all, source.Id) is not null)
        {
            throw new DomainException(Codes.HasSuccessor);
        }

        if (!InvoiceMath.ConvertTargets(source.InvoiceType).Contains(target))
        {
            throw new DomainException(Codes.InvalidTarget);
        }

        var carryPrices = source.InvoiceType
            is InvoiceType.PURCHASE_PROVISIONAL or InvoiceType.SALE_PROVISIONAL;

        Invoice successor = null!;
        await UniqueRetry.SaveWithOneRetryAsync(db, async () =>
        {
            // Re-read on every attempt, same reason as CreateAsync: a retry follows a collision
            // on the number, and the source's items must come from a tracked, non-detached
            // entity after a collision clears the change tracker.
            var candidates = await LoadAllAsync(cancellationToken);
            var current = Find(candidates, id);
            var today = DateTimeOffset.UtcNow;

            successor = new Invoice
            {
                Id = NextInvoiceId(candidates, target),
                InvoiceNumber = NextNumber(candidates, today),
                InvoiceType = target,
                InvoiceDate = today,
                ContractId = current.ContractId,
                CustomerId = current.CustomerId,
                Status = InvoiceStatus.DRAFT,
                Currency = current.Currency,
                ExchangeRate = current.ExchangeRate,
                Description = current.Description,
                RefInvoiceId = current.Id,
            };

            var seq = 0;
            foreach (var line in current.Items)
            {
                successor.Items.Add(new InvoiceItem
                {
                    Id = NextItemId(candidates, seq++),
                    InvoiceId = successor.Id,
                    ContractItemId = line.ContractItemId,
                    // The whole point of the chain. A fresh identity here would silently break
                    // warehouse de-duplication and orphan every cost booked on the predecessor.
                    ReferenceDocumentItemId = line.ReferenceDocumentItemId,
                    Product = line.Product,
                    QuantityMt = line.QuantityMt,
                    // Every convert target is an invoice type, which must carry weights. A line
                    // that came from an order has none yet, so gross starts as the quantity and
                    // tare as zero — valid at once, corrected when the goods are weighed.
                    GrossMt = line.GrossMt ?? line.QuantityMt,
                    TareMt = line.TareMt ?? 0m,
                    LmePercent = line.LmePercent,
                    LmeFixed = line.LmeFixed,
                    FixedPrice = line.FixedPrice,
                    Premium = line.Premium,
                    LmePrice = carryPrices ? line.LmePrice : null,
                    LmeDate = carryPrices ? line.LmeDate : null,
                    DiscountPercent = carryPrices ? line.DiscountPercent : null,
                    ContainerId = line.ContainerId,
                    Description = line.Description,
                    Amount = 0m,
                });
            }

            foreach (var line in successor.Items)
            {
                InvoiceMath.RecomputeItemAmount(line);
            }

            InvoiceMath.RecomputeInvoiceTotals(successor);
            db.Invoices.Add(successor);
        }, Codes.DuplicateNumber, cancellationToken);

        await RecomputeAllRemainingAsync(db, cancellationToken);
        return await SingleAsync(successor.Id, cancellationToken);
    }

    /// <summary>
    /// Stamps the document as sent.
    ///
    /// <para>The browser stamps anything, including a cancelled document. A cancelled invoice that
    /// claims to have been sent is a statement about the outside world that is simply untrue, so
    /// it is refused.</para>
    /// </summary>
    public async Task<Invoice> MarkSentAsync(string id, CancellationToken cancellationToken = default)
    {
        var all = await LoadAllAsync(cancellationToken);
        var invoice = Find(all, id);

        if (invoice.Status == InvoiceStatus.CANCELLED)
        {
            throw new DomainException(Codes.InvoiceCancelled);
        }

        invoice.SentAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return await SingleAsync(invoice.Id, cancellationToken);
    }

    /* ---------------------------------- Shared ---------------------------------- */

    /// <summary>
    /// Saves, then rewrites every contract line's remaining quantity from what the documents now
    /// say.
    ///
    /// <para>
    /// A full sweep rather than a delta. The figure depends on which documents are chain leaves,
    /// which changes when anything converts or cancels — so an incremental update would have to
    /// know which lines a status change touched, and that is exactly the reasoning that goes
    /// wrong quietly.
    /// </para>
    /// </summary>
    private async Task SaveAndRecomputeRemainingAsync(CancellationToken cancellationToken)
    {
        await db.SaveChangesAsync(cancellationToken);
        await RecomputeAllRemainingAsync(db, cancellationToken);
    }

    /// <summary>
    /// Public so contract edits can call it too: adding or editing a goods line must not reset a
    /// line that documents have already drawn on.
    /// </summary>
    public static async Task RecomputeAllRemainingAsync(ErpDbContext db, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(db);

        var all = await db.Invoices.Include(i => i.Items).ToListAsync(cancellationToken);
        var items = await db.ContractItems.ToListAsync(cancellationToken);

        foreach (var item in items)
        {
            item.RemainingMt = Rounding.Quantity(
                Math.Max(item.QuantityMt - InvoiceMath.ShippedMtForItem(all, item.Id), 0m));
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private static Invoice Find(IReadOnlyCollection<Invoice> all, string id) =>
        all.FirstOrDefault(i => i.Id == id) ?? throw new NotFoundException(Codes.InvoiceNotFound);

    private static void RequireDraft(Invoice invoice)
    {
        if (invoice.Status != InvoiceStatus.DRAFT)
        {
            throw new DomainException(Codes.NotDraft);
        }
    }

    private static decimal RequireDiscountInRange(decimal value) =>
        value is >= 0m and <= 100m
            ? value
            : throw new DomainException(Codes.InvalidDiscount,
                new Dictionary<string, object?> { ["value"] = value });

    /// <summary>
    /// What a line stores, from what the caller sent, by document type (spec §2).
    ///
    /// <para>An order is written before the goods are weighed, so it takes a quantity and
    /// stores no weights. The four invoice types take gross and tare; the net is gross − tare
    /// and is computed HERE — a client's <c>quantityMt</c> is ignored on those types, so no
    /// screen can ever save a net that disagrees with its own gross and tare.</para>
    /// </summary>
    private static (decimal QuantityMt, decimal? GrossMt, decimal? TareMt) ResolveWeights(
        InvoiceType type, decimal? quantityMt, decimal? grossMt, decimal? tareMt)
    {
        if (!InvoiceMath.IsPricedType(type))
        {
            var quantity = Rounding.Quantity(quantityMt ?? 0m);
            return quantity > 0m ? (quantity, null, null) : throw WeightsInvalid("quantity");
        }

        if (grossMt is not { } grossRaw || Rounding.Quantity(grossRaw) <= 0m)
        {
            throw WeightsInvalid("gross");
        }

        if (tareMt is not { } tareRaw || Rounding.Quantity(tareRaw) < 0m)
        {
            throw WeightsInvalid("tare");
        }

        var gross = Rounding.Quantity(grossRaw);
        var tare = Rounding.Quantity(tareRaw);
        if (tare >= gross)
        {
            throw WeightsInvalid("tare-exceeds-gross");
        }

        return (Rounding.Quantity(gross - tare), gross, tare);
    }

    private static DomainException WeightsInvalid(string rule) =>
        new(Codes.WeightsInvalid, new Dictionary<string, object?> { ["rule"] = rule });

    private async Task<Contract> LoadContractAsync(string id, CancellationToken cancellationToken) =>
        await db.Contracts.Include(c => c.Items)
            .SingleOrDefaultAsync(c => c.Id == id, cancellationToken)
        ?? throw new NotFoundException(Codes.ContractNotFound);

    private async Task<Invoice> SingleAsync(string id, CancellationToken cancellationToken) =>
        await Query().AsNoTracking().SingleAsync(i => i.Id == id, cancellationToken);

    private async Task<decimal> FxRateAsync(CancellationToken cancellationToken)
    {
        var stored = await db.Settings.AsNoTracking()
            .Where(s => s.Key == "fxRate").Select(s => s.Value)
            .SingleOrDefaultAsync(cancellationToken);

        return stored is null ? 3.6725m : decimal.Parse(stored, CultureInfo.InvariantCulture);
    }

    private static InvoiceType ParseType(string value) =>
        Enum.TryParse<InvoiceType>(value, ignoreCase: false, out var parsed)
            ? parsed
            : throw new DomainException(Codes.InvalidTarget,
                new Dictionary<string, object?> { ["value"] = value });

    private static Currency ParseCurrency(string? value) =>
        string.IsNullOrWhiteSpace(value)
            ? Currency.USD
            : Enum.TryParse<Currency>(value, ignoreCase: false, out var parsed)
                ? parsed
                : throw new DomainException(Codes.InvalidStatus,
                    new Dictionary<string, object?> { ["value"] = value });

    private static string? Blank(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }

    /* --------------------------------- Numbering -------------------------------- */

    private static readonly Dictionary<InvoiceType, string> IdPrefix = new()
    {
        [InvoiceType.PURCHASE_ORDER] = "po",
        [InvoiceType.PURCHASE_PROVISIONAL] = "pp",
        [InvoiceType.PURCHASE_INVOICE] = "pi",
        [InvoiceType.SALE_ORDER] = "so",
        [InvoiceType.SALE_PROVISIONAL] = "sp",
        [InvoiceType.SALE_INVOICE] = "si",
    };

    /// <summary>
    /// The next document number: <c>YYMM</c> of the document's date plus four digits, counted
    /// across every type and every status — cancelled and old-style numbers included — so a
    /// number is never issued twice. See <see cref="Numbering.NextDocumentNumber"/>.
    /// </summary>
    private static string NextNumber(IEnumerable<Invoice> all, DateTimeOffset date) =>
        Numbering.NextDocumentNumber(date, all.Select(i => i.InvoiceNumber));

    private static string NextInvoiceId(IReadOnlyCollection<Invoice> all, InvoiceType type)
    {
        var prefix = string.Create(CultureInfo.InvariantCulture, $"inv-{IdPrefix[type]}-");
        var highest = 0;
        foreach (var invoice in all.Where(i => i.Id.StartsWith(prefix, StringComparison.Ordinal)))
        {
            if (int.TryParse(invoice.Id[prefix.Length..], CultureInfo.InvariantCulture, out var n))
            {
                highest = Math.Max(highest, n);
            }
        }

        return string.Create(CultureInfo.InvariantCulture, $"{prefix}{highest + 1:D4}");
    }

    /// <summary>Monotonic across every document. <paramref name="offset"/> lets one call mint a
    /// run of them without re-reading the set between each.</summary>
    private static string NextItemId(IReadOnlyCollection<Invoice> all, int offset = 0)
    {
        var highest = 0;
        foreach (var line in all.SelectMany(i => i.Items))
        {
            if (line.Id.StartsWith("invitem-", StringComparison.Ordinal) &&
                int.TryParse(line.Id["invitem-".Length..], CultureInfo.InvariantCulture, out var n))
            {
                highest = Math.Max(highest, n);
            }
        }

        return string.Create(CultureInfo.InvariantCulture, $"invitem-{highest + 1 + offset}");
    }
}
