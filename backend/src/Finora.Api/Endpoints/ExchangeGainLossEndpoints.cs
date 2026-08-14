using Finora.Api.Infrastructure;
using Finora.Erp.Application;
using Finora.Erp.Domain;
using Finora.Erp.Infrastructure.Money;

namespace Finora.Api.Endpoints;

/// <summary>Exchange gains and losses. Behind the <c>exchange</c> permission.</summary>
internal static class ExchangeGainLossEndpoints
{
    internal sealed record GainLossResult(ExchangeGainLoss Entity, IReadOnlyList<ExchangeGainLoss> All);

    public static IEndpointRouteBuilder MapExchangeGainLossEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/erp/exchange-gain-losses")
            .WithTags("ERP exchange")
            .RequirePermission("exchange");

        group.MapGet("/", async (ExchangeGainLossService service, CancellationToken ct) =>
            Results.Ok(await service.ListAsync(ct)))
            .WithName("ListExchangeGainLosses");

        group.MapPost("/", async (
                ExchangeGainLossInput input, ExchangeGainLossService service, CancellationToken ct) =>
                Results.Ok(new GainLossResult(await service.CreateAsync(input, ct), await service.ListAsync(ct))))
            .WithName("CreateExchangeGainLoss");

        group.MapPut("/{id}", async (
                string id, ExchangeGainLossInput input, ExchangeGainLossService service, CancellationToken ct) =>
                Results.Ok(new GainLossResult(await service.UpdateAsync(id, input, ct), await service.ListAsync(ct))))
            .WithName("UpdateExchangeGainLoss");

        group.MapDelete("/{id}", async (
                string id, ExchangeGainLossService service, CancellationToken ct) =>
        {
            await service.DeleteAsync(id, ct);
            return Results.Ok(await service.ListAsync(ct));
        })
            .WithName("DeleteExchangeGainLoss");

        return app;
    }
}
