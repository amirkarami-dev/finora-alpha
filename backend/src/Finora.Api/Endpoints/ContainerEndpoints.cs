using Finora.Api.Infrastructure;
using Finora.Erp.Application;
using Finora.Erp.Domain;
using Finora.Erp.Infrastructure.Trade;

namespace Finora.Api.Endpoints;

/// <summary>Shipping containers. Behind the <c>containers</c> permission, as the sidebar is.</summary>
internal static class ContainerEndpoints
{
    /// <summary>The container that changed, plus the whole list — the page derives its rows from
    /// the set, so patching one record in would leave it counting from a mixture.</summary>
    internal sealed record ContainerResult(Container Entity, IReadOnlyList<Container> All);

    public static IEndpointRouteBuilder MapContainerEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/erp/containers")
            .WithTags("ERP containers")
            .RequirePermission("containers");

        group.MapGet("/", async (ContainerService service, CancellationToken ct) =>
            Results.Ok(await service.ListAsync(ct)))
            .WithName("ListContainers");

        group.MapPost("/", async (
                ContainerInput input, ContainerService service, CancellationToken ct) =>
                Results.Ok(new ContainerResult(await service.CreateAsync(input, ct), await service.ListAsync(ct))))
            .WithName("CreateContainer");

        group.MapPut("/{id}", async (
                string id, ContainerInput input, ContainerService service, CancellationToken ct) =>
                Results.Ok(new ContainerResult(await service.UpdateAsync(id, input, ct), await service.ListAsync(ct))))
            .WithName("UpdateContainer");

        return app;
    }
}
