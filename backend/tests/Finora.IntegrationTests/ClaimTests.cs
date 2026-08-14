using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Finora.Erp.Domain;
using Finora.Erp.Infrastructure.Snapshot;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Finora.IntegrationTests;

/// <summary>Claims over real HTTP.</summary>
[Collection(nameof(ApiCollection))]
public sealed class ClaimTests(ApiFixture fixture)
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

    /// <summary>A confirmed sale invoice with two goods, and a confirmed purchase one, so the
    /// side check has something on each side.</summary>
    private async Task ResetAsync()
    {
        using var scope = fixture.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<SnapshotService>().ReplaceAsync(new ErpSnapshot
        {
            Customers = [new Customer { Id = "cust-am", Name = "Alco Metal Trading", Code = "AM" }],
            Contracts =
            [
                new Contract
                {
                    Id = "ctr-1", CustomerId = "cust-am", Destination = "NINGBO",
                    Items = [new ContractItem { Id = "item-1", ContractId = "ctr-1", Product = "98% Copper Ingots", QuantityMt = 100m, RemainingMt = 100m }],
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
                        new InvoiceItem { Id = "invitem-1", InvoiceId = "inv-si-0001", ContractItemId = "item-1", Product = "98% Copper Ingots", QuantityMt = 60m, ReferenceDocumentItemId = "ref-1" },
                        new InvoiceItem { Id = "invitem-2", InvoiceId = "inv-si-0001", ContractItemId = "item-1", Product = "98% Copper Ingots", QuantityMt = 40m, ReferenceDocumentItemId = "ref-2" },
                    ],
                },
                new Invoice
                {
                    Id = "inv-pi-0001", InvoiceNumber = "PI-2026-0001",
                    InvoiceType = InvoiceType.PURCHASE_INVOICE, Status = InvoiceStatus.CONFIRMED,
                    ContractId = "ctr-1", CustomerId = "cust-am",
                    Items = [new InvoiceItem { Id = "invitem-3", InvoiceId = "inv-pi-0001", ContractItemId = "item-1", Product = "98% Copper Ingots", QuantityMt = 100m, ReferenceDocumentItemId = "ref-3" }],
                },
            ],
        });
    }

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

    private static string Id(JsonElement r) => r.GetProperty("entity").GetProperty("id").GetString()!;

    private static object Input(
        string side = "SALE", string invoiceId = "inv-si-0001", string claimType = "QUALITY",
        string currency = "USD", decimal fxRate = 1m, object[]? items = null) => new
        {
            side, title = "Short weight on arrival", invoiceId, claimType, date = Date,
            currency, fxRate,
            items = items ?? [new { invoiceItemId = "invitem-1", amount = 500m }],
        };

    /* --------------------------------- The sides ------------------------------- */

    [Fact]
    public async Task A_sale_claim_stays_a_sale_claim()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var claim = (await PostAsync(c, "/api/erp/claims", Input())).GetProperty("entity");

        // `ClaimSide` and `InvoiceSide` name the same two things and declare them in OPPOSITE
        // order — SALE first in one, PURCHASE first in the other. A cast between them compiles
        // and turns every sale claim into a purchase one, which no test that only ever uses one
        // side would notice.
        Assert.Equal("SALE", claim.GetProperty("side").GetString());

        var purchase = (await PostAsync(c, "/api/erp/claims",
            Input(side: "PURCHASE", invoiceId: "inv-pi-0001",
                  items: [new { invoiceItemId = "invitem-3", amount = 100m }]))).GetProperty("entity");
        Assert.Equal("PURCHASE", purchase.GetProperty("side").GetString());
    }

    [Fact]
    public async Task A_claim_must_be_on_the_documents_own_side()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var response = await c.PostAsJsonAsync(new Uri("/api/erp/claims", UriKind.Relative),
            Input(side: "PURCHASE"));

        Assert.Equal("invoice-side-mismatch",
            (await ProblemAsync(response)).GetProperty("code").GetString());
    }

    /* ------------------------------- The amounts ------------------------------- */

    [Fact]
    public async Task The_header_amount_is_the_sum_of_the_items_and_the_party_comes_from_the_document()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var claim = (await PostAsync(c, "/api/erp/claims", Input(currency: "AED", fxRate: 4m, items:
        [
            new { invoiceItemId = "invitem-1", amount = 400m },
            new { invoiceItemId = "invitem-2", amount = 200m },
        ]))).GetProperty("entity");

        // Neither figure is sent. Each item converts on its own — 100 and 50 — and the header is
        // their sum.
        Assert.Equal(600m, claim.GetProperty("amount").GetDecimal());
        Assert.Equal(150m, claim.GetProperty("amountUSD").GetDecimal());

        // And the party is read off the document, which is what removed the two error codes that
        // used to exist for the caller disagreeing with it.
        Assert.Equal("cust-am", claim.GetProperty("partyId").GetString());
    }

    [Fact]
    public async Task Rows_with_no_amount_are_dropped_not_refused()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        // The form shows a row per good and most are left blank — that is how one good is
        // claimed for.
        var claim = (await PostAsync(c, "/api/erp/claims", Input(items:
        [
            new { invoiceItemId = "invitem-1", amount = 500m },
            new { invoiceItemId = "invitem-2", amount = 0m },
        ]))).GetProperty("entity");

        Assert.Equal(1, claim.GetProperty("items").GetArrayLength());
        Assert.Equal(500m, claim.GetProperty("amount").GetDecimal());
    }

    [Fact]
    public async Task A_claim_with_nothing_claimed_is_refused()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var response = await c.PostAsJsonAsync(new Uri("/api/erp/claims", UriKind.Relative),
            Input(items: [new { invoiceItemId = "invitem-1", amount = 0m }]));

        Assert.Equal("no-claim-items", (await ProblemAsync(response)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task The_same_goods_cannot_be_claimed_twice()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var response = await c.PostAsJsonAsync(new Uri("/api/erp/claims", UriKind.Relative),
            Input(items:
            [
                new { invoiceItemId = "invitem-1", amount = 100m },
                new { invoiceItemId = "invitem-1", amount = 200m },
            ]));

        // Caught on the chain-stable key, not the row id — so the same metal reached through two
        // document generations is still one claim.
        Assert.Equal("duplicate-item", (await ProblemAsync(response)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task An_item_must_be_on_the_document()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var response = await c.PostAsJsonAsync(new Uri("/api/erp/claims", UriKind.Relative),
            Input(items: [new { invoiceItemId = "invitem-3", amount = 100m }]));

        Assert.Equal("item-not-on-invoice",
            (await ProblemAsync(response)).GetProperty("code").GetString());
    }

    /* -------------------------------- Editing --------------------------------- */

    [Fact]
    public async Task Editing_a_claim_never_re_checks_the_document()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        // Raise a claim against a confirmed provisional, then convert it — the provisional is no
        // longer the tip of its chain.
        var id = Id(await PostAsync(c, "/api/erp/claims", Input()));

        // Now give the document a successor: it stops being the tip of its chain, exactly as it
        // does the day the provisional is converted. `InvoiceType` is init-only, so the successor
        // is added rather than the original rewritten — which is closer to what really happens.
        using (var scope = fixture.Services.CreateScope())
        {
            var context = scope.ServiceProvider.GetRequiredService<Finora.Erp.Infrastructure.ErpDbContext>();
            context.Invoices.Add(new Invoice
            {
                Id = "inv-si-0002", InvoiceNumber = "SI-2026-0002",
                InvoiceType = InvoiceType.SALE_INVOICE, Status = InvoiceStatus.DRAFT,
                ContractId = "ctr-1", CustomerId = "cust-am", RefInvoiceId = "inv-si-0001",
            });
            await context.SaveChangesAsync();
        }

        // Creating one NOW is refused, because the document is no longer a chain leaf...
        var blocked = await c.PostAsJsonAsync(new Uri("/api/erp/claims", UriKind.Relative), Input());
        Assert.Equal("invoice-not-confirmed",
            (await ProblemAsync(blocked)).GetProperty("code").GetString());

        // Re-running the create-time checks here would refuse this, and the user could do nothing
        // about it — the document moved on, the claim did not.
        var edit = await c.PutAsJsonAsync(new Uri($"/api/erp/claims/{id}", UriKind.Relative),
            Input(items: [new { invoiceItemId = "invitem-1", amount = 750m }]));
        edit.EnsureSuccessStatusCode();

        Assert.Equal(750m, (await edit.Content.ReadFromJsonAsync<JsonElement>(Json))
            .GetProperty("entity").GetProperty("amount").GetDecimal());
    }

    [Fact]
    public async Task The_document_and_the_side_never_change()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = Id(await PostAsync(c, "/api/erp/claims", Input()));

        var moved = await c.PutAsJsonAsync(new Uri($"/api/erp/claims/{id}", UriKind.Relative),
            Input(invoiceId: "inv-pi-0001"));
        Assert.Equal("invoice-immutable", (await ProblemAsync(moved)).GetProperty("code").GetString());

        var flipped = await c.PutAsJsonAsync(new Uri($"/api/erp/claims/{id}", UriKind.Relative),
            Input(side: "PURCHASE"));
        Assert.Equal("side-immutable", (await ProblemAsync(flipped)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Editing_replaces_the_items_rather_than_adding_to_them()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = Id(await PostAsync(c, "/api/erp/claims", Input(items:
        [
            new { invoiceItemId = "invitem-1", amount = 100m },
            new { invoiceItemId = "invitem-2", amount = 100m },
        ])));

        var edit = await c.PutAsJsonAsync(new Uri($"/api/erp/claims/{id}", UriKind.Relative),
            Input(items: [new { invoiceItemId = "invitem-2", amount = 300m }]));
        edit.EnsureSuccessStatusCode();

        var entity = (await edit.Content.ReadFromJsonAsync<JsonElement>(Json)).GetProperty("entity");
        Assert.Equal(1, entity.GetProperty("items").GetArrayLength());
        Assert.Equal(300m, entity.GetProperty("amount").GetDecimal());
    }

    [Fact]
    public async Task A_cancelled_claim_refuses_edits_and_cancelling_is_idempotent()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = Id(await PostAsync(c, "/api/erp/claims", Input()));

        await PostAsync(c, $"/api/erp/claims/{id}/cancel");
        var twice = await PostAsync(c, $"/api/erp/claims/{id}/cancel");
        Assert.Equal("CANCELLED", twice.GetProperty("entity").GetProperty("status").GetString());

        var response = await c.PutAsJsonAsync(new Uri($"/api/erp/claims/{id}", UriKind.Relative), Input());
        Assert.Equal("claim-cancelled", (await ProblemAsync(response)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Claims_need_the_claims_permission()
    {
        await ResetAsync();
        var client = fixture.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        await client.PostAsJsonAsync(new Uri("/api/identity/login", UriKind.Relative),
            new { email = "staff@finora.app", password = "Staff@2026" });

        var response = await client.GetAsync(new Uri("/api/erp/claims", UriKind.Relative));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        client.Dispose();
    }
}
