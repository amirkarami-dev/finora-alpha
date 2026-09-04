namespace Finora.Identity.Infrastructure;

/// <summary>
/// Who may reach what, mirroring <c>apps/erp-panel/src/config/roles.ts</c> exactly.
///
/// <para>
/// A permission code here IS a front-end route key. That is deliberate: the SPA's sidebar and
/// route guards already test exactly these strings, so moving the decision to the server changes
/// where the answer comes from without changing the answer. A unit test compares this table
/// against <c>roles.ts</c> character for character, because the failure mode otherwise is a menu
/// item that silently appears or disappears for one role.
/// </para>
///
/// <para>
/// The permission code is a free-form string, so finer-grained entries
/// (<c>erp.sales.invoice.create</c>) can be granted later as rows without a schema change. The
/// route keys are simply the set that exists today.
/// </para>
/// </summary>
public static class AccessCatalogue
{
    public static IReadOnlyDictionary<string, string[]> RolePermissions { get; } =
        new Dictionary<string, string[]>(StringComparer.Ordinal)
        {
            ["CEO"] = ["executive", "reports", "settings", "users", "assistant"],

            ["Manager"] =
            [
                "dashboard", "customers", "contracts", "partners", "containers", "baseInfo",
                "purchase", "sale", "warehouse",
                // Not a route key: it gates one endpoint (confirming a conversion) and one button.
                "conversions.confirm",
                "payments", "transfers", "exchange",
                "expenses", "revenues", "claims", "reports", "settings", "develop", "users",
                "assistant",
            ],

            // Staff keeps baseInfo (its cost-centre capability predates the current shell) but
            // not expenses/revenues/claims — those are Manager-only, and the invoice charges
            // card is hidden from Staff entirely rather than shown empty, since an empty card
            // still reveals that costs exist.
            ["Staff"] =
            [
                "dashboard", "customers", "contracts", "partners", "containers", "baseInfo",
                "purchase", "sale", "warehouse",
                "assistant",
            ],

            ["Customer"] = ["portal"],
        };

    /// <summary>Where each role lands after signing in.</summary>
    public static IReadOnlyDictionary<string, string> RoleHome { get; } =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["CEO"] = "/app/executive",
            ["Manager"] = "/app/dashboard",
            ["Staff"] = "/app/dashboard",
            ["Customer"] = "/app/portal",
        };

    /// <summary>Every distinct permission code, sorted.</summary>
    public static IReadOnlyList<string> AllPermissions { get; } =
        [.. RolePermissions.Values.SelectMany(p => p).Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal)];
}

/// <summary>
/// The accounts created on an empty database, carried over from the front end's seeded list so
/// the same four logins keep working.
/// </summary>
public sealed record SeededAccount(string Email, string Name, string Role, string AvatarColor, string DemoPassword);

public static class SeededAccounts
{
    public static IReadOnlyList<SeededAccount> All { get; } =
    [
        new("ceo@finora.app", "Khalid Al Mansoori", "CEO", "#b87333", "Ceo@2026"),
        new("amir@finora.app", "Amir Karami", "Manager", "#b87333", "demo1234"),
        new("staff@finora.app", "Operations Desk", "Staff", "#3b82f6", "Staff@2026"),
        // Which customer this login sees is resolved from `Customer.portalAccount`, not from a
        // hardcoded id — a customer coded "AM" would otherwise inherit the portal's scope.
        new("portal@alcometal.ae", "Alco Metal Trading", "Customer", "#b87333", "Alco@2026"),
    ];
}
