using Finora.Api.Infrastructure;
using Finora.Erp.Application;
using Finora.Erp.Domain;
using Finora.Erp.Infrastructure.Trade;

namespace Finora.Api.Endpoints;

/// <summary>Warehouse receipts and issues. Behind the <c>warehouse</c> permission.</summary>
internal static class WarehouseDocumentEndpoints
{
    /// <summary>The document that changed, plus the whole list — stock is folded from the set, so
    /// one record on its own tells the page nothing it can count with.</summary>
    internal sealed record InventoryDocResult(
        InventoryDocument Entity, IReadOnlyList<InventoryDocument> All);

    public static IEndpointRouteBuilder MapWarehouseDocumentEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/erp/inventory-documents")
            .WithTags("ERP warehouse")
            .RequirePermission("warehouse");

        group.MapGet("/", async (WarehouseDocumentService service, CancellationToken ct) =>
            Results.Ok(await service.ListAsync(ct)))
            .WithName("ListInventoryDocuments");

        group.MapPost("/", async (
                InventoryDocInput input, WarehouseDocumentService service, CancellationToken ct) =>
                Results.Ok(new InventoryDocResult(
                    await service.CreateAsync(input, ct), await service.ListAsync(ct))))
            .WithName("CreateInventoryDocument");

        group.MapPost("/{id}/cancel", async (
                string id, WarehouseDocumentService service, CancellationToken ct) =>
                Results.Ok(new InventoryDocResult(
                    await service.CancelAsync(id, ct), await service.ListAsync(ct))))
            .WithName("CancelInventoryDocument");

        return app;
    }
}
