using Finora.Api.Infrastructure;
using Finora.Erp.Application;
using Finora.Erp.Infrastructure.Trade;

namespace Finora.Api.Endpoints;

public static class ConversionEndpoints
{
    public static IEndpointRouteBuilder MapConversionEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/erp/conversions")
            .WithTags("ERP warehouse")
            .RequirePermission("warehouse");

        group.MapGet("/", async (ConversionService service, CancellationToken ct) =>
            Results.Ok(await service.ListAsync(ct)))
            .WithName("ListConversions");

        group.MapPost("/", async (ConversionDocInput input, ConversionService service, CancellationToken ct) =>
            Results.Ok(new ConversionResult(await service.CreateAsync(input, ct), await service.ListAsync(ct))))
            .WithName("CreateConversion");

        group.MapPut("/{id}", async (string id, ConversionDocInput input, ConversionService service, CancellationToken ct) =>
            Results.Ok(new ConversionResult(await service.UpdateAsync(id, input, ct), await service.ListAsync(ct))))
            .WithName("UpdateConversion");

        group.MapPost("/{id}/cancel", async (string id, ConversionService service, CancellationToken ct) =>
            Results.Ok(new ConversionResult(await service.CancelAsync(id, ct), await service.ListAsync(ct))))
            .WithName("CancelConversion");

        // Confirm changes stock and cost, so it takes the manager-only permission on top of the
        // group's; a Staff session gets 403 here and nowhere else in this group.
        group.MapPost("/{id}/confirm", async (string id, ConversionService service, CancellationToken ct) =>
            Results.Ok(new ConversionResult(await service.ConfirmAsync(id, ct), await service.ListAsync(ct))))
            .RequirePermission("conversions.confirm")
            .WithName("ConfirmConversion");

        return app;
    }
}
