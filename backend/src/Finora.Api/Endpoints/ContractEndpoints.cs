using System.Security.Claims;
using Finora.Api.Infrastructure;
using Finora.Erp.Application;
using Finora.Erp.Domain;
using Finora.Erp.Infrastructure.Trade;

namespace Finora.Api.Endpoints;

/// <summary>
/// Contracts and their goods lines — the first trade documents that persist.
///
/// <para>
/// Every response carries the whole contract list rather than the one record that changed. Adding
/// a line changes its contract's totals, and the SPA derives its rows from the set, so handing
/// back one contract would leave the browser recomputing from a mixture of old and new. These
/// lists are small, and the alternative is a second request that could fail on its own.
/// </para>
/// </summary>
internal static class ContractEndpoints
{
    /// <summary>The contract list plus the one that changed, mirroring the master-data shape.</summary>
    internal sealed record ContractResult(Contract Entity, IReadOnlyList<Contract> All);

    public static IEndpointRouteBuilder MapContractEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/erp/contracts")
            .WithTags("ERP contracts")
            .RequirePermission("contracts");

        group.MapGet("/", async (ContractService service, CancellationToken cancellationToken) =>
            Results.Ok(await service.ListAsync(cancellationToken)))
            .WithName("ListContracts");

        group.MapPost("/", async (
                ContractInput input, ContractService service, CancellationToken cancellationToken) =>
                Results.Ok(await ResultAsync(service, await service.CreateAsync(input, cancellationToken), cancellationToken)))
            .WithName("CreateContract");

        group.MapPut("/{id}", async (
                string id, ContractInput input, ContractService service, CancellationToken cancellationToken) =>
                Results.Ok(await ResultAsync(service, await service.UpdateAsync(id, input, cancellationToken), cancellationToken)))
            .WithName("UpdateContract");

        group.MapPost("/{id}/items", async (
                string id, ContractItemInput input, ContractService service, CancellationToken cancellationToken) =>
                Results.Ok(await ResultAsync(service, await service.AddItemAsync(id, input, cancellationToken), cancellationToken)))
            .WithName("AddContractItem");

        group.MapPut("/{id}/items/{itemId}", async (
                string id, string itemId, ContractItemInput input, ContractService service,
                CancellationToken cancellationToken) =>
                Results.Ok(await ResultAsync(service, await service.UpdateItemAsync(id, itemId, input, cancellationToken), cancellationToken)))
            .WithName("UpdateContractItem");

        group.MapPost("/{id}/items/{itemId}/changes", async (
                string id, string itemId, ContractItemChangeInput input, ClaimsPrincipal principal,
                ContractService service, CancellationToken cancellationToken) =>
            {
                // Who made the change is stamped from the session, never taken from the body.
                var userId = Guid.Parse(principal.FindFirstValue(IdentityEndpoints.UserIdClaim)!);
                var userName = principal.FindFirstValue(ClaimTypes.Name) ?? "";
                var contract = await service.ChangeItemQuantityAsync(id, itemId, input, userId, userName, cancellationToken);
                return Results.Ok(await ResultAsync(service, contract, cancellationToken));
            })
            .WithName("ChangeContractItemQuantity");

        return app;
    }

    private static async Task<ContractResult> ResultAsync(
        ContractService service, Contract entity, CancellationToken cancellationToken) =>
        new(entity, await service.ListAsync(cancellationToken));
}
