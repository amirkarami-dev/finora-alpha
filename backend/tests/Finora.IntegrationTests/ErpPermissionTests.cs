using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Finora.Erp.Domain;
using Finora.Erp.Infrastructure.Snapshot;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Finora.IntegrationTests;

/// <summary>
/// Who may call the ERP endpoints, and how much of the dataset each caller gets back.
///
/// <para>
/// Every route under <c>/api/erp</c> used to accept any signed-in cookie. The consequences were
/// not theoretical: a portal customer could rename a warehouse, and — worse, because it leaves no
/// trace — could read every contract, invoice and payment on the desk by asking for the snapshot
/// directly. The SPA filtered the portal view in the browser, which filters nothing; the data had
/// already been sent.
/// </para>
/// </summary>
[Collection(nameof(ApiCollection))]
public sealed class ErpPermissionTests(ApiFixture fixture)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private static async Task<HttpClient> SignedInAsync(ApiFixture fixture, string email, string password)
    {
        var client = fixture.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        var response = await client.PostAsJsonAsync(
            new Uri("/api/identity/login", UriKind.Relative), new { email, password });
        response.EnsureSuccessStatusCode();
        return client;
    }

    private static Task<HttpClient> AsManagerAsync(ApiFixture f) => SignedInAsync(f, "amir@finora.app", "demo1234");
    private static Task<HttpClient> AsStaffAsync(ApiFixture f) => SignedInAsync(f, "staff@finora.app", "Staff@2026");
    private static Task<HttpClient> AsCustomerAsync(ApiFixture f) => SignedInAsync(f, "portal@alcometal.ae", "Alco@2026");

    /* ------------------------------ Master data ------------------------------- */

    [Fact]
    public async Task A_portal_customer_cannot_touch_master_data()
    {
        using var client = await AsCustomerAsync(fixture);

        var response = await client.PostAsJsonAsync(
            new Uri("/api/erp/warehouses", UriKind.Relative),
            new { name = "Not mine", code = "NOPE" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Staff_may_edit_the_lists_it_holds_and_not_the_ones_it_does_not()
    {
        using var client = await AsStaffAsync(fixture);

        // Staff holds `warehouse` and `baseInfo` …
        var allowed = await client.PostAsJsonAsync(
            new Uri("/api/erp/warehouses", UriKind.Relative),
            new { name = "Jebel Ali", code = $"JA{Guid.NewGuid():N}"[..8] });
        Assert.Equal(HttpStatusCode.OK, allowed.StatusCode);

        // … but not `settings`, which is what the destructive snapshot write demands.
        var refused = await client.PutAsJsonAsync(
            new Uri("/api/erp/snapshot", UriKind.Relative), new ErpSnapshot());
        Assert.Equal(HttpStatusCode.Forbidden, refused.StatusCode);
    }

    [Fact]
    public async Task A_portal_customer_cannot_replace_the_dataset()
    {
        await SeedTwoCustomersAsync();
        using var client = await AsCustomerAsync(fixture);

        var response = await client.PutAsJsonAsync(
            new Uri("/api/erp/snapshot", UriKind.Relative), new ErpSnapshot());

        // This one is worth stating on its own rather than leaving it implied by the Staff case.
        // The portal's browser now holds a snapshot containing only its own customer, and the
        // SPA still pushes its whole store back after a local edit. If that push were ever
        // accepted, one customer opening the portal would erase every other customer from the
        // database — a scoped read and an unscoped write are a bad pair.
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);

        using var staff = await AsManagerAsync(fixture);
        var after = await staff.GetFromJsonAsync<JsonElement>(
            new Uri("/api/erp/snapshot", UriKind.Relative), Json);
        Assert.Equal(2, after.GetProperty("customers").GetArrayLength());
    }

    [Fact]
    public async Task An_anonymous_caller_is_refused_before_any_permission_is_considered()
    {
        using var client = fixture.CreateClient();

        var snapshot = await client.GetAsync(new Uri("/api/erp/snapshot", UriKind.Relative));
        var write = await client.PostAsJsonAsync(
            new Uri("/api/erp/goods", UriKind.Relative), new { name = "X", code = "X" });

        Assert.Equal(HttpStatusCode.Unauthorized, snapshot.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, write.StatusCode);
    }

    /* -------------------------- The scoped snapshot --------------------------- */

    [Fact]
    public async Task A_portal_customer_reads_only_their_own_affairs()
    {
        await SeedTwoCustomersAsync();

        using var staff = await AsManagerAsync(fixture);
        var everything = await staff.GetFromJsonAsync<JsonElement>(
            new Uri("/api/erp/snapshot", UriKind.Relative), Json);

        using var customer = await AsCustomerAsync(fixture);
        var mine = await customer.GetFromJsonAsync<JsonElement>(
            new Uri("/api/erp/snapshot", UriKind.Relative), Json);

        // The back office sees both customers; the portal sees itself.
        Assert.Equal(2, everything.GetProperty("customers").GetArrayLength());
        Assert.Equal(1, mine.GetProperty("customers").GetArrayLength());
        Assert.Equal("cust-portal", mine.GetProperty("customers")[0].GetProperty("id").GetString());

        // And the other customer's trade is simply not there.
        Assert.Equal(2, everything.GetProperty("contracts").GetArrayLength());
        var contracts = mine.GetProperty("contracts");
        Assert.Equal(1, contracts.GetArrayLength());
        Assert.Equal("cust-portal", contracts[0].GetProperty("customerId").GetString());

        Assert.Equal(1, mine.GetProperty("invoices").GetArrayLength());
        Assert.Equal("inv-portal", mine.GetProperty("invoices")[0].GetProperty("id").GetString());
    }

    [Fact]
    public async Task The_portal_snapshot_withholds_what_the_desk_earns_on_the_deal()
    {
        await SeedTwoCustomersAsync();

        using var customer = await AsCustomerAsync(fixture);
        var mine = await customer.GetFromJsonAsync<JsonElement>(
            new Uri("/api/erp/snapshot", UriKind.Relative), Json);

        // Cost-share partners would disclose who the company splits its margin with — on the
        // customer's OWN contract, which is exactly where it would be most sensitive.
        var item = mine.GetProperty("contracts")[0].GetProperty("items")[0];
        Assert.Equal(0, item.GetProperty("partners").GetArrayLength());

        // Internal money movements are absent entirely, not merely emptied of this customer's rows.
        foreach (var key in new[] { "chargeDocs", "claims", "cheques", "moneyTransfers", "exchangeGainLosses" })
        {
            Assert.Equal(0, mine.GetProperty(key).GetArrayLength());
        }

        // Master data the portal never renders is withheld too.
        foreach (var key in new[] { "goods", "warehouses", "costCentres", "partners", "financialAccounts" })
        {
            Assert.Equal(0, mine.GetProperty(key).GetArrayLength());
        }
    }

    [Fact]
    public async Task The_back_office_still_reads_everything()
    {
        await SeedTwoCustomersAsync();

        using var staff = await AsStaffAsync(fixture);
        var all = await staff.GetFromJsonAsync<JsonElement>(
            new Uri("/api/erp/snapshot", UriKind.Relative), Json);

        // Staff holds no `portal`, so nothing about this read is narrowed.
        Assert.Equal(2, all.GetProperty("customers").GetArrayLength());
        Assert.Equal(2, all.GetProperty("contracts").GetArrayLength());
        Assert.True(all.GetProperty("goods").GetArrayLength() > 0);
    }

    /// <summary>Two customers, one of which holds the portal account, each with a contract and an
    /// invoice — the smallest dataset in which "only mine" means anything.</summary>
    private async Task SeedTwoCustomersAsync()
    {
        using var scope = fixture.Services.CreateScope();
        var snapshots = scope.ServiceProvider.GetRequiredService<SnapshotService>();

        await snapshots.ReplaceAsync(new ErpSnapshot
        {
            Customers =
            [
                new Customer { Id = "cust-portal", Name = "Alco Metal Trading", Code = "AM", PortalAccount = true },
                new Customer { Id = "cust-other", Name = "Someone Else", Code = "SE" },
            ],
            Partners = [new Partner { Id = "ptnr-cc", Name = "Crescent Capital", Code = "CC" }],
            Goods = [new Good { Id = "good-0001", Name = "Copper Ingots", Code = "CU" }],
            Contracts =
            [
                new Contract
                {
                    Id = "ctr-portal", CustomerId = "cust-portal", Destination = "NINGBO",
                    Items =
                    [
                        new ContractItem
                        {
                            Id = "item-portal", ContractId = "ctr-portal", Product = "Copper Ingots",
                            QuantityMt = 25m, RemainingMt = 25m,
                            Partners = [new ItemPartner { PartnerId = "ptnr-cc", Percent = 40m }],
                        },
                    ],
                },
                new Contract { Id = "ctr-other", CustomerId = "cust-other", Destination = "DUBAI" },
            ],
            Invoices =
            [
                new Invoice
                {
                    Id = "inv-portal", ContractId = "ctr-portal", CustomerId = "cust-portal",
                    InvoiceNumber = "SI-1", InvoiceType = InvoiceType.SALE_INVOICE,
                },
                new Invoice
                {
                    Id = "inv-other", ContractId = "ctr-other", CustomerId = "cust-other",
                    InvoiceNumber = "SI-2", InvoiceType = InvoiceType.SALE_INVOICE,
                },
            ],
        });
    }
}
