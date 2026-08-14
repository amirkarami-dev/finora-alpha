using Finora.Api.Infrastructure;
using Finora.Erp.Application;
using Finora.Erp.Domain;
using Finora.Erp.Infrastructure.Money;

namespace Finora.Api.Endpoints;

/// <summary>Transfers between the company's own accounts. Behind the <c>transfers</c> permission.</summary>
internal static class MoneyTransferEndpoints
{
    internal sealed record TransferResult(MoneyTransfer Entity, IReadOnlyList<MoneyTransfer> All);

    internal sealed record TransferStatusInput
    {
        public required TransferStatus Status { get; init; }
    }

    public static IEndpointRouteBuilder MapMoneyTransferEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/erp/transfers")
            .WithTags("ERP transfers")
            .RequirePermission("transfers");

        group.MapGet("/", async (MoneyTransferService service, CancellationToken ct) =>
            Results.Ok(await service.ListAsync(ct)))
            .WithName("ListMoneyTransfers");

        group.MapPost("/", async (
                MoneyTransferInput input, MoneyTransferService service, CancellationToken ct) =>
                Results.Ok(new TransferResult(await service.CreateAsync(input, ct), await service.ListAsync(ct))))
            .WithName("CreateMoneyTransfer");

        group.MapPut("/{id}", async (
                string id, MoneyTransferInput input, MoneyTransferService service, CancellationToken ct) =>
                Results.Ok(new TransferResult(await service.UpdateAsync(id, input, ct), await service.ListAsync(ct))))
            .WithName("UpdateMoneyTransfer");

        group.MapPost("/{id}/status", async (
                string id, TransferStatusInput input, MoneyTransferService service, CancellationToken ct) =>
                Results.Ok(new TransferResult(await service.SetStatusAsync(id, input.Status, ct), await service.ListAsync(ct))))
            .WithName("SetTransferStatus");

        return app;
    }
}
