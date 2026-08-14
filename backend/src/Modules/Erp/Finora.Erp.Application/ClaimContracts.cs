using Finora.Erp.Domain;

namespace Finora.Erp.Application;

/// <summary>
/// A claim against one trade document.
///
/// <para>The party and the money are NOT here: the party is read off the document, and both
/// amounts are the sums of the items.</para>
/// </summary>
public sealed record ClaimInput
{
    public ClaimSide Side { get; init; }
    public required string Title { get; init; }
    public required string InvoiceId { get; init; }
    public ClaimType ClaimType { get; init; }
    public DateTimeOffset Date { get; init; }
    public required Currency Currency { get; init; }

    /// <summary>Forced to 1 for USD; required for anything else.</summary>
    public decimal? FxRate { get; init; }

    public string? Description { get; init; }

    /// <summary>One row per good on the document. Rows with no amount are dropped, which is how
    /// a claim against a single good is entered.</summary>
    public IReadOnlyList<ClaimItemInput> Items { get; init; } = [];
}

public sealed record ClaimItemInput
{
    public required string InvoiceItemId { get; init; }
    public decimal Amount { get; init; }
    public string? Description { get; init; }
}
