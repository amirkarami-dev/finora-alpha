using Finora.Api.Infrastructure;
using Finora.Erp.Application;
using Finora.Erp.Domain;
using Finora.Erp.Infrastructure.Money;

namespace Finora.Api.Endpoints;

/// <summary>
/// Payments, their lines, and the cheques that settle them.
///
/// <para>Behind the <c>payments</c> permission — the same key the sidebar and the route guards
/// test, so what the server allows and what the screen offers cannot drift apart.</para>
/// </summary>
internal static class PaymentEndpoints
{
    /// <summary>
    /// The payment that changed, plus every payment AND every cheque.
    ///
    /// <para>
    /// Cheques come too because a payment line mints them: adding one line can create a cheque
    /// the caller never named, and returning payments alone would leave the register missing it
    /// until the next reload. The same is true in reverse — clearing a cheque changes what a
    /// payment line is worth to every balance.
    /// </para>
    /// </summary>
    internal sealed record PaymentResult(
        Payment Entity, IReadOnlyList<Payment> Payments, IReadOnlyList<Cheque> Cheques);

    /// <summary>A cheque write answers with the same pair, so one shape covers both screens.</summary>
    internal sealed record ChequeResult(
        Cheque Entity, IReadOnlyList<Payment> Payments, IReadOnlyList<Cheque> Cheques);

    public static IEndpointRouteBuilder MapPaymentEndpoints(this IEndpointRouteBuilder app)
    {
        var payments = app.MapGroup("/api/erp/payments")
            .WithTags("ERP payments")
            .RequirePermission("payments");

        payments.MapGet("/", async (PaymentService service, CancellationToken ct) =>
            Results.Ok(await service.ListAsync(ct)))
            .WithName("ListPayments");

        payments.MapPost("/", async (
                PaymentInput input, PaymentService service, CancellationToken ct) =>
                Results.Ok(await ResultAsync(service, await service.CreateAsync(input, ct), ct)))
            .WithName("CreatePayment");

        payments.MapPut("/{id}", async (
                string id, PaymentHeaderInput input, PaymentService service, CancellationToken ct) =>
                Results.Ok(await ResultAsync(service, await service.UpdateHeaderAsync(id, input, ct), ct)))
            .WithName("UpdatePaymentHeader");

        payments.MapPost("/{id}/status", async (
                string id, PaymentStatusInput input, PaymentService service, CancellationToken ct) =>
                Results.Ok(await ResultAsync(service, await service.SetStatusAsync(id, input.Status, ct), ct)))
            .WithName("SetPaymentStatus");

        payments.MapPost("/{id}/items", async (
                string id, PaymentItemInput input, PaymentService service, CancellationToken ct) =>
                Results.Ok(await ResultAsync(service, await service.AddItemAsync(id, input, ct), ct)))
            .WithName("AddPaymentItem");

        payments.MapPut("/{id}/items/{itemId}", async (
                string id, string itemId, PaymentItemInput input, PaymentService service,
                CancellationToken ct) =>
                Results.Ok(await ResultAsync(service, await service.UpdateItemAsync(id, itemId, input, ct), ct)))
            .WithName("UpdatePaymentItem");

        payments.MapDelete("/{id}/items/{itemId}", async (
                string id, string itemId, PaymentService service, CancellationToken ct) =>
                Results.Ok(await ResultAsync(service, await service.RemoveItemAsync(id, itemId, ct), ct)))
            .WithName("RemovePaymentItem");

        var cheques = app.MapGroup("/api/erp/cheques")
            .WithTags("ERP payments")
            .RequirePermission("payments");

        cheques.MapGet("/", async (PaymentService service, CancellationToken ct) =>
            Results.Ok(await service.ListChequesAsync(ct)))
            .WithName("ListCheques");

        cheques.MapPost("/", async (
                ChequeInput input, PaymentService service, CancellationToken ct) =>
                Results.Ok(await ChequeResultAsync(service, await service.CreateChequeAsync(input, ct), ct)))
            .WithName("CreateCheque");

        cheques.MapPut("/{id}", async (
                string id, ChequeInput input, PaymentService service, CancellationToken ct) =>
                Results.Ok(await ChequeResultAsync(service, await service.UpdateChequeAsync(id, input, ct), ct)))
            .WithName("UpdateCheque");

        cheques.MapPost("/{id}/status", async (
                string id, ChequeStatusInput input, PaymentService service, CancellationToken ct) =>
                Results.Ok(await ChequeResultAsync(service, await service.SetChequeStatusAsync(id, input, ct), ct)))
            .WithName("SetChequeStatus");

        return app;
    }

    private static async Task<PaymentResult> ResultAsync(
        PaymentService service, Payment entity, CancellationToken ct) =>
        new(entity, await service.ListAsync(ct), await service.ListChequesAsync(ct));

    private static async Task<ChequeResult> ChequeResultAsync(
        PaymentService service, Cheque entity, CancellationToken ct) =>
        new(entity, await service.ListAsync(ct), await service.ListChequesAsync(ct));
}
