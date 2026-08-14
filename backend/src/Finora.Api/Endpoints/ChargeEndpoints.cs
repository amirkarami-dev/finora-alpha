using Finora.Api.Infrastructure;
using Finora.Erp.Application;
using Finora.Erp.Domain;
using Finora.Erp.Infrastructure.Money;

namespace Finora.Api.Endpoints;

/// <summary>
/// Expenses and revenues.
///
/// <para>One route set for both, because they are one mirrored implementation — the document's
/// own direction says which it is. Guarded by either screen's permission.</para>
/// </summary>
internal static class ChargeEndpoints
{
    internal sealed record ChargeResult(ChargeDoc Entity, IReadOnlyList<ChargeDoc> All);

    public static IEndpointRouteBuilder MapChargeEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/erp/charge-docs")
            .WithTags("ERP expenses and revenues")
            .RequireAnyPermission("expenses", "revenues");

        group.MapGet("/", async (ChargeService service, CancellationToken ct) =>
            Results.Ok(await service.ListAsync(ct)))
            .WithName("ListChargeDocs");

        group.MapPost("/", async (ChargeDocInput input, ChargeService service, CancellationToken ct) =>
            Results.Ok(new ChargeResult(await service.CreateAsync(input, ct), await service.ListAsync(ct))))
            .WithName("CreateChargeDoc");

        group.MapPut("/{id}", async (
                string id, ChargeDocInput input, ChargeService service, CancellationToken ct) =>
                Results.Ok(new ChargeResult(await service.UpdateAsync(id, input, ct), await service.ListAsync(ct))))
            .WithName("UpdateChargeDoc");

        group.MapPost("/{id}/cancel", async (string id, ChargeService service, CancellationToken ct) =>
            Results.Ok(new ChargeResult(await service.CancelAsync(id, ct), await service.ListAsync(ct))))
            .WithName("CancelChargeDoc");

        group.MapPost("/{id}/lines", async (
                string id, ChargeLineInput input, ChargeService service, CancellationToken ct) =>
                Results.Ok(new ChargeResult(await service.AddLineAsync(id, input, ct), await service.ListAsync(ct))))
            .WithName("AddChargeLine");

        group.MapPut("/{id}/lines/{lineId}", async (
                string id, string lineId, ChargeLineInput input, ChargeService service, CancellationToken ct) =>
                Results.Ok(new ChargeResult(await service.UpdateLineAsync(id, lineId, input, ct), await service.ListAsync(ct))))
            .WithName("UpdateChargeLine");

        group.MapDelete("/{id}/lines/{lineId}", async (
                string id, string lineId, ChargeService service, CancellationToken ct) =>
                Results.Ok(new ChargeResult(await service.RemoveLineAsync(id, lineId, ct), await service.ListAsync(ct))))
            .WithName("RemoveChargeLine");

        return app;
    }
}
