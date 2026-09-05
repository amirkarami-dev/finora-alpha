using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Finora.Erp.Domain;
using Finora.Erp.Infrastructure.Snapshot;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Finora.IntegrationTests;

/// <summary>
/// Contracts, over real HTTP.
///
/// <para>
/// The first trade documents that persist. Until now a contract entered on one machine lived in
/// that browser alone; these tests are what say it does not any more.
/// </para>
/// </summary>
[Collection(nameof(ApiCollection))]
public sealed class ContractTests(ApiFixture fixture)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private static async Task<HttpClient> AsManagerAsync(ApiFixture fixture)
    {
        var client = fixture.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        var response = await client.PostAsJsonAsync(
            new Uri("/api/identity/login", UriKind.Relative),
            new { email = "amir@finora.app", password = "demo1234" });
        response.EnsureSuccessStatusCode();
        return client;
    }

    /// <summary>One customer and one partner, and nothing else — contract ids embed the
    /// customer's code, so the fixture has to pin it.</summary>
    private async Task ResetAsync()
    {
        using var scope = fixture.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<SnapshotService>().ReplaceAsync(new ErpSnapshot
        {
            Customers = [new Customer { Id = "cust-am", Name = "Alco Metal Trading", Code = "AM" }],
            Partners = [new Partner { Id = "ptnr-cc", Name = "Crescent Capital", Code = "CC" }],
        });
    }

    private static object Header(string status = "ACTIVE", string? type = "SELL", string? notes = null) =>
        new
        {
            customerId = "cust-am",
            date = "2026-11-15T00:00:00Z",
            destination = "NINGBO",
            status,
            notes,
            contractType = type,
        };

    private static object Line(decimal quantity = 55m, object[]? partners = null) =>
        new
        {
            product = "98% Copper Ingots",
            quantityMt = quantity,
            lmePercent = 94.76m,
            lmeFixed = true,
            fixedLmePrice = 11685m,
            premium = 0m,
            incoterm = "CNF",
            status = "ACTIVE",
            notes = (string?)null,
            partners,
        };

    private static async Task<JsonElement> PostAsync(HttpClient client, string url, object body)
    {
        var response = await client.PostAsJsonAsync(new Uri(url, UriKind.Relative), body);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>(Json);
    }

    /* ------------------------------- Creating --------------------------------- */

    [Fact]
    public async Task A_contract_is_saved_and_its_id_reads_like_the_ones_people_quote()
    {
        await ResetAsync();
        using var client = await AsManagerAsync(fixture);

        var result = await PostAsync(client, "/api/erp/contracts", Header());
        var contract = result.GetProperty("entity");

        // {CODE}-P-{yyMMdd}{nnn} — the shape the sample data ships and the desk reads aloud.
        Assert.Equal("AM-P-261115100", contract.GetProperty("id").GetString());
        Assert.Equal("cust-am", contract.GetProperty("customerId").GetString());
        Assert.Equal("SELL", contract.GetProperty("contractType").GetString());
        Assert.Equal(1, result.GetProperty("all").GetArrayLength());
    }

    [Fact]
    public async Task A_second_contract_the_same_day_takes_the_next_free_suffix()
    {
        await ResetAsync();
        using var client = await AsManagerAsync(fixture);

        var first = await PostAsync(client, "/api/erp/contracts", Header());
        var second = await PostAsync(client, "/api/erp/contracts", Header());

        Assert.Equal("AM-P-261115100", first.GetProperty("entity").GetProperty("id").GetString());
        Assert.Equal("AM-P-261115101", second.GetProperty("entity").GetProperty("id").GetString());
    }

    [Fact]
    public async Task A_contract_for_a_person_who_does_not_exist_is_refused()
    {
        await ResetAsync();
        using var client = await AsManagerAsync(fixture);

        var response = await client.PostAsJsonAsync(
            new Uri("/api/erp/contracts", UriKind.Relative),
            new { customerId = "cust-nobody", date = "2026-11-15T00:00:00Z", destination = "X", status = "ACTIVE" });

        // The browser fell back to a placeholder code and minted an id anyway.
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(Json);
        Assert.Equal("person-not-found", problem.GetProperty("code").GetString());
    }

    [Fact]
    public async Task An_unknown_status_is_refused_rather_than_stored()
    {
        await ResetAsync();
        using var client = await AsManagerAsync(fixture);

        var response = await client.PostAsJsonAsync(
            new Uri("/api/erp/contracts", UriKind.Relative), Header(status: "ALMOST_DONE"));

        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(Json);
        Assert.Equal("invalid-status", problem.GetProperty("code").GetString());
        Assert.Equal("ALMOST_DONE", problem.GetProperty("value").GetString());
    }

    /* --------------------------------- Lines ---------------------------------- */

    [Fact]
    public async Task A_goods_line_starts_with_all_of_itself_remaining()
    {
        await ResetAsync();
        using var client = await AsManagerAsync(fixture);
        var id = (await PostAsync(client, "/api/erp/contracts", Header()))
            .GetProperty("entity").GetProperty("id").GetString();

        var result = await PostAsync(client, $"/api/erp/contracts/{id}/items", Line(quantity: 55m));
        var item = result.GetProperty("entity").GetProperty("items")[0];

        Assert.Equal($"{id}-I1", item.GetProperty("id").GetString());
        Assert.Equal(55m, item.GetProperty("quantityMt").GetDecimal());
        // Nothing has shipped, so nothing is consumed.
        Assert.Equal(55m, item.GetProperty("remainingMt").GetDecimal());
        Assert.Equal(11685m, item.GetProperty("fixedLmePrice").GetDecimal());
    }

    [Fact]
    public async Task Line_numbers_continue_rather_than_repeat()
    {
        await ResetAsync();
        using var client = await AsManagerAsync(fixture);
        var id = (await PostAsync(client, "/api/erp/contracts", Header()))
            .GetProperty("entity").GetProperty("id").GetString();

        await PostAsync(client, $"/api/erp/contracts/{id}/items", Line());
        var second = await PostAsync(client, $"/api/erp/contracts/{id}/items", Line());

        var ids = second.GetProperty("entity").GetProperty("items")
            .EnumerateArray().Select(i => i.GetProperty("id").GetString() ?? string.Empty).Order().ToList();
        Assert.Equal([$"{id}-I1", $"{id}-I2"], ids);
    }

    [Fact]
    public async Task Cost_share_partners_round_trip_and_are_replaced_wholesale_on_edit()
    {
        await ResetAsync();
        using var client = await AsManagerAsync(fixture);
        var id = (await PostAsync(client, "/api/erp/contracts", Header()))
            .GetProperty("entity").GetProperty("id").GetString();

        var created = await PostAsync(client, $"/api/erp/contracts/{id}/items",
            Line(partners: [new { partnerId = "ptnr-cc", percent = 40m }]));
        var itemId = created.GetProperty("entity").GetProperty("items")[0].GetProperty("id").GetString();
        Assert.Equal(40m, created.GetProperty("entity").GetProperty("items")[0]
            .GetProperty("partners")[0].GetProperty("percent").GetDecimal());

        // An edit that sends no partners clears them — the list is the whole truth, not a patch.
        var updated = await client.PutAsJsonAsync(
            new Uri($"/api/erp/contracts/{id}/items/{itemId}", UriKind.Relative), Line());
        updated.EnsureSuccessStatusCode();

        var after = await updated.Content.ReadFromJsonAsync<JsonElement>(Json);
        Assert.Equal(0, after.GetProperty("entity").GetProperty("items")[0]
            .GetProperty("partners").GetArrayLength());
    }

    [Fact]
    public async Task A_share_promised_to_a_partner_who_does_not_exist_is_refused()
    {
        await ResetAsync();
        using var client = await AsManagerAsync(fixture);
        var id = (await PostAsync(client, "/api/erp/contracts", Header()))
            .GetProperty("entity").GetProperty("id").GetString();

        var response = await client.PostAsJsonAsync(
            new Uri($"/api/erp/contracts/{id}/items", UriKind.Relative),
            Line(partners: [new { partnerId = "ptnr-ghost", percent = 40m }]));

        // Without this the foreign key refuses it as a 500, which no form can show against a field.
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(Json);
        Assert.Equal("partner-not-found", problem.GetProperty("code").GetString());
    }

    /* -------------------------------- Editing --------------------------------- */

    [Fact]
    public async Task The_direction_and_the_customer_survive_an_edit_that_tries_to_change_them()
    {
        await ResetAsync();
        using var client = await AsManagerAsync(fixture);
        var id = (await PostAsync(client, "/api/erp/contracts", Header(type: "PURCHASE")))
            .GetProperty("entity").GetProperty("id").GetString();

        using var scope = fixture.Services.CreateScope();
        var response = await client.PutAsJsonAsync(
            new Uri($"/api/erp/contracts/{id}", UriKind.Relative),
            new
            {
                customerId = "cust-nobody",     // would orphan every invoice raised against it
                date = "2026-12-01T00:00:00Z",
                destination = "DUBAI",
                status = "CLOSED",
                notes = "moved",
                contractType = "SELL",          // would reverse which way the money runs
            });
        response.EnsureSuccessStatusCode();

        var contract = (await response.Content.ReadFromJsonAsync<JsonElement>(Json)).GetProperty("entity");
        Assert.Equal("PURCHASE", contract.GetProperty("contractType").GetString());
        Assert.Equal("cust-am", contract.GetProperty("customerId").GetString());
        // Everything genuinely editable did change.
        Assert.Equal("DUBAI", contract.GetProperty("destination").GetString());
        Assert.Equal("CLOSED", contract.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Editing_a_line_that_is_not_there_is_a_404()
    {
        await ResetAsync();
        using var client = await AsManagerAsync(fixture);
        var id = (await PostAsync(client, "/api/erp/contracts", Header()))
            .GetProperty("entity").GetProperty("id").GetString();

        var response = await client.PutAsJsonAsync(
            new Uri($"/api/erp/contracts/{id}/items/{id}-I9", UriKind.Relative), Line());

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(Json);
        Assert.Equal("contract-item-not-found", problem.GetProperty("code").GetString());
    }

    /* ------------------------------ Persistence ------------------------------- */

    [Fact]
    public async Task A_contract_written_here_comes_back_in_the_snapshot_everyone_loads()
    {
        await ResetAsync();
        using var client = await AsManagerAsync(fixture);

        var id = (await PostAsync(client, "/api/erp/contracts", Header()))
            .GetProperty("entity").GetProperty("id").GetString();
        await PostAsync(client, $"/api/erp/contracts/{id}/items",
            Line(partners: [new { partnerId = "ptnr-cc", percent = 40m }]));

        // This is the whole point: another device hydrates from here and sees the same contract.
        var snapshot = await client.GetFromJsonAsync<JsonElement>(
            new Uri("/api/erp/snapshot", UriKind.Relative), Json);

        var contract = snapshot.GetProperty("contracts")[0];
        Assert.Equal(id, contract.GetProperty("id").GetString());
        Assert.Equal(1, contract.GetProperty("items").GetArrayLength());
        Assert.Equal("ptnr-cc", contract.GetProperty("items")[0]
            .GetProperty("partners")[0].GetProperty("partnerId").GetString());
    }

    [Fact]
    public async Task Contracts_need_the_contracts_permission()
    {
        await ResetAsync();
        var client = fixture.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        await client.PostAsJsonAsync(new Uri("/api/identity/login", UriKind.Relative),
            new { email = "portal@alcometal.ae", password = "Alco@2026" });

        var response = await client.PostAsJsonAsync(new Uri("/api/erp/contracts", UriKind.Relative), Header());

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        client.Dispose();
    }

    [Fact]
    public async Task A_quantity_change_travels_inside_its_goods_line()
    {
        // Written straight into the store, the way the snapshot replace path does, then read
        // back over the contract list: the rows are children of the goods line, so they must
        // come out wherever the goods line comes out.
        using (var scope = fixture.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<SnapshotService>().ReplaceAsync(new ErpSnapshot
            {
                Customers = [new Customer { Id = "cust-am", Name = "Alco Metal Trading", Code = "AM" }],
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
                                QuantityMt = 120m, RemainingMt = 120m,
                                Changes =
                                [
                                    new ContractItemChange
                                    {
                                        Id = "chg-1", At = DateTimeOffset.Parse("2026-09-05T08:00:00Z", System.Globalization.CultureInfo.InvariantCulture),
                                        UserId = Guid.Parse("11111111-1111-1111-1111-111111111111"),
                                        UserName = "Amir Karami", DeltaMt = 20m, BeforeMt = 100m, AfterMt = 120m,
                                        Note = "Client asked for two more trucks",
                                    },
                                ],
                            },
                        ],
                    },
                ],
            });
        }

        using var client = await AsManagerAsync(fixture);
        var contracts = await client.GetFromJsonAsync<JsonElement>(new Uri("/api/erp/contracts", UriKind.Relative), Json);
        var change = contracts.EnumerateArray().Single().GetProperty("items")[0].GetProperty("changes")[0];

        Assert.Equal(20m, change.GetProperty("deltaMt").GetDecimal());
        Assert.Equal(100m, change.GetProperty("beforeMt").GetDecimal());
        Assert.Equal(120m, change.GetProperty("afterMt").GetDecimal());
        Assert.Equal("Amir Karami", change.GetProperty("userName").GetString());
        Assert.Equal("Client asked for two more trucks", change.GetProperty("note").GetString());

        var snapshot = await client.GetFromJsonAsync<JsonElement>(new Uri("/api/erp/snapshot", UriKind.Relative), Json);
        Assert.Equal(1, snapshot.GetProperty("contracts")[0].GetProperty("items")[0].GetProperty("changes").GetArrayLength());
    }
}
