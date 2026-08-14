using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Finora.Erp.Domain;
using Finora.Erp.Infrastructure.Snapshot;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Finora.IntegrationTests;

/// <summary>Transfers between the company's own accounts, over real HTTP.</summary>
[Collection(nameof(ApiCollection))]
public sealed class MoneyTransferTests(ApiFixture fixture)
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

    /// <summary>Two dollar accounts, one dirham account, and one that is switched off.</summary>
    private async Task ResetAsync()
    {
        using var scope = fixture.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<SnapshotService>().ReplaceAsync(new ErpSnapshot
        {
            Customers = [new Customer { Id = "cust-am", Name = "Alco Metal Trading", Code = "AM" }],
            FinancialAccounts =
            [
                Bank("acc-usd", "ENBD USD", Currency.USD),
                Bank("acc-usd2", "Mashreq USD", Currency.USD),
                Bank("acc-aed", "ENBD AED", Currency.AED),
                Bank("acc-off", "Closed", Currency.USD, active: false),
            ],
        });
    }

    private static FinancialAccount Bank(string id, string name, Currency currency, bool active = true) => new()
    {
        Id = id, Name = name, Type = FinancialAccountType.BANK, Currency = currency,
        AccountNumber = "0123456789", Iban = "AE070331234567890123456", Active = active,
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

    private static object Input(
        string from = "acc-usd", string to = "acc-usd2", decimal amount = 1000m,
        decimal rate = 1m, object[]? allocations = null) => new
        {
            date = Date, fromAccountId = from, toAccountId = to,
            fromAmount = amount, exchangeRate = rate, allocations,
        };

    /* ------------------------------- The valuation ----------------------------- */

    [Fact]
    public async Task Money_landing_in_dollars_is_valued_by_what_it_landed_as()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        // AED 3,672.50 out, at 0.2723 dollars per dirham, landing as USD 1,000.
        var transfer = (await PostAsync(c, "/api/erp/transfers",
            Input(from: "acc-aed", to: "acc-usd", amount: 3672.50m, rate: 0.2723m))).GetProperty("entity");

        Assert.Equal(1000.02m, transfer.GetProperty("toAmount").GetDecimal());

        // The destination states the value exactly, so that is what is booked. The old fallback
        // fed the transfer's own rate — destination units per source unit — into a conversion
        // expecting foreign units per dollar, and valued this at over thirteen thousand.
        Assert.Equal(1000.02m, transfer.GetProperty("baseAmount").GetDecimal());
    }

    [Fact]
    public async Task Money_leaving_a_dollar_account_is_worth_what_left()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var transfer = (await PostAsync(c, "/api/erp/transfers",
            Input(from: "acc-usd", to: "acc-aed", amount: 1000m, rate: 3.6725m))).GetProperty("entity");

        Assert.Equal(3672.50m, transfer.GetProperty("toAmount").GetDecimal());
        Assert.Equal(1000m, transfer.GetProperty("baseAmount").GetDecimal());
    }

    [Fact]
    public async Task A_dirham_account_is_valued_at_what_its_holdings_cost()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        // Fund the dirham account: USD 1,000 in, becoming AED 4,000. Its money is now worth
        // 4 dirhams to the dollar, whatever any market says.
        var funding = Id(await PostAsync(c, "/api/erp/transfers",
            Input(from: "acc-usd", to: "acc-aed", amount: 1000m, rate: 4m)));
        await PostAsync(c, $"/api/erp/transfers/{funding}/status", new { status = "CONFIRMED" });

        // Now move dirhams to another dirham-ish destination — neither side is USD, so the value
        // comes from the source account's own book rate.
        using (var scope = fixture.Services.CreateScope())
        {
            var context = scope.ServiceProvider.GetRequiredService<Finora.Erp.Infrastructure.ErpDbContext>();
            context.FinancialAccounts.Add(Bank("acc-aed2", "Second AED", Currency.AED));
            await context.SaveChangesAsync();
        }

        var transfer = (await PostAsync(c, "/api/erp/transfers",
            Input(from: "acc-aed", to: "acc-aed2", amount: 2000m, rate: 1m))).GetProperty("entity");

        // 2,000 dirhams at the 4-per-dollar the account actually paid = USD 500.
        Assert.Equal(500m, transfer.GetProperty("baseAmount").GetDecimal());
    }

    [Fact]
    public async Task Only_confirmed_transfers_count_towards_what_an_account_is_worth()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        // Same funding, left as a DRAFT this time.
        await PostAsync(c, "/api/erp/transfers", Input(from: "acc-usd", to: "acc-aed", amount: 1000m, rate: 4m));

        using (var scope = fixture.Services.CreateScope())
        {
            var context = scope.ServiceProvider.GetRequiredService<Finora.Erp.Infrastructure.ErpDbContext>();
            context.FinancialAccounts.Add(Bank("acc-aed3", "Third AED", Currency.AED));
            await context.SaveChangesAsync();
        }

        var transfer = (await PostAsync(c, "/api/erp/transfers",
            Input(from: "acc-aed", to: "acc-aed3", amount: 2000m, rate: 1m))).GetProperty("entity");

        // Nothing confirmed has gone in, so there is no rate to average and the fallback is one
        // for one. Wrong by a knowable amount, rather than by the wildly wrong one the old
        // fallback produced.
        Assert.Equal(2000m, transfer.GetProperty("baseAmount").GetDecimal());
    }

    /* --------------------------------- The guards ------------------------------ */

    [Fact]
    public async Task The_same_currency_can_only_move_one_for_one()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var response = await c.PostAsJsonAsync(new Uri("/api/erp/transfers", UriKind.Relative),
            Input(from: "acc-usd", to: "acc-usd2", rate: 1.05m));

        // A rate between two accounts holding the same currency would create money inside the
        // company.
        Assert.Equal("same-currency-rate", (await ProblemAsync(response)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task An_account_cannot_pay_itself_and_a_closed_one_cannot_be_used()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var itself = await c.PostAsJsonAsync(new Uri("/api/erp/transfers", UriKind.Relative),
            Input(from: "acc-usd", to: "acc-usd"));
        Assert.Equal("same-account", (await ProblemAsync(itself)).GetProperty("code").GetString());

        var closed = await c.PostAsJsonAsync(new Uri("/api/erp/transfers", UriKind.Relative),
            Input(to: "acc-off"));
        Assert.Equal("account-inactive", (await ProblemAsync(closed)).GetProperty("code").GetString());
    }

    /* ------------------------------- Allocations ------------------------------- */

    [Fact]
    public async Task Allocations_may_cover_only_part_of_a_transfer()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        // Deliberately no "must add up" rule — the unallocated remainder stays valid, because a
        // transfer is not a settlement and does not have to be spoken for.
        var transfer = (await PostAsync(c, "/api/erp/transfers",
            Input(amount: 1000m, allocations: [new { amount = 300m }]))).GetProperty("entity");

        Assert.Equal(1, transfer.GetProperty("allocations").GetArrayLength());
        Assert.Equal(1000m, transfer.GetProperty("fromAmount").GetDecimal());
    }

    [Fact]
    public async Task Allocations_may_not_exceed_the_transfer()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var response = await c.PostAsJsonAsync(new Uri("/api/erp/transfers", UriKind.Relative),
            Input(amount: 1000m, allocations: [new { amount = 600m }, new { amount = 600m }]));

        Assert.Equal("over-allocated", (await ProblemAsync(response)).GetProperty("code").GetString());
    }

    /* -------------------------------- Lifecycle -------------------------------- */

    [Fact]
    public async Task Only_a_draft_may_be_edited()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = Id(await PostAsync(c, "/api/erp/transfers", Input()));

        var edit = await c.PutAsJsonAsync(new Uri($"/api/erp/transfers/{id}", UriKind.Relative),
            Input(amount: 2000m));
        edit.EnsureSuccessStatusCode();

        await PostAsync(c, $"/api/erp/transfers/{id}/status", new { status = "CONFIRMED" });

        var after = await c.PutAsJsonAsync(new Uri($"/api/erp/transfers/{id}", UriKind.Relative),
            Input(amount: 3000m));
        Assert.Equal("transfer-not-draft", (await ProblemAsync(after)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task A_cancelled_transfer_cannot_come_back()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = Id(await PostAsync(c, "/api/erp/transfers", Input()));

        await PostAsync(c, $"/api/erp/transfers/{id}/status", new { status = "CANCELLED" });

        var response = await c.PostAsJsonAsync(
            new Uri($"/api/erp/transfers/{id}/status", UriKind.Relative), new { status = "CONFIRMED" });
        Assert.Equal("transfer-cancelled", (await ProblemAsync(response)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task A_transfer_keeps_its_number_when_it_is_edited()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var created = (await PostAsync(c, "/api/erp/transfers", Input())).GetProperty("entity");
        var number = created.GetProperty("number").GetString();
        var id = created.GetProperty("id").GetString();

        var edited = await c.PutAsJsonAsync(new Uri($"/api/erp/transfers/{id}", UriKind.Relative),
            Input(amount: 5000m));
        edited.EnsureSuccessStatusCode();

        Assert.Equal(number, (await edited.Content.ReadFromJsonAsync<JsonElement>(Json))
            .GetProperty("entity").GetProperty("number").GetString());
    }

    [Fact]
    public async Task Transfers_need_the_transfers_permission()
    {
        await ResetAsync();
        var client = fixture.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        await client.PostAsJsonAsync(new Uri("/api/identity/login", UriKind.Relative),
            new { email = "staff@finora.app", password = "Staff@2026" });

        var response = await client.GetAsync(new Uri("/api/erp/transfers", UriKind.Relative));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        client.Dispose();
    }
}
