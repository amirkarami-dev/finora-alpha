using System.Security.Claims;
using Finora.Api.Endpoints;
using Finora.Identity.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

namespace Finora.Api.Infrastructure;

/// <summary>
/// Server-side permission checks — the first in this codebase.
///
/// <para>
/// Until now the only authorization here was a bare <c>RequireAuthorization()</c>, which means
/// "any valid cookie". The permission list was enforced only by the SPA's route guards, so a
/// Customer-role session could call anything by hand. That was survivable while every endpoint
/// answered with data the signed-in user could already see; it stops being survivable the moment
/// an endpoint can create an account.
/// </para>
///
/// <para>
/// Permissions are read from the database on each protected request rather than baked into the
/// cookie as claims. The cookie lasts seven days and slides, so a claim-based check would leave a
/// revoked permission working for a week. This matches what <c>/api/identity/me</c> already does
/// deliberately: rebuild from the database so a change takes effect on the next request.
/// </para>
/// </summary>
internal static class PermissionAuthorization
{
    /// <summary>Policy names are derived, not spelled out, so a permission code and its policy
    /// cannot drift apart.</summary>
    public static string PolicyFor(params string[] permissions) =>
        $"perm:{string.Join('|', permissions.Order(StringComparer.Ordinal))}";

    /// <summary>
    /// Permission pairs that are checked as any-of, because one route serves two screens.
    ///
    /// <para>Listed rather than composed on demand: the set is tiny, and registering them at
    /// startup means a typo fails the application rather than silently creating a policy nobody
    /// holds — which would read as "everyone is forbidden" and be blamed on the data.</para>
    /// </summary>
    private static readonly string[][] AnyOfPolicies =
    [
        ["purchase", "sale"],   // trade documents: one route, both sides
    ];

    /// <summary>
    /// Registers one policy per known permission code.
    ///
    /// <para>
    /// A loop over the catalogue rather than a custom <see cref="IAuthorizationPolicyProvider"/>:
    /// the set of codes is known at startup and small, so the dynamic provider would be machinery
    /// earning nothing. A typo in a route's permission name fails at startup with "policy not
    /// found" instead of silently letting everyone through.
    /// </para>
    /// </summary>
    public static AuthorizationOptions AddPermissionPolicies(this AuthorizationOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);

        foreach (var permission in AccessCatalogue.AllPermissions)
        {
            options.AddPolicy(PolicyFor(permission), policy =>
                policy.AddRequirements(new PermissionRequirement(permission)));
        }

        foreach (var pair in AnyOfPolicies)
        {
            options.AddPolicy(PolicyFor(pair), policy =>
                policy.AddRequirements(new PermissionRequirement(pair)));
        }

        return options;
    }

    /// <summary>Requires the caller to hold <paramref name="permission"/>, the same route-key
    /// string the SPA's sidebar and route guards test.</summary>
    public static TBuilder RequirePermission<TBuilder>(this TBuilder builder, string permission)
        where TBuilder : IEndpointConventionBuilder =>
        builder.RequireAuthorization(PolicyFor(permission));

    /// <summary>Requires ANY of the given permissions. The combination must appear in
    /// <c>AnyOfPolicies</c>, so an unregistered pair fails at startup, not at the first request.</summary>
    public static TBuilder RequireAnyPermission<TBuilder>(this TBuilder builder, params string[] permissions)
        where TBuilder : IEndpointConventionBuilder =>
        builder.RequireAuthorization(PolicyFor(permissions));
}

/// <summary>Holds one permission, or a set any of which will do.</summary>
internal sealed class PermissionRequirement(params string[] permissions) : IAuthorizationRequirement
{
    public IReadOnlyCollection<string> Permissions { get; } = permissions;
}

/// <summary>
/// Answers "does this session still hold that permission?" from the database.
///
/// <para>Scoped, because it uses the request's <see cref="IdentityDbContext"/>.</para>
/// </summary>
internal sealed class PermissionHandler(IdentityDbContext db)
    : AuthorizationHandler<PermissionRequirement>
{
    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context, PermissionRequirement requirement)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(requirement);

        var raw = context.User.FindFirstValue(IdentityEndpoints.UserIdClaim);
        if (!Guid.TryParse(raw, out var userId))
        {
            return;   // No id claim means no session; leaving it unhandled is a 401.
        }

        // `Active` is part of the query, not a separate check: deactivating an account has to
        // revoke it immediately, and the cookie it was issued outlives the decision by a week.
        var wanted = requirement.Permissions;
        var held = await db.Users
            .Where(u => u.Id == userId && u.Active)
            .SelectMany(u => u.Roles.SelectMany(r => r.Role!.Permissions.Select(p => p.Permission!.Code)))
            .AnyAsync(code => wanted.Contains(code));

        if (held)
        {
            context.Succeed(requirement);
        }
    }
}
