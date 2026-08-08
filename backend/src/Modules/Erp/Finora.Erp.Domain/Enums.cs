using System.Text.Json.Serialization;

namespace Finora.Erp.Domain;

// Every enum here mirrors a TypeScript string union in apps/erp-panel/src/types/index.ts. The
// wire spelling is the union member, verbatim — a unit test parses that file and compares, so a
// member added on one side and forgotten on the other fails the build rather than a request.
//
// Where the C# name cannot be the wire name (spaces, SCREAMING_CASE), the member carries
// [JsonStringEnumMemberName]. EnumNames reads it for JSON, for the EF converter and for the
// CHECK constraint alike.

/// <summary>USD is the base. Every <c>*USD</c> figure is <c>amount / fxRate</c>.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<Currency>))]
public enum Currency
{
    USD,
    AED,
    IQD,
}

[JsonConverter(typeof(JsonStringEnumConverter<PaymentMethod>))]
public enum PaymentMethod
{
    TT,
    Cash,
    Cheque,
    Offset,
    [JsonStringEnumMemberName("Credit Note")] CreditNote,
}

[JsonConverter(typeof(JsonStringEnumConverter<Incoterm>))]
public enum Incoterm
{
    FOB,
    CIF,
    CFR,
    CNF,
    EXW,
    DAP,
}

/// <summary>Base material of a good. Closed set; OTHER is the escape hatch so a new alloy never
/// blocks data entry while waiting on a code change.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<MetalType>))]
public enum MetalType
{
    COPPER,
    ALUMINIUM,
    ZINC,
    LEAD,
    NICKEL,
    TIN,
    BRASS,
    STEEL,
    OTHER,
}

[JsonConverter(typeof(JsonStringEnumConverter<GoodForm>))]
public enum GoodForm
{
    CATHODE,
    INGOT,
    BILLET,
    SCRAP,
    WIRE_ROD,
    GRANULES,
    POWDER,
    OTHER,
}

/// <summary>MT only. Every quantity in the app is metric tonnes, so a second unit here would
/// also mean changing the pricing maths and every <c>*Mt</c> column.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<GoodUnit>))]
public enum GoodUnit
{
    MT,
}

[JsonConverter(typeof(JsonStringEnumConverter<ContractStatus>))]
public enum ContractStatus
{
    ACTIVE,
    CLOSED,
    // The wire value carries a SPACE. This is exactly why the enum spelling is data rather than
    // the C# identifier, and why native PostgreSQL enums were not worth their migration tax.
    [JsonStringEnumMemberName("ON HOLD")] OnHold,
    CANCELLED,
}

/// <summary>EMPLOYEE and OTHER are people who do not trade: no credit limit, no payment terms,
/// no contracts.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<CustomerType>))]
public enum CustomerType
{
    BUYER,
    SUPPLIER,
    BOTH,
    EMPLOYEE,
    OTHER,
}

[JsonConverter(typeof(JsonStringEnumConverter<ContractType>))]
public enum ContractType
{
    SELL,
    PURCHASE,
}

/// <summary>INVOICE settles specific documents through its lines; GENERAL is money on account.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<PaymentType>))]
public enum PaymentType
{
    INVOICE,
    GENERAL,
}

/// <summary>Only CONFIRMED money counts towards balances, KPIs and ageing. Reversible.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<PaymentStatus>))]
public enum PaymentStatus
{
    DRAFT,
    CONFIRMED,
}

/// <summary>IN = received from a customer; OUT = paid to a supplier.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<MoneyDirection>))]
public enum MoneyDirection
{
    IN,
    OUT,
}

[JsonConverter(typeof(JsonStringEnumConverter<TransferStatus>))]
public enum TransferStatus
{
    DRAFT,
    CONFIRMED,
    CANCELLED,
}

[JsonConverter(typeof(JsonStringEnumConverter<ExchangeGainLossType>))]
public enum ExchangeGainLossType
{
    GAIN,
    LOSS,
}

[JsonConverter(typeof(JsonStringEnumConverter<ChequeType>))]
public enum ChequeType
{
    NORMAL,
    SECURITY,
}

/// <summary>Any status may follow any other; what is guarded is the money, not the graph.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<ChequeStatus>))]
public enum ChequeStatus
{
    PENDING,
    PAID,
    EXPIRED,
    RETURNED,
    CHANGED,
}

/// <summary>Six document types: {purchase, sale} × {order, provisional, invoice}.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<InvoiceType>))]
public enum InvoiceType
{
    PURCHASE_ORDER,
    PURCHASE_PROVISIONAL,
    PURCHASE_INVOICE,
    SALE_ORDER,
    SALE_PROVISIONAL,
    SALE_INVOICE,
}

[JsonConverter(typeof(JsonStringEnumConverter<InvoiceStatus>))]
public enum InvoiceStatus
{
    DRAFT,
    CONFIRMED,
    CANCELLED,
}

/// <summary>Derived from <see cref="InvoiceType"/>, never stored.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<InvoiceSide>))]
public enum InvoiceSide
{
    PURCHASE,
    SALE,
}

[JsonConverter(typeof(JsonStringEnumConverter<InventoryDocType>))]
public enum InventoryDocType
{
    IN,
    OUT,
}

/// <summary>Shared by inventory documents. The TS side spells this inline rather than naming it.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<DocumentStatus>))]
public enum DocumentStatus
{
    CONFIRMED,
    CANCELLED,
}

/// <summary>Shared by charge documents and claims — both are ACTIVE until cancelled, and neither
/// is ever deleted, because a financial record that vanishes is worse than one marked void.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<RecordStatus>))]
public enum RecordStatus
{
    ACTIVE,
    CANCELLED,
}

[JsonConverter(typeof(JsonStringEnumConverter<FinancialAccountType>))]
public enum FinancialAccountType
{
    BANK,
    CASH_SAFE,
}

[JsonConverter(typeof(JsonStringEnumConverter<ChargeDirection>))]
public enum ChargeDirection
{
    EXPENSE,
    REVENUE,
}

[JsonConverter(typeof(JsonStringEnumConverter<ChargeScope>))]
public enum ChargeScope
{
    INVOICE,
    GENERAL,
}

/// <summary>A claim is named after the document it is filed against: a SALE claim sits on a sale
/// invoice. The side IS the invoice side — there is no mapping.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<ClaimSide>))]
public enum ClaimSide
{
    SALE,
    PURCHASE,
}

[JsonConverter(typeof(JsonStringEnumConverter<ClaimType>))]
public enum ClaimType
{
    QUANTITY,
    QUALITY,
}
