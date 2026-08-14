using System.Security.Claims;
using Finora.Api.Infrastructure;
using Finora.Erp.Infrastructure;
using Finora.Erp.Infrastructure.Snapshot;
using Finora.Identity.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Finora.Api.Endpoints;

/// <summary>
/// The ERP strangler seam: read the dataset you are allowed to see, or replace it.
///
/// <para>
/// Deliberately coarse. The SPA's derived reads are global — one person's balance walks
/// customers, invoices, payments, claims, charge documents, cheques and transfers together — so
/// there is no entity you can move to the server on its own without leaving every balance
/// quietly wrong. Hydrating the client's store from one snapshot keeps its proven derivation
/// running over server data, and writes then move one feature at a time. Both endpoints are
/// deleted once the last read is server-side.
/// </para>
/// </summary>
internal static class ErpEndpoints
{
    public static IEndpointRouteBuilder MapErpEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/erp").WithTags("ERP").RequireAuthorization();

        group.MapGet("/snapshot", async (
            SnapshotService snapshots,
            IdentityDbContext identity,
            ErpDbContext erp,
            HttpContext context,
            CancellationToken cancellationToken) =>
        {
            // Which dataset you get is the authorization here, not whether you get one. A
            // back-office role reads everything; a portal customer reads their own affairs. The
            // old version handed the whole trading book to anyone with a cookie and left the
            // filtering to the browser, which is not filtering — the data had already been sent.
            var scope = await ResolveScopeAsync(identity, erp, context, cancellationToken);

            return Results.Ok(scope is null
                ? await snapshots.ReadAsync(cancellationToken)
                : await snapshots.ReadForCustomerAsync(scope, cancellationToken));
        })
            .WithName("GetErpSnapshot")
            .WithSummary("The ERP dataset the caller is entitled to, in the shape the SPA's store expects.");

        group.MapPut("/snapshot", async (
            ErpSnapshot snapshot,
            SnapshotService snapshots,
            IConfiguration configuration,
            CancellationToken cancellationToken) =>
        {
            // This wipes everything. It is what "Load sample data" and "Reset" have always done,
            // but a destructive endpoint deserves a switch that production can leave off — the
            // one behind it is a demo aid, not a business operation.
            if (!configuration.GetValue<bool>("Erp:AllowDestructiveAdmin"))
            {
                return Results.Problem(
                    title: "Replacing the dataset is disabled on this environment.",
                    statusCode: StatusCodes.Status403Forbidden,
                    extensions: new Dictionary<string, object?> { ["code"] = "destructive-admin-disabled" });
            }

            await snapshots.ReplaceAsync(snapshot, cancellationToken);
            return Results.NoContent();
        })
            // Behind the same permission as the screen that offers it — the buttons live in
            // Settings → Danger zone, which Staff and Customer cannot open.
            .RequirePermission("settings")
            .WithName("ReplaceErpSnapshot")
            .WithSummary("Replace the entire ERP dataset. Destructive; gated by configuration.");

        return app;
    }

    /// <summary>
    /// The customer this caller is limited to, or <c>null</c> for the whole dataset.
    ///
    /// <para>
    /// Holding <c>portal</c> is what makes someone an outside party; holding <c>customers</c> is
    /// what makes them staff. Both conditions are checked rather than just the first, so granting
    /// a back-office role the portal page some day widens their view instead of silently
    /// narrowing it to one customer.
    /// </para>
    /// </summary>
    private static async Task<string?> ResolveScopeAsync(
        IdentityDbContext identity, ErpDbContext erp, HttpContext context, CancellationToken cancellationToken)
    {
        var raw = context.User.FindFirstValue(IdentityEndpoints.UserIdClaim);
        if (!Guid.TryParse(raw, out var userId))
        {
            return null;
        }

        var permissions = await identity.Users
            .Where(u => u.Id == userId && u.Active)
            .SelectMany(u => u.Roles.SelectMany(r => r.Role!.Permissions.Select(p => p.Permission!.Code)))
            .ToListAsync(cancellationToken);

        if (!permissions.Contains("portal", StringComparer.Ordinal)
            || permissions.Contains("customers", StringComparer.Ordinal))
        {
            return null;
        }

        // Which customer the portal shows is a property of the data, not of the login — the same
        // rule the SPA has always used. No customer flagged means an empty snapshot rather than
        // everyone's.
        return await erp.Customers
            .Where(c => c.PortalAccount && c.Active)
            .Select(c => c.Id)
            .FirstOrDefaultAsync(cancellationToken) ?? string.Empty;
    }
}
