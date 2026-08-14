namespace Finora.Erp.Application;

/// <summary>A note that currency moved for or against the company.</summary>
public sealed record ExchangeGainLossInput
{
    public DateTimeOffset Date { get; init; }

    /// <summary>Signed USD. Positive is a gain, negative a loss; zero is not a record.</summary>
    public required decimal Amount { get; init; }

    public string? Notes { get; init; }
}
