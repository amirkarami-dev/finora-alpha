using Finora.BuildingBlocks.Domain;
using Finora.Erp.Application;
using Finora.Erp.Domain;
using Finora.Erp.Infrastructure.Trade;
using Microsoft.EntityFrameworkCore;

namespace Finora.Erp.Infrastructure.Money;

/// <summary>
/// Expenses and revenues — one mirrored implementation, because "who was this revenue from" is
/// as meaningful as "who was this expense to".
///
/// <para>
/// A document may be GENERAL, or booked against one trade document, in which case each line
/// spreads across that document's goods. Every USD figure is built from the leaf upwards: an
/// allocation converts, then a line sums its allocations, then the document sums its lines. It is
/// never a parent total converted once and divided — that rounds twice and leaves the printed
/// total a cent away from the rows beneath it.
/// </para>
/// </summary>
public sealed class ChargeService(ErpDbContext db)
{
    internal static class Codes
    {
        public const string DocNotFound = "charge-doc-not-found";
        public const string DocCancelled = "doc-cancelled";
        public const string LineNotFound = "charge-line-not-found";
        public const string TitleRequired = "title-required";
        public const string DateRequired = "date-required";
        public const string InvoiceRequired = "invoice-required";
        public const string InvoiceNotFound = "invoice-not-found";
        public const string InvoiceNotConfirmed = "invoice-not-confirmed";
        public const string InvoiceImmutable = "invoice-immutable";
        public const string KindImmutable = "kind-immutable";
        public const string DirectionImmutable = "direction-immutable";

        public const string CategoryRequired = "category-required";
        public const string CategoryNotFound = "category-not-found";
        public const string CategoryInactive = "category-inactive";
        public const string CategoryMismatch = "category-mismatch";
        public const string InvalidAmount = "invalid-amount";
        public const string InvalidFx = "invalid-fx";
        public const string PersonRequired = "person-required";
        public const string PersonNotFound = "person-not-found";
        public const string CostCentreNotFound = "cost-centre-not-found";

        public const string GoodsNotAllowed = "goods-not-allowed";
        public const string GoodsRequired = "goods-required";
        public const string GoodNotOnInvoice = "good-not-on-invoice";
        public const string DuplicateGood = "duplicate-good";
        public const string InvalidGoodAmount = "invalid-good-amount";
    }

    /// <summary>
    /// Splits an amount into <paramref name="n"/> equal parts, in whole cents, with the leftover
    /// cents going to the FIRST parts.
    ///
    /// <para>
    /// Not <c>amount / n</c>. Splitting 100 three ways gives 33.34, 33.33, 33.33 — the parts add
    /// back to exactly the whole, and they match every row the browser has already written.
    /// Dividing instead leaves a repeating remainder and a total that is a cent short.
    /// </para>
    /// </summary>
    internal static decimal[] SplitEqually(decimal amount, int n)
    {
        if (n <= 0)
        {
            return [];
        }

        var totalCents = (long)Rounding.Money(amount * 100m);
        var each = totalCents / n;
        var remainder = totalCents - (each * n);

        return [.. Enumerable.Range(0, n).Select(i => (each + (i < remainder ? 1 : 0)) / 100m)];
    }

    public async Task<List<ChargeDoc>> ListAsync(CancellationToken cancellationToken = default) =>
        await db.ChargeDocs
            .Include(d => d.Lines).ThenInclude(l => l.Allocations)
            .OrderBy(d => d.Id)
            .ToListAsync(cancellationToken);

    /* -------------------------------- Documents ------------------------------- */

    public async Task<ChargeDoc> CreateAsync(
        ChargeDocInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        var title = input.Title.Trim();
        if (title.Length == 0)
        {
            throw new DomainException(Codes.TitleRequired);
        }

        if (input.Date == default)
        {
            throw new DomainException(Codes.DateRequired);
        }

        string? invoiceId = null;
        if (input.Kind == ChargeScope.INVOICE)
        {
            if (string.IsNullOrWhiteSpace(input.InvoiceId))
            {
                throw new DomainException(Codes.InvoiceRequired);
            }

            var invoices = await db.Invoices.Include(i => i.Items).ToListAsync(cancellationToken);
            var invoice = invoices.FirstOrDefault(i => i.Id == input.InvoiceId)
                ?? throw new DomainException(Codes.InvoiceNotFound);

            var side = InvoiceMath.SideOf(invoice.InvoiceType);
            var isLeaf = InvoiceMath.IsPricedType(invoice.InvoiceType) &&
                         InvoiceMath.ChainLeafDocs(invoices, side, includeDraft: false)
                             .Exists(i => i.Id == invoice.Id);
            if (!isLeaf)
            {
                throw new DomainException(Codes.InvoiceNotConfirmed);
            }

            invoiceId = invoice.Id;
        }

        var doc = new ChargeDoc
        {
            Id = await NextDocIdAsync(cancellationToken),
            Direction = input.Direction,
            Kind = input.Kind,
            Title = title,
            InvoiceId = invoiceId,
            Date = input.Date,
            Description = Trimmed(input.Description),
            Status = RecordStatus.ACTIVE,
            CreatedAt = input.Date,
            TotalUSD = 0m,
        };

        db.ChargeDocs.Add(doc);
        await db.SaveChangesAsync(cancellationToken);
        return doc;
    }

    /// <summary>
    /// Header edits only, and deliberately NO re-validation of the booked document.
    ///
    /// <para>That is the point of keeping the booking immutable: renaming an expense long after
    /// the provisional it was booked against became a final one must not start failing.</para>
    /// </summary>
    public async Task<ChargeDoc> UpdateAsync(
        string id, ChargeDocInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        var doc = await LoadAsync(id, cancellationToken);
        RefuseWhenCancelled(doc);

        var title = input.Title.Trim();
        if (title.Length == 0)
        {
            throw new DomainException(Codes.TitleRequired);
        }

        if (input.Date == default)
        {
            throw new DomainException(Codes.DateRequired);
        }

        if (input.InvoiceId != doc.InvoiceId)
        {
            throw new DomainException(Codes.InvoiceImmutable);
        }

        if (input.Kind != doc.Kind)
        {
            throw new DomainException(Codes.KindImmutable);
        }

        if (input.Direction != doc.Direction)
        {
            throw new DomainException(Codes.DirectionImmutable);
        }

        doc.Title = title;
        doc.Date = input.Date;
        doc.Description = Trimmed(input.Description);

        await db.SaveChangesAsync(cancellationToken);
        return doc;
    }

    /// <summary>Cancels. Never deletes — every total excludes cancelled documents by its own
    /// filter, so the record stays readable.</summary>
    public async Task<ChargeDoc> CancelAsync(string id, CancellationToken cancellationToken = default)
    {
        var doc = await LoadAsync(id, cancellationToken);
        if (doc.Status == RecordStatus.CANCELLED)
        {
            return doc;
        }

        doc.Status = RecordStatus.CANCELLED;
        await db.SaveChangesAsync(cancellationToken);
        return doc;
    }

    /* ---------------------------------- Lines --------------------------------- */

    public async Task<ChargeDoc> AddLineAsync(
        string docId, ChargeLineInput input, CancellationToken cancellationToken = default)
    {
        var doc = await LoadAsync(docId, cancellationToken);
        RefuseWhenCancelled(doc);

        doc.Lines.Add(await BuildLineAsync(doc, input, existing: null, cancellationToken));
        RecomputeDocTotal(doc);

        await db.SaveChangesAsync(cancellationToken);
        return doc;
    }

    public async Task<ChargeDoc> UpdateLineAsync(
        string docId, string lineId, ChargeLineInput input,
        CancellationToken cancellationToken = default)
    {
        var doc = await LoadAsync(docId, cancellationToken);
        RefuseWhenCancelled(doc);

        var existing = doc.Lines.FirstOrDefault(l => l.Id == lineId)
            ?? throw new DomainException(Codes.LineNotFound);

        // Built entirely before anything is replaced, so a rejected edit leaves the document as
        // it was rather than half-changed.
        var rebuilt = await BuildLineAsync(doc, input, existing, cancellationToken);

        db.ChargeAllocations.RemoveRange(existing.Allocations);
        doc.Lines.Remove(existing);
        db.ChargeLines.Remove(existing);
        doc.Lines.Add(rebuilt);
        RecomputeDocTotal(doc);

        await db.SaveChangesAsync(cancellationToken);
        return doc;
    }

    public async Task<ChargeDoc> RemoveLineAsync(
        string docId, string lineId, CancellationToken cancellationToken = default)
    {
        var doc = await LoadAsync(docId, cancellationToken);
        RefuseWhenCancelled(doc);

        var line = doc.Lines.FirstOrDefault(l => l.Id == lineId);
        if (line is not null)
        {
            doc.Lines.Remove(line);
            db.ChargeLines.Remove(line);
            RecomputeDocTotal(doc);
            await db.SaveChangesAsync(cancellationToken);
        }

        return doc;
    }

    private async Task<ChargeLine> BuildLineAsync(
        ChargeDoc doc, ChargeLineInput input, ChargeLine? existing, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(input);

        if (string.IsNullOrWhiteSpace(input.CategoryId))
        {
            throw new DomainException(Codes.CategoryRequired);
        }

        var category = await db.ChargeCategories
            .FirstOrDefaultAsync(c => c.Id == input.CategoryId, cancellationToken)
            ?? throw new DomainException(Codes.CategoryNotFound);

        // Only checked when the category CHANGES: retiring one must not make the lines already
        // using it unsaveable.
        if ((existing is null || existing.CategoryId != category.Id) && !category.Active)
        {
            throw new DomainException(Codes.CategoryInactive);
        }

        if (category.Direction != doc.Direction || category.Scope != doc.Kind)
        {
            throw new DomainException(Codes.CategoryMismatch);
        }

        if (input.Date == default)
        {
            throw new DomainException(Codes.DateRequired);
        }

        if (input.Amount <= 0)
        {
            throw new DomainException(Codes.InvalidAmount);
        }

        var fxRate = 1m;
        if (input.Currency != Currency.USD)
        {
            if (input.FxRate is not > 0)
            {
                throw new DomainException(Codes.InvalidFx);
            }

            fxRate = input.FxRate.Value;
        }

        // Required on every line, both directions. Existence only — deactivating a person must
        // not make their historical lines unsaveable.
        if (string.IsNullOrWhiteSpace(input.PersonId))
        {
            throw new DomainException(Codes.PersonRequired);
        }

        if (!await db.Customers.AnyAsync(c => c.Id == input.PersonId, cancellationToken))
        {
            throw new DomainException(Codes.PersonNotFound);
        }

        if (!string.IsNullOrWhiteSpace(input.CostCentreId) &&
            !await db.CostCentres.AnyAsync(c => c.Id == input.CostCentreId, cancellationToken))
        {
            throw new DomainException(Codes.CostCentreNotFound);
        }

        var lineId = existing?.Id ?? await NextLineIdAsync(cancellationToken);
        var line = new ChargeLine
        {
            Id = lineId,
            DocId = doc.Id,
            CategoryId = category.Id,
            Date = input.Date,
            Amount = Rounding.Money(input.Amount),
            Currency = input.Currency,
            FxRate = fxRate,
            PersonId = input.PersonId,
            CostCentreId = string.IsNullOrWhiteSpace(input.CostCentreId) ? null : input.CostCentreId,
            Description = Trimmed(input.Description),
        };

        if (doc.Kind == ChargeScope.GENERAL)
        {
            if (input.Goods is not null)
            {
                throw new DomainException(Codes.GoodsNotAllowed);
            }

            RecomputeLine(line);
            return line;
        }

        var invoice = await db.Invoices
            .Include(i => i.Items)
            .FirstOrDefaultAsync(i => i.Id == doc.InvoiceId, cancellationToken)
            ?? throw new DomainException(Codes.InvoiceNotFound);

        // Omitting the goods means all of them.
        var requested = input.Goods?.ToList()
            ?? [.. invoice.Items.Select(i => new ChargeGoodInput { InvoiceItemId = i.Id })];

        if (requested.Count == 0)
        {
            throw new DomainException(Codes.GoodsRequired);
        }

        // Resolved and validated in full before anything is built.
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var resolved = new List<(InvoiceItem Item, decimal? Amount)>();
        foreach (var good in requested)
        {
            var item = invoice.Items.FirstOrDefault(i => i.Id == good.InvoiceItemId)
                ?? throw new DomainException(Codes.GoodNotOnInvoice);

            if (!seen.Add(item.ReferenceDocumentItemId))
            {
                throw new DomainException(Codes.DuplicateGood);
            }

            if (good.Amount is < 0)
            {
                throw new DomainException(Codes.InvalidGoodAmount);
            }

            resolved.Add((item, good.Amount));
        }

        // An amount on EVERY good is taken as typed. A missing one on ANY good re-splits the
        // WHOLE line — which is the rule the screen relies on: adding or removing a good
        // redistributes everything, discarding earlier manual edits rather than leaving a set of
        // figures that no longer add up.
        var amounts = resolved.TrueForAll(r => r.Amount is not null)
            ? [.. resolved.Select(r => Rounding.Money(r.Amount!.Value))]
            : SplitEqually(input.Amount, resolved.Count);

        for (var i = 0; i < resolved.Count; i++)
        {
            var (item, _) = resolved[i];
            line.Allocations.Add(new ChargeAllocation
            {
                Id = $"{lineId}-g{i + 1}",
                LineId = lineId,
                InvoiceItemId = item.Id,
                // From the invoice line, never the caller — it survives a provisional becoming
                // a final document.
                ReferenceDocumentItemId = item.ReferenceDocumentItemId,
                Product = item.Product,
                QuantityMt = item.QuantityMt,
                Amount = amounts[i],
            });
        }

        RecomputeLine(line);
        return line;
    }

    /// <summary>
    /// Converts at the leaf and rolls up.
    ///
    /// <para>
    /// Each allocation converts to USD on its own, and the line is the SUM of those — not the
    /// line's own amount converted once. The two differ by a cent often enough to matter, and
    /// only the first keeps the printed rows adding up to the printed total.
    /// </para>
    ///
    /// <para>With allocations, the line's own amount is REPLACED by their sum: the goods are the
    /// record, and a header figure that disagreed with them would be the one printed.</para>
    /// </summary>
    private static void RecomputeLine(ChargeLine line)
    {
        if (line.Allocations.Count > 0)
        {
            foreach (var allocation in line.Allocations)
            {
                allocation.AmountUSD = Rounding.Money(allocation.Amount / line.FxRate);
            }

            line.Amount = Rounding.Money(line.Allocations.Sum(a => a.Amount));
            line.AmountUSD = Rounding.Money(line.Allocations.Sum(a => a.AmountUSD));
            line.QuantityBasisMt = Rounding.Quantity(line.Allocations.Sum(a => a.QuantityMt));
            line.UnitPriceUSD = line.QuantityBasisMt > 0
                ? Rounding.Money(line.AmountUSD / line.QuantityBasisMt.Value)
                : null;
        }
        else
        {
            line.AmountUSD = Rounding.Money(line.Amount / line.FxRate);
            line.QuantityBasisMt = null;
            line.UnitPriceUSD = null;
        }
    }

    private static void RecomputeDocTotal(ChargeDoc doc) =>
        doc.TotalUSD = Rounding.Money(doc.Lines.Sum(l => l.AmountUSD));

    /* --------------------------------- Plumbing ------------------------------- */

    private async Task<ChargeDoc> LoadAsync(string id, CancellationToken cancellationToken) =>
        await db.ChargeDocs
            .Include(d => d.Lines).ThenInclude(l => l.Allocations)
            .FirstOrDefaultAsync(d => d.Id == id, cancellationToken)
        ?? throw new DomainException(Codes.DocNotFound);

    private static void RefuseWhenCancelled(ChargeDoc doc)
    {
        if (doc.Status == RecordStatus.CANCELLED)
        {
            throw new DomainException(Codes.DocCancelled);
        }
    }

    private static string? Trimmed(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private async Task<string> NextDocIdAsync(CancellationToken cancellationToken) =>
        $"chg-{await NextSeqAsync(db.ChargeDocs.Select(d => d.Id), "chg-", cancellationToken):D4}";

    private async Task<string> NextLineIdAsync(CancellationToken cancellationToken) =>
        $"chgline-{await NextSeqAsync(db.ChargeLines.Select(l => l.Id), "chgline-", cancellationToken)}";

    /// <summary>Max-scan, never count-derived, so removing one can never make the next collide.</summary>
    private static async Task<int> NextSeqAsync(
        IQueryable<string> ids, string prefix, CancellationToken cancellationToken)
    {
        var max = 0;
        foreach (var id in await ids.ToListAsync(cancellationToken))
        {
            if (id.StartsWith(prefix, StringComparison.Ordinal) &&
                int.TryParse(id.AsSpan(prefix.Length), out var n))
            {
                max = Math.Max(max, n);
            }
        }

        return max + 1;
    }
}
