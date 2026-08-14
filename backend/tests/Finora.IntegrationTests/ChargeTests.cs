using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Finora.Erp.Domain;
using Finora.Erp.Infrastructure.Snapshot;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Finora.IntegrationTests;

/// <summary>Expenses and revenues over real HTTP.</summary>
[Collection(nameof(ApiCollection))]
public sealed class ChargeTests(ApiFixture fixture)
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

    /// <summary>A confirmed sale invoice with THREE goods, plus one expense category on each
    /// scope so the mismatch guard has something to refuse.</summary>
    private async Task ResetAsync()
    {
        using var scope = fixture.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<SnapshotService>().ReplaceAsync(new ErpSnapshot
        {
            Customers = [new Customer { Id = "cust-am", Name = "Alco Metal Trading", Code = "AM" }],
            CostCentres = [new CostCentre { Id = "cc-1", Name = "Logistics", Code = "LOG" }],
            ChargeCategories =
            [
                new ChargeCategory { Id = "cat-inv", Code = "FRT", Name = "Freight", Direction = ChargeDirection.EXPENSE, Scope = ChargeScope.INVOICE },
                new ChargeCategory { Id = "cat-gen", Code = "OFF", Name = "Office", Direction = ChargeDirection.EXPENSE, Scope = ChargeScope.GENERAL },
                new ChargeCategory { Id = "cat-rev", Code = "SCR", Name = "Scrap sale", Direction = ChargeDirection.REVENUE, Scope = ChargeScope.INVOICE },
                new ChargeCategory { Id = "cat-off", Code = "RET", Name = "Retired", Direction = ChargeDirection.EXPENSE, Scope = ChargeScope.INVOICE, Active = false },
            ],
            Contracts =
            [
                new Contract
                {
                    Id = "ctr-1", CustomerId = "cust-am", Destination = "NINGBO",
                    Items = [new ContractItem { Id = "item-1", ContractId = "ctr-1", Product = "98% Copper Ingots", QuantityMt = 90m, RemainingMt = 90m }],
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
                        Line("invitem-1", "ref-1", 30m),
                        Line("invitem-2", "ref-2", 30m),
                        Line("invitem-3", "ref-3", 30m),
                    ],
                },
            ],
        });
    }

    private static InvoiceItem Line(string id, string refId, decimal qty) => new()
    {
        Id = id, InvoiceId = "inv-si-0001", ContractItemId = "item-1",
        Product = "98% Copper Ingots", QuantityMt = qty, ReferenceDocumentItemId = refId,
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

    private static string Id(JsonElement r) => r.GetProperty("entity").GetProperty("id").GetString()!;

    private static Task<JsonElement> DocAsync(HttpClient c, string kind = "INVOICE", string direction = "EXPENSE") =>
        PostAsync(c, "/api/erp/charge-docs", new
        {
            direction, kind, title = "Freight to Ningbo",
            invoiceId = kind == "INVOICE" ? "inv-si-0001" : null, date = Date,
        });

    private static object LineInput(
        decimal amount, string categoryId = "cat-inv", string currency = "USD",
        decimal fxRate = 1m, object[]? goods = null) => new
        {
            categoryId, date = Date, amount, currency, fxRate,
            personId = "cust-am", costCentreId = "cc-1", goods,
        };

    /* --------------------------------- The split ------------------------------- */

    [Fact]
    public async Task An_amount_that_does_not_divide_gives_the_odd_cents_to_the_first_goods()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var doc = Id(await DocAsync(c));

        var result = await PostAsync(c, $"/api/erp/charge-docs/{doc}/lines", LineInput(100m));
        var line = result.GetProperty("entity").GetProperty("lines")[0];
        var amounts = line.GetProperty("allocations").EnumerateArray()
            .Select(a => a.GetProperty("amount").GetDecimal()).ToList();

        // 100 across three: 33.34, 33.33, 33.33 — whole cents, the remainder to the FIRST.
        // `amount / n` gives 33.333333… and a total a cent short of what the user typed.
        Assert.Equal([33.34m, 33.33m, 33.33m], amounts);
        Assert.Equal(100m, amounts.Sum());
        Assert.Equal(100m, line.GetProperty("amount").GetDecimal());
    }

    [Fact]
    public async Task One_good_without_an_amount_re_splits_the_whole_line()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var doc = Id(await DocAsync(c));

        // Two typed, one left blank. The blank one does not get the leftover — the WHOLE line
        // re-splits, which is what the screen does when a good is added or removed, so the
        // figures always add up rather than drifting from the total.
        var result = await PostAsync(c, $"/api/erp/charge-docs/{doc}/lines", LineInput(90m, goods:
        [
            new { invoiceItemId = "invitem-1", amount = 50m },
            new { invoiceItemId = "invitem-2", amount = 40m },
            new { invoiceItemId = "invitem-3" },
        ]));

        var amounts = result.GetProperty("entity").GetProperty("lines")[0]
            .GetProperty("allocations").EnumerateArray()
            .Select(a => a.GetProperty("amount").GetDecimal()).ToList();

        Assert.Equal([30m, 30m, 30m], amounts);
    }

    [Fact]
    public async Task An_amount_on_every_good_is_taken_as_typed()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var doc = Id(await DocAsync(c));

        var result = await PostAsync(c, $"/api/erp/charge-docs/{doc}/lines", LineInput(90m, goods:
        [
            new { invoiceItemId = "invitem-1", amount = 50m },
            new { invoiceItemId = "invitem-2", amount = 30m },
            new { invoiceItemId = "invitem-3", amount = 10m },
        ]));

        var line = result.GetProperty("entity").GetProperty("lines")[0];
        Assert.Equal([50m, 30m, 10m], line.GetProperty("allocations").EnumerateArray()
            .Select(a => a.GetProperty("amount").GetDecimal()).ToList());

        // And the line's own amount becomes their sum — the goods are the record.
        Assert.Equal(90m, line.GetProperty("amount").GetDecimal());
    }

    /* ------------------------------ Leaf-first USD ----------------------------- */

    [Fact]
    public async Task Every_usd_figure_is_summed_from_the_goods_not_converted_once()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var doc = Id(await DocAsync(c));

        // AED 100 at 3, split three ways: 33.34, 33.33, 33.33 → 11.11 + 11.11 + 11.11 = 33.33.
        // Converting the line's own 100 once gives 33.33 too here — but the roll-up is what keeps
        // the printed rows adding to the printed total when they do not.
        var result = await PostAsync(c, $"/api/erp/charge-docs/{doc}/lines",
            LineInput(100m, currency: "AED", fxRate: 3m));

        var entity = result.GetProperty("entity");
        var line = entity.GetProperty("lines")[0];
        var allocationsUsd = line.GetProperty("allocations").EnumerateArray()
            .Select(a => a.GetProperty("amountUSD").GetDecimal()).ToList();

        Assert.Equal(allocationsUsd.Sum(), line.GetProperty("amountUSD").GetDecimal());
        Assert.Equal(line.GetProperty("amountUSD").GetDecimal(), entity.GetProperty("totalUSD").GetDecimal());
    }

    [Fact]
    public async Task A_general_line_converts_its_own_amount()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var doc = Id(await DocAsync(c, kind: "GENERAL"));

        var result = await PostAsync(c, $"/api/erp/charge-docs/{doc}/lines",
            LineInput(300m, categoryId: "cat-gen", currency: "AED", fxRate: 3m));

        var line = result.GetProperty("entity").GetProperty("lines")[0];
        Assert.Equal(0, line.GetProperty("allocations").GetArrayLength());
        Assert.Equal(100m, line.GetProperty("amountUSD").GetDecimal());
    }

    [Fact]
    public async Task A_general_document_refuses_goods()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var doc = Id(await DocAsync(c, kind: "GENERAL"));

        var response = await c.PostAsJsonAsync(
            new Uri($"/api/erp/charge-docs/{doc}/lines", UriKind.Relative),
            LineInput(10m, categoryId: "cat-gen", goods: [new { invoiceItemId = "invitem-1" }]));

        Assert.Equal("goods-not-allowed", (await ProblemAsync(response)).GetProperty("code").GetString());
    }

    /* -------------------------------- Categories ------------------------------- */

    [Fact]
    public async Task A_category_must_match_the_documents_direction_and_kind()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var doc = Id(await DocAsync(c));

        // A REVENUE category on an EXPENSE document.
        var wrongWay = await c.PostAsJsonAsync(
            new Uri($"/api/erp/charge-docs/{doc}/lines", UriKind.Relative),
            LineInput(10m, categoryId: "cat-rev"));
        Assert.Equal("category-mismatch", (await ProblemAsync(wrongWay)).GetProperty("code").GetString());

        // A GENERAL category on an INVOICE document.
        var wrongScope = await c.PostAsJsonAsync(
            new Uri($"/api/erp/charge-docs/{doc}/lines", UriKind.Relative),
            LineInput(10m, categoryId: "cat-gen"));
        Assert.Equal("category-mismatch", (await ProblemAsync(wrongScope)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task A_retired_category_cannot_be_chosen_but_an_existing_line_still_saves()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var doc = Id(await DocAsync(c));

        var refused = await c.PostAsJsonAsync(
            new Uri($"/api/erp/charge-docs/{doc}/lines", UriKind.Relative),
            LineInput(10m, categoryId: "cat-off"));
        Assert.Equal("category-inactive", (await ProblemAsync(refused)).GetProperty("code").GetString());

        // A line already using it can still be edited, as long as the category is not being
        // changed — retiring one must not make its history unsaveable.
        var added = await PostAsync(c, $"/api/erp/charge-docs/{doc}/lines", LineInput(10m));
        var lineId = added.GetProperty("entity").GetProperty("lines")[0].GetProperty("id").GetString();

        using (var scope = fixture.Services.CreateScope())
        {
            var context = scope.ServiceProvider.GetRequiredService<Finora.Erp.Infrastructure.ErpDbContext>();
            context.ChargeCategories.Single(x => x.Id == "cat-inv").Active = false;
            await context.SaveChangesAsync();
        }

        var edit = await c.PutAsJsonAsync(
            new Uri($"/api/erp/charge-docs/{doc}/lines/{lineId}", UriKind.Relative), LineInput(20m));
        edit.EnsureSuccessStatusCode();
    }

    /* --------------------------------- Documents ------------------------------- */

    [Fact]
    public async Task The_booked_document_the_kind_and_the_direction_never_change()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var doc = Id(await DocAsync(c));

        foreach (var (body, expected) in new (object, string)[]
                 {
                     (new { direction = "EXPENSE", kind = "INVOICE", title = "t", invoiceId = (string?)null, date = Date }, "invoice-immutable"),
                     (new { direction = "EXPENSE", kind = "GENERAL", title = "t", invoiceId = (string?)"inv-si-0001", date = Date }, "kind-immutable"),
                     (new { direction = "REVENUE", kind = "INVOICE", title = "t", invoiceId = (string?)"inv-si-0001", date = Date }, "direction-immutable"),
                 })
        {
            var response = await c.PutAsJsonAsync(new Uri($"/api/erp/charge-docs/{doc}", UriKind.Relative), body);
            Assert.Equal(expected, (await ProblemAsync(response)).GetProperty("code").GetString());
        }

        // The title and date DO change, and no document re-validation happens — that is the point
        // of keeping the booking fixed.
        var ok = await c.PutAsJsonAsync(new Uri($"/api/erp/charge-docs/{doc}", UriKind.Relative),
            new { direction = "EXPENSE", kind = "INVOICE", title = "Renamed", invoiceId = "inv-si-0001", date = Date });
        ok.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task A_cancelled_document_refuses_every_edit_and_cancelling_is_idempotent()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var doc = Id(await DocAsync(c));

        await PostAsync(c, $"/api/erp/charge-docs/{doc}/cancel");
        var twice = await PostAsync(c, $"/api/erp/charge-docs/{doc}/cancel");
        Assert.Equal("CANCELLED", twice.GetProperty("entity").GetProperty("status").GetString());

        var response = await c.PostAsJsonAsync(
            new Uri($"/api/erp/charge-docs/{doc}/lines", UriKind.Relative), LineInput(10m));
        Assert.Equal("doc-cancelled", (await ProblemAsync(response)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Removing_a_line_takes_its_money_off_the_total()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var doc = Id(await DocAsync(c));

        await PostAsync(c, $"/api/erp/charge-docs/{doc}/lines", LineInput(60m));
        var second = await PostAsync(c, $"/api/erp/charge-docs/{doc}/lines", LineInput(40m));
        Assert.Equal(100m, second.GetProperty("entity").GetProperty("totalUSD").GetDecimal());

        var lineId = second.GetProperty("entity").GetProperty("lines")
            .EnumerateArray().Last().GetProperty("id").GetString();
        var after = await c.DeleteAsync(new Uri($"/api/erp/charge-docs/{doc}/lines/{lineId}", UriKind.Relative));
        after.EnsureSuccessStatusCode();

        Assert.Equal(60m, (await after.Content.ReadFromJsonAsync<JsonElement>(Json))
            .GetProperty("entity").GetProperty("totalUSD").GetDecimal());
    }

    /* ---------------------------------- Guards --------------------------------- */

    [Fact]
    public async Task A_line_needs_a_person_and_a_good_must_be_on_the_document()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var doc = Id(await DocAsync(c));

        var noPerson = await c.PostAsJsonAsync(
            new Uri($"/api/erp/charge-docs/{doc}/lines", UriKind.Relative),
            new { categoryId = "cat-inv", date = Date, amount = 10m, currency = "USD", fxRate = 1m });
        Assert.Equal("person-required", (await ProblemAsync(noPerson)).GetProperty("code").GetString());

        var strayGood = await c.PostAsJsonAsync(
            new Uri($"/api/erp/charge-docs/{doc}/lines", UriKind.Relative),
            LineInput(10m, goods: [new { invoiceItemId = "invitem-nope" }]));
        Assert.Equal("good-not-on-invoice", (await ProblemAsync(strayGood)).GetProperty("code").GetString());

        var twice = await c.PostAsJsonAsync(
            new Uri($"/api/erp/charge-docs/{doc}/lines", UriKind.Relative),
            LineInput(10m, goods: [new { invoiceItemId = "invitem-1" }, new { invoiceItemId = "invitem-1" }]));
        Assert.Equal("duplicate-good", (await ProblemAsync(twice)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Charges_need_an_expenses_or_revenues_permission()
    {
        await ResetAsync();
        var client = fixture.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        await client.PostAsJsonAsync(new Uri("/api/identity/login", UriKind.Relative),
            new { email = "staff@finora.app", password = "Staff@2026" });

        var response = await client.GetAsync(new Uri("/api/erp/charge-docs", UriKind.Relative));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        client.Dispose();
    }
}
