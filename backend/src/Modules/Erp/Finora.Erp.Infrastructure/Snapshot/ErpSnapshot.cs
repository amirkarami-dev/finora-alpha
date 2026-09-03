using Finora.Erp.Domain;

namespace Finora.Erp.Infrastructure.Snapshot;

/// <summary>
/// The whole ERP dataset in exactly the shape the SPA's mock database has always had — the
/// seventeen root collections plus the FX rate, with children inline.
///
/// <para>
/// This is the strangler seam. The front end's derived reads are global (one balance walks
/// customers, invoices, payments, claims, charge documents, cheques and transfers at once), so
/// moving one entity at a time to the server would leave every balance quietly wrong in the
/// meantime. Instead the SPA hydrates this on boot and keeps running its own battle-tested
/// derivation code — now over server data. Writes then move feature by feature, each one
/// verifiable on its own, and this endpoint is deleted once the last read is server-side.
/// </para>
///
/// <para>
/// Property names match the TypeScript <c>Db</c> field for field; the camelCase JSON policy does
/// the rest. A mismatch here does not throw — it silently produces an empty array on the client,
/// which is why the round-trip test compares the shape rather than trusting it.
/// </para>
/// </summary>
public sealed record ErpSnapshot
{
    public IReadOnlyList<Customer> Customers { get; init; } = [];
    public IReadOnlyList<Contract> Contracts { get; init; } = [];
    public IReadOnlyList<Container> Containers { get; init; } = [];
    public IReadOnlyList<Payment> Payments { get; init; } = [];
    public IReadOnlyList<Partner> Partners { get; init; } = [];
    public IReadOnlyList<Warehouse> Warehouses { get; init; } = [];
    public IReadOnlyList<Invoice> Invoices { get; init; } = [];

    /// <summary>Named <c>inventoryDocs</c> on the client, not <c>inventoryDocuments</c>.</summary>
    public IReadOnlyList<InventoryDocument> InventoryDocs { get; init; } = [];

    public IReadOnlyList<ConversionDocument> Conversions { get; init; } = [];

    public IReadOnlyList<CostCentre> CostCentres { get; init; } = [];
    public IReadOnlyList<ChargeCategory> ChargeCategories { get; init; } = [];
    public IReadOnlyList<ChargeDoc> ChargeDocs { get; init; } = [];
    public IReadOnlyList<Claim> Claims { get; init; } = [];
    public IReadOnlyList<Good> Goods { get; init; } = [];
    public IReadOnlyList<FinancialAccount> FinancialAccounts { get; init; } = [];
    public IReadOnlyList<Cheque> Cheques { get; init; } = [];
    public IReadOnlyList<MoneyTransfer> MoneyTransfers { get; init; } = [];
    public IReadOnlyList<ExchangeGainLoss> ExchangeGainLosses { get; init; } = [];

    /// <summary>The default AED-per-USD rate, which the client keeps beside its data.</summary>
    public decimal FxRate { get; init; } = 3.6725m;
}
