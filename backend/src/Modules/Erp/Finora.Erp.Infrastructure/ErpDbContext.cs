using Finora.Erp.Domain;
using Microsoft.EntityFrameworkCore;

namespace Finora.Erp.Infrastructure;

/// <summary>
/// The <c>erp</c> schema — 29 tables mirroring <c>apps/erp-panel/src/types/index.ts</c>.
///
/// <para>
/// Two decisions run through the whole configuration:
/// </para>
///
/// <para>
/// <b>Enums are <c>text</c> with a CHECK constraint</b>, not native PostgreSQL enums and not
/// ints. The TypeScript string literals are already the wire format the SPA sends and renders,
/// so an int mapping would mean translating on every request and a database nobody can read
/// with psql — <c>WHERE status = 3</c> is not something anyone should have to decode at 2am. A
/// native PG enum would give type safety we already have in C# in exchange for a permanent
/// migration tax: a label can never be removed, adding one cannot be used in the same
/// transaction, and Npgsql needs the type registered at startup or it crashes at runtime.
/// <c>text</c> + CHECK is readable, alterable in one migration, and still enforced by the
/// database. The allowed values come from <c>EnumNames</c>, the same list that feeds JSON and
/// OpenAPI, so the three cannot drift.
/// </para>
///
/// <para>
/// <b>Ids are strings.</b> The front end mints readable ids it depends on — <c>cust-am</c>,
/// <c>AM-P-251101156</c>, <c>inv-po-0001</c> — and the snapshot the SPA still reads has to carry
/// them back unchanged. Guids would break the reference contract that is this system's
/// correctness check.
/// </para>
/// </summary>
public sealed class ErpDbContext(DbContextOptions<ErpDbContext> options) : DbContext(options)
{
    public const string Schema = "erp";

    // Master data
    public DbSet<Partner> Partners => Set<Partner>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<Warehouse> Warehouses => Set<Warehouse>();
    public DbSet<CostCentre> CostCentres => Set<CostCentre>();
    public DbSet<FinancialAccount> FinancialAccounts => Set<FinancialAccount>();
    public DbSet<Good> Goods => Set<Good>();
    public DbSet<ChargeCategory> ChargeCategories => Set<ChargeCategory>();

    // Trade
    public DbSet<Contract> Contracts => Set<Contract>();
    public DbSet<ContractItem> ContractItems => Set<ContractItem>();
    public DbSet<ItemPartner> ItemPartners => Set<ItemPartner>();
    public DbSet<Container> Containers => Set<Container>();
    public DbSet<ContainerGood> ContainerGoods => Set<ContainerGood>();
    public DbSet<Invoice> Invoices => Set<Invoice>();
    public DbSet<InvoiceItem> InvoiceItems => Set<InvoiceItem>();
    public DbSet<InventoryDocument> InventoryDocuments => Set<InventoryDocument>();
    public DbSet<InventoryDocumentItem> InventoryDocumentItems => Set<InventoryDocumentItem>();
    public DbSet<ConversionDocument> ConversionDocuments => Set<ConversionDocument>();
    public DbSet<ConversionInput> ConversionInputs => Set<ConversionInput>();
    public DbSet<ConversionOutput> ConversionOutputs => Set<ConversionOutput>();
    public DbSet<ConversionCost> ConversionCosts => Set<ConversionCost>();

    // Money
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<PaymentItem> PaymentItems => Set<PaymentItem>();
    public DbSet<PaymentItemAllocation> PaymentItemAllocations => Set<PaymentItemAllocation>();
    public DbSet<Cheque> Cheques => Set<Cheque>();
    public DbSet<MoneyTransfer> MoneyTransfers => Set<MoneyTransfer>();
    public DbSet<MoneyTransferAllocation> MoneyTransferAllocations => Set<MoneyTransferAllocation>();
    public DbSet<ExchangeGainLoss> ExchangeGainLosses => Set<ExchangeGainLoss>();

    // Charges and claims
    public DbSet<ChargeDoc> ChargeDocs => Set<ChargeDoc>();
    public DbSet<ChargeLine> ChargeLines => Set<ChargeLine>();
    public DbSet<ChargeAllocation> ChargeAllocations => Set<ChargeAllocation>();
    public DbSet<Claim> Claims => Set<Claim>();
    public DbSet<ClaimItem> ClaimItems => Set<ClaimItem>();

    // Settings
    public DbSet<ErpSetting> Settings => Set<ErpSetting>();

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        ArgumentNullException.ThrowIfNull(configurationBuilder);

        // Money is the default. Anything needing more decimals says so explicitly below, and
        // nothing can silently land on an unconstrained `numeric`.
        configurationBuilder.Properties<decimal>().HavePrecision(18, 2);

        // Ids and codes are short; the default unbounded text would give every one of them an
        // unbounded column and no index size guarantee.
        configurationBuilder.Properties<string>().HaveMaxLength(400);
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);

        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ErpDbContext).Assembly);
    }
}

/// <summary>
/// A single global setting row. Today it holds the default AED-per-USD rate the front end keeps
/// beside its data; a key/value table rather than a one-row table so the next setting is an
/// insert rather than a migration.
/// </summary>
public sealed class ErpSetting
{
    public required string Key { get; init; }
    public required string Value { get; set; }
}
