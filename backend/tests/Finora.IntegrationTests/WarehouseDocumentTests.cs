using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Finora.Erp.Domain;
using Finora.Erp.Infrastructure.Snapshot;
using Finora.Erp.Infrastructure.Trade;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Finora.IntegrationTests;

/// <summary>
/// Warehouse receipts and issues over real HTTP.
///
/// <para>
/// Stock is not stored anywhere — it is folded from the documents. So these tests move metal in
/// and out and then ask what is left, which is the only way to check the fold at all.
/// </para>
/// </summary>
[Collection(nameof(ApiCollection))]
public sealed class WarehouseDocumentTests(ApiFixture fixture)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private const string Date = "2026-08-13T00:00:00Z";
    private const string Copper = "98% Copper Ingots";

    private static async Task<HttpClient> AsManagerAsync(ApiFixture fixture)
    {
        var client = fixture.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        (await client.PostAsJsonAsync(new Uri("/api/identity/login", UriKind.Relative),
            new { email = "amir@finora.app", password = "demo1234" })).EnsureSuccessStatusCode();
        return client;
    }

    /// <summary>
    /// One warehouse, and two CONFIRMED documents on opposite sides carrying the same metal: a
    /// purchase invoice for 100 MT to receive, and a sale invoice for 100 MT to issue.
    /// </summary>
    private async Task ResetAsync()
    {
        using var scope = fixture.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<SnapshotService>().ReplaceAsync(new ErpSnapshot
        {
            Customers = [new Customer { Id = "cust-am", Name = "Alco Metal Trading", Code = "AM" }],
            Warehouses = [new Warehouse { Id = "wh-1", Name = "Jebel Ali", Code = "JA" }],
            Contracts =
            [
                new Contract
                {
                    Id = "ctr-1", CustomerId = "cust-am", Destination = "NINGBO",
                    Items = [new ContractItem { Id = "item-1", ContractId = "ctr-1", Product = Copper, QuantityMt = 200m, RemainingMt = 200m }],
                },
            ],
            Invoices =
            [
                // Priced at 1,000,000 USD for the 100 MT line — 10,000 USD/MT — so a receipt
                // against it has a price to read.
                Doc("inv-pi-0001", "PI-2026-0001", InvoiceType.PURCHASE_INVOICE, "pref-1", amount: 1_000_000m),
                Doc("inv-si-0001", "SI-2026-0001", InvoiceType.SALE_INVOICE, "sref-1"),
                // An ORDER is a promise, not a shipment — nothing may be received against it.
                Doc("inv-po-0001", "PO-2026-0001", InvoiceType.PURCHASE_ORDER, "oref-1"),
            ],
        });
    }

    private static Invoice Doc(string id, string number, InvoiceType type, string refId, decimal amount = 0m) => new()
    {
        Id = id, InvoiceNumber = number, InvoiceType = type,
        Status = InvoiceStatus.CONFIRMED, ContractId = "ctr-1", CustomerId = "cust-am",
        Currency = Currency.USD, ExchangeRate = 1m,
        Items =
        [
            new InvoiceItem
            {
                Id = $"invitem-{refId}", InvoiceId = id, ContractItemId = "item-1",
                Product = Copper, QuantityMt = 100m, ReferenceDocumentItemId = refId,
                Amount = amount,
            },
        ],
    };

    private static async Task<JsonElement> PostAsync(HttpClient c, string url, object? body = null)
    {
        var r = body is null
            ? await c.PostAsync(new Uri(url, UriKind.Relative), null)
            : await c.PostAsJsonAsync(new Uri(url, UriKind.Relative), body);
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<JsonElement>(Json);
    }

    private static async Task<JsonElement> ProblemAsync(HttpResponseMessage r) =>
        await r.Content.ReadFromJsonAsync<JsonElement>(Json);

    private static object Move(string type, string invoiceId, string refId, decimal qty) => new
    {
        type, warehouseId = "wh-1", invoiceId, date = Date,
        items = new[] { new { referenceDocumentItemId = refId, quantityMt = qty } },
    };

    private static Task<JsonElement> ReceiveAsync(HttpClient c, decimal qty) =>
        PostAsync(c, "/api/erp/inventory-documents", Move("IN", "inv-pi-0001", "pref-1", qty));

    /* -------------------------------- Numbering ------------------------------- */

    [Fact]
    public async Task A_receipt_and_an_issue_each_count_from_one()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var grn = (await ReceiveAsync(c, 100m)).GetProperty("entity");
        Assert.Equal("GRN-2026-0001", grn.GetProperty("docNumber").GetString());

        var gdn = (await PostAsync(c, "/api/erp/inventory-documents",
            Move("OUT", "inv-si-0001", "sref-1", 40m))).GetProperty("entity");

        // The prefix is part of the number being checked for, so each kind counts from one and
        // GRN-2026-0001 and GDN-2026-0001 sit side by side. Uniqueness is on the whole string.
        Assert.Equal("GDN-2026-0001", gdn.GetProperty("docNumber").GetString());
    }

    /* --------------------------------- Stock ---------------------------------- */

    [Fact]
    public async Task An_issue_cannot_take_out_more_than_the_warehouse_holds()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        await ReceiveAsync(c, 40m);

        var response = await c.PostAsJsonAsync(
            new Uri("/api/erp/inventory-documents", UriKind.Relative),
            Move("OUT", "inv-si-0001", "sref-1", 60m));

        var problem = await ProblemAsync(response);
        Assert.Equal("insufficient-stock", problem.GetProperty("code").GetString());
        Assert.Equal(Copper, problem.GetProperty("product").GetString());
        Assert.Equal(40m, problem.GetProperty("available").GetDecimal());
    }

    [Fact]
    public async Task Two_lines_of_one_metal_are_checked_against_each_other()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        await ReceiveAsync(c, 50m);

        // Two lines of 30 in ONE issue, against 50 in stock. Each is under 50 on its own; together
        // they are not. Reading the stock once before the loop lets both through and drives the
        // warehouse to minus ten.
        var response = await c.PostAsJsonAsync(
            new Uri("/api/erp/inventory-documents", UriKind.Relative), new
            {
                type = "OUT", warehouseId = "wh-1", invoiceId = "inv-si-0001", date = Date,
                items = new[]
                {
                    new { referenceDocumentItemId = "sref-1", quantityMt = 30m },
                    new { referenceDocumentItemId = "sref-1", quantityMt = 30m },
                },
            });

        Assert.Equal("insufficient-stock", (await ProblemAsync(response)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Two_lines_are_also_checked_against_the_documents_own_quantity()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        // The same running rule on the other guard: the purchase line is 100 MT, and two receipts
        // of 60 inside one document add to 120.
        var response = await c.PostAsJsonAsync(
            new Uri("/api/erp/inventory-documents", UriKind.Relative), new
            {
                type = "IN", warehouseId = "wh-1", invoiceId = "inv-pi-0001", date = Date,
                items = new[]
                {
                    new { referenceDocumentItemId = "pref-1", quantityMt = 60m },
                    new { referenceDocumentItemId = "pref-1", quantityMt = 60m },
                },
            });

        var problem = await ProblemAsync(response);
        Assert.Equal("exceeds-remaining", problem.GetProperty("code").GetString());
        Assert.Equal(40m, problem.GetProperty("remaining").GetDecimal());
    }

    [Fact]
    public async Task Stock_is_only_counted_from_live_documents()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var id = (await ReceiveAsync(c, 100m)).GetProperty("entity").GetProperty("id").GetString();
        await PostAsync(c, $"/api/erp/inventory-documents/{id}/cancel");

        // Cancelled, so it never moved any metal — and the issue now has nothing to take.
        var response = await c.PostAsJsonAsync(
            new Uri("/api/erp/inventory-documents", UriKind.Relative),
            Move("OUT", "inv-si-0001", "sref-1", 10m));

        Assert.Equal("insufficient-stock", (await ProblemAsync(response)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task A_cancelled_receipt_frees_the_quantity_for_another_one()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var id = (await ReceiveAsync(c, 100m)).GetProperty("entity").GetProperty("id").GetString();
        await PostAsync(c, $"/api/erp/inventory-documents/{id}/cancel");

        // The whole 100 is available again, because the used-quantity fold skips cancelled ones.
        (await ReceiveAsync(c, 100m)).GetProperty("entity");
    }

    /* -------------------------------- Cancelling ------------------------------ */

    [Fact]
    public async Task A_receipt_cannot_be_cancelled_once_the_metal_has_left()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var id = (await ReceiveAsync(c, 100m)).GetProperty("entity").GetProperty("id").GetString();
        await PostAsync(c, "/api/erp/inventory-documents", Move("OUT", "inv-si-0001", "sref-1", 100m));

        var response = await c.PostAsync(
            new Uri($"/api/erp/inventory-documents/{id}/cancel", UriKind.Relative), null);

        // Cancelling the receipt would take the metal back out of a warehouse that no longer has
        // it, leaving stock negative.
        var problem = await ProblemAsync(response);
        Assert.Equal("cancel-blocked-stock", problem.GetProperty("code").GetString());
        Assert.Equal(Copper, problem.GetProperty("product").GetString());
    }

    [Fact]
    public async Task Cancelling_an_issue_is_never_blocked_and_is_idempotent()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        await ReceiveAsync(c, 100m);

        var id = (await PostAsync(c, "/api/erp/inventory-documents",
            Move("OUT", "inv-si-0001", "sref-1", 100m))).GetProperty("entity").GetProperty("id").GetString();

        // An issue only ever puts metal back, which cannot go negative.
        await PostAsync(c, $"/api/erp/inventory-documents/{id}/cancel");
        var twice = await PostAsync(c, $"/api/erp/inventory-documents/{id}/cancel");
        Assert.Equal("CANCELLED", twice.GetProperty("entity").GetProperty("status").GetString());
    }

    /* ------------------------------- Preconditions ---------------------------- */

    [Fact]
    public async Task A_receipt_belongs_to_a_purchase_and_an_issue_to_a_sale()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var crossed = await c.PostAsJsonAsync(
            new Uri("/api/erp/inventory-documents", UriKind.Relative),
            Move("IN", "inv-si-0001", "sref-1", 10m));

        Assert.Equal("invoice-side-mismatch",
            (await ProblemAsync(crossed)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Nothing_may_be_received_against_an_order()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var response = await c.PostAsJsonAsync(
            new Uri("/api/erp/inventory-documents", UriKind.Relative),
            Move("IN", "inv-po-0001", "oref-1", 10m));

        // An order carries no prices and is not a shipment.
        Assert.Equal("invoice-not-confirmed",
            (await ProblemAsync(response)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task A_line_must_belong_to_the_document_it_names()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var response = await c.PostAsJsonAsync(
            new Uri("/api/erp/inventory-documents", UriKind.Relative),
            Move("IN", "inv-pi-0001", "sref-1", 10m));

        Assert.Equal("line-not-on-invoice",
            (await ProblemAsync(response)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task A_document_needs_a_live_warehouse_and_at_least_one_line()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var empty = await c.PostAsJsonAsync(
            new Uri("/api/erp/inventory-documents", UriKind.Relative), new
            {
                type = "IN", warehouseId = "wh-1", invoiceId = "inv-pi-0001", date = Date,
                items = Array.Empty<object>(),
            });
        Assert.Equal("no-items", (await ProblemAsync(empty)).GetProperty("code").GetString());

        var noWarehouse = await c.PostAsJsonAsync(
            new Uri("/api/erp/inventory-documents", UriKind.Relative),
            Move("IN", "inv-pi-0001", "pref-1", 10m) is var _
                ? new
                {
                    type = "IN", warehouseId = "wh-nope", invoiceId = "inv-pi-0001", date = Date,
                    items = new[] { new { referenceDocumentItemId = "pref-1", quantityMt = 10m } },
                }
                : null);
        Assert.Equal("warehouse-required",
            (await ProblemAsync(noWarehouse)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Warehouse_documents_need_the_warehouse_permission()
    {
        await ResetAsync();
        var client = fixture.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        await client.PostAsJsonAsync(new Uri("/api/identity/login", UriKind.Relative),
            new { email = "portal@alcometal.ae", password = "Alco@2026" });

        var response = await client.GetAsync(new Uri("/api/erp/inventory-documents", UriKind.Relative));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        client.Dispose();
    }

    /* ---------------------------------- Cost ----------------------------------- */

    [Fact]
    public async Task A_receipt_stores_the_invoice_price_per_mt_and_an_issue_stores_the_average()
    {
        await ResetAsync();
        var c = await AsManagerAsync(fixture);

        var receipt = await c.PostAsJsonAsync(new Uri("/api/erp/inventory-documents", UriKind.Relative), new
        {
            type = "IN", warehouseId = "wh-1", invoiceId = "inv-pi-0001", date = Date,
            items = new[] { new { referenceDocumentItemId = "pref-1", quantityMt = 100m } },
        });
        receipt.EnsureSuccessStatusCode();
        var grn = (await receipt.Content.ReadFromJsonAsync<JsonElement>(Json)).GetProperty("entity");
        var grnLine = grn.GetProperty("items")[0];
        Assert.Equal(10000m, grnLine.GetProperty("unitCostUsd").GetDecimal());
        Assert.Equal(1_000_000m, grnLine.GetProperty("costUsd").GetDecimal());

        var issue = await c.PostAsJsonAsync(new Uri("/api/erp/inventory-documents", UriKind.Relative), new
        {
            type = "OUT", warehouseId = "wh-1", invoiceId = "inv-si-0001", date = Date,
            items = new[] { new { referenceDocumentItemId = "sref-1", quantityMt = 40m } },
        });
        issue.EnsureSuccessStatusCode();
        var gdnLine = (await issue.Content.ReadFromJsonAsync<JsonElement>(Json)).GetProperty("entity").GetProperty("items")[0];
        Assert.Equal(10000m, gdnLine.GetProperty("unitCostUsd").GetDecimal());
        Assert.Equal(400_000m, gdnLine.GetProperty("costUsd").GetDecimal());
    }

    [Fact]
    public async Task The_ledger_folds_value_as_well_as_quantity()
    {
        await ResetAsync();
        var c = await AsManagerAsync(fixture);
        (await c.PostAsJsonAsync(new Uri("/api/erp/inventory-documents", UriKind.Relative), new
        {
            type = "IN", warehouseId = "wh-1", invoiceId = "inv-pi-0001", date = Date,
            items = new[] { new { referenceDocumentItemId = "pref-1", quantityMt = 100m } },
        })).EnsureSuccessStatusCode();

        using var scope = fixture.Services.CreateScope();
        var ledger = scope.ServiceProvider.GetRequiredService<StockLedger>();
        var positions = await ledger.PositionsAsync();
        var position = positions[StockLedger.Key("wh-1", Copper)];

        Assert.Equal(100m, position.QuantityMt);
        Assert.Equal(1_000_000m, position.ValueUsd);
        Assert.Equal(10000m, position.AverageUnitCost);
    }
}
