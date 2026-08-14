using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Finora.Erp.Infrastructure.Snapshot;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Finora.IntegrationTests;

/// <summary>Exchange gains and losses over real HTTP.</summary>
[Collection(nameof(ApiCollection))]
public sealed class ExchangeGainLossTests(ApiFixture fixture)
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

    private async Task ResetAsync()
    {
        using var scope = fixture.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<SnapshotService>().ReplaceAsync(new ErpSnapshot());
    }

    private static async Task<JsonElement> PostAsync(HttpClient c, string url, object body)
    {
        var r = await c.PostAsJsonAsync(new Uri(url, UriKind.Relative), body);
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<JsonElement>(Json);
    }

    private static async Task<JsonElement> ProblemAsync(HttpResponseMessage r) =>
        await r.Content.ReadFromJsonAsync<JsonElement>(Json);

    [Fact]
    public async Task The_sign_of_the_amount_decides_whether_it_is_a_gain_or_a_loss()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var gain = (await PostAsync(c, "/api/erp/exchange-gain-losses",
            new { date = Date, amount = 250.75m })).GetProperty("entity");
        Assert.Equal("GAIN", gain.GetProperty("type").GetString());

        var loss = (await PostAsync(c, "/api/erp/exchange-gain-losses",
            new { date = Date, amount = -100m })).GetProperty("entity");
        Assert.Equal("LOSS", loss.GetProperty("type").GetString());
    }

    [Fact]
    public async Task Editing_across_zero_flips_the_kind_with_it()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var created = (await PostAsync(c, "/api/erp/exchange-gain-losses",
            new { date = Date, amount = 250m })).GetProperty("entity");
        var id = created.GetProperty("id").GetString();

        var edited = await c.PutAsJsonAsync(
            new Uri($"/api/erp/exchange-gain-losses/{id}", UriKind.Relative),
            new { date = Date, amount = -250m });
        edited.EnsureSuccessStatusCode();

        // Derived on every write rather than stored once, so a record can never say GAIN while
        // holding a negative number.
        Assert.Equal("LOSS", (await edited.Content.ReadFromJsonAsync<JsonElement>(Json))
            .GetProperty("entity").GetProperty("type").GetString());
    }

    [Fact]
    public async Task Zero_is_not_a_record()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var response = await c.PostAsJsonAsync(
            new Uri("/api/erp/exchange-gain-losses", UriKind.Relative),
            new { date = Date, amount = 0m });

        // A gain of nothing is a blank row, not a note about currency.
        Assert.Equal("invalid-amount", (await ProblemAsync(response)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task The_human_number_follows_the_id()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var first = (await PostAsync(c, "/api/erp/exchange-gain-losses",
            new { date = Date, amount = 10m })).GetProperty("entity");
        var second = (await PostAsync(c, "/api/erp/exchange-gain-losses",
            new { date = Date, amount = 20m })).GetProperty("entity");

        Assert.Equal("egl-0001", first.GetProperty("id").GetString());
        Assert.Equal("EGL-0001", first.GetProperty("number").GetString());
        Assert.Equal("EGL-0002", second.GetProperty("number").GetString());
    }

    [Fact]
    public async Task Deleting_really_deletes()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var id = (await PostAsync(c, "/api/erp/exchange-gain-losses",
            new { date = Date, amount = 10m })).GetProperty("entity").GetProperty("id").GetString();

        var deleted = await c.DeleteAsync(
            new Uri($"/api/erp/exchange-gain-losses/{id}", UriKind.Relative));
        deleted.EnsureSuccessStatusCode();

        // The only real delete in the module: nothing points at one of these, so a cancelled row
        // would be clutter with no integrity argument behind it.
        Assert.Equal(0, (await deleted.Content.ReadFromJsonAsync<JsonElement>(Json)).GetArrayLength());

        var again = await c.DeleteAsync(
            new Uri($"/api/erp/exchange-gain-losses/{id}", UriKind.Relative));
        Assert.Equal("gain-loss-not-found", (await ProblemAsync(again)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Gains_and_losses_need_the_exchange_permission()
    {
        await ResetAsync();
        var client = fixture.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        await client.PostAsJsonAsync(new Uri("/api/identity/login", UriKind.Relative),
            new { email = "staff@finora.app", password = "Staff@2026" });

        var response = await client.GetAsync(new Uri("/api/erp/exchange-gain-losses", UriKind.Relative));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        client.Dispose();
    }
}
