namespace Finora.BuildingBlocks.Domain;

/// <summary>
/// The one place money, quantities and rates are rounded.
///
/// <para>
/// This exists because C# and the TypeScript front end disagree by default.
/// <c>Math.Round(2.675m, 2)</c> uses banker's rounding and gives <c>2.68</c> for some inputs and
/// <c>2.67</c> for others depending on the preceding digit; the front end's
/// <c>Math.round(x * 100) / 100</c> is half-away-from-zero and always gives <c>2.68</c>. A
/// single cent of divergence between the two is a balance that does not reconcile, so every
/// rounding in this codebase goes through here and an architecture test bans raw
/// <c>Math.Round</c> outside this file.
/// </para>
///
/// <para>
/// Scales mirror the front end exactly: money 2dp, quantity (MT) 3dp, FX rates 4dp. See
/// <c>apps/erp-panel/src/services/api.ts</c> (<c>round</c>, <c>round3</c>, <c>round4</c>) — the
/// tonnage comment there records why quantity is NOT 2dp: rounding a remaining quantity up can
/// let a warehouse receipt over-consume an invoice line by up to 0.005 MT.
/// </para>
/// </summary>
public static class Rounding
{
    /// <summary>Money — 2 decimal places.</summary>
    public static decimal Money(decimal value) => Half(value, 2);

    /// <summary>Quantity in metric tonnes — 3 decimal places.</summary>
    public static decimal Quantity(decimal value) => Half(value, 3);

    /// <summary>Exchange rates — 4 decimal places.</summary>
    public static decimal Rate(decimal value) => Half(value, 4);

    /// <summary>
    /// Half-away-from-zero at the given scale, matching JavaScript's
    /// <c>Math.round(x * 10^n) / 10^n</c> for both signs.
    /// </summary>
    private static decimal Half(decimal value, int decimals) =>
#pragma warning disable RCS1249 // the single sanctioned call; see the class summary
        System.Math.Round(value, decimals, MidpointRounding.AwayFromZero);
#pragma warning restore RCS1249

    /// <summary>
    /// Splits <paramref name="amount"/> into <paramref name="parts"/> equal shares in whole
    /// cents, so the shares always sum back to <c>Money(amount)</c> exactly.
    ///
    /// <para>
    /// Equal division gives every share the same fractional remainder, so the tie-break is
    /// positional: leftover cents go to the FIRST shares. This is a port of
    /// <c>splitEqually</c> in <c>apps/erp-panel/src/utils/calc.ts</c>, including its use of
    /// floor rather than truncate — truncate rounds a negative quotient toward zero, which
    /// makes the remainder negative and silently drops the leftover cents.
    /// </para>
    /// </summary>
    public static decimal[] SplitEqually(decimal amount, int parts)
    {
        if (parts <= 0) return [];

        var totalCents = (long)Half(amount * 100m, 0);
        var baseCents = (long)System.Math.Floor((decimal)totalCents / parts);
        var remainder = totalCents - (baseCents * parts);

        var result = new decimal[parts];
        for (var i = 0; i < parts; i++)
        {
            result[i] = (baseCents + (i < remainder ? 1 : 0)) / 100m;
        }

        return result;
    }
}
