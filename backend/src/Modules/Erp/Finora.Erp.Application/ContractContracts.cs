namespace Finora.Erp.Application;

/// <summary>
/// A trading agreement's header. Mirrors the SPA's <c>ContractInput</c> field for field.
/// </summary>
/// <param name="ContractType">
/// Read only when creating. A contract's direction decides which documents may be raised against
/// it and which way the money runs, so changing it after lines and invoices exist would restate
/// the whole deal. The browser has always ignored it on edit; here that is stated rather than
/// implied.
/// </param>
public sealed record ContractInput(
    string CustomerId,
    DateTimeOffset Date,
    string Destination,
    string Status,
    string? Notes,
    string? ContractType);

/// <summary>One goods line. <c>Partners</c> is replaced wholesale, never merged.</summary>
public sealed record ContractItemInput(
    string Product,
    decimal QuantityMt,
    decimal LmePercent,
    bool LmeFixed,
    decimal FixedLmePrice,
    decimal Premium,
    string Incoterm,
    string Status,
    string? Notes,
    IReadOnlyList<ItemPartnerInput>? Partners);

public sealed record ItemPartnerInput(string PartnerId, decimal Percent);

/// <summary>A formal change to a goods line's quantity: signed MT and the reason.</summary>
public sealed record ContractItemChangeInput(decimal DeltaMt, string? Note);
