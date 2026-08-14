using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Finora.Erp.Domain;
using Finora.Erp.Infrastructure.Snapshot;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Finora.IntegrationTests;

/// <summary>Containers over real HTTP.</summary>
[Collection(nameof(ApiCollection))]
public sealed class ContainerTests(ApiFixture fixture)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private const string Date = "2026-08-13T00:00:00Z";

    private static async Task<HttpClient> AsManagerAsync(ApiFixture fixture)
    {
        var client = fixture.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        (await client.PostAsJsonAsync(new Uri("/api/identity/login", UriKind.Relative),
            new { email = "amir@finora.app", password = "demo1234" })).EnsureSuccessStatusCode();
        return client;
    }

    /// <summary>One contract with two goods lines, and a confirmed sale invoice whose line says
    /// the first of them shipped in container <c>cnt-1</c>.</summary>
    private async Task ResetAsync()
    {
        using var scope = fixture.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<SnapshotService>().ReplaceAsync(new ErpSnapshot
        {
            Customers = [new Customer { Id = "cust-am", Name = "Alco Metal Trading", Code = "AM" }],
            Containers =
            [
                new Container
                {
                    Id = "cnt-1", Reference = "MSNU8018095",
                    Goods =
                    [
                        new ContainerGood { ContainerId = "cnt-1", ContractItemId = "item-1", QuantityMt = 25m },
                        new ContainerGood { ContainerId = "cnt-1", ContractItemId = "item-2", QuantityMt = 10m },
                    ],
                },
            ],
            Contracts =
            [
                new Contract
                {
                    Id = "ctr-1", CustomerId = "cust-am", Destination = "NINGBO",
                    Items =
                    [
                        new ContractItem { Id = "item-1", ContractId = "ctr-1", Product = "98% Copper Ingots", QuantityMt = 100m, RemainingMt = 100m },
                        new ContractItem { Id = "item-2", ContractId = "ctr-1", Product = "Copper Cathode", QuantityMt = 50m, RemainingMt = 50m },
                    ],
                },
            ],
            Invoices =
            [
                new Invoice
                {
                    Id = "inv-si-0001", InvoiceNumber = "SI-2026-0001",
                    InvoiceType = InvoiceType.SALE_INVOICE, Status = InvoiceStatus.CONFIRMED,
                    ContractId = "ctr-1", CustomerId = "cust-am",
                    Items =
                    [
                        new InvoiceItem
                        {
                            Id = "invitem-1", InvoiceId = "inv-si-0001", ContractItemId = "item-1",
                            Product = "98% Copper Ingots", ContainerId = "cnt-1",
                            ReferenceDocumentItemId = "ref-1",
                        },
                    ],
                },
            ],
        });
    }

    private static object Input(string reference = "MSNU8018095", object[]? goods = null) => new
    {
        reference,
        loadDate = Date,
        goods = goods ?? [new { contractItemId = "item-1", quantityMt = 25m },
                          new { contractItemId = "item-2", quantityMt = 10m }],
    };

    private static async Task<JsonElement> ProblemAsync(HttpResponseMessage r) =>
        await r.Content.ReadFromJsonAsync<JsonElement>(Json);

    [Fact]
    public async Task A_new_container_takes_the_next_id_from_the_server()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var first = await c.PostAsJsonAsync(new Uri("/api/erp/containers", UriKind.Relative), Input("NEW-1"));
        first.EnsureSuccessStatusCode();
        var second = await c.PostAsJsonAsync(new Uri("/api/erp/containers", UriKind.Relative), Input("NEW-2"));
        second.EnsureSuccessStatusCode();

        var a = (await first.Content.ReadFromJsonAsync<JsonElement>(Json)).GetProperty("entity").GetProperty("id").GetString();
        var b = (await second.Content.ReadFromJsonAsync<JsonElement>(Json)).GetProperty("entity").GetProperty("id").GetString();

        // One counter, on the server. The browser's counted the list it happened to hold, so two
        // people entering a container on the same day both produced cnt-1 and whichever pushed
        // second silently took the other's identity — while trade document lines already stored
        // that id.
        Assert.Equal("cnt-2", a);
        Assert.Equal("cnt-3", b);
    }

    [Fact]
    public async Task A_good_a_document_relies_on_cannot_be_taken_off()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        // Drop item-1, which SI-2026-0001 says shipped in this container.
        var response = await c.PutAsJsonAsync(
            new Uri("/api/erp/containers/cnt-1", UriKind.Relative),
            Input(goods: [new { contractItemId = "item-2", quantityMt = 10m }]));

        var problem = await ProblemAsync(response);
        Assert.Equal("good-in-use", problem.GetProperty("code").GetString());

        // The dialog lists the documents to fix first, and names the product — so both cross the
        // wire rather than being left for the screen to guess.
        Assert.Equal("SI-2026-0001", problem.GetProperty("invoices")[0].GetString());
        Assert.Equal("98% Copper Ingots", problem.GetProperty("product").GetString());
    }

    [Fact]
    public async Task A_good_no_document_relies_on_can_be_taken_off()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        // item-2 ships in this container but no document says so.
        var response = await c.PutAsJsonAsync(
            new Uri("/api/erp/containers/cnt-1", UriKind.Relative),
            Input(goods: [new { contractItemId = "item-1", quantityMt = 25m }]));

        response.EnsureSuccessStatusCode();
        var entity = (await response.Content.ReadFromJsonAsync<JsonElement>(Json)).GetProperty("entity");
        Assert.Equal(1, entity.GetProperty("goods").GetArrayLength());
    }

    [Fact]
    public async Task Changing_a_quantity_is_always_allowed()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        // The guard is about REMOVING a good, not about editing one a document relies on.
        var response = await c.PutAsJsonAsync(
            new Uri("/api/erp/containers/cnt-1", UriKind.Relative),
            Input(goods: [new { contractItemId = "item-1", quantityMt = 30m },
                          new { contractItemId = "item-2", quantityMt = 10m }]));

        response.EnsureSuccessStatusCode();
        var goods = (await response.Content.ReadFromJsonAsync<JsonElement>(Json))
            .GetProperty("entity").GetProperty("goods");
        Assert.Equal(30m, goods.EnumerateArray()
            .Single(g => g.GetProperty("contractItemId").GetString() == "item-1")
            .GetProperty("quantityMt").GetDecimal());
    }

    [Fact]
    public async Task A_refused_edit_changes_nothing()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        await c.PutAsJsonAsync(
            new Uri("/api/erp/containers/cnt-1", UriKind.Relative),
            Input(reference: "CHANGED", goods: [new { contractItemId = "item-2", quantityMt = 10m }]));

        // The guard runs before anything is written, so the rejected reference did not land.
        var all = await c.GetFromJsonAsync<JsonElement>(
            new Uri("/api/erp/containers", UriKind.Relative), Json);
        var container = all.EnumerateArray().Single(x => x.GetProperty("id").GetString() == "cnt-1");

        Assert.Equal("MSNU8018095", container.GetProperty("reference").GetString());
        Assert.Equal(2, container.GetProperty("goods").GetArrayLength());
    }

    [Fact]
    public async Task A_container_needs_a_reference()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var response = await c.PostAsJsonAsync(
            new Uri("/api/erp/containers", UriKind.Relative), Input(reference: "   "));

        Assert.Equal("reference-required", (await ProblemAsync(response)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Containers_need_the_containers_permission()
    {
        await ResetAsync();
        var client = fixture.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        await client.PostAsJsonAsync(new Uri("/api/identity/login", UriKind.Relative),
            new { email = "portal@alcometal.ae", password = "Alco@2026" });

        var response = await client.GetAsync(new Uri("/api/erp/containers", UriKind.Relative));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        client.Dispose();
    }
}
