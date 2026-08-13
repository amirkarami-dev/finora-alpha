using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Finora.IntegrationTests;

/// <summary>
/// Payments, over real HTTP.
///
/// <para>
/// The first of these do not test an endpoint — there is no payment endpoint yet. They test what
/// the snapshot round-trip does to a payment, because that is the only way a payment currently
/// reaches the database, and what it does to one is lose it.
/// </para>
/// </summary>
[Collection(nameof(ApiCollection))]
public sealed class PaymentTests(ApiFixture fixture)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private static async Task<HttpClient> AsManagerAsync(ApiFixture fixture)
    {
        var client = fixture.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        (await client.PostAsJsonAsync(new Uri("/api/identity/login", UriKind.Relative),
            new { email = "amir@finora.app", password = "demo1234" })).EnsureSuccessStatusCode();
        return client;
    }

    /// <summary>
    /// A snapshot holding one customer and one payment written EXACTLY as the browser writes a
    /// single-shot payment: no `status`, no `type`, no `items` keys at all.
    ///
    /// <para>Raw JSON rather than the typed <c>ErpSnapshot</c>, because a C# object cannot omit a
    /// property — and the absence of the key is the whole point.</para>
    /// </summary>
    private const string LegacyPaymentSnapshot = """
    {
      "customers": [{ "id": "cust-am", "name": "Alco Metal Trading", "code": "AM", "active": true }],
      "contracts": [], "containers": [], "invoices": [], "goods": [], "partners": [],
      "warehouses": [], "inventoryDocs": [], "costCentres": [], "chargeCategories": [],
      "chargeDocs": [], "claims": [], "financialAccounts": [], "moneyTransfers": [],
      "exchangeGainLosses": [], "cheques": [],
      "payments": [
        {
          "id": "NIZ001",
          "customerId": "cust-am",
          "date": "2026-06-01T00:00:00Z",
          "currency": "USD",
          "amount": 25000,
          "fxRate": 1,
          "amountUSD": 25000,
          "method": "TT",
          "reference": "PI-2026-0001",
          "direction": "OUT",
          "notes": ""
        }
      ],
      "fxRate": 3.6725
    }
    """;

    private static async Task<JsonElement> RoundTripAsync(HttpClient client, string snapshotJson)
    {
        var put = await client.PutAsync(
            new Uri("/api/erp/snapshot", UriKind.Relative),
            new StringContent(snapshotJson, Encoding.UTF8, "application/json"));
        put.EnsureSuccessStatusCode();

        return await client.GetFromJsonAsync<JsonElement>(
            new Uri("/api/erp/snapshot", UriKind.Relative), Json);
    }

    [Fact]
    public async Task A_payment_that_names_no_status_comes_back_settled()
    {
        using var client = await AsManagerAsync(fixture);

        var snapshot = await RoundTripAsync(client, LegacyPaymentSnapshot);
        var payment = snapshot.GetProperty("payments")[0];

        // `api.ts` reads a missing status as CONFIRMED, and says why: "treating that as anything
        // but CONFIRMED would silently erase real money from every balance in the app."
        //
        // DRAFT is the zero value of the enum AND the property's initializer, so a key the
        // browser never wrote lands there twice over. The row survives the round-trip; the money
        // does not — a DRAFT payment is skipped by `isSettled`, so it leaves the customer's
        // balance, the ageing buckets, the account movement report and the portal.
        Assert.Equal("CONFIRMED", payment.GetProperty("status").GetString());
    }

    [Fact]
    public async Task A_payment_with_no_invoice_and_no_type_is_money_on_account()
    {
        using var client = await AsManagerAsync(fixture);

        var snapshot = await RoundTripAsync(client, LegacyPaymentSnapshot);
        var payment = snapshot.GetProperty("payments")[0];

        // `p.type ?? (p.invoiceId ? 'INVOICE' : 'GENERAL')` — derived from whether a document is
        // named, not fixed. Defaulted to INVOICE, this payment demands an invoice on every line
        // it ever gets (`invoice-required`) when the spec says it must refuse one
        // (`invoice-not-allowed`). The branch flips entirely.
        Assert.Equal("GENERAL", payment.GetProperty("type").GetString());
    }

    [Fact]
    public async Task A_payment_that_names_an_invoice_and_no_type_settles_that_invoice()
    {
        using var client = await AsManagerAsync(fixture);

        var withInvoice = LegacyPaymentSnapshot.Replace(
            "\"direction\": \"OUT\"",
            "\"invoiceId\": \"inv-pi-0001\", \"direction\": \"OUT\"",
            StringComparison.Ordinal);

        var snapshot = await RoundTripAsync(client, withInvoice);
        var payment = snapshot.GetProperty("payments")[0];

        Assert.Equal("INVOICE", payment.GetProperty("type").GetString());
    }
}
