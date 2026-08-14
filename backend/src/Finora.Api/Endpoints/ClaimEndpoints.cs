using Finora.Api.Infrastructure;
using Finora.Erp.Application;
using Finora.Erp.Domain;
using Finora.Erp.Infrastructure.Trade;

namespace Finora.Api.Endpoints;

/// <summary>Claims. Behind the <c>claims</c> permission.</summary>
internal static class ClaimEndpoints
{
    internal sealed record ClaimResult(Claim Entity, IReadOnlyList<Claim> All);

    public static IEndpointRouteBuilder MapClaimEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/erp/claims")
            .WithTags("ERP claims")
            .RequirePermission("claims");

        group.MapGet("/", async (ClaimService service, CancellationToken ct) =>
            Results.Ok(await service.ListAsync(ct)))
            .WithName("ListClaims");

        group.MapPost("/", async (ClaimInput input, ClaimService service, CancellationToken ct) =>
            Results.Ok(new ClaimResult(await service.CreateAsync(input, ct), await service.ListAsync(ct))))
            .WithName("CreateClaim");

        group.MapPut("/{id}", async (
                string id, ClaimInput input, ClaimService service, CancellationToken ct) =>
                Results.Ok(new ClaimResult(await service.UpdateAsync(id, input, ct), await service.ListAsync(ct))))
            .WithName("UpdateClaim");

        group.MapPost("/{id}/cancel", async (string id, ClaimService service, CancellationToken ct) =>
            Results.Ok(new ClaimResult(await service.CancelAsync(id, ct), await service.ListAsync(ct))))
            .WithName("CancelClaim");

        return app;
    }
}
