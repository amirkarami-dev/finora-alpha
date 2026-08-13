using Finora.Api.Infrastructure;
using Finora.Erp.Application;
using Finora.Erp.Domain;
using Finora.Erp.Infrastructure.Trade;

namespace Finora.Api.Endpoints;

/// <summary>
/// Trade documents — the six types and the chain between them.
///
/// <para>
/// Guarded by <c>purchase</c> or <c>sale</c> depending on the document, which is what the two
/// screens are called. The permission is resolved from the document rather than the route,
/// because a single route serves both sides.
/// </para>
/// </summary>
internal static class InvoiceEndpoints
{
    /// <summary>
    /// The document that changed, plus every invoice AND every contract.
    ///
    /// <para>
    /// Contracts come too because a line consumes contract quantity: a change here moves
    /// <c>remainingMt</c> on a contract line the caller never named. Returning invoices alone
    /// leaves the browser showing a contract that still believes it has the goods.
    /// </para>
    /// </summary>
    internal sealed record InvoiceResult(
        Invoice Entity, IReadOnlyList<Invoice> Invoices, IReadOnlyList<Contract> Contracts);

    public static IEndpointRouteBuilder MapInvoiceEndpoints(this IEndpointRouteBuilder app)
    {
        // Both trade screens are gated, and the pair is checked as any-of because one route
        // serves purchase and sale documents alike.
        var group = app.MapGroup("/api/erp/invoices")
            .WithTags("ERP trade documents")
            .RequireAnyPermission("purchase", "sale");

        group.MapGet("/", async (InvoiceService service, CancellationToken ct) =>
            Results.Ok(await service.ListAsync(ct)))
            .WithName("ListInvoices");

        group.MapPost("/", async (
                InvoiceInput input, InvoiceService service, ContractService contracts, CancellationToken ct) =>
                Results.Ok(await ResultAsync(service, contracts, await service.CreateAsync(input, ct), ct)))
            .WithName("CreateInvoice");

        group.MapPut("/{id}", async (
                string id, InvoiceHeaderPatch patch, InvoiceService service, ContractService contracts,
                CancellationToken ct) =>
                Results.Ok(await ResultAsync(service, contracts, await service.UpdateHeaderAsync(id, patch, ct), ct)))
            .WithName("UpdateInvoiceHeader");

        group.MapPost("/{id}/items", async (
                string id, List<InvoiceItemInput> items, InvoiceService service, ContractService contracts,
                CancellationToken ct) =>
                Results.Ok(await ResultAsync(service, contracts, await service.AddItemsAsync(id, items, ct), ct)))
            .WithName("AddInvoiceItems");

        group.MapPut("/{id}/items/{itemId}", async (
                string id, string itemId, InvoiceItemPatch patch, InvoiceService service,
                ContractService contracts, CancellationToken ct) =>
                Results.Ok(await ResultAsync(service, contracts, await service.UpdateItemAsync(id, itemId, patch, ct), ct)))
            .WithName("UpdateInvoiceItem");

        group.MapDelete("/{id}/items/{itemId}", async (
                string id, string itemId, InvoiceService service, ContractService contracts,
                CancellationToken ct) =>
                Results.Ok(await ResultAsync(service, contracts, await service.RemoveItemAsync(id, itemId, ct), ct)))
            .WithName("RemoveInvoiceItem");

        group.MapPost("/{id}/lme-price", async (
                string id, ApplyLmePriceInput input, InvoiceService service, ContractService contracts,
                CancellationToken ct) =>
                Results.Ok(await ResultAsync(service, contracts, await service.ApplyLmePriceAsync(id, input, ct), ct)))
            .WithName("ApplyLmePrice");

        group.MapPost("/{id}/confirm", async (
                string id, InvoiceService service, ContractService contracts, CancellationToken ct) =>
                Results.Ok(await ResultAsync(service, contracts, await service.ConfirmAsync(id, ct), ct)))
            .WithName("ConfirmInvoice");

        group.MapPost("/{id}/cancel", async (
                string id, InvoiceService service, ContractService contracts, CancellationToken ct) =>
                Results.Ok(await ResultAsync(service, contracts, await service.CancelAsync(id, ct), ct)))
            .WithName("CancelInvoice");

        group.MapPost("/{id}/convert", async (
                string id, ConvertInvoiceInput input, InvoiceService service, ContractService contracts,
                CancellationToken ct) =>
                Results.Ok(await ResultAsync(service, contracts, await service.ConvertAsync(id, input.TargetType, ct), ct)))
            .WithName("ConvertInvoice");

        group.MapPost("/{id}/sent", async (
                string id, InvoiceService service, ContractService contracts, CancellationToken ct) =>
                Results.Ok(await ResultAsync(service, contracts, await service.MarkSentAsync(id, ct), ct)))
            .WithName("MarkInvoiceSent");

        return app;
    }

    private static async Task<InvoiceResult> ResultAsync(
        InvoiceService service, ContractService contracts, Invoice entity, CancellationToken ct) =>
        new(entity, await service.ListAsync(ct), await contracts.ListAsync(ct));
}
