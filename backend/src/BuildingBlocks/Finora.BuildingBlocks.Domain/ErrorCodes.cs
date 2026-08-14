using System.Collections.Frozen;
using System.Reflection;
using System.Text.Json;

namespace Finora.BuildingBlocks.Domain;

/// <summary>
/// Every business error code the API may return, loaded from the checked-in contract file.
///
/// <para>
/// The list is data rather than an enum on purpose: it is extracted from the front end's
/// <c>api.ts</c>, which is still the authority while the migration is in progress, and the same
/// file is served from <c>/api/meta/error-codes</c> so a drift between the two sides shows up
/// as a failing check rather than as an untranslated error in front of a user.
/// </para>
/// </summary>
public static class ErrorCodes
{
    private static readonly FrozenSet<string> Codes = Load();

    /// <summary>
    /// Sorted, so the endpoint that serves this returns a stable document. CI diffs it against
    /// the checked-in contract; a set's enumeration order would make every response a new diff.
    /// </summary>
    private static readonly string[] Ordered = [.. Codes.Order(StringComparer.Ordinal)];

    public static IReadOnlyList<string> All => Ordered;

    public static bool IsKnown(string code) => Codes.Contains(code);

    private static FrozenSet<string> Load()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var name = assembly.GetManifestResourceNames()
            .Single(n => n.EndsWith("error-codes.json", StringComparison.Ordinal));

        using var stream = assembly.GetManifestResourceStream(name)
            ?? throw new InvalidOperationException($"Embedded resource '{name}' is missing.");

        var codes = JsonSerializer.Deserialize<string[]>(stream)
            ?? throw new InvalidOperationException("error-codes.json did not contain an array.");

        return codes.ToFrozenSet(StringComparer.Ordinal);
    }
}
