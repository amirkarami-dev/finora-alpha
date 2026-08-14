using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Finora.IntegrationTests;

/// <summary>
/// The snapshot endpoints over real HTTP, driven with the JSON the SPA actually sends.
///
/// <para>
/// <see cref="SnapshotRoundTripTests"/> calls the service directly and so never exercises model
/// binding — which is where the interesting failures live. The client nests a partner inside its
/// goods line and a good inside its container, and therefore omits the parent key from both:
/// it is implied by where the object sits. A <c>required</c> parent key on either entity makes
/// System.Text.Json reject the entire 230 KB body, and the app reports one opaque 500 with no
/// hint that two small objects out of thousands were the cause.
/// </para>
/// </summary>
[Collection(nameof(ApiCollection))]
public sealed class SnapshotEndpointTests(ApiFixture fixture)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>
    /// Copied field-for-field from what <c>buildSampleData()</c> emits, trimmed to the two
    /// aggregates that carry implicit parent keys. Hand-simplifying it would defeat the point:
    /// the test only means something if the keys are exactly the client's.
    /// </summary>
    private const string ClientSnapshot = """
    {
      "customers": [
        { "id": "cust-am", "name": "Alco Metal Trading", "code": "AM", "defaultCurrency": "AED",
          "contactName": "Khalid Nasser", "email": "am@alcometaltrading.com", "country": "UAE",
          "paymentTermsDays": 7, "creditLimit": 2750000, "customerType": "BUYER",
          "active": true, "createdAt": "2025-04-17T04:16:03.184Z", "portalAccount": true }
      ],
      "partners": [
        { "id": "ptnr-cc", "name": "Crescent Capital Partners", "code": "CC", "active": true }
      ],
      "contracts": [
        { "id": "AM-P-251101156", "customerId": "cust-am", "contractType": "SELL",
          "date": "2026-01-14T04:16:03.184Z", "destination": "NINGBO", "status": "CLOSED",
          "items": [
            { "id": "AM-P-251101156-I1", "contractId": "AM-P-251101156",
              "product": "98% Copper Ingots", "quantityMt": 55, "lmePercent": 94.76,
              "lmeFixed": true, "fixedLmePrice": 11685, "premium": 0, "incoterm": "CNF",
              "status": "CLOSED", "remainingMt": 0,
              "partners": [{ "partnerId": "ptnr-cc", "percent": 40 }] }
          ] }
      ],
      "containers": [
        { "id": "cnt-AM-P-251101156-2", "reference": "DFSU7152890",
          "loadDate": "2026-02-09T04:16:03.184Z", "blNumber": "MSCU518327744",
          "goods": [{ "contractItemId": "AM-P-251101156-I1", "quantityMt": 27.5 }] }
      ],
      "invoices": [], "inventoryDocs": [], "payments": [], "warehouses": [], "costCentres": [],
      "chargeCategories": [], "chargeDocs": [], "claims": [], "goods": [],
      "financialAccounts": [], "cheques": [], "moneyTransfers": [], "exchangeGainLosses": [],
      "fxRate": 3.6725
    }
    """;

    private static async Task<HttpClient> SignedInAsync(ApiFixture fixture)
    {
        var client = fixture.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        var response = await client.PostAsJsonAsync(
            new Uri("/api/identity/login", UriKind.Relative),
            new { email = "amir@finora.app", password = "demo1234" });
        response.EnsureSuccessStatusCode();
        return client;
    }

    [Fact]
    public async Task The_clients_own_json_is_accepted_and_the_implied_parent_keys_are_filled()
    {
        using var client = await SignedInAsync(fixture);

        using var body = new StringContent(ClientSnapshot, Encoding.UTF8, "application/json");
        var put = await client.PutAsync(new Uri("/api/erp/snapshot", UriKind.Relative), body);

        Assert.Equal(HttpStatusCode.NoContent, put.StatusCode);

        var read = await client.GetFromJsonAsync<JsonElement>(
            new Uri("/api/erp/snapshot", UriKind.Relative), Json);

        // The keys the client never sent are the ones the database needs; EF sets them from the
        // graph on save, so they must come back populated rather than empty.
        var partner = read.GetProperty("contracts")[0].GetProperty("items")[0]
            .GetProperty("partners")[0];
        Assert.Equal("AM-P-251101156-I1", partner.GetProperty("contractItemId").GetString());
        Assert.Equal("ptnr-cc", partner.GetProperty("partnerId").GetString());

        var good = read.GetProperty("containers")[0].GetProperty("goods")[0];
        Assert.Equal("cnt-AM-P-251101156-2", good.GetProperty("containerId").GetString());
        Assert.Equal("AM-P-251101156-I1", good.GetProperty("contractItemId").GetString());
    }

    [Fact]
    public async Task A_snapshot_read_needs_a_session()
    {
        using var client = fixture.CreateClient();

        var response = await client.GetAsync(new Uri("/api/erp/snapshot", UriKind.Relative));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
