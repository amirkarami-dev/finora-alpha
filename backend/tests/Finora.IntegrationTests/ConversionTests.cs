using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Finora.Erp.Domain;
using Finora.Erp.Infrastructure.Snapshot;
using Finora.Erp.Infrastructure.Trade;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Finora.IntegrationTests;

/// <summary>Cable becomes copper becomes ingot, over real HTTP, with the cost following the metal.</summary>
[Collection(nameof(ApiCollection))]
public sealed class ConversionTests(ApiFixture fixture)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private const string Date = "2026-09-03T08:00:00+04:00";

    private static async Task<HttpClient> LoginAsync(ApiFixture fixture, string email, string password)
    {
        var client = fixture.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        (await client.PostAsJsonAsync(new Uri("/api/identity/login", UriKind.Relative), new { email, password })).EnsureSuccessStatusCode();
        return client;
    }

    private static Task<HttpClient> AsManagerAsync(ApiFixture f) => LoginAsync(f, "amir@finora.app", "demo1234");
    private static Task<HttpClient> AsStaffAsync(ApiFixture f) => LoginAsync(f, "staff@finora.app", "Staff@2026");

    /// <summary>Main warehouse holding 1.000 MT of cable that cost 10,000 USD; a second, empty
    /// warehouse (Overflow) for the header-edit test; a workshop person and a Processing category.</summary>
    private async Task ResetAsync()
    {
        using var scope = fixture.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<SnapshotService>().ReplaceAsync(new ErpSnapshot
        {
            Warehouses = [new Warehouse { Id = "wh-1", Name = "Main", Code = "1" }, new Warehouse { Id = "wh-2", Name = "Overflow", Code = "2" }],
            Customers =
            [
                new Customer { Id = "cust-1", Name = "Cable Supplier", Code = "1", CustomerType = CustomerType.SUPPLIER },
                new Customer { Id = "cust-2", Name = "The Workshop", Code = "2", CustomerType = CustomerType.OTHER },
            ],
            ChargeCategories = [new ChargeCategory { Id = "ccat-0001", Name = "Processing", Code = "1", Direction = ChargeDirection.EXPENSE, Scope = ChargeScope.GENERAL }],
            Contracts = [new Contract { Id = "ctr-1", CustomerId = "cust-1", ContractType = ContractType.PURCHASE, Destination = "DXB",
                Items = [new ContractItem { Id = "item-1", ContractId = "ctr-1", Product = "Copper cable", QuantityMt = 1m, RemainingMt = 1m }] }],
            Invoices = [new Invoice { Id = "inv-pi-0001", InvoiceNumber = "26090001", InvoiceType = InvoiceType.PURCHASE_INVOICE,
                Status = InvoiceStatus.CONFIRMED, ContractId = "ctr-1", CustomerId = "cust-1", Currency = Currency.USD, ExchangeRate = 1m,
                Items = [new InvoiceItem { Id = "ii-1", InvoiceId = "inv-pi-0001", ContractItemId = "item-1", ReferenceDocumentItemId = "ref-1",
                    Product = "Copper cable", QuantityMt = 1m, Amount = 10000m }] }],
            InventoryDocs = [new InventoryDocument { Id = "idoc-0001", DocNumber = "GRN-2026-0001", WarehouseId = "wh-1", InvoiceId = "inv-pi-0001",
                Type = InventoryDocType.IN, Date = DateTimeOffset.Parse(Date).ToUniversalTime(), Status = DocumentStatus.CONFIRMED,
                Items = [new InventoryDocumentItem { Id = "idocitem-1", DocumentId = "idoc-0001", InvoiceItemId = "ii-1", ReferenceDocumentItemId = "ref-1",
                    Product = "Copper cable", QuantityMt = 1m, UnitCostUsd = 10000m, CostUsd = 10000m }] }],
        });
    }

    private static object Strip(decimal outMt = 0.65m, object[]? costs = null) => new
    {
        warehouseId = "wh-1", date = Date, notes = "strip",
        inputs = new[] { new { product = "Copper cable", quantityMt = 1m } },
        outputs = new[] { new { product = "Stripped copper", quantityMt = outMt, sharePercent = (decimal?)null } },
        costs = costs ?? [],
    };

    private static async Task<JsonElement> PostAsync(HttpClient c, string url, object? body = null)
    {
        var r = body is null ? await c.PostAsync(new Uri(url, UriKind.Relative), null) : await c.PostAsJsonAsync(new Uri(url, UriKind.Relative), body);
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<JsonElement>(Json);
    }

    private static JsonElement Entity(JsonElement r) => r.GetProperty("entity");
    private static string Id(JsonElement r) => Entity(r).GetProperty("id").GetString()!;

    [Fact]
    public async Task A_draft_is_numbered_and_moves_nothing()
    {
        await ResetAsync();
        var c = await AsStaffAsync(fixture);
        var created = await PostAsync(c, "/api/erp/conversions", Strip());
        Assert.Equal("CNV-2026-0001", Entity(created).GetProperty("docNumber").GetString());
        Assert.Equal("DRAFT", Entity(created).GetProperty("status").GetString());

        using var scope = fixture.Services.CreateScope();
        var positions = await scope.ServiceProvider.GetRequiredService<Finora.Erp.Infrastructure.Trade.StockLedger>().PositionsAsync();
        Assert.Equal(1m, positions[Finora.Erp.Infrastructure.Trade.StockLedger.Key("wh-1", "Copper cable")].QuantityMt);
    }

    [Fact]
    public async Task Editing_a_draft_replaces_the_header_and_every_line_with_fresh_ids()
    {
        await ResetAsync();
        var manager = await AsManagerAsync(fixture);
        var created = Entity(await PostAsync(manager, "/api/erp/conversions", Strip()));
        var id = created.GetProperty("id").GetString()!;
        var originalInputId = created.GetProperty("inputs")[0].GetProperty("id").GetString();
        var originalOutputId = created.GetProperty("outputs")[0].GetProperty("id").GetString();

        var edited = new { warehouseId = "wh-2", date = Date, notes = "moved to overflow",
            inputs = new[] { new { product = "Copper cable", quantityMt = 0.4m } },
            outputs = new[]
            {
                new { product = "Stripped copper", quantityMt = 0.2m, sharePercent = (decimal?)null },
                new { product = "Insulation scrap", quantityMt = 0.15m, sharePercent = (decimal?)null },
            },
            costs = new[] { new { categoryId = "ccat-0001", personId = "cust-2", amount = 50m, currency = "USD", fxRate = (decimal?)null, description = "sorting" } } };
        var updateResponse = await manager.PutAsJsonAsync(new Uri($"/api/erp/conversions/{id}", UriKind.Relative), edited);
        updateResponse.EnsureSuccessStatusCode();
        var updated = Entity(await updateResponse.Content.ReadFromJsonAsync<JsonElement>(Json));

        Assert.Equal("wh-2", updated.GetProperty("warehouseId").GetString());
        Assert.Equal("moved to overflow", updated.GetProperty("notes").GetString());
        Assert.Equal(1, updated.GetProperty("inputs").GetArrayLength());
        Assert.Equal(0.4m, updated.GetProperty("inputs")[0].GetProperty("quantityMt").GetDecimal());
        Assert.Equal(2, updated.GetProperty("outputs").GetArrayLength());
        Assert.Equal(1, updated.GetProperty("costs").GetArrayLength());
        Assert.NotEqual(originalInputId, updated.GetProperty("inputs")[0].GetProperty("id").GetString());
        Assert.NotEqual(originalOutputId, updated.GetProperty("outputs")[0].GetProperty("id").GetString());
        Assert.NotEqual(originalOutputId, updated.GetProperty("outputs")[1].GetProperty("id").GetString());

        // Re-read through the list endpoint, not just the write response, so the assertion covers
        // what actually persisted.
        var list = await manager.GetFromJsonAsync<JsonElement>(new Uri("/api/erp/conversions", UriKind.Relative), Json);
        var reread = list.EnumerateArray().Single(d => d.GetProperty("id").GetString() == id);
        Assert.Equal("wh-2", reread.GetProperty("warehouseId").GetString());
        Assert.Equal(1, reread.GetProperty("inputs").GetArrayLength());
        Assert.Equal(0.4m, reread.GetProperty("inputs")[0].GetProperty("quantityMt").GetDecimal());
        Assert.Equal(2, reread.GetProperty("outputs").GetArrayLength());
        Assert.Equal(0.2m, reread.GetProperty("outputs")[0].GetProperty("quantityMt").GetDecimal());
        Assert.Equal(0.15m, reread.GetProperty("outputs")[1].GetProperty("quantityMt").GetDecimal());
        Assert.Equal(1, reread.GetProperty("costs").GetArrayLength());
        Assert.Equal(50m, reread.GetProperty("costs")[0].GetProperty("amount").GetDecimal());
    }

    [Fact]
    public async Task Confirming_moves_the_stock_and_the_cost_and_books_the_workshop_as_an_expense()
    {
        await ResetAsync();
        var staff = await AsStaffAsync(fixture);
        var id = Id(await PostAsync(staff, "/api/erp/conversions", Strip(costs:
            [new { categoryId = "ccat-0001", personId = "cust-2", amount = 500m, currency = "USD", fxRate = (decimal?)null, description = "labour" }])));

        var manager = await AsManagerAsync(fixture);
        var confirmed = Entity(await PostAsync(manager, $"/api/erp/conversions/{id}/confirm"));

        Assert.Equal("CONFIRMED", confirmed.GetProperty("status").GetString());
        Assert.Equal(10000m, confirmed.GetProperty("totalInputCostUsd").GetDecimal());
        Assert.Equal(500m, confirmed.GetProperty("totalAddedCostUsd").GetDecimal());
        var output = confirmed.GetProperty("outputs")[0];
        Assert.Equal(10500m, output.GetProperty("costUsd").GetDecimal());
        Assert.Equal(16153.8462m, output.GetProperty("unitCostUsd").GetDecimal());
        Assert.False(string.IsNullOrEmpty(confirmed.GetProperty("chargeDocId").GetString()));

        using var scope = fixture.Services.CreateScope();
        var ledger = scope.ServiceProvider.GetRequiredService<Finora.Erp.Infrastructure.Trade.StockLedger>();
        var positions = await ledger.PositionsAsync();
        Assert.Equal(0m, positions[Finora.Erp.Infrastructure.Trade.StockLedger.Key("wh-1", "Copper cable")].QuantityMt);
        var copper = positions[Finora.Erp.Infrastructure.Trade.StockLedger.Key("wh-1", "Stripped copper")];
        Assert.Equal(0.65m, copper.QuantityMt);
        Assert.Equal(10500m, copper.ValueUsd);

        var charges = await manager.GetFromJsonAsync<JsonElement>(new Uri("/api/erp/charge-docs", UriKind.Relative), Json);
        var booked = charges.EnumerateArray().Single(d => d.GetProperty("id").GetString() == confirmed.GetProperty("chargeDocId").GetString());
        Assert.Equal("EXPENSE", booked.GetProperty("direction").GetString());
        Assert.Equal("GENERAL", booked.GetProperty("kind").GetString());
        Assert.Equal("cust-2", booked.GetProperty("lines")[0].GetProperty("personId").GetString());
        Assert.Equal(500m, booked.GetProperty("totalUSD").GetDecimal());
    }

    [Fact]
    public async Task Staff_may_draft_but_not_confirm()
    {
        await ResetAsync();
        var staff = await AsStaffAsync(fixture);
        var id = Id(await PostAsync(staff, "/api/erp/conversions", Strip()));
        var refused = await staff.PostAsync(new Uri($"/api/erp/conversions/{id}/confirm", UriKind.Relative), null);
        Assert.Equal(HttpStatusCode.Forbidden, refused.StatusCode);
    }

    [Fact]
    public async Task A_line_with_a_blank_product_is_refused()
    {
        await ResetAsync();
        var manager = await AsManagerAsync(fixture);
        var body = new { warehouseId = "wh-1", date = Date, notes = (string?)null,
            inputs = new[] { new { product = "   ", quantityMt = 0.5m } },
            outputs = new[] { new { product = "Stripped copper", quantityMt = 0.5m, sharePercent = (decimal?)null } },
            costs = Array.Empty<object>() };
        var response = await manager.PostAsJsonAsync(new Uri("/api/erp/conversions", UriKind.Relative), body);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(Json);
        Assert.Equal("product-required", problem.GetProperty("code").GetString());
    }

    [Fact]
    public async Task An_input_larger_than_the_stock_is_refused_with_the_available_figure()
    {
        await ResetAsync();
        var manager = await AsManagerAsync(fixture);
        var body = new { warehouseId = "wh-1", date = Date, notes = (string?)null,
            inputs = new[] { new { product = "Copper cable", quantityMt = 1.5m } },
            outputs = new[] { new { product = "Stripped copper", quantityMt = 1m, sharePercent = (decimal?)null } },
            costs = Array.Empty<object>() };
        var id = Id(await PostAsync(manager, "/api/erp/conversions", body));
        var refused = await manager.PostAsync(new Uri($"/api/erp/conversions/{id}/confirm", UriKind.Relative), null);
        var problem = await refused.Content.ReadFromJsonAsync<JsonElement>(Json);
        Assert.Equal("insufficient-stock", problem.GetProperty("code").GetString());
        Assert.Equal(1m, problem.GetProperty("available").GetDecimal());
    }

    /// <summary>Two drafts each want the whole tonne. Fired together, exactly one may have it:
    /// the warehouse lock makes the second confirm wait and then fold a ledger that already
    /// shows the cable gone. Without the lock both could pass and stock would read -1.000 MT.</summary>
    [Fact]
    public async Task Two_confirms_racing_for_the_same_stock_let_exactly_one_through()
    {
        await ResetAsync();
        var manager = await AsManagerAsync(fixture);
        var first = Id(await PostAsync(manager, "/api/erp/conversions", Strip()));
        var second = Id(await PostAsync(manager, "/api/erp/conversions", Strip()));

        var responses = await Task.WhenAll(
            manager.PostAsync(new Uri($"/api/erp/conversions/{first}/confirm", UriKind.Relative), null),
            manager.PostAsync(new Uri($"/api/erp/conversions/{second}/confirm", UriKind.Relative), null));

        Assert.Single(responses, r => r.IsSuccessStatusCode);
        var refused = responses.Single(r => !r.IsSuccessStatusCode);
        var problem = await refused.Content.ReadFromJsonAsync<JsonElement>(Json);
        Assert.Equal("insufficient-stock", problem.GetProperty("code").GetString());
        Assert.Equal(0m, problem.GetProperty("available").GetDecimal());

        using var scope = fixture.Services.CreateScope();
        var positions = await scope.ServiceProvider.GetRequiredService<StockLedger>().PositionsAsync();
        Assert.Equal(0m, positions[StockLedger.Key("wh-1", "Copper cable")].QuantityMt);
        Assert.Equal(0.65m, positions[StockLedger.Key("wh-1", "Stripped copper")].QuantityMt);
    }

    [Fact]
    public async Task Two_input_lines_of_the_same_product_are_summed_before_the_stock_check()
    {
        await ResetAsync();
        var manager = await AsManagerAsync(fixture);
        var body = new { warehouseId = "wh-1", date = Date, notes = (string?)null,
            inputs = new[]
            {
                new { product = "Copper cable", quantityMt = 0.6m },
                new { product = "Copper cable", quantityMt = 0.6m },
            },
            outputs = new[] { new { product = "Stripped copper", quantityMt = 1m, sharePercent = (decimal?)null } },
            costs = Array.Empty<object>() };
        var id = Id(await PostAsync(manager, "/api/erp/conversions", body));
        var refused = await manager.PostAsync(new Uri($"/api/erp/conversions/{id}/confirm", UriKind.Relative), null);
        var problem = await refused.Content.ReadFromJsonAsync<JsonElement>(Json);
        Assert.Equal("insufficient-stock", problem.GetProperty("code").GetString());
        Assert.Equal(0.4m, problem.GetProperty("available").GetDecimal());
    }

    [Fact]
    public async Task Two_outputs_split_the_cost_by_weight_unless_shares_are_given()
    {
        await ResetAsync();
        var manager = await AsManagerAsync(fixture);
        var body = new { warehouseId = "wh-1", date = Date, notes = (string?)null,
            inputs = new[] { new { product = "Copper cable", quantityMt = 1m } },
            outputs = new[]
            {
                new { product = "Stripped copper", quantityMt = 0.65m, sharePercent = (decimal?)98m },
                new { product = "Insulation scrap", quantityMt = 0.35m, sharePercent = (decimal?)2m },
            },
            costs = Array.Empty<object>() };
        var id = Id(await PostAsync(manager, "/api/erp/conversions", body));
        var confirmed = Entity(await PostAsync(manager, $"/api/erp/conversions/{id}/confirm"));
        Assert.Equal(9800m, confirmed.GetProperty("outputs")[0].GetProperty("costUsd").GetDecimal());
        Assert.Equal(200m, confirmed.GetProperty("outputs")[1].GetProperty("costUsd").GetDecimal());
    }

    [Fact]
    public async Task A_confirmed_conversion_cannot_be_edited_and_cancelling_it_reverses_stock_and_the_expense()
    {
        await ResetAsync();
        var manager = await AsManagerAsync(fixture);
        var id = Id(await PostAsync(manager, "/api/erp/conversions", Strip(costs:
            [new { categoryId = "ccat-0001", personId = "cust-2", amount = 500m, currency = "USD", fxRate = (decimal?)null, description = (string?)null }])));
        var confirmed = Entity(await PostAsync(manager, $"/api/erp/conversions/{id}/confirm"));

        var edit = await manager.PutAsJsonAsync(new Uri($"/api/erp/conversions/{id}", UriKind.Relative), Strip(0.6m));
        Assert.Equal("conversion-not-draft", (await edit.Content.ReadFromJsonAsync<JsonElement>(Json)).GetProperty("code").GetString());

        var cancelled = Entity(await PostAsync(manager, $"/api/erp/conversions/{id}/cancel"));
        Assert.Equal("CANCELLED", cancelled.GetProperty("status").GetString());

        using var scope = fixture.Services.CreateScope();
        var positions = await scope.ServiceProvider.GetRequiredService<Finora.Erp.Infrastructure.Trade.StockLedger>().PositionsAsync();
        Assert.Equal(1m, positions[Finora.Erp.Infrastructure.Trade.StockLedger.Key("wh-1", "Copper cable")].QuantityMt);
        var charges = await manager.GetFromJsonAsync<JsonElement>(new Uri("/api/erp/charge-docs", UriKind.Relative), Json);
        var booked = charges.EnumerateArray().Single(d => d.GetProperty("id").GetString() == confirmed.GetProperty("chargeDocId").GetString());
        Assert.Equal("CANCELLED", booked.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Cancelling_is_blocked_once_an_output_was_consumed()
    {
        await ResetAsync();
        var manager = await AsManagerAsync(fixture);
        var strip = Id(await PostAsync(manager, "/api/erp/conversions", Strip()));
        await PostAsync(manager, $"/api/erp/conversions/{strip}/confirm");
        var melt = Id(await PostAsync(manager, "/api/erp/conversions", new { warehouseId = "wh-1", date = Date, notes = (string?)null,
            inputs = new[] { new { product = "Stripped copper", quantityMt = 0.65m } },
            outputs = new[] { new { product = "Copper ingot", quantityMt = 0.6m, sharePercent = (decimal?)null } },
            costs = Array.Empty<object>() }));
        await PostAsync(manager, $"/api/erp/conversions/{melt}/confirm");

        var blocked = await manager.PostAsync(new Uri($"/api/erp/conversions/{strip}/cancel", UriKind.Relative), null);
        Assert.Equal("cancel-blocked-stock", (await blocked.Content.ReadFromJsonAsync<JsonElement>(Json)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Cable_to_copper_to_ingot_to_sale_carries_the_cost_all_the_way()
    {
        await ResetAsync();
        var manager = await AsManagerAsync(fixture);
        var strip = Id(await PostAsync(manager, "/api/erp/conversions", Strip()));
        await PostAsync(manager, $"/api/erp/conversions/{strip}/confirm");
        var melt = Id(await PostAsync(manager, "/api/erp/conversions", new { warehouseId = "wh-1", date = Date, notes = (string?)null,
            inputs = new[] { new { product = "Stripped copper", quantityMt = 0.65m } },
            outputs = new[] { new { product = "Copper ingot", quantityMt = 0.6m, sharePercent = (decimal?)null } },
            costs = new[] { new { categoryId = "ccat-0001", personId = "cust-2", amount = 800m, currency = "USD", fxRate = (decimal?)null, description = "gas" } } }));
        var melted = Entity(await PostAsync(manager, $"/api/erp/conversions/{melt}/confirm"));
        Assert.Equal(10800m, melted.GetProperty("outputs")[0].GetProperty("costUsd").GetDecimal());
        Assert.Equal(18000m, melted.GetProperty("outputs")[0].GetProperty("unitCostUsd").GetDecimal());

        using var scope = fixture.Services.CreateScope();
        var ingot = (await scope.ServiceProvider.GetRequiredService<Finora.Erp.Infrastructure.Trade.StockLedger>().PositionsAsync())
            [Finora.Erp.Infrastructure.Trade.StockLedger.Key("wh-1", "Copper ingot")];
        Assert.Equal(0.6m, ingot.QuantityMt);
        Assert.Equal(10800m, ingot.ValueUsd);
        Assert.Equal(18000m, ingot.AverageUnitCost);
    }
}
