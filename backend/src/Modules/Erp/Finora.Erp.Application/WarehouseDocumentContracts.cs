using Finora.Erp.Domain;

namespace Finora.Erp.Application;

/// <summary>A warehouse receipt or issue, raised against one trade document.</summary>
public sealed record InventoryDocInput
{
    public InventoryDocType Type { get; init; }
    public required string WarehouseId { get; init; }
    public required string InvoiceId { get; init; }
    public DateTimeOffset Date { get; init; }
    public string? Notes { get; init; }
    public IReadOnlyList<InventoryDocItemInput> Items { get; init; } = [];
}

public sealed record InventoryDocItemInput
{
    /// <summary>The chain-stable line key, not the row id — it is what survives a provisional
    /// document becoming a final one.</summary>
    public required string ReferenceDocumentItemId { get; init; }

    public decimal QuantityMt { get; init; }
}
