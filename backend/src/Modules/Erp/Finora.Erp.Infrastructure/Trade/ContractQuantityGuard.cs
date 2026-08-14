using Finora.BuildingBlocks.Domain;
using Finora.Erp.Domain;

namespace Finora.Erp.Infrastructure.Trade;

/// <summary>
/// What a contract line has left, broken down.
///
/// <para>
/// Every field crosses the wire when the guard refuses, because the dialog the user sees adds
/// them up in front of them. Renaming or pre-summing any of them breaks that screen.
/// </para>
/// </summary>
/// <param name="ContractQuantityMt">The contract line's own quantity.</param>
/// <param name="AlreadyInvoicedMt">Confirmed claims by other chains on this side.</param>
/// <param name="OnThisDocMt">This document's own lines for the same contract line.</param>
/// <param name="RemainingMt">Contract minus both, floored at zero.</param>
public sealed record ContractQtyCheck(
    decimal ContractQuantityMt,
    decimal AlreadyInvoicedMt,
    decimal OnThisDocMt,
    decimal RemainingMt,
    decimal RequestedMt,
    bool Exceeds);

/// <summary>
/// The single place a document is told it may not claim more of a contract line.
///
/// <para>
/// One rule, three callers — adding lines, editing a line's quantity, and confirming — because
/// when each computed its own version, two of the three were wrong in different ways.
/// </para>
/// </summary>
internal static class ContractQuantityGuard
{
    /// <param name="excludeInvoiceItemIds">
    /// Lines whose quantity is already inside <paramref name="requestedMt"/>, so they must not be
    /// counted twice: one line when editing, a whole group when confirming checks a contract
    /// line's total across several lines at once.
    /// </param>
    /// <param name="extraOnDocMt">
    /// Quantity staged earlier in the same multi-line call but not yet attached to the document.
    /// Without it, three lines of 40 against a 100 tonne line each pass individually.
    /// </param>
    public static ContractQtyCheck Check(
        IReadOnlyCollection<Invoice> all,
        ContractItem? contractItem,
        InvoiceSide side,
        string invoiceId,
        decimal requestedMt,
        IReadOnlyCollection<string>? excludeInvoiceItemIds = null,
        decimal extraOnDocMt = 0m)
    {
        // A contract line that cannot be resolved has a ceiling of zero rather than an error —
        // the caller has already established the document's contract, so this can only mean the
        // line was named wrongly, and a zero ceiling refuses it with a figure the user can read.
        var contractQuantityMt = contractItem?.QuantityMt ?? 0m;

        var claims = InvoiceMath.ConfirmedClaimsByItem(all, side, invoiceId);
        var alreadyInvoicedMt = Rounding.Quantity(
            contractItem is null ? 0m : claims.GetValueOrDefault(contractItem.Id));

        var excluded = excludeInvoiceItemIds is null
            ? []
            : new HashSet<string>(excludeInvoiceItemIds, StringComparer.Ordinal);

        var invoice = all.FirstOrDefault(i => i.Id == invoiceId);
        var ownMt = invoice is null || contractItem is null
            ? 0m
            : invoice.Items
                .Where(i => i.ContractItemId == contractItem.Id && !excluded.Contains(i.Id))
                .Sum(i => i.QuantityMt);

        var onThisDocMt = Rounding.Quantity(ownMt + extraOnDocMt);
        var remainingMt = Rounding.Quantity(Math.Max(contractQuantityMt - alreadyInvoicedMt - onThisDocMt, 0m));
        var requested = Rounding.Quantity(requestedMt);

        // The browser compares with a 1e-9 tolerance because its arithmetic is binary floating
        // point. Quantities here are decimal(18,3), so every value is exact and the tolerance
        // would only ever hide a real overshoot — the smallest one representable is 0.001.
        return new ContractQtyCheck(
            contractQuantityMt,
            alreadyInvoicedMt,
            onThisDocMt,
            remainingMt,
            requested,
            requested > remainingMt);
    }

    /// <summary>
    /// Refuses, carrying the whole breakdown.
    ///
    /// <para><c>available</c> repeats <c>remainingMt</c> under the name an older version of the
    /// dialog reads; both are sent because either may be the one rendered.</para>
    /// </summary>
    public static DomainException Exceeded(ContractQtyCheck check, string product)
    {
        ArgumentNullException.ThrowIfNull(check);

        return new DomainException("qty-exceeds-remaining", new Dictionary<string, object?>
        {
            ["contractQuantityMt"] = check.ContractQuantityMt,
            ["alreadyInvoicedMt"] = check.AlreadyInvoicedMt,
            ["onThisDocMt"] = check.OnThisDocMt,
            ["remainingMt"] = check.RemainingMt,
            ["requestedMt"] = check.RequestedMt,
            ["exceeds"] = check.Exceeds,
            ["product"] = product,
            ["available"] = check.RemainingMt,
        });
    }
}
