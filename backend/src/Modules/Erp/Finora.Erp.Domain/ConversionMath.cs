using Finora.BuildingBlocks.Domain;

namespace Finora.Erp.Domain;

/// <summary>The arithmetic of a conversion, kept pure so it can be pinned by unit tests.</summary>
public static class ConversionMath
{
    /// <summary>
    /// Splits <paramref name="total"/> over the outputs. With no shares the split follows the
    /// weight; with shares it follows them. Every part is rounded to cents and the LAST output
    /// absorbs whatever rounding left over, so the parts always sum to the total exactly.
    /// </summary>
    public static decimal[] Distribute(
        decimal total, IReadOnlyList<decimal> quantities, IReadOnlyList<decimal?> shares)
    {
        var n = quantities.Count;
        var result = new decimal[n];
        if (n == 0)
        {
            return result;
        }

        var byShares = shares.Count == n && shares.All(s => s.HasValue);
        var totalQty = quantities.Sum();
        var allocated = 0m;
        for (var i = 0; i < n - 1; i++)
        {
            var fraction = byShares
                ? shares[i]!.Value / 100m
                : totalQty == 0m ? 0m : quantities[i] / totalQty;
            result[i] = Rounding.Money(total * fraction);
            allocated += result[i];
        }

        result[n - 1] = Rounding.Money(total - allocated);
        return result;
    }

    /// <summary>All given and summing to 100 (± 0.01), or all absent.</summary>
    public static bool SharesAreValid(IReadOnlyList<decimal?> shares)
    {
        if (shares.All(s => !s.HasValue))
        {
            return true;
        }

        if (shares.Any(s => !s.HasValue || s.Value < 0m))
        {
            return false;
        }

        return Math.Abs(shares.Sum(s => s!.Value) - 100m) <= 0.01m;
    }

    /// <summary>Output over input, as a percent to 2 dp; 0 when there is no input.</summary>
    public static decimal Yield(decimal inputMt, decimal outputMt) =>
        inputMt == 0m ? 0m : Rounding.Money(outputMt / inputMt * 100m);
}
