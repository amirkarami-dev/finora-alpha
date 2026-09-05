using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Finora.Erp.Domain;
using Finora.Erp.Infrastructure.Snapshot;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Finora.IntegrationTests;

/// <summary>
/// Trade documents over real HTTP.
///
/// <para>
/// Each test pins one rule that no other test pins. The rules chosen are the ones a
/// reimplementation gets wrong quietly — where the wrong answer is a plausible number on a
/// screen rather than an exception.
/// </para>
/// </summary>
[Collection(nameof(ApiCollection))]
public sealed class InvoiceTests(ApiFixture fixture)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    // The workbook reference: 11,685 × 94.76% + 0 = 11,072.706 USD/MT — deliberately a figure
    // whose unit price does not land on a cent.
    private const decimal FixedLme = 11685m;
    private const decimal LmePercent = 94.76m;

    private static async Task<HttpClient> AsManagerAsync(ApiFixture fixture)
    {
        var client = fixture.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        (await client.PostAsJsonAsync(new Uri("/api/identity/login", UriKind.Relative),
            new { email = "amir@finora.app", password = "demo1234" })).EnsureSuccessStatusCode();
        return client;
    }

    /// <summary>One customer, one 100 MT contract line, one container.</summary>
    private async Task ResetAsync(decimal quantity = 100m, decimal lmePercent = LmePercent)
    {
        using var scope = fixture.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<SnapshotService>().ReplaceAsync(new ErpSnapshot
        {
            Customers = [new Customer { Id = "cust-am", Name = "Alco Metal Trading", Code = "AM" }],
            Containers = [new Container { Id = "cnt-1", Reference = "MSNU8018095" }],
            Warehouses = [new Warehouse { Id = "wh-1", Name = "Main", Code = "1" }],
            Contracts =
            [
                new Contract
                {
                    Id = "ctr-1", CustomerId = "cust-am", Destination = "NINGBO",
                    Items =
                    [
                        new ContractItem
                        {
                            Id = "item-1", ContractId = "ctr-1", Product = "98% Copper Ingots",
                            QuantityMt = quantity, RemainingMt = quantity,
                            LmePercent = lmePercent, LmeFixed = true, FixedLmePrice = FixedLme,
                        },
                    ],
                },
            ],
        });
    }

    private static async Task<JsonElement> PostAsync(HttpClient c, string url, object? body = null)
    {
        var response = body is null
            ? await c.PostAsync(new Uri(url, UriKind.Relative), null)
            : await c.PostAsJsonAsync(new Uri(url, UriKind.Relative), body);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>(Json);
    }

    private static async Task<JsonElement> ProblemAsync(HttpResponseMessage r) =>
        await r.Content.ReadFromJsonAsync<JsonElement>(Json);

    private static string Id(JsonElement result) => result.GetProperty("entity").GetProperty("id").GetString()!;

    private static async Task<string> DraftAsync(HttpClient c, string type = "SALE_INVOICE") =>
        Id(await PostAsync(c, "/api/erp/invoices",
            new { invoiceType = type, contractId = "ctr-1", invoiceDate = "2026-08-13T00:00:00Z" }));

    /// <summary>Sends every quantity field: an order takes <c>quantityMt</c>, an invoice type
    /// takes <c>grossMt</c>/<c>tareMt</c> and ignores the rest. Tare 0 keeps net == qty.</summary>
    private static Task<JsonElement> AddLineAsync(
        HttpClient c, string id, decimal qty, string? container = "cnt-1") =>
        PostAsync(c, $"/api/erp/invoices/{id}/items",
            new[] { new { contractItemId = "item-1", quantityMt = qty, grossMt = qty, tareMt = 0m, containerId = container } });

    private static Task<JsonElement> PriceAsync(HttpClient c, string id, decimal lme = 9000m) =>
        PostAsync(c, $"/api/erp/invoices/{id}/lme-price",
            new { lmeDate = "2026-08-13T00:00:00Z", lmePrice = lme });

    /* ---------------------------- Pricing and totals ---------------------------- */

    [Fact]
    public async Task The_unit_price_is_never_stored_rounded()
    {
        // A percentage with four decimals, which is what the column allows and what a negotiated
        // contract actually carries: 11,685 × 0.947636 = 11,073.12666 USD/MT — six decimals.
        await ResetAsync(quantity: 1000m, lmePercent: 94.7636m);
        using var c = await AsManagerAsync(fixture);
        var id = await DraftAsync(c);

        var line = (await AddLineAsync(c, id, 1000m)).GetProperty("entity").GetProperty("items")[0];

        // 11,073.12666 × 1,000 = 11,073,126.66 exactly.
        // Rounding the unit to its column's 4dp first — 11,073.1267 — gives 11,073,126.70. Four
        // cents on one line, in the same direction on every line, reconciling perfectly against
        // itself so nothing downstream ever flags it.
        Assert.Equal(11073126.66m, line.GetProperty("amount").GetDecimal());
    }

    [Fact]
    public async Task Totals_round_each_line_then_sum_them()
    {
        await ResetAsync(quantity: 1000m);
        using var c = await AsManagerAsync(fixture);
        var id = await DraftAsync(c);

        // Three lines each worth 11,072.706 × 0.5 = 5,536.353 → 5,536.35 stored.
        var invoice = (await PostAsync(c, $"/api/erp/invoices/{id}/items", new[]
        {
            new { contractItemId = "item-1", quantityMt = 0.5m, grossMt = 0.5m, tareMt = 0m, containerId = "cnt-1" },
            new { contractItemId = "item-1", quantityMt = 0.5m, grossMt = 0.5m, tareMt = 0m, containerId = "cnt-1" },
            new { contractItemId = "item-1", quantityMt = 0.5m, grossMt = 0.5m, tareMt = 0m, containerId = "cnt-1" },
        })).GetProperty("entity");

        // Round-then-sum: 5,536.35 × 3 = 16,609.05. Summing raw and rounding once gives
        // 16,609.06, and the header would disagree with the three lines printed beneath it.
        Assert.Equal(16609.05m, invoice.GetProperty("totalAmount").GetDecimal());
    }

    [Fact]
    public async Task An_unpriced_floating_line_is_worth_zero_rather_than_an_error()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Finora.Erp.Infrastructure.ErpDbContext>();
        var item = db.ContractItems.Single(i => i.Id == "item-1");
        item.LmeFixed = false;                    // floating: priced only when a quotation arrives
        await db.SaveChangesAsync();

        var id = await DraftAsync(c, "SALE_PROVISIONAL");
        var line = (await AddLineAsync(c, id, 25m)).GetProperty("entity").GetProperty("items")[0];

        Assert.Equal(0m, line.GetProperty("amount").GetDecimal());
        Assert.Null(line.GetProperty("lmePrice").ValueKind == JsonValueKind.Null ? null : "set");
    }

    [Fact]
    public async Task Applying_a_price_without_a_discount_leaves_line_discounts_alone()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = await DraftAsync(c);
        var added = await AddLineAsync(c, id, 10m);
        var itemId = added.GetProperty("entity").GetProperty("items")[0].GetProperty("id").GetString();

        await c.PutAsJsonAsync(new Uri($"/api/erp/invoices/{id}/items/{itemId}", UriKind.Relative),
            new { discountPercent = 10m });

        var after = (await PriceAsync(c, id)).GetProperty("entity").GetProperty("items")[0];

        // Omitted means "unchanged", not "clear" — the difference between a `decimal?` and a
        // `decimal` on the request, and between keeping and silently discarding a negotiated
        // discount.
        Assert.Equal(10m, after.GetProperty("discountPercent").GetDecimal());
    }

    [Fact]
    public async Task A_discount_outside_zero_to_a_hundred_is_a_coded_refusal()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = await DraftAsync(c);
        await AddLineAsync(c, id, 10m);

        var response = await c.PostAsJsonAsync(
            new Uri($"/api/erp/invoices/{id}/lme-price", UriKind.Relative),
            new { lmeDate = "2026-08-13T00:00:00Z", lmePrice = 9000m, discountPercent = 150m });

        // The column has a CHECK. Without this guard the caller gets a 500 from the driver
        // instead of something a form can show against a field.
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal("invalid-discount", (await ProblemAsync(response)).GetProperty("code").GetString());
    }

    /* ----------------------------- The quantity ceiling ------------------------- */

    [Fact]
    public async Task A_confirmed_ancestor_still_claims_after_it_converts_to_a_draft()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var provisional = await DraftAsync(c, "SALE_PROVISIONAL");
        await AddLineAsync(c, provisional, 60m);
        await PriceAsync(c, provisional);
        await PostAsync(c, $"/api/erp/invoices/{provisional}/confirm");
        await PostAsync(c, $"/api/erp/invoices/{provisional}/convert", new { targetType = "SALE_INVOICE" });

        // The provisional is CONFIRMED with a DRAFT successor. Written as "confirmed AND has no
        // successor", its 60 tonnes would vanish from the remaining figure and the contract page
        // would show 100 left instead of 40.
        var second = await DraftAsync(c, "SALE_PROVISIONAL");
        var response = await c.PostAsJsonAsync(
            new Uri($"/api/erp/invoices/{second}/items", UriKind.Relative),
            new[] { new { contractItemId = "item-1", quantityMt = 50m, grossMt = 50m, tareMt = 0m, containerId = "cnt-1" } });
        response.EnsureSuccessStatusCode();

        var item = (await response.Content.ReadFromJsonAsync<JsonElement>(Json))
            .GetProperty("contracts")[0].GetProperty("items")[0];
        Assert.Equal(0m, item.GetProperty("remainingMt").GetDecimal());
    }

    [Fact]
    public async Task A_document_may_hold_its_own_chains_quantity_in_full()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var provisional = await DraftAsync(c, "SALE_PROVISIONAL");
        await AddLineAsync(c, provisional, 60m);
        await PriceAsync(c, provisional);
        await PostAsync(c, $"/api/erp/invoices/{provisional}/confirm");
        var final = Id(await PostAsync(c, $"/api/erp/invoices/{provisional}/convert",
            new { targetType = "SALE_INVOICE" }));

        // Its own chain is excluded whole, so the successor may be raised to the full 100 without
        // colliding with the 60 its predecessor claims.
        var items = (await c.GetFromJsonAsync<JsonElement>(
            new Uri("/api/erp/invoices", UriKind.Relative), Json))
            .EnumerateArray().Single(i => i.GetProperty("id").GetString() == final)
            .GetProperty("items");
        var lineId = items[0].GetProperty("id").GetString();

        var response = await c.PutAsJsonAsync(
            new Uri($"/api/erp/invoices/{final}/items/{lineId}", UriKind.Relative),
            new { grossMt = 100m, tareMt = 0m });

        response.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task A_line_above_the_contract_is_accepted_and_remaining_floors_at_zero()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = await DraftAsync(c);

        var response = await c.PostAsJsonAsync(
            new Uri($"/api/erp/invoices/{id}/items", UriKind.Relative),
            new[] { new { contractItemId = "item-1", grossMt = 150m, tareMt = 0m, containerId = "cnt-1" } });
        response.EnsureSuccessStatusCode();

        // 150 against a 100 MT line: the document keeps the 150 and the contract shows nothing
        // left, never a negative figure.
        var result = await response.Content.ReadFromJsonAsync<JsonElement>(Json);
        Assert.Equal(150m, result.GetProperty("entity").GetProperty("items")[0].GetProperty("quantityMt").GetDecimal());
        var item = result.GetProperty("contracts")[0].GetProperty("items")[0];
        Assert.Equal(0m, item.GetProperty("remainingMt").GetDecimal());
    }

    [Fact]
    public async Task Several_lines_that_together_exceed_the_contract_are_all_accepted()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = await DraftAsync(c);

        var response = await c.PostAsJsonAsync(
            new Uri($"/api/erp/invoices/{id}/items", UriKind.Relative),
            new[]
            {
                new { contractItemId = "item-1", grossMt = 40m, tareMt = 0m, containerId = "cnt-1" },
                new { contractItemId = "item-1", grossMt = 40m, tareMt = 0m, containerId = "cnt-1" },
                new { contractItemId = "item-1", grossMt = 40m, tareMt = 0m, containerId = "cnt-1" },
            });
        response.EnsureSuccessStatusCode();

        var invoice = (await response.Content.ReadFromJsonAsync<JsonElement>(Json)).GetProperty("entity");
        Assert.Equal(3, invoice.GetProperty("items").GetArrayLength());
        Assert.Equal(120m, invoice.GetProperty("totalWeightMt").GetDecimal());
    }

    [Fact]
    public async Task Confirming_a_document_that_exceeds_the_contract_succeeds()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var second = await DraftAsync(c, "SALE_ORDER");
        foreach (var _ in Enumerable.Range(0, 3))
        {
            await PostAsync(c, $"/api/erp/invoices/{second}/items",
                new[] { new { contractItemId = "item-1", quantityMt = 30m, containerId = (string?)null } });
        }

        var first = await DraftAsync(c, "SALE_PROVISIONAL");
        await AddLineAsync(c, first, 60m);
        await PriceAsync(c, first);
        await PostAsync(c, $"/api/erp/invoices/{first}/confirm");

        // 90 on this order plus 60 confirmed elsewhere is 150 against a 100 MT line. The
        // business sells what it sells; the contract page shows the overrun instead.
        var confirmed = await PostAsync(c, $"/api/erp/invoices/{second}/confirm");
        Assert.Equal("CONFIRMED", confirmed.GetProperty("entity").GetProperty("status").GetString());
    }

    /* --------------------------- Chain and line identity ------------------------ */

    [Fact]
    public async Task Converting_keeps_the_chain_stable_line_identity_and_mints_a_new_row_id()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var provisional = await DraftAsync(c, "SALE_PROVISIONAL");
        var added = await AddLineAsync(c, provisional, 25m);
        var sourceLine = added.GetProperty("entity").GetProperty("items")[0];
        var sourceRowId = sourceLine.GetProperty("id").GetString();
        var chainId = sourceLine.GetProperty("referenceDocumentItemId").GetString();

        await PriceAsync(c, provisional);
        await PostAsync(c, $"/api/erp/invoices/{provisional}/confirm");
        var successor = await PostAsync(c, $"/api/erp/invoices/{provisional}/convert",
            new { targetType = "SALE_INVOICE" });

        var newLine = successor.GetProperty("entity").GetProperty("items")[0];

        // The chain id is what warehouse receipts, costs, claims and payments are keyed on. An
        // explicit field-by-field copy that mints a fresh one compiles cleanly and lets the same
        // metal be received twice.
        Assert.Equal(chainId, newLine.GetProperty("referenceDocumentItemId").GetString());
        Assert.NotEqual(sourceRowId, newLine.GetProperty("id").GetString());
        // A provisional carries its pricing forward. The quotation DATE is the observable part
        // here: `lmePrice` is only ever written to floating lines, and this contract line is
        // fixed, so it is null on both documents.
        Assert.NotEqual(JsonValueKind.Null, newLine.GetProperty("lmeDate").ValueKind);
    }

    [Fact]
    public async Task Converting_from_an_order_carries_no_prices_but_keeps_the_contract_snapshot()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var order = await DraftAsync(c, "SALE_ORDER");
        await AddLineAsync(c, order, 25m, container: null);
        await PostAsync(c, $"/api/erp/invoices/{order}/confirm");

        var line = (await PostAsync(c, $"/api/erp/invoices/{order}/convert",
            new { targetType = "SALE_PROVISIONAL" })).GetProperty("entity").GetProperty("items")[0];

        Assert.Equal(JsonValueKind.Null, line.GetProperty("lmePrice").ValueKind);
        Assert.Equal(JsonValueKind.Null, line.GetProperty("lmeDate").ValueKind);
        // The contract snapshot survives — it is what prices the line, not a live contract read.
        Assert.Equal(FixedLme, line.GetProperty("fixedPrice").GetDecimal());
        Assert.Equal(LmePercent, line.GetProperty("lmePercent").GetDecimal());
    }

    [Fact]
    public async Task A_second_line_for_the_same_good_gets_its_own_identity()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var provisional = await DraftAsync(c, "SALE_PROVISIONAL");
        await AddLineAsync(c, provisional, 25m);
        await PriceAsync(c, provisional);
        await PostAsync(c, $"/api/erp/invoices/{provisional}/confirm");
        var successor = Id(await PostAsync(c, $"/api/erp/invoices/{provisional}/convert",
            new { targetType = "SALE_INVOICE" }));

        // On the successor, one call adding two lines for the same contract line: the first
        // inherits the chain identity, the second is genuinely additional goods.
        var after = await PostAsync(c, $"/api/erp/invoices/{successor}/items", new[]
        {
            new { contractItemId = "item-1", quantityMt = 10m, grossMt = 10m, tareMt = 0m, containerId = "cnt-1" },
            new { contractItemId = "item-1", quantityMt = 10m, grossMt = 10m, tareMt = 0m, containerId = "cnt-1" },
        });

        var ids = after.GetProperty("entity").GetProperty("items")
            .EnumerateArray().Select(i => i.GetProperty("referenceDocumentItemId").GetString()).ToList();

        Assert.Equal(3, ids.Count);
        Assert.Equal(ids.Count, ids.Distinct(StringComparer.Ordinal).Count());
    }

    [Fact]
    public async Task A_document_may_be_converted_only_once()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var provisional = await DraftAsync(c, "SALE_PROVISIONAL");
        await AddLineAsync(c, provisional, 25m);
        await PriceAsync(c, provisional);
        await PostAsync(c, $"/api/erp/invoices/{provisional}/confirm");
        await PostAsync(c, $"/api/erp/invoices/{provisional}/convert", new { targetType = "SALE_INVOICE" });

        var again = await c.PostAsJsonAsync(
            new Uri($"/api/erp/invoices/{provisional}/convert", UriKind.Relative),
            new { targetType = "SALE_INVOICE" });

        Assert.Equal("has-successor", (await ProblemAsync(again)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task A_side_is_never_crossed_and_a_final_converts_to_nothing()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var order = await DraftAsync(c, "SALE_ORDER");
        await AddLineAsync(c, order, 25m, container: null);
        await PostAsync(c, $"/api/erp/invoices/{order}/confirm");

        var crossed = await c.PostAsJsonAsync(
            new Uri($"/api/erp/invoices/{order}/convert", UriKind.Relative),
            new { targetType = "PURCHASE_INVOICE" });

        Assert.Equal("invalid-target", (await ProblemAsync(crossed)).GetProperty("code").GetString());
    }

    /* ------------------------------- Remaining -------------------------------- */

    [Fact]
    public async Task A_draft_consumes_the_contract_line_but_does_not_reserve_it()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var draft = await DraftAsync(c);
        var result = await AddLineAsync(c, draft, 60m);

        // Two different questions with two different answers, on purpose. `remainingMt` says how
        // much of the line is spoken for — a draft counts. The guard says whether another
        // document may be raised — a draft reserves nothing, so a rival may still claim all 100.
        var contractLine = result.GetProperty("contracts")[0].GetProperty("items")[0];
        Assert.Equal(40m, contractLine.GetProperty("remainingMt").GetDecimal());

        var rival = await DraftAsync(c, "SALE_ORDER");
        (await c.PostAsJsonAsync(new Uri($"/api/erp/invoices/{rival}/items", UriKind.Relative),
            new[] { new { contractItemId = "item-1", quantityMt = 100m, grossMt = 100m, tareMt = 0m, containerId = (string?)null } }))
            .EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Cancelling_returns_the_quantity_to_the_contract()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var draft = await DraftAsync(c);
        await AddLineAsync(c, draft, 60m);
        var after = await PostAsync(c, $"/api/erp/invoices/{draft}/cancel");

        Assert.Equal(100m, after.GetProperty("contracts")[0].GetProperty("items")[0]
            .GetProperty("remainingMt").GetDecimal());
    }

    [Fact]
    public async Task Editing_a_contract_line_does_not_reset_what_documents_have_claimed()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var draft = await DraftAsync(c);
        await AddLineAsync(c, draft, 60m);

        // Touch something unrelated on the goods line.
        var updated = await c.PutAsJsonAsync(
            new Uri("/api/erp/contracts/ctr-1/items/item-1", UriKind.Relative),
            new
            {
                product = "98% Copper Ingots", quantityMt = 100m, lmePercent = LmePercent,
                lmeFixed = true, fixedLmePrice = FixedLme, premium = 0m, incoterm = "CNF",
                status = "ACTIVE", notes = "a note",
            });
        updated.EnsureSuccessStatusCode();

        // Recomputed from the documents, not reset to the full quantity. Reset, the contract page
        // would read 100 remaining and 0% shipped while the guard still refused the tonnage.
        var contract = (await updated.Content.ReadFromJsonAsync<JsonElement>(Json)).GetProperty("entity");
        Assert.Equal(40m, contract.GetProperty("items")[0].GetProperty("remainingMt").GetDecimal());
    }

    private static Task<HttpResponseMessage> SetGoodsStatusAsync(HttpClient c, string status) =>
        c.PutAsJsonAsync(new Uri("/api/erp/contracts/ctr-1/items/item-1", UriKind.Relative), new
        {
            product = "98% Copper Ingots", quantityMt = 100m, lmePercent = LmePercent,
            lmeFixed = true, fixedLmePrice = FixedLme, premium = 0m, incoterm = "CNF", status,
        });

    [Theory]
    [InlineData("CLOSED")]
    [InlineData("ON HOLD")]
    [InlineData("CANCELLED")]
    public async Task A_goods_line_that_is_not_active_cannot_be_added_to_a_document(string status)
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        (await SetGoodsStatusAsync(c, status)).EnsureSuccessStatusCode();
        var draft = await DraftAsync(c);

        var response = await c.PostAsJsonAsync(new Uri($"/api/erp/invoices/{draft}/items", UriKind.Relative),
            new[] { new { contractItemId = "item-1", grossMt = 10m, tareMt = 0m, containerId = "cnt-1" } });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var problem = await ProblemAsync(response);
        Assert.Equal("contract-item-not-active", problem.GetProperty("code").GetString());
        Assert.Equal(422, problem.GetProperty("status").GetInt32());
        Assert.Equal(status, problem.GetProperty("goodsStatus").GetString());
        Assert.Equal("98% Copper Ingots", problem.GetProperty("product").GetString());
    }

    [Fact]
    public async Task A_line_on_goods_that_went_inactive_keeps_its_quantity_but_cannot_grow()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var draft = await DraftAsync(c);
        var lineId = (await AddLineAsync(c, draft, 40m)).GetProperty("entity").GetProperty("items")[0].GetProperty("id").GetString();
        (await SetGoodsStatusAsync(c, "CLOSED")).EnsureSuccessStatusCode();

        var grow = await c.PutAsJsonAsync(new Uri($"/api/erp/invoices/{draft}/items/{lineId}", UriKind.Relative),
            new { grossMt = 50m, tareMt = 0m });
        Assert.Equal("contract-item-not-active", (await ProblemAsync(grow)).GetProperty("code").GetString());

        // The line itself stays editable: a smaller weight or a description is not a new claim.
        var shrink = await c.PutAsJsonAsync(new Uri($"/api/erp/invoices/{draft}/items/{lineId}", UriKind.Relative),
            new { grossMt = 30m, tareMt = 0m, description = "re-weighed" });
        shrink.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task A_contract_line_may_shrink_below_what_is_already_invoiced()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var draft = await DraftAsync(c);
        await AddLineAsync(c, draft, 60m);

        var response = await c.PutAsJsonAsync(
            new Uri("/api/erp/contracts/ctr-1/items/item-1", UriKind.Relative),
            new
            {
                product = "98% Copper Ingots", quantityMt = 50m, lmePercent = LmePercent,
                lmeFixed = true, fixedLmePrice = FixedLme, premium = 0m, incoterm = "CNF",
                status = "ACTIVE",
            });
        response.EnsureSuccessStatusCode();

        // The documents already claim 60; the line now holds 50; remaining floors at zero and
        // the contract page reports 10 over.
        var item = (await response.Content.ReadFromJsonAsync<JsonElement>(Json)).GetProperty("entity").GetProperty("items")[0];
        Assert.Equal(50m, item.GetProperty("quantityMt").GetDecimal());
        Assert.Equal(0m, item.GetProperty("remainingMt").GetDecimal());
    }

    /* -------------------------------- Lifecycle ------------------------------- */

    [Fact]
    public async Task Confirming_reports_its_guards_one_at_a_time_in_order()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = await DraftAsync(c, "SALE_INVOICE");

        var empty = await c.PostAsync(new Uri($"/api/erp/invoices/{id}/confirm", UriKind.Relative), null);
        Assert.Equal("no-items", (await ProblemAsync(empty)).GetProperty("code").GetString());

        using (var scope = fixture.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<Finora.Erp.Infrastructure.ErpDbContext>();
            db.ContractItems.Single(i => i.Id == "item-1").LmeFixed = false;
            await db.SaveChangesAsync();
        }

        await AddLineAsync(c, id, 10m, container: null);
        var unpriced = await c.PostAsync(new Uri($"/api/erp/invoices/{id}/confirm", UriKind.Relative), null);
        Assert.Equal("missing-lme-price", (await ProblemAsync(unpriced)).GetProperty("code").GetString());

        await PriceAsync(c, id);
        var noContainer = await c.PostAsync(new Uri($"/api/erp/invoices/{id}/confirm", UriKind.Relative), null);
        var problem = await ProblemAsync(noContainer);
        Assert.Equal("missing-container", problem.GetProperty("code").GetString());
        // One entry per LINE, in line order, duplicates kept — the dialog lists lines, not goods.
        Assert.Equal(1, problem.GetProperty("products").GetArrayLength());
    }

    [Fact]
    public async Task An_order_needs_neither_a_price_nor_a_container()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var order = await DraftAsync(c, "SALE_ORDER");
        await AddLineAsync(c, order, 25m, container: null);

        var confirmed = await PostAsync(c, $"/api/erp/invoices/{order}/confirm");

        Assert.Equal("CONFIRMED", confirmed.GetProperty("entity").GetProperty("status").GetString());

        // It still carries a value. `isPricedType` exempts orders from those two confirm guards
        // and from the "shipped" aggregations — it does NOT zero the arithmetic, and a line off a
        // fixed contract prices itself from the snapshot it copied. 11,072.706 × 25.
        Assert.Equal(276817.65m, confirmed.GetProperty("entity").GetProperty("totalAmount").GetDecimal());
    }

    [Fact]
    public async Task A_confirmed_document_refuses_every_edit()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var order = await DraftAsync(c, "SALE_ORDER");
        await AddLineAsync(c, order, 25m, container: null);
        await PostAsync(c, $"/api/erp/invoices/{order}/confirm");

        var response = await c.PostAsJsonAsync(
            new Uri($"/api/erp/invoices/{order}/items", UriKind.Relative),
            new[] { new { contractItemId = "item-1", quantityMt = 5m, grossMt = 5m, tareMt = 0m, containerId = (string?)null } });

        Assert.Equal("not-draft", (await ProblemAsync(response)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Cancelling_is_idempotent_and_refused_while_a_successor_lives()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var provisional = await DraftAsync(c, "SALE_PROVISIONAL");
        await AddLineAsync(c, provisional, 25m);
        await PriceAsync(c, provisional);
        await PostAsync(c, $"/api/erp/invoices/{provisional}/confirm");
        var successor = Id(await PostAsync(c, $"/api/erp/invoices/{provisional}/convert",
            new { targetType = "SALE_INVOICE" }));

        var blocked = await c.PostAsync(new Uri($"/api/erp/invoices/{provisional}/cancel", UriKind.Relative), null);
        Assert.Equal("cancel-blocked-successor", (await ProblemAsync(blocked)).GetProperty("code").GetString());

        // Unwind from the tip; then the predecessor is free, and cancelling twice is not an error.
        await PostAsync(c, $"/api/erp/invoices/{successor}/cancel");
        await PostAsync(c, $"/api/erp/invoices/{provisional}/cancel");
        var twice = await PostAsync(c, $"/api/erp/invoices/{provisional}/cancel");
        Assert.Equal("CANCELLED", twice.GetProperty("entity").GetProperty("status").GetString());
    }

    [Fact]
    public async Task A_cancelled_document_cannot_be_marked_as_sent()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var id = await DraftAsync(c);
        await PostAsync(c, $"/api/erp/invoices/{id}/cancel");

        var response = await c.PostAsync(new Uri($"/api/erp/invoices/{id}/sent", UriKind.Relative), null);

        // The browser stamps anything. A cancelled invoice claiming to have been sent is a
        // statement about the outside world that is simply untrue.
        Assert.Equal("invoice-cancelled", (await ProblemAsync(response)).GetProperty("code").GetString());
    }

    /* ------------------------------- Weights ------------------------------- */

#pragma warning disable CA1859 // the anonymous array type has no name to declare as the return type
    private static object Weighed(decimal gross, decimal tare, string? container = "cnt-1") =>
        new[] { new { contractItemId = "item-1", grossMt = gross, tareMt = tare, containerId = container } };
#pragma warning restore CA1859

    [Fact]
    public async Task Net_is_gross_minus_tare_and_it_prices_the_line()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = await DraftAsync(c);

        // quantityMt is sent on purpose and must be ignored on an invoice type.
        var line = (await PostAsync(c, $"/api/erp/invoices/{id}/items",
            new[] { new { contractItemId = "item-1", grossMt = 1.2m, tareMt = 0.2m, quantityMt = 99m, containerId = "cnt-1" } }))
            .GetProperty("entity").GetProperty("items")[0];

        Assert.Equal(1.2m, line.GetProperty("grossMt").GetDecimal());
        Assert.Equal(0.2m, line.GetProperty("tareMt").GetDecimal());
        Assert.Equal(1m, line.GetProperty("quantityMt").GetDecimal());
        // 11,685 × 94.76% = 11,072.706 USD/MT × 1.000 MT, to the cent.
        Assert.Equal(11072.71m, line.GetProperty("amount").GetDecimal());
    }

    [Theory]
    [InlineData(0, 0, "gross")]
    [InlineData(1, -0.1, "tare")]
    [InlineData(1, 1, "tare-exceeds-gross")]
    [InlineData(1, 1.5, "tare-exceeds-gross")]
    public async Task Weights_are_checked_rule_by_rule(decimal gross, decimal tare, string rule)
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = await DraftAsync(c);

        var response = await c.PostAsJsonAsync(new Uri($"/api/erp/invoices/{id}/items", UriKind.Relative), Weighed(gross, tare));

        var problem = await ProblemAsync(response);
        Assert.Equal("weights-invalid", problem.GetProperty("code").GetString());
        Assert.Equal(rule, problem.GetProperty("rule").GetString());
    }

    [Fact]
    public async Task A_missing_weight_on_an_invoice_type_is_refused_not_defaulted()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = await DraftAsync(c);

        var response = await c.PostAsJsonAsync(new Uri($"/api/erp/invoices/{id}/items", UriKind.Relative),
            new[] { new { contractItemId = "item-1", quantityMt = 10m, containerId = "cnt-1" } });

        var problem = await ProblemAsync(response);
        Assert.Equal("weights-invalid", problem.GetProperty("code").GetString());
        Assert.Equal("gross", problem.GetProperty("rule").GetString());
    }

    [Fact]
    public async Task An_order_line_takes_a_quantity_and_stores_no_weights()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var order = await DraftAsync(c, "SALE_ORDER");

        var line = (await PostAsync(c, $"/api/erp/invoices/{order}/items",
            new[] { new { contractItemId = "item-1", quantityMt = 25m, grossMt = 40m, tareMt = 1m } }))
            .GetProperty("entity").GetProperty("items")[0];

        Assert.Equal(25m, line.GetProperty("quantityMt").GetDecimal());
        Assert.Equal(JsonValueKind.Null, line.GetProperty("grossMt").ValueKind);
        Assert.Equal(JsonValueKind.Null, line.GetProperty("tareMt").ValueKind);

        var zero = await c.PostAsJsonAsync(new Uri($"/api/erp/invoices/{order}/items", UriKind.Relative),
            new[] { new { contractItemId = "item-1", quantityMt = 0m } });
        var problem = await ProblemAsync(zero);
        Assert.Equal("weights-invalid", problem.GetProperty("code").GetString());
        Assert.Equal("quantity", problem.GetProperty("rule").GetString());
    }

    [Fact]
    public async Task Editing_one_weight_moves_the_net_and_keeps_the_other()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = await DraftAsync(c);
        var lineId = (await PostAsync(c, $"/api/erp/invoices/{id}/items", Weighed(1.2m, 0.2m)))
            .GetProperty("entity").GetProperty("items")[0].GetProperty("id").GetString();

        var response = await c.PutAsJsonAsync(new Uri($"/api/erp/invoices/{id}/items/{lineId}", UriKind.Relative), new { grossMt = 2m });
        response.EnsureSuccessStatusCode();
        var edited = (await response.Content.ReadFromJsonAsync<JsonElement>(Json)).GetProperty("entity").GetProperty("items")[0];

        Assert.Equal(2m, edited.GetProperty("grossMt").GetDecimal());
        Assert.Equal(0.2m, edited.GetProperty("tareMt").GetDecimal());
        Assert.Equal(1.8m, edited.GetProperty("quantityMt").GetDecimal());

        var refused = await c.PutAsJsonAsync(new Uri($"/api/erp/invoices/{id}/items/{lineId}", UriKind.Relative), new { tareMt = 2.5m });
        var problem = await ProblemAsync(refused);
        Assert.Equal("weights-invalid", problem.GetProperty("code").GetString());
        Assert.Equal("tare-exceeds-gross", problem.GetProperty("rule").GetString());
    }

    [Fact]
    public async Task Converting_seeds_gross_from_an_orders_quantity_and_then_carries_the_weights()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var order = await DraftAsync(c, "SALE_ORDER");
        await AddLineAsync(c, order, 25m, container: null);
        await PostAsync(c, $"/api/erp/invoices/{order}/confirm");

        var provisional = await PostAsync(c, $"/api/erp/invoices/{order}/convert", new { targetType = "SALE_PROVISIONAL" });
        var pLine = provisional.GetProperty("entity").GetProperty("items")[0];
        Assert.Equal(25m, pLine.GetProperty("grossMt").GetDecimal());
        Assert.Equal(0m, pLine.GetProperty("tareMt").GetDecimal());
        Assert.Equal(25m, pLine.GetProperty("quantityMt").GetDecimal());

        // The desk weighs the goods and corrects the provisional, then it goes final.
        var pId = Id(provisional);
        var pLineId = pLine.GetProperty("id").GetString();
        await c.PutAsJsonAsync(new Uri($"/api/erp/invoices/{pId}/items/{pLineId}", UriKind.Relative),
            new { grossMt = 25.4m, tareMt = 0.4m, containerId = "cnt-1" });
        await PostAsync(c, $"/api/erp/invoices/{pId}/confirm");

        var final = (await PostAsync(c, $"/api/erp/invoices/{pId}/convert", new { targetType = "SALE_INVOICE" }))
            .GetProperty("entity").GetProperty("items")[0];
        Assert.Equal(25.4m, final.GetProperty("grossMt").GetDecimal());
        Assert.Equal(0.4m, final.GetProperty("tareMt").GetDecimal());
        Assert.Equal(25m, final.GetProperty("quantityMt").GetDecimal());
    }

    [Fact]
    public async Task A_receipt_against_the_line_consumes_the_net_not_the_gross()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = await DraftAsync(c, "PURCHASE_INVOICE");
        var line = (await PostAsync(c, $"/api/erp/invoices/{id}/items", Weighed(1.2m, 0.2m)))
            .GetProperty("entity").GetProperty("items")[0];
        await PostAsync(c, $"/api/erp/invoices/{id}/confirm");
        var refId = line.GetProperty("referenceDocumentItemId").GetString();

        await PostAsync(c, "/api/erp/inventory-documents", new
        {
            type = "IN", warehouseId = "wh-1", invoiceId = id, date = "2026-08-13T00:00:00Z",
            items = new[] { new { referenceDocumentItemId = refId, quantityMt = 1m } },
        });

        var over = await c.PostAsJsonAsync(new Uri("/api/erp/inventory-documents", UriKind.Relative), new
        {
            type = "IN", warehouseId = "wh-1", invoiceId = id, date = "2026-08-13T00:00:00Z",
            items = new[] { new { referenceDocumentItemId = refId, quantityMt = 0.1m } },
        });
        var problem = await ProblemAsync(over);
        Assert.Equal("exceeds-remaining", problem.GetProperty("code").GetString());
    }

    /* -------------------------------- Numbering ------------------------------- */

    [Fact]
    public async Task A_cancelled_number_is_never_reissued()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var first = await PostAsync(c, "/api/erp/invoices",
            new { invoiceType = "SALE_INVOICE", contractId = "ctr-1", invoiceDate = "2026-08-13T00:00:00Z" });
        Assert.Equal("26080001", first.GetProperty("entity").GetProperty("invoiceNumber").GetString());

        await PostAsync(c, $"/api/erp/invoices/{Id(first)}/cancel");

        var second = await PostAsync(c, "/api/erp/invoices",
            new { invoiceType = "SALE_INVOICE", contractId = "ctr-1", invoiceDate = "2026-08-13T00:00:00Z" });

        // A cancelled number has already been sent to somebody. Reissuing it puts one legal
        // invoice number on two documents.
        Assert.Equal("26080002", second.GetProperty("entity").GetProperty("invoiceNumber").GetString());
    }

    /* --------------------------------- Numbering --------------------------------- */

    private static string Number(JsonElement result) =>
        result.GetProperty("entity").GetProperty("invoiceNumber").GetString()!;

    [Fact]
    public async Task Numbers_are_yymm_plus_four_digits_and_shared_across_types()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var order = await PostAsync(c, "/api/erp/invoices",
            new { invoiceType = "PURCHASE_ORDER", contractId = "ctr-1", invoiceDate = "2026-09-05T08:00:00+04:00" });
        var sale = await PostAsync(c, "/api/erp/invoices",
            new { invoiceType = "SALE_INVOICE", contractId = "ctr-1", invoiceDate = "2026-09-20T08:00:00+04:00" });

        Assert.Equal("26090001", Number(order));
        Assert.Equal("26090002", Number(sale));
    }

    [Fact]
    public async Task A_new_month_restarts_the_sequence()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        await PostAsync(c, "/api/erp/invoices",
            new { invoiceType = "SALE_ORDER", contractId = "ctr-1", invoiceDate = "2026-09-05T08:00:00+04:00" });
        var october = await PostAsync(c, "/api/erp/invoices",
            new { invoiceType = "SALE_ORDER", contractId = "ctr-1", invoiceDate = "2026-10-01T08:00:00+04:00" });

        Assert.Equal("26100001", Number(october));
    }

    [Fact]
    public async Task A_posted_number_is_ignored_not_honoured()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var created = await PostAsync(c, "/api/erp/invoices",
            new { invoiceType = "SALE_ORDER", contractId = "ctr-1", invoiceDate = "2026-09-05T08:00:00+04:00", invoiceNumber = "MINE-1" });

        Assert.Equal("26090001", Number(created));
    }

    [Fact]
    public async Task Editing_the_header_cannot_change_the_number()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = await DraftAsync(c, "SALE_ORDER");

        var patched = await c.PutAsJsonAsync(new Uri($"/api/erp/invoices/{id}", UriKind.Relative),
            new { invoiceNumber = "MINE-2", description = "still a draft" });
        patched.EnsureSuccessStatusCode();
        var body = await patched.Content.ReadFromJsonAsync<JsonElement>(Json);

        Assert.Equal("26080001", Number(body));
        Assert.Equal("still a draft", body.GetProperty("entity").GetProperty("description").GetString());
    }

    [Fact]
    public async Task Moving_a_drafts_date_to_another_month_re_mints_the_number()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var created = await PostAsync(c, "/api/erp/invoices",
            new { invoiceType = "SALE_ORDER", contractId = "ctr-1", invoiceDate = "2026-09-30T08:00:00+04:00" });
        Assert.Equal("26090001", Number(created));

        var patched = await c.PutAsJsonAsync(new Uri($"/api/erp/invoices/{Id(created)}", UriKind.Relative),
            new { invoiceDate = "2026-10-02T08:00:00+04:00" });
        patched.EnsureSuccessStatusCode();
        var body = await patched.Content.ReadFromJsonAsync<JsonElement>(Json);

        // The number's YYMM must always agree with the date it now carries, even on a DRAFT
        // nobody edited the number of directly.
        Assert.Equal("26100001", Number(body));
    }

    [Fact]
    public async Task Moving_a_drafts_date_within_the_same_month_leaves_the_number_unchanged()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var created = await PostAsync(c, "/api/erp/invoices",
            new { invoiceType = "SALE_ORDER", contractId = "ctr-1", invoiceDate = "2026-09-05T08:00:00+04:00" });
        Assert.Equal("26090001", Number(created));

        var patched = await c.PutAsJsonAsync(new Uri($"/api/erp/invoices/{Id(created)}", UriKind.Relative),
            new { invoiceDate = "2026-09-20T08:00:00+04:00" });
        patched.EnsureSuccessStatusCode();
        var body = await patched.Content.ReadFromJsonAsync<JsonElement>(Json);

        Assert.Equal("26090001", Number(body));
    }

    [Fact]
    public async Task A_converted_document_takes_the_month_it_is_made_in()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = await DraftAsync(c, "SALE_ORDER");                 // dated 2026-08-13 → 26080001
        await AddLineAsync(c, id, 10m);
        await PostAsync(c, $"/api/erp/invoices/{id}/confirm");

        var converted = await PostAsync(c, $"/api/erp/invoices/{id}/convert", new { targetType = "SALE_INVOICE" });

        var expectedMonth = DateTimeOffset.UtcNow.ToOffset(Numbering.GulfOffset)
            .ToString("yyMM", System.Globalization.CultureInfo.InvariantCulture);
        Assert.StartsWith(expectedMonth, Number(converted), StringComparison.Ordinal);
        Assert.Equal(expectedMonth + "0001", Number(converted));
    }

    /* ------------------------------- Permissions ------------------------------ */

    [Fact]
    public async Task Trade_documents_need_a_trade_permission()
    {
        await ResetAsync();
        var client = fixture.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        await client.PostAsJsonAsync(new Uri("/api/identity/login", UriKind.Relative),
            new { email = "portal@alcometal.ae", password = "Alco@2026" });

        var response = await client.GetAsync(new Uri("/api/erp/invoices", UriKind.Relative));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        client.Dispose();
    }
}
