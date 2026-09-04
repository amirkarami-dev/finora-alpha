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
        // AI assistant. The SPA branches on these in Task 2 of the assistant plan; remove
        // these three lines when `code === 'assistant-…'` exists in apps/erp-panel/src.
        "assistant-bad-request",
        "assistant-rate-limited",
        "assistant-unavailable",

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

        // Codes are assigned by the server now, so the browser never raises this itself. It can
        // still come back when two people save in the same second and the retry also collides —
        // the modals show their generic failure message for it, which is honest for a race.
        "duplicate-code",

        // Same race, for trade-document numbers: two concurrent creates (or a header edit that
        // re-mints across a month boundary) can both land on the same number, and the retry can
        // still collide a second time. The SPA no longer branches on this — it shows the generic
        // failure message, honest for a race the user did not cause.
        "duplicate-number",

        // User administration. These live on the server because `api.ts` never had accounts to
        // administer — the mock app had four hardcoded logins. Every one of them is reachable
        // from a form a person is filling in, so each has a translation in all three locale
        // files under `users.errors.*`, and the modals look them up by code.
        "email-required",
        "duplicate-email",
        "user-not-found",
        "role-not-found",
        "password-too-short",
        "current-password-incorrect",
        "cannot-deactivate-self",
        "cannot-change-own-role",

        // Contracts. The browser threw sentences here ("Contract X not found") rather than codes,
        // because in one tab an id could not go stale and an enum could not be anything but one
        // of its own values. Over HTTP both can, so each gets a code the form can act on.
        // Translated under `contracts.errors.*` in all three locale files.
        "contract-not-found",
        "contract-item-not-found",
        "invalid-status",
        "invalid-contract-type",
        "invalid-incoterm",

        // Trade documents. Three of these guard things a single browser could not get wrong and a
        // database can: a line another record already points at, a discount outside the range its
        // column CHECKs, and a contract line shrunk below what has been invoiced off it. Each is
        // reachable from a form somebody is filling in, so each is translated —
        // `tradeInvoices.lineInUse`, `tradeInvoices.invalidDiscount`,
        // `items.quantityBelowInvoiced` — in all three locale files.
        "line-in-use",
        "invalid-discount",
        "quantity-below-invoiced",

        // Untranslated, deliberately. A stale line id needs the generic failure message, exactly
        // as the master-data not-founds above do. `invoice-cancelled` guards `markInvoiceSent`,
        // which no screen calls today — it exists so the endpoint cannot be used to claim a
        // cancelled document was sent, and it gets a translation when a screen calls it.
        "invoice-item-not-found",
        "invoice-cancelled",

        // State guards no screen names because no screen can reach them: the edit controls are
        // hidden unless the document is a draft, Convert appears only on a confirmed one, and the
        // target menu is built from the allowed targets. They are enforced anyway — the endpoint
        // is reachable without the screen — and a caller who bypasses the UI gets the generic
        // message, which is the honest thing to say to a request the UI would not have made.
        "not-draft",
        "not-confirmed",
        "invalid-target",

        // Containers. The browser threw a sentence for the missing one ("Container cnt-x not
        // found") because an id could not go stale in a single tab, and it never checked the
        // reference at all — the form marks the field required, so nothing could submit without
        // it. Both are enforced anyway, because the endpoint is reachable without the screen,
        // and both fall through to the generic failure message, which is the right thing to say
        // about a record that has vanished or a field the form would not have let through.
        "container-not-found",
        "reference-required",

        // Same for a stale warehouse-document id: the browser threw a sentence, and the generic
        // failure message is the right thing to say about a document that has gone.
        "inventory-doc-not-found",

        // And for an expense or revenue document, and one of its lines. Same reason, same
        // sentence-not-code history.
        "charge-doc-not-found",
        "charge-line-not-found",
        "claim-not-found",

        // Transfers. A stale id, and a cancelled transfer being brought back — the screen offers
        // neither, and both get the generic message. `transfer-not-draft` is NOT here: the form
        // names that one, because editing a confirmed transfer is a thing a person tries.
        "transfer-not-found",
        "transfer-cancelled",

        // A gain/loss record that has already been deleted — the only thing in the module that
        // really deletes, so the only place a stale row can be reached by two people at once.
        "gain-loss-not-found",

        // Conversions. A stale id and an edit on a confirmed document — the screen hides both
        // paths (the edit button appears on drafts only), so both get the generic message.
        "conversion-not-found",
        "conversion-not-draft",

        // A conversion input/output line with no product — the form already blocks submitting
        // a started row that is missing one (mirrors the cost rows' `common.required`), so this
        // only guards the endpoint against a caller that skips the screen; the generic message
        // is honest for that.
        "product-required",
    ];

    /// <summary>
    /// Every code a screen branches on.
    ///
    /// <para>
    /// Throws alone were enough while <c>api.ts</c> was the whole business layer. Each write it
    /// hands to the server is one throw fewer, and the code does not disappear with it — the
    /// screen still names it, it is just caught now instead of raised. Reading only the throws
    /// would report every ported code as unknown to the client and push it into the allowlist,
    /// which is how an allowlist stops meaning anything.
    /// </para>
    ///
    /// <para>
    /// Matched loosely, on purpose: a false positive here can only excuse a code from the
    /// <c>extra</c> check, and <c>missing</c> — the direction that catches a real bug — does not
    /// read this set at all.
    /// </para>
    /// </summary>
    private static HashSet<string> CodesTheClientHandles(string repoRoot)
    {
        var source = Path.Combine(repoRoot, "apps", "erp-panel", "src");
        var handled = new HashSet<string>(StringComparer.Ordinal);

        // `code === 'x'` / `code !== 'x'`, which is how every screen branches on one, plus the
        // array-of-codes form two of the modals use.
        foreach (var file in Directory.EnumerateFiles(source, "*.ts*", SearchOption.AllDirectories))
        {
            foreach (var match in System.Text.RegularExpressions.Regex
                         .Matches(File.ReadAllText(file),
                             @"(?:===|!==|\[|,)\s*'([a-z][a-z0-9]*(?:-[a-z0-9]+)+)'").AsEnumerable())
            {
                handled.Add(match.Groups[1].Value);
            }
        }

        return handled;
    }

    [Fact]
    public void The_contract_holds_every_code_the_front_end_uses()
    {
        var repoRoot = FindRepoRoot();
        var apiTs = File.ReadAllText(Path.Combine(repoRoot, "apps", "erp-panel", "src", "services", "api.ts"));

        // A throw is unambiguously a code, so it is the only thing trusted to prove the backend is
        // MISSING one. This set shrinks toward empty as writes move to the server; what replaces
        // it is the integration tests, which exercise each guard over real HTTP.
        var thrown = System.Text.RegularExpressions.Regex
            .Matches(apiTs, @"throw new Error\('([^']+)'\)")
            .Select(m => m.Groups[1].Value)
            .ToHashSet(StringComparer.Ordinal);

        var missing = thrown.Except(ErrorCodes.All, StringComparer.Ordinal).Order().ToList();
        var extra = ErrorCodes.All
            .Except(thrown, StringComparer.Ordinal)
            .Except(CodesTheClientHandles(repoRoot), StringComparer.Ordinal)
            .Except(BackendOnlyCodes, StringComparer.Ordinal)
            .Order()
            .ToList();

        Assert.True(missing.Count == 0,
            $"api.ts throws codes the backend contract does not list: {string.Join(", ", missing)}");
        Assert.True(extra.Count == 0,
            "The backend contract lists codes the client neither throws nor handles: " +
            $"{string.Join(", ", extra)}. Remove them, add the matching guard on the server, " +
            "or list them in BackendOnlyCodes.");
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
