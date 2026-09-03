using Finora.Erp.Domain;

namespace Finora.Erp.Application;

public sealed record ConversionInputLine(string Product, decimal QuantityMt);
public sealed record ConversionOutputLine(string Product, decimal QuantityMt, decimal? SharePercent);
public sealed record ConversionCostLine(string CategoryId, string PersonId, decimal Amount, Currency Currency, decimal? FxRate, string? Description);

/// <summary>The whole document, header and all three line lists; a DRAFT is replaced with it on every save.</summary>
public sealed record ConversionDocInput(
    string WarehouseId,
    DateTimeOffset Date,
    string? Notes,
    IReadOnlyList<ConversionInputLine> Inputs,
    IReadOnlyList<ConversionOutputLine> Outputs,
    IReadOnlyList<ConversionCostLine> Costs);

public sealed record ConversionResult(ConversionDocument Entity, IReadOnlyList<ConversionDocument> All);
