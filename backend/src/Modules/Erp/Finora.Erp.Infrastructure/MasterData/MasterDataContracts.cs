using Finora.Erp.Domain;

namespace Finora.Erp.Infrastructure.MasterData;

/// <summary>
/// What a master-data write answers with: the record that changed, and the whole list after it.
///
/// <para>
/// The list is not padding. Two of these writes touch rows the caller did not name — assigning
/// the portal account clears it from every other customer, and deactivating a customer drops its
/// own — so returning the changed record alone would leave the client's copy of the others
/// silently wrong. These lists are tens of rows; sending all of them costs less than the second
/// request that would otherwise be needed to stay correct.
/// </para>
/// </summary>
public sealed record MasterDataResult<T>(T Entity, IReadOnlyList<T> All);

// The inputs below mirror the `*Input` interfaces in the SPA's api.ts field for field. Codes are
// NOT here: the server assigns them (see Finora.Erp.Domain.Numbering) and a client that still
// posts one is ignored by System.Text.Json, so an older bundle keeps working. Where a field is
// immutable after create the server re-reads it from the stored record and ignores what arrived.

public sealed record CustomerInput(
    string Name,
    Currency DefaultCurrency,
    CustomerType CustomerType,
    string? ContactName,
    string? Email,
    string? Phone,
    string? Country,
    int PaymentTermsDays,
    decimal CreditLimit,
    bool? PortalAccount);

public sealed record PartnerInput(string Name);

public sealed record WarehouseInput(string Name, string? Location);

public sealed record CostCentreInput(string Name, string? Description);

public sealed record GoodInput(
    string Name,
    MetalType MetalType,
    GoodForm? Form,
    GoodUnit Unit,
    string? HsCode,
    string? Description);

public sealed record FinancialAccountInput(
    string Name,
    FinancialAccountType Type,
    Currency Currency,
    string? Description,
    string? AccountNumber,
    string? Iban,
    string? SwiftCode,
    string? Address);

public sealed record ChargeCategoryInput(
    string Name,
    ChargeDirection Direction,
    ChargeScope Scope,
    string? Description);

/// <summary>The body of every "set active" call — a bare boolean has no field name on the wire.</summary>
public sealed record SetActiveInput(bool Active);
