using Finora.Erp.Domain;

namespace Finora.Erp.Application;

/// <summary>An expense or revenue document — free-standing, or booked against one trade document.</summary>
public sealed record ChargeDocInput
{
    public ChargeDirection Direction { get; init; }
    public ChargeScope Kind { get; init; }
    public required string Title { get; init; }

    /// <summary>Required when the kind is INVOICE, and immutable afterwards.</summary>
    public string? InvoiceId { get; init; }

    public DateTimeOffset Date { get; init; }
    public string? Description { get; init; }
}

public sealed record ChargeLineInput
{
    public required string CategoryId { get; init; }
    public DateTimeOffset Date { get; init; }
    public required decimal Amount { get; init; }
    public required Currency Currency { get; init; }

    /// <summary>Forced to 1 for USD; required for anything else.</summary>
    public decimal? FxRate { get; init; }

    /// <summary>Required on every line, expense and revenue alike.</summary>
    public string? PersonId { get; init; }

    public string? CostCentreId { get; init; }
    public string? Description { get; init; }

    /// <summary>INVOICE kind only. Omitted means every good on the booked document.</summary>
    public IReadOnlyList<ChargeGoodInput>? Goods { get; init; }
}

public sealed record ChargeGoodInput
{
    public required string InvoiceItemId { get; init; }

    /// <summary>Omitted on ANY good re-splits the whole line evenly.</summary>
    public decimal? Amount { get; init; }
}
