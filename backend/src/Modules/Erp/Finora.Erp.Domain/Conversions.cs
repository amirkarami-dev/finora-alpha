using System.Text.Json.Serialization;

namespace Finora.Erp.Domain;

/// <summary>
/// Stock of some products becomes stock of others, in one warehouse: cable is stripped to
/// copper, copper is melted to ingot. The document carries the cost along — what the inputs
/// were worth, plus whatever the workshop charged — so the outputs know what they cost.
/// </summary>
public sealed class ConversionDocument
{
    public required string Id { get; init; }

    /// <summary>'CNV-2026-0001'.</summary>
    public required string DocNumber { get; set; }

    public required string WarehouseId { get; init; }
    [JsonIgnore] public Warehouse? Warehouse { get; init; }

    public DateTimeOffset Date { get; set; }
    public ConversionStatus Status { get; set; } = ConversionStatus.DRAFT;
    public string? Notes { get; set; }

    /// <summary>The GENERAL expense document the cost lines were booked as, on confirm.</summary>
    public string? ChargeDocId { get; set; }

    /// <summary>Stored on confirm: Σ input CostUsd.</summary>
    public decimal TotalInputCostUsd { get; set; }

    /// <summary>Stored on confirm: Σ cost-line AmountUsd.</summary>
    public decimal TotalAddedCostUsd { get; set; }

    public DateTimeOffset CreatedAt { get; init; }

    public ICollection<ConversionInput> Inputs { get; init; } = [];
    public ICollection<ConversionOutput> Outputs { get; init; } = [];
    public ICollection<ConversionCost> Costs { get; init; } = [];
}

/// <summary>Metal that leaves the warehouse into the conversion.</summary>
public sealed class ConversionInput
{
    public required string Id { get; init; }
    public required string DocumentId { get; init; }
    [JsonIgnore] public ConversionDocument? Document { get; init; }

    /// <summary>Product NAME — stock is counted by it, exactly like receipts and issues.</summary>
    public required string Product { get; set; }
    public decimal QuantityMt { get; set; }

    /// <summary>The warehouse's average cost at confirm time; 0 while DRAFT.</summary>
    public decimal UnitCostUsd { get; set; }
    public decimal CostUsd { get; set; }
}

/// <summary>Metal that comes back out of the conversion.</summary>
public sealed class ConversionOutput
{
    public required string Id { get; init; }
    public required string DocumentId { get; init; }
    [JsonIgnore] public ConversionDocument? Document { get; init; }

    public required string Product { get; set; }
    public decimal QuantityMt { get; set; }

    /// <summary>Percent of the total cost this output takes. Null on every line means "by
    /// weight"; given, the lines must sum to 100.</summary>
    public decimal? SharePercent { get; set; }

    public decimal UnitCostUsd { get; set; }
    public decimal CostUsd { get; set; }
}

/// <summary>What the workshop charged: labour, gas, power. Booked as an expense on confirm.</summary>
public sealed class ConversionCost
{
    public required string Id { get; init; }
    public required string DocumentId { get; init; }
    [JsonIgnore] public ConversionDocument? Document { get; init; }

    /// <summary>An EXPENSE category with scope GENERAL.</summary>
    public required string CategoryId { get; set; }
    [JsonIgnore] public ChargeCategory? Category { get; init; }

    /// <summary>Who is paid.</summary>
    public required string PersonId { get; set; }
    [JsonIgnore] public Customer? Person { get; init; }

    public decimal Amount { get; set; }
    public Currency Currency { get; set; }
    public decimal FxRate { get; set; } = 1m;
    public decimal AmountUsd { get; set; }
    public string? Description { get; set; }
}
