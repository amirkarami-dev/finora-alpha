using Finora.Erp.Infrastructure.Snapshot;

namespace Finora.Api.Endpoints;

/// <summary>
/// The ERP strangler seam: read the whole dataset, or replace it.
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

        group.MapGet("/snapshot", async (SnapshotService snapshots, CancellationToken cancellationToken) =>
            Results.Ok(await snapshots.ReadAsync(cancellationToken)))
            .WithName("GetErpSnapshot")
            .WithSummary("The whole ERP dataset, in the shape the SPA's store expects.");

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
            .WithName("ReplaceErpSnapshot")
            .WithSummary("Replace the entire ERP dataset. Destructive; gated by configuration.");

        return app;
    }
}
