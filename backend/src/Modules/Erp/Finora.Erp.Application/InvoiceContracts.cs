namespace Finora.Erp.Application;

/// <summary>
/// A new trade document. Mirrors the SPA's <c>InvoiceInput</c>.
/// </summary>
public sealed record InvoiceInput(
    string InvoiceType,
    string ContractId,
    DateTimeOffset InvoiceDate,
    string? Currency,
    decimal? ExchangeRate,
    string? Description);

/// <summary>Header fields that may change while a document is still a draft.</summary>
public sealed record InvoiceHeaderPatch(
    DateTimeOffset? InvoiceDate,
    string? Currency,
    decimal? ExchangeRate,
    string? Description);

/// <summary>
/// A goods line to add. Pricing is not accepted from the caller — it is copied from the contract
/// line, so a document cannot quietly disagree with the contract it is raised against.
///
/// <para>Which quantity fields count depends on the document (spec 2026-09-04 invoice line
/// weights, §2): an order takes <see cref="QuantityMt"/>; the four invoice types take
/// <see cref="GrossMt"/> and <see cref="TareMt"/> and the server sets the net itself.</para>
/// </summary>
public sealed record InvoiceItemInput(
    string ContractItemId,
    decimal? QuantityMt,
    decimal? GrossMt,
    decimal? TareMt,
    string? ContainerId,
    string? Description);

/// <summary>An edit to one line. Every field is optional; absent means unchanged.</summary>
public sealed record InvoiceItemPatch(
    decimal? QuantityMt,
    decimal? GrossMt,
    decimal? TareMt,
    string? ContainerId,
    string? Description,
    decimal? DiscountPercent);

/// <summary>
/// The LME quotation for a document. Applied to every floating line; fixed lines keep the price
/// their contract locked. The discount, when given, applies to all lines.
/// </summary>
public sealed record ApplyLmePriceInput(
    DateTimeOffset LmeDate,
    decimal LmePrice,
    decimal? DiscountPercent);

/// <summary>Which document type to convert into.</summary>
public sealed record ConvertInvoiceInput(string TargetType);
