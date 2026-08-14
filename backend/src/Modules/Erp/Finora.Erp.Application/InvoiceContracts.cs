namespace Finora.Erp.Application;

/// <summary>
/// A new trade document. Mirrors the SPA's <c>InvoiceInput</c>.
/// </summary>
/// <param name="InvoiceNumber">
/// Optional. Left out, the server mints the next free one for this type. The browser's preview
/// does not reserve, so two people drafting at once both see the same suggestion and the second
/// save is refused — which is why the field is optional rather than required.
/// </param>
public sealed record InvoiceInput(
    string InvoiceType,
    string ContractId,
    DateTimeOffset InvoiceDate,
    string? InvoiceNumber,
    string? Currency,
    decimal? ExchangeRate,
    string? Description);

/// <summary>Header fields that may change while a document is still a draft.</summary>
public sealed record InvoiceHeaderPatch(
    string? InvoiceNumber,
    DateTimeOffset? InvoiceDate,
    string? Currency,
    decimal? ExchangeRate,
    string? Description);

/// <summary>
/// A goods line to add. Pricing is not accepted from the caller — it is copied from the contract
/// line, so a document cannot quietly disagree with the contract it is raised against.
/// </summary>
public sealed record InvoiceItemInput(
    string ContractItemId,
    decimal QuantityMt,
    string? ContainerId,
    string? Description);

/// <summary>An edit to one line. Every field is optional; absent means unchanged.</summary>
public sealed record InvoiceItemPatch(
    decimal? QuantityMt,
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
