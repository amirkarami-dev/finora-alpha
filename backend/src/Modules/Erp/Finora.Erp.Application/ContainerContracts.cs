namespace Finora.Erp.Application;

/// <summary>A shipping container and the contract goods loaded into it.</summary>
public sealed record ContainerInput
{
    public required string Reference { get; init; }
    public DateTimeOffset LoadDate { get; init; }
    public DateTimeOffset? ArrivalDate { get; init; }

    /// <summary>Kilograms, not tonnes — this is what the weighbridge and the B/L record.</summary>
    public decimal? GrossWeightKg { get; init; }
    public decimal? NetWeightKg { get; init; }

    public string? BlNumber { get; init; }
    public string? BookingNumber { get; init; }
    public string? SealNumber { get; init; }

    /// <summary>The whole list every time — the form posts what the container should now hold,
    /// not a set of changes.</summary>
    public IReadOnlyList<ContainerGoodInput> Goods { get; init; } = [];
}

public sealed record ContainerGoodInput
{
    public required string ContractItemId { get; init; }
    public decimal QuantityMt { get; init; }
}
