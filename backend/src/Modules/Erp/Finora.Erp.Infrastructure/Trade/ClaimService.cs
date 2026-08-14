using Finora.BuildingBlocks.Domain;
using Finora.Erp.Application;
using Finora.Erp.Domain;
using Microsoft.EntityFrameworkCore;

namespace Finora.Erp.Infrastructure.Trade;

/// <summary>
/// Claims — a shortfall in quantity or quality, raised against one trade document, on either
/// side of the desk.
///
/// <para>
/// The header's amount is never sent by the caller: it is the sum of the item amounts, and the
/// party is read off the document. Both used to be client-supplied and both had their own error
/// codes for disagreeing with the document; deriving them deleted the disagreement.
/// </para>
/// </summary>
public sealed class ClaimService(ErpDbContext db)
{
    internal static class Codes
    {
        public const string ClaimNotFound = "claim-not-found";
        public const string ClaimCancelled = "claim-cancelled";
        public const string TitleRequired = "title-required";
        public const string DateRequired = "date-required";
        public const string InvoiceRequired = "invoice-required";
        public const string InvoiceNotFound = "invoice-not-found";
        public const string InvoiceSideMismatch = "invoice-side-mismatch";
        public const string InvoiceNotConfirmed = "invoice-not-confirmed";
        public const string InvoiceImmutable = "invoice-immutable";
        public const string SideImmutable = "side-immutable";
        public const string ClaimTypeRequired = "claim-type-required";
        public const string InvalidFx = "invalid-fx";
        public const string NoClaimItems = "no-claim-items";
        public const string ItemNotOnInvoice = "item-not-on-invoice";
        public const string InvalidItemAmount = "invalid-item-amount";
        public const string DuplicateItem = "duplicate-item";
    }

    public async Task<List<Claim>> ListAsync(CancellationToken cancellationToken = default) =>
        await db.Claims
            .Include(c => c.Items)
            .OrderBy(c => c.Id)
            .ToListAsync(cancellationToken);

    public async Task<Claim> CreateAsync(ClaimInput input, CancellationToken cancellationToken = default)
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

        if (string.IsNullOrWhiteSpace(input.InvoiceId))
        {
            throw new DomainException(Codes.InvoiceRequired);
        }

        var invoices = await db.Invoices.Include(i => i.Items).ToListAsync(cancellationToken);
        var invoice = invoices.FirstOrDefault(i => i.Id == input.InvoiceId)
            ?? throw new DomainException(Codes.InvoiceNotFound);

        var documentSide = InvoiceMath.SideOf(invoice.InvoiceType);
        if (Claimed(documentSide) != input.Side)
        {
            throw new DomainException(Codes.InvoiceSideMismatch);
        }

        var isLeaf = InvoiceMath.IsPricedType(invoice.InvoiceType) &&
                     InvoiceMath.ChainLeafDocs(invoices, documentSide, includeDraft: false)
                         .Exists(i => i.Id == invoice.Id);
        if (!isLeaf)
        {
            throw new DomainException(Codes.InvoiceNotConfirmed);
        }

        var claim = await BuildAsync(invoice, input, existing: null, title, cancellationToken);
        db.Claims.Add(claim);
        await db.SaveChangesAsync(cancellationToken);
        return claim;
    }

    /// <summary>
    /// Edits a claim, and deliberately does NOT re-check the document.
    ///
    /// <para>
    /// No side check, no chain-leaf check, no confirmed check. A claim raised against a
    /// provisional stays editable after that provisional becomes a final document — at which
    /// point the provisional is no longer the tip of its chain, so re-running the create-time
    /// checks would make an old claim start refusing to save for a reason the user cannot act on.
    /// The document itself is immutable instead, which is what makes skipping the checks safe.
    /// </para>
    /// </summary>
    public async Task<Claim> UpdateAsync(
        string id, ClaimInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        var existing = await db.Claims
            .Include(c => c.Items)
            .FirstOrDefaultAsync(c => c.Id == id, cancellationToken)
            ?? throw new DomainException(Codes.ClaimNotFound);

        if (existing.Status == RecordStatus.CANCELLED)
        {
            throw new DomainException(Codes.ClaimCancelled);
        }

        var title = input.Title.Trim();
        if (title.Length == 0)
        {
            throw new DomainException(Codes.TitleRequired);
        }

        if (input.Date == default)
        {
            throw new DomainException(Codes.DateRequired);
        }

        if (input.InvoiceId != existing.InvoiceId)
        {
            throw new DomainException(Codes.InvoiceImmutable);
        }

        if (input.Side != existing.Side)
        {
            throw new DomainException(Codes.SideImmutable);
        }

        // Read only to source the document's lines for the item pass — never to re-validate it.
        var invoice = await db.Invoices
            .Include(i => i.Items)
            .FirstOrDefaultAsync(i => i.Id == existing.InvoiceId, cancellationToken)
            ?? throw new DomainException(Codes.InvoiceNotFound);

        var rebuilt = await BuildAsync(invoice, input, existing, title, cancellationToken);

        // Everything validated, so the old items can go.
        db.ClaimItems.RemoveRange(existing.Items);
        existing.Items.Clear();
        foreach (var item in rebuilt.Items)
        {
            existing.Items.Add(item);
        }

        existing.Title = rebuilt.Title;
        existing.ClaimType = rebuilt.ClaimType;
        existing.Date = rebuilt.Date;
        existing.Currency = rebuilt.Currency;
        existing.FxRate = rebuilt.FxRate;
        existing.Amount = rebuilt.Amount;
        existing.AmountUSD = rebuilt.AmountUSD;
        existing.Description = rebuilt.Description;

        await db.SaveChangesAsync(cancellationToken);
        return existing;
    }

    /// <summary>Cancels. Never deletes.</summary>
    public async Task<Claim> CancelAsync(string id, CancellationToken cancellationToken = default)
    {
        var claim = await db.Claims
            .Include(c => c.Items)
            .FirstOrDefaultAsync(c => c.Id == id, cancellationToken)
            ?? throw new DomainException(Codes.ClaimNotFound);

        if (claim.Status == RecordStatus.CANCELLED)
        {
            return claim;
        }

        claim.Status = RecordStatus.CANCELLED;
        await db.SaveChangesAsync(cancellationToken);
        return claim;
    }

    private async Task<Claim> BuildAsync(
        Invoice invoice, ClaimInput input, Claim? existing, string title,
        CancellationToken cancellationToken)
    {
        if (input.ClaimType is not (ClaimType.QUANTITY or ClaimType.QUALITY))
        {
            throw new DomainException(Codes.ClaimTypeRequired);
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

        // Zero and negative entries are dropped rather than refused: the form shows a row per
        // good on the document, and leaving most of them blank is how one good is claimed for.
        var claimed = input.Items.Where(i => i.Amount > 0).ToList();
        if (claimed.Count == 0)
        {
            throw new DomainException(Codes.NoClaimItems);
        }

        var seen = new HashSet<string>(StringComparer.Ordinal);
        var resolved = new List<(InvoiceItem Item, ClaimItemInput Input)>();
        foreach (var item in claimed)
        {
            var invoiceItem = invoice.Items.FirstOrDefault(i => i.Id == item.InvoiceItemId)
                ?? throw new DomainException(Codes.ItemNotOnInvoice);

            if (item.Amount <= 0)
            {
                throw new DomainException(Codes.InvalidItemAmount);
            }

            // Duplicates are caught on the CHAIN-STABLE key, not the row id. Two rows naming the
            // same goods through different document generations are one claim against one lot of
            // metal; keyed on the row id they would both be accepted.
            if (!seen.Add(invoiceItem.ReferenceDocumentItemId))
            {
                throw new DomainException(Codes.DuplicateItem);
            }

            resolved.Add((invoiceItem, item));
        }

        var claimId = existing?.Id ?? await NextIdAsync(cancellationToken);
        var nextItem = await NextItemSeqAsync(cancellationToken);

        var items = resolved.Select(r => new ClaimItem
        {
            Id = $"claimitem-{nextItem++}",
            ClaimId = claimId,
            InvoiceItemId = r.Item.Id,
            // Everything below comes from the document, never the caller.
            ReferenceDocumentItemId = r.Item.ReferenceDocumentItemId,
            Product = r.Item.Product,
            QuantityMt = r.Item.QuantityMt,
            Amount = Rounding.Money(r.Input.Amount),
            AmountUSD = Rounding.Money(r.Input.Amount / fxRate),
            Description = Trimmed(r.Input.Description),
        }).ToList();

        return new Claim
        {
            Id = claimId,
            Side = input.Side,
            Title = title,
            InvoiceId = invoice.Id,
            // Read off the document. It used to be sent and checked against it, which is two
            // error codes for a question the document already answers.
            PartyId = invoice.CustomerId,
            ClaimType = input.ClaimType,
            Date = input.Date,
            Currency = input.Currency,
            FxRate = fxRate,
            // Sums of the items, never client-supplied — converted at the leaf and rolled up.
            Amount = Rounding.Money(items.Sum(i => i.Amount)),
            AmountUSD = Rounding.Money(items.Sum(i => i.AmountUSD)),
            Description = Trimmed(input.Description),
            Status = existing?.Status ?? RecordStatus.ACTIVE,
            CreatedAt = existing?.CreatedAt ?? input.Date,
            Items = items,
        };
    }

    /// <summary>
    /// The same side, in the other enum.
    ///
    /// <para>
    /// <see cref="ClaimSide"/> and <see cref="InvoiceSide"/> name the same two things and declare
    /// them in OPPOSITE order — SALE first here, PURCHASE first there. So a cast between them
    /// compiles, reads as a formality, and silently turns every sale claim into a purchase one.
    /// Converted by name, always.
    /// </para>
    /// </summary>
    private static ClaimSide Claimed(InvoiceSide side) =>
        side == InvoiceSide.SALE ? ClaimSide.SALE : ClaimSide.PURCHASE;

    private static string? Trimmed(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private async Task<string> NextIdAsync(CancellationToken cancellationToken) =>
        $"clm-{await NextSeqAsync(db.Claims.Select(c => c.Id), "clm-", cancellationToken):D4}";

    private async Task<int> NextItemSeqAsync(CancellationToken cancellationToken) =>
        await NextSeqAsync(db.ClaimItems.Select(i => i.Id), "claimitem-", cancellationToken);

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
