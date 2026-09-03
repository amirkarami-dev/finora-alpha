using Finora.BuildingBlocks.Domain;
using Finora.Erp.Domain;
using Finora.Erp.Infrastructure;
using Finora.Erp.Infrastructure.MasterData;
using Finora.Erp.Infrastructure.Snapshot;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Finora.IntegrationTests;

/// <summary>
/// The master-data guards, against a real database.
///
/// <para>
/// These rules exist twice — here and in the SPA's <c>api.ts</c>, which still runs them when the
/// API is unreachable. Two implementations of one rule drift silently, and the drift shows up as
/// a code the browser accepts and the server rejects, or worse the reverse. Each test below names
/// the exact code the front end branches on.
/// </para>
/// </summary>
[Collection(nameof(ApiCollection))]
public sealed class MasterDataTests(ApiFixture fixture) : IAsyncLifetime
{
    private AsyncServiceScope _scope;
    private MasterDataService _service = null!;

    public async Task InitializeAsync()
    {
        _scope = fixture.Services.CreateAsyncScope();
        _service = _scope.ServiceProvider.GetRequiredService<MasterDataService>();

        // Ids are minted from what is already stored (`cc-0002` follows `cc-0001`), so these
        // tests start from an empty database rather than from whatever a neighbour left behind.
        await _scope.ServiceProvider.GetRequiredService<SnapshotService>()
            .ReplaceAsync(new ErpSnapshot());
    }

    public async Task DisposeAsync() => await _scope.DisposeAsync();

    /* ------------------------------- Id minting ------------------------------- */

    [Fact]
    public async Task Customers_are_numbered_from_one_and_the_id_follows_the_code()
    {
        var first = await _service.CreateCustomerAsync(Customer("Alco Metal Trading"));
        var second = await _service.CreateCustomerAsync(Customer("Million Gen Tr"));

        Assert.Equal("1", first.Entity.Code);
        Assert.Equal("cust-1", first.Entity.Id);
        Assert.Equal("2", second.Entity.Code);
        Assert.Equal("cust-2", second.Entity.Id);
    }

    [Fact]
    public async Task Partners_warehouses_and_cost_centres_count_separately()
    {
        await _service.CreatePartnerAsync(new PartnerInput("Crescent Capital"));
        var partner = await _service.CreatePartnerAsync(new PartnerInput("Gulf Metals JV"));
        var warehouse = await _service.CreateWarehouseAsync(new WarehouseInput("Main Warehouse", "Jebel Ali"));
        await _service.CreateCostCentreAsync(new CostCentreInput("Logistics", null));
        var centre = await _service.CreateCostCentreAsync(new CostCentreInput("Admin", null));

        Assert.Equal("2", partner.Entity.Code);
        Assert.Equal("ptnr-2", partner.Entity.Id);
        Assert.Equal("1", warehouse.Entity.Code);
        Assert.Equal("wh-1", warehouse.Entity.Id);
        Assert.Equal("2", centre.Entity.Code);
        Assert.Equal("cc-0002", centre.Entity.Id);
    }

    [Fact]
    public async Task Goods_are_coded_by_metal()
    {
        var cathode = await _service.CreateGoodAsync(Good("Copper Cathode"));
        var ingot = await _service.CreateGoodAsync(Good("Copper Ingot"));
        var aluminium = await _service.CreateGoodAsync(Good("Aluminium Ingot", MetalType.ALUMINIUM));

        Assert.Equal("copper-001", cathode.Entity.Code);
        Assert.Equal("copper-002", ingot.Entity.Code);
        Assert.Equal("aluminium-001", aluminium.Entity.Code);
    }

    [Fact]
    public async Task A_goods_metal_type_cannot_be_changed_after_creation()
    {
        var created = await _service.CreateGoodAsync(Good("Copper Cathode"));

        var edited = await _service.UpdateGoodAsync(
            created.Entity.Id, Good("Copper Cathode 99.9", MetalType.ALUMINIUM));

        Assert.Equal(MetalType.COPPER, edited.Entity.MetalType);
        Assert.Equal("copper-001", edited.Entity.Code);
        Assert.Equal("Copper Cathode 99.9", edited.Entity.Name);
    }

    [Fact]
    public async Task A_good_still_needs_a_name()
    {
        var error = await Assert.ThrowsAsync<DomainException>(() => _service.CreateGoodAsync(Good("  ")));
        Assert.Equal("name-required", error.Code);
    }

    [Fact]
    public async Task Expense_and_revenue_categories_count_separately()
    {
        var freight = await _service.CreateChargeCategoryAsync(
            new ChargeCategoryInput("Freight", ChargeDirection.EXPENSE, ChargeScope.INVOICE, null));
        var customs = await _service.CreateChargeCategoryAsync(
            new ChargeCategoryInput("Customs", ChargeDirection.EXPENSE, ChargeScope.INVOICE, null));
        var commission = await _service.CreateChargeCategoryAsync(
            new ChargeCategoryInput("Commission", ChargeDirection.REVENUE, ChargeScope.GENERAL, null));

        Assert.Equal("1", freight.Entity.Code);
        Assert.Equal("2", customs.Entity.Code);
        Assert.Equal("1", commission.Entity.Code);
    }

    /* -------------------------------- Guards ---------------------------------- */

    [Fact]
    public async Task A_good_repeating_a_name_in_different_case_is_refused()
    {
        await _service.CreateGoodAsync(Good("Copper Ingots"));

        var error = await Assert.ThrowsAsync<DomainException>(
            () => _service.CreateGoodAsync(Good("COPPER INGOTS")));

        // Names, not just codes: a contract line matches a good by NAME, so two spellings of one
        // product split it into two rows in every report.
        Assert.Equal("duplicate-name", error.Code);
    }

    [Theory]
    [InlineData(null, "AE07 0331 2345 6789 0123 456", "account-number-required")]
    [InlineData("0123456789", null, "iban-required")]
    public async Task A_bank_account_needs_a_number_and_an_iban(
        string? accountNumber, string? iban, string expected)
    {
        var error = await Assert.ThrowsAsync<DomainException>(
            () => _service.CreateFinancialAccountAsync(new FinancialAccountInput(
                "Emirates NBD", FinancialAccountType.BANK, Currency.AED, null,
                accountNumber, iban, null, null)));

        Assert.Equal(expected, error.Code);
    }

    [Fact]
    public async Task A_cash_safe_needs_neither_and_is_not_given_them()
    {
        var created = await _service.CreateFinancialAccountAsync(new FinancialAccountInput(
            "Office safe", FinancialAccountType.CASH_SAFE, Currency.AED, null,
            // Filled in by someone who switched the type after typing: stored on a record that
            // can never display them would be worse than dropped.
            "0123456789", "AE070331234567890123456", "ENBDAEAD", "Dubai"));

        Assert.Null(created.Entity.AccountNumber);
        Assert.Null(created.Entity.Iban);
        Assert.Null(created.Entity.SwiftCode);
        Assert.Null(created.Entity.Address);
    }

    [Fact]
    public async Task Two_accounts_of_different_types_may_share_a_name()
    {
        await _service.CreateFinancialAccountAsync(new FinancialAccountInput(
            "Dubai", FinancialAccountType.CASH_SAFE, Currency.AED, null, null, null, null, null));

        var bank = await _service.CreateFinancialAccountAsync(new FinancialAccountInput(
            "Dubai", FinancialAccountType.BANK, Currency.AED, null,
            "0123456789", "AE070331234567890123456", null, null));

        Assert.Equal("Dubai", bank.Entity.Name);
    }

    /* ------------------------------ Immutability ------------------------------ */

    [Fact]
    public async Task An_accounts_type_and_currency_survive_an_edit_that_tries_to_change_them()
    {
        var created = await _service.CreateFinancialAccountAsync(new FinancialAccountInput(
            "Emirates NBD", FinancialAccountType.BANK, Currency.AED, null,
            "0123456789", "AE070331234567890123456", null, null));

        var updated = await _service.UpdateFinancialAccountAsync(
            created.Entity.Id,
            new FinancialAccountInput(
                "Emirates NBD renamed", FinancialAccountType.CASH_SAFE, Currency.USD, null,
                "0123456789", "AE070331234567890123456", null, null));

        // The currency defines what every transfer booked against this account meant.
        Assert.Equal(FinancialAccountType.BANK, updated.Entity.Type);
        Assert.Equal(Currency.AED, updated.Entity.Currency);
        Assert.Equal("Emirates NBD renamed", updated.Entity.Name);
    }

    [Fact]
    public async Task A_rejected_account_edit_changes_nothing()
    {
        await _service.CreateFinancialAccountAsync(new FinancialAccountInput(
            "Taken", FinancialAccountType.CASH_SAFE, Currency.AED, null, null, null, null, null));
        var target = await _service.CreateFinancialAccountAsync(new FinancialAccountInput(
            "Original", FinancialAccountType.CASH_SAFE, Currency.AED, "was here", null, null, null, null));

        await Assert.ThrowsAsync<DomainException>(
            () => _service.UpdateFinancialAccountAsync(
                target.Entity.Id,
                new FinancialAccountInput(
                    "Taken", FinancialAccountType.CASH_SAFE, Currency.AED, "overwritten",
                    null, null, null, null)));

        // The guard runs before anything is assigned, so the description is not half-applied.
        var db = _scope.ServiceProvider.GetRequiredService<ErpDbContext>();
        var stored = await db.FinancialAccounts.AsNoTracking()
            .SingleAsync(a => a.Id == target.Entity.Id);
        Assert.Equal("Original", stored.Name);
        Assert.Equal("was here", stored.Description);
    }

    /* -------------------------- The portal account ---------------------------- */

    [Fact]
    public async Task Granting_the_portal_account_takes_it_from_whoever_had_it()
    {
        var first = await _service.CreateCustomerAsync(Customer("Alco Metal Trading") with { PortalAccount = true });

        var second = await _service.CreateCustomerAsync(
            Customer("Zurich Metal") with { PortalAccount = true });

        // The whole list comes back precisely so the caller sees this: the row it never named
        // changed too.
        Assert.True(second.All.Single(c => c.Id == second.Entity.Id).PortalAccount);
        Assert.False(second.All.Single(c => c.Id == first.Entity.Id).PortalAccount);
    }

    [Fact]
    public async Task Deactivating_a_customer_closes_its_portal_door()
    {
        var created = await _service.CreateCustomerAsync(
            Customer("Alco Metal Trading") with { PortalAccount = true });

        var deactivated = await _service.SetCustomerActiveAsync(created.Entity.Id, active: false);

        Assert.False(deactivated.Entity.Active);
        Assert.False(deactivated.Entity.PortalAccount);
    }

    /* --------------------------------- Order ---------------------------------- */

    [Fact]
    public async Task An_edited_row_keeps_its_place_in_the_list()
    {
        await _service.CreateGoodAsync(Good("Copper Ingots"));
        await _service.CreateGoodAsync(Good("Lead Ingots"));
        await _service.CreateGoodAsync(Good("Zinc Ingots"));

        var updated = await _service.UpdateGoodAsync("good-0001", Good("Copper Cathodes"));

        // PostgreSQL puts an updated row wherever the new tuple landed, so without an explicit
        // order the edited good would fall to the bottom of the BaseInfo table on save.
        Assert.Equal(["good-0001", "good-0002", "good-0003"], updated.All.Select(g => g.Id));
    }

    /* -------------------------------- Not found ------------------------------- */

    [Fact]
    public async Task Editing_something_that_is_not_there_is_a_not_found_not_a_rule_violation()
    {
        var error = await Assert.ThrowsAsync<NotFoundException>(
            () => _service.UpdateWarehouseAsync("wh-nope", new WarehouseInput("X", null)));

        Assert.Equal("warehouse-not-found", error.Code);
    }

    private static CustomerInput Customer(string name) =>
        new(name, Currency.USD, CustomerType.BUYER, null, null, null, null, 30, 0m, null);

    private static GoodInput Good(string name, MetalType metal = MetalType.COPPER) =>
        new(name, metal, null, GoodUnit.MT, null, null);
}
