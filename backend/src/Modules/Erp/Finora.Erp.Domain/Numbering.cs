using System.Globalization;

namespace Finora.Erp.Domain;

/// <summary>
/// The codes and numbers the server assigns on the user's behalf. Pure functions over what is
/// already stored, so the rule lives in one place and the SPA's offline copy
/// (<c>apps/erp-panel/src/utils/numbering.ts</c>) can mirror it line for line.
///
/// <para>
/// Max-plus-one rather than a database sequence, for the same reason the invoice ids are: a
/// sequence leaves gaps an auditor reads as deleted rows, and it would not know about the
/// codes that arrived by snapshot. Nothing here is ever deleted, only deactivated, so a code is
/// never reused.
/// </para>
/// </summary>
public static class Numbering
{
    /// <summary>
    /// The desk sits in the Gulf. A document dated "1 Sep" by a user in Dubai arrives as
    /// 31 Aug 20:00Z, and its number must still say 2609 — so the month is read in Gulf time.
    /// </summary>
    public static readonly TimeSpan GulfOffset = TimeSpan.FromHours(4);

    /// <summary>"1", "2", … — one past the highest code that is an integer; strays ignored.</summary>
    public static string NextIntegerCode(IEnumerable<string> existing)
    {
        var highest = 0;
        foreach (var code in existing)
        {
            if (int.TryParse(code, NumberStyles.None, CultureInfo.InvariantCulture, out var n))
            {
                highest = Math.Max(highest, n);
            }
        }

        return (highest + 1).ToString(CultureInfo.InvariantCulture);
    }

    /// <summary>"copper-001" — the metal in lower case, then three digits counted per metal.</summary>
    public static string NextGoodCode(MetalType metal, IEnumerable<string> existing)
    {
        var prefix = metal.ToString().ToLowerInvariant() + "-";
        var highest = 0;
        foreach (var code in existing)
        {
            if (code.StartsWith(prefix, StringComparison.Ordinal)
                && int.TryParse(code[prefix.Length..], NumberStyles.None, CultureInfo.InvariantCulture, out var n))
            {
                highest = Math.Max(highest, n);
            }
        }

        return string.Create(CultureInfo.InvariantCulture, $"{prefix}{highest + 1:D3}");
    }

    /// <summary>"26090001" — YYMM of the document's date in Gulf time, then four digits counted
    /// across every document type, restarting each month.</summary>
    public static string NextDocumentNumber(DateTimeOffset date, IEnumerable<string> existing)
    {
        var month = date.ToOffset(GulfOffset).ToString("yyMM", CultureInfo.InvariantCulture);
        var highest = 0;
        foreach (var number in existing)
        {
            if (number.Length > month.Length
                && number.StartsWith(month, StringComparison.Ordinal)
                && int.TryParse(number[month.Length..], NumberStyles.None, CultureInfo.InvariantCulture, out var n))
            {
                highest = Math.Max(highest, n);
            }
        }

        return string.Create(CultureInfo.InvariantCulture, $"{month}{highest + 1:D4}");
    }
}
