using Finora.BuildingBlocks.Domain;
using Finora.Erp.Domain;

namespace Finora.Erp.Infrastructure.Trade;

/// <summary>
/// Pricing, totals, and the document chain — the parts of the trade model that are pure
/// arithmetic over a set of documents, with no database in sight.
///
/// <para>
/// Separated from <see cref="InvoiceService"/> so the rules can be read without the persistence
/// around them, and so a test can drive them with a hand-built list.
/// </para>
/// </summary>
internal static class InvoiceMath
{
    /* --------------------------------- Pricing ---------------------------------- */

    /// <summary>
    /// USD per tonne, or null when a floating line has no quotation yet.
    ///
    /// <para>
    /// Deliberately never rounded and never stored. Rounding it to the 4dp its column would allow
    /// and multiplying by the quantity moves a 25 MT line by ten cents — small, permanent,
    /// applied to every line, and perfectly self-consistent, so nothing downstream ever flags it.
    /// </para>
    /// </summary>
    public static decimal? UnitPrice(InvoiceItem item)
    {
        ArgumentNullException.ThrowIfNull(item);

        // A fixed line prices from the contract's locked figure, a floating one from the
        // quotation. `FixedPrice` is non-nullable precisely because a fixed line always prices.
        decimal? basePrice = item.LmeFixed ? item.FixedPrice : item.LmePrice;
        return basePrice is null ? null : (basePrice.Value * (item.LmePercent / 100m)) + item.Premium;
    }

    /// <summary>
    /// The line's value in the document's currency, after discount. Zero — not an error — while a
    /// floating line is unpriced, which is the normal state of a provisional before the quotation
    /// arrives and the permanent state of an order.
    /// </summary>
    public static decimal Amount(InvoiceItem item)
    {
        ArgumentNullException.ThrowIfNull(item);

        var unit = UnitPrice(item);
        if (unit is null)
        {
            return 0m;
        }

        var gross = unit.Value * item.QuantityMt;
        return gross * (1m - ((item.DiscountPercent ?? 0m) / 100m));
    }

    public static void RecomputeItemAmount(InvoiceItem item) =>
        item!.Amount = Rounding.Money(Amount(item));

    /// <summary>
    /// Rolls the lines up into the header.
    ///
    /// <para>
    /// Round-then-sum, not sum-then-round: three lines whose true value is 100.005 each total
    /// 300.03, because each is stored as 100.01. Summing raw and rounding once gives 300.02, and
    /// the header would then disagree with the lines printed beneath it by a cent that nothing
    /// reconciles.
    /// </para>
    ///
    /// <para>
    /// The discount is the sum of per-line differences between two independently rounded numbers,
    /// not gross-minus-total. The two drift apart, and this is the figure printed in the discount
    /// column.
    /// </para>
    /// </summary>
    public static void RecomputeInvoiceTotals(Invoice invoice)
    {
        ArgumentNullException.ThrowIfNull(invoice);

        var total = 0m;
        var discount = 0m;
        var weight = 0m;

        foreach (var item in invoice.Items)
        {
            var unit = UnitPrice(item);
            var gross = unit is null ? 0m : Rounding.Money(unit.Value * item.QuantityMt);
            total += item.Amount;
            discount += gross - item.Amount;
            weight += item.QuantityMt;
        }

        invoice.TotalAmount = Rounding.Money(total);
        invoice.TotalDiscount = Rounding.Money(discount);
        // Money scale on purpose: the header's tonnage is a display total, while a line carries
        // three decimals because the warehouse consumes against it.
        invoice.TotalWeightMt = Rounding.Money(weight);
    }

    /* ------------------------------ Document kinds ------------------------------ */

    /// <summary>Orders carry no price and are exempt from the pricing guards.</summary>
    public static bool IsPricedType(InvoiceType type) =>
        type is not (InvoiceType.PURCHASE_ORDER or InvoiceType.SALE_ORDER);

    public static InvoiceSide SideOf(InvoiceType type) =>
        type.ToString().StartsWith("PURCHASE", StringComparison.Ordinal)
            ? InvoiceSide.PURCHASE
            : InvoiceSide.SALE;

    /// <summary>
    /// What a document may become. A side is never crossed, and an order may skip the provisional
    /// and go straight to the final.
    /// </summary>
    public static IReadOnlyList<InvoiceType> ConvertTargets(InvoiceType from) => from switch
    {
        InvoiceType.PURCHASE_ORDER => [InvoiceType.PURCHASE_PROVISIONAL, InvoiceType.PURCHASE_INVOICE],
        InvoiceType.PURCHASE_PROVISIONAL => [InvoiceType.PURCHASE_INVOICE],
        InvoiceType.SALE_ORDER => [InvoiceType.SALE_PROVISIONAL, InvoiceType.SALE_INVOICE],
        InvoiceType.SALE_PROVISIONAL => [InvoiceType.SALE_INVOICE],
        _ => [],
    };

    /* --------------------------------- The chain -------------------------------- */

    /// <summary>
    /// The document converted FROM this one, if it is still live.
    ///
    /// <para>A cancelled successor does not count: cancelling one must free its predecessor to be
    /// converted again. The database enforces the same rule in <c>ux_invoices_live_successor</c>.</para>
    /// </summary>
    public static Invoice? FindSuccessor(IReadOnlyCollection<Invoice> all, string id) =>
        all.FirstOrDefault(i => i.RefInvoiceId == id && i.Status != InvoiceStatus.CANCELLED);

    /// <summary>
    /// Every document in one conversion chain, root first.
    ///
    /// <para>The upward walk is cycle-guarded. The schema cannot express a cycle, but an import
    /// could, and hanging is a worse failure than a wrong answer.</para>
    /// </summary>
    public static List<Invoice> Chain(IReadOnlyCollection<Invoice> all, Invoice invoice)
    {
        ArgumentNullException.ThrowIfNull(invoice);

        var byId = all.ToDictionary(i => i.Id, StringComparer.Ordinal);

        var root = invoice;
        var seen = new HashSet<string>(StringComparer.Ordinal) { root.Id };
        while (root.RefInvoiceId is not null &&
               byId.TryGetValue(root.RefInvoiceId, out var parent) &&
               seen.Add(parent.Id))
        {
            root = parent;
        }

        var chain = new List<Invoice> { root };
        var next = FindSuccessor(all, root.Id);
        while (next is not null && seen.Add(next.Id))
        {
            chain.Add(next);
            next = FindSuccessor(all, next.Id);
        }

        return chain;
    }

    /// <summary>
    /// The chain-stable id a new line should carry for <paramref name="contractItemId"/>, or null
    /// when it should mint a fresh one.
    ///
    /// <para>
    /// This is what makes a cost booked against a provisional stay attached to the invoice it
    /// becomes, and what stops deleting a line and re-adding it from minting a second identity for
    /// the same goods. A second line for the same contract item on the same document IS genuinely
    /// additional goods, so it gets its own.
    /// </para>
    /// </summary>
    public static string? ChainReferenceDocumentItemId(
        IReadOnlyCollection<Invoice> all, Invoice invoice, string contractItemId)
    {
        ArgumentNullException.ThrowIfNull(invoice);

        if (invoice.RefInvoiceId is null)
        {
            return null;
        }

        // Read live: `AddItems` pushes each line before evaluating the next, so two entries for
        // one contract item become (reuse, fresh) rather than (reuse, reuse).
        if (invoice.Items.Any(i => i.ContractItemId == contractItemId))
        {
            return null;
        }

        foreach (var member in Chain(all, invoice))
        {
            var match = member.Items.FirstOrDefault(i => i.ContractItemId == contractItemId);
            if (match is not null)
            {
                return match.ReferenceDocumentItemId;
            }
        }

        return null;
    }

    /// <summary>
    /// The live tip of every chain on one side — documents with no live successor.
    ///
    /// <para>Used for what has physically been committed. Drafts count, because a draft line has
    /// already spoken for the goods even though it reserves no contract quantity.</para>
    /// </summary>
    public static List<Invoice> ChainLeafDocs(
        IReadOnlyCollection<Invoice> all, InvoiceSide side, bool includeDraft)
    {
        return all
            .Where(i => SideOf(i.InvoiceType) == side)
            .Where(i => i.Status != InvoiceStatus.CANCELLED)
            .Where(i => includeDraft || i.Status == InvoiceStatus.CONFIRMED)
            .Where(i => FindSuccessor(all, i.Id) is null)
            .ToList();
    }

    /// <summary>
    /// One entry per contract line: how much of it other documents on this side have CONFIRMED.
    ///
    /// <para>
    /// The subtle rule, and the one a set-based rewrite gets wrong. It is NOT "confirmed documents
    /// with no successor" — a confirmed provisional that has been converted into a draft final
    /// still holds its claim, because the goods are spoken for and the draft reserves nothing. So
    /// each chain is walked once and its DEEPEST CONFIRMED member counted, whether or not
    /// something newer sits on top of it.
    /// </para>
    ///
    /// <para>
    /// Written as "CONFIRMED AND NOT EXISTS(successor)" instead, a 60 MT confirmed provisional
    /// converted to a draft vanishes from the ceiling and a third document may claim the same
    /// tonnage — 110 MT sold against a 100 MT contract line, with the contract page still
    /// reporting healthy remaining because the figure is floored at zero.
    /// </para>
    /// </summary>
    public static Dictionary<string, decimal> ConfirmedClaimsByItem(
        IReadOnlyCollection<Invoice> all, InvoiceSide side, string? excludeInvoiceId)
    {
        var claims = new Dictionary<string, decimal>(StringComparer.Ordinal);
        var countedRoots = new HashSet<string>(StringComparer.Ordinal);

        var excludedChain = new HashSet<string>(StringComparer.Ordinal);
        if (excludeInvoiceId is not null)
        {
            var self = all.FirstOrDefault(i => i.Id == excludeInvoiceId);
            if (self is not null)
            {
                foreach (var member in Chain(all, self))
                {
                    excludedChain.Add(member.Id);
                }
            }
            else
            {
                // A document being created does not exist yet; excluding its id alone is right.
                excludedChain.Add(excludeInvoiceId);
            }
        }

        foreach (var invoice in all.Where(i => SideOf(i.InvoiceType) == side))
        {
            if (excludedChain.Contains(invoice.Id))
            {
                continue;
            }

            var chain = Chain(all, invoice);
            if (chain.Any(m => excludedChain.Contains(m.Id)) || !countedRoots.Add(chain[0].Id))
            {
                continue;
            }

            // Deepest first: the last CONFIRMED member along the chain.
            var deepest = chain.LastOrDefault(m => m.Status == InvoiceStatus.CONFIRMED);
            if (deepest is null)
            {
                continue;
            }

            foreach (var line in deepest.Items)
            {
                claims.TryGetValue(line.ContractItemId, out var running);
                claims[line.ContractItemId] = Rounding.Quantity(running + line.QuantityMt);
            }
        }

        return claims;
    }

    /// <summary>
    /// How much of a contract line has been committed to documents, for
    /// <see cref="ContractItem.RemainingMt"/>.
    ///
    /// <para>
    /// A third rule again, and deliberately different from the guard above: BOTH sides summed
    /// together, chain-leaf rather than deepest-confirmed, drafts counted, and orders excluded.
    /// The guard answers "may I raise another document"; this answers "how much of this line is
    /// spoken for". Merging them makes a confirmed purchase order start consuming the line, or
    /// makes drafts reserve contract quantity, which the model explicitly forbids.
    /// </para>
    /// </summary>
    public static decimal ShippedMtForItem(IReadOnlyCollection<Invoice> all, string contractItemId)
    {
        var leaves = ChainLeafDocs(all, InvoiceSide.PURCHASE, includeDraft: true)
            .Concat(ChainLeafDocs(all, InvoiceSide.SALE, includeDraft: true))
            .Where(i => IsPricedType(i.InvoiceType));

        return leaves.Sum(invoice => invoice.Items
            .Where(line => line.ContractItemId == contractItemId)
            .Sum(line => line.QuantityMt));
    }
}
