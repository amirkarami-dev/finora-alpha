namespace Finora.Erp.Application;

/// <summary>Money moved between two of the company's own accounts.</summary>
public sealed record MoneyTransferInput
{
    public DateTimeOffset Date { get; init; }
    public required string FromAccountId { get; init; }
    public required string ToAccountId { get; init; }
    public required decimal FromAmount { get; init; }

    /// <summary>
    /// Units of the DESTINATION currency per 1 unit of the source — the opposite direction to
    /// every other rate in the application, which are foreign units per dollar. Stored as the
    /// user types it; 1 when both accounts hold the same currency.
    /// </summary>
    public required decimal ExchangeRate { get; init; }

    public string? Notes { get; init; }

    /// <summary>Optional, and may cover only part of the transfer.</summary>
    public IReadOnlyList<TransferAllocationInput>? Allocations { get; init; }
}

public sealed record TransferAllocationInput
{
    public string? InvoiceId { get; init; }
    public string? InvoiceItemId { get; init; }
    public decimal Amount { get; init; }
}
