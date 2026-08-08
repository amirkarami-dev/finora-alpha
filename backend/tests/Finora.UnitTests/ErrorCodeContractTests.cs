using System.Text.Json;
using Finora.BuildingBlocks.Domain;

namespace Finora.UnitTests;

/// <summary>
/// The error codes are a wire contract with the SPA: components branch on the exact string, and
/// each one has a translation in three locale files. A code the server can return but the client
/// cannot translate reaches the user as a raw slug like <c>qty-exceeds-remaining</c>.
/// </summary>
public sealed class ErrorCodeContractTests
{
    /// <summary>
    /// Codes the server can return that the mock <c>api.ts</c> never had a reason to throw.
    /// The list is short and explicit so it cannot become a dumping ground: anything added here
    /// needs a translation in all three locale files, or the user sees the raw slug.
    /// </summary>
    private static readonly string[] BackendOnlyCodes =
    [
        // Authentication did not exist while the app ran on mock data.
        "invalid-credentials",

        // Master data reached by id that is no longer there. The mock threw a sentence for these
        // ("Warehouse wh-x not found") rather than a code, because in one browser the id could
        // not go stale. On a server it can, so each gets a real code. The other four lists reuse
        // codes api.ts already throws — person-not-found, cost-centre-not-found,
        // category-not-found, bank-account-not-found — and only these three had none.
        //
        // Deliberately untranslated: nothing here is ever deleted, only deactivated, so a user
        // can only reach one of these by holding a screen open across a database replacement. The
        // master-data modals show their generic failure message for any code they do not name,
        // which is the right thing to say about a record that has vanished.
        "good-not-found",
        "partner-not-found",
        "warehouse-not-found",
    ];

    [Fact]
    public void The_contract_holds_every_code_the_front_end_throws()
    {
        var repoRoot = FindRepoRoot();
        var apiTs = File.ReadAllText(Path.Combine(repoRoot, "apps", "erp-panel", "src", "services", "api.ts"));

        var thrown = System.Text.RegularExpressions.Regex
            .Matches(apiTs, @"throw new Error\('([^']+)'\)")
            .Select(m => m.Groups[1].Value)
            .ToHashSet(StringComparer.Ordinal);

        var missing = thrown.Except(ErrorCodes.All, StringComparer.Ordinal).Order().ToList();
        var extra = ErrorCodes.All
            .Except(thrown, StringComparer.Ordinal)
            .Except(BackendOnlyCodes, StringComparer.Ordinal)
            .Order()
            .ToList();

        Assert.True(missing.Count == 0,
            $"api.ts throws codes the backend contract does not list: {string.Join(", ", missing)}");
        Assert.True(extra.Count == 0,
            $"The backend contract lists codes api.ts never throws: {string.Join(", ", extra)}. " +
            "Remove them, add the matching guard on the server, or list them in BackendOnlyCodes.");
    }

    [Fact]
    public void Backend_only_codes_are_actually_in_the_contract()
    {
        // Guards the allowlist itself: an entry that is not in the contract would silently
        // widen the `extra` exclusion above without granting anything.
        var orphans = BackendOnlyCodes.Except(ErrorCodes.All, StringComparer.Ordinal).ToList();
        Assert.True(orphans.Count == 0, $"Listed but not in the contract: {string.Join(", ", orphans)}");
    }

    [Fact]
    public void Codes_are_lower_kebab_case_and_unique()
    {
        Assert.All(ErrorCodes.All, code =>
            Assert.Matches("^[a-z][a-z0-9]*(-[a-z0-9]+)*$", code));

        Assert.Equal(ErrorCodes.All.Count, ErrorCodes.All.Distinct(StringComparer.Ordinal).Count());
    }

    [Fact]
    public void The_embedded_contract_matches_the_file_on_disk()
    {
        var repoRoot = FindRepoRoot();
        var onDisk = JsonSerializer.Deserialize<string[]>(
            File.ReadAllText(Path.Combine(repoRoot, "backend", "contracts", "error-codes.json")))!;

        Assert.Equal(onDisk.Order(), ErrorCodes.All.Order());
    }

    /// <summary>Walks up from the test assembly until the repo root (the one with apps/) appears.</summary>
    private static string FindRepoRoot()
    {
        var directory = new DirectoryInfo(Path.GetDirectoryName(typeof(ErrorCodeContractTests).Assembly.Location)!);

        while (directory is not null && !Directory.Exists(Path.Combine(directory.FullName, "apps")))
        {
            directory = directory.Parent;
        }

        Assert.NotNull(directory);
        return directory.FullName;
    }
}
