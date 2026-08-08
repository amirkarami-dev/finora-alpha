using System.Text.Json.Serialization;

namespace Finora.Erp.Domain;

// Costs and income booked against trade documents, and claims raised on them.
//
//   ChargeDoc 1─* ChargeLine 1─* ChargeAllocation   (allocation = one line's share of one good)
//   Claim     1─* ClaimItem

/// <summary>
/// A cost or income document. The header carries no amount of its own — its total is the sum of
/// its lines, so the two can never disagree.
/// </summary>
public sealed class ChargeDoc
{
    public required string Id { get; init; }

    /// <summary>Immutable. EXPENSE and REVENUE share one implementation and one table; they are
    /// the same shape with opposite signs.</summary>
    public ChargeDirection Direction { get; init; }

    /// <summary>Immutable. INVOICE documents spread across a document's goods; GENERAL ones are
    /// overheads that belong to no single document.</summary>
    public ChargeScope Kind { get; init; }

    public required string Title { get; set; }

    /// <summary>
    /// The document this was booked on. Set for INVOICE kind and <b>immutable</b> after create:
    /// the eligibility rule (confirmed, priced, chain-leaf) is checked once, at creation, so
    /// editing the title later cannot start failing because the document has since converted.
    /// </summary>
    public string? InvoiceId { get; init; }
    [JsonIgnore] public Invoice? Invoice { get; init; }

    public DateTimeOffset Date { get; set; }
    public string? Description { get; set; }
    public RecordStatus Status { get; set; } = RecordStatus.ACTIVE;
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;

    /// <summary>The sum of the lines' USD amounts.</summary>
    public decimal TotalUSD { get; set; }

    public ICollection<ChargeLine> Lines { get; init; } = [];
}

/// <summary>
/// One category's worth of cost or income on a document, spread across its goods.
/// </summary>
public sealed class ChargeLine
{
    public required string Id { get; init; }
    public required string DocId { get; init; }
    [JsonIgnore] public ChargeDoc? Doc { get; init; }

    /// <summary>Must match the document's direction, and the category's scope must match the
    /// document's kind — a general category cannot be used on an invoice document.</summary>
    public required string CategoryId { get; init; }
    [JsonIgnore] public ChargeCategory? Category { get; init; }

    public DateTimeOffset Date { get; set; }

    /// <summary>On an INVOICE line this is the sum of the allocations — the split is the truth
    /// and the total follows it, not the other way round.</summary>
    public decimal Amount { get; set; }

    public Currency Currency { get; set; }

    /// <summary>Forced to 1 when the currency is USD.</summary>
    public decimal FxRate { get; set; } = 1m;

    public decimal AmountUSD { get; set; }

    public string? CostCentreId { get; set; }
    [JsonIgnore] public CostCentre? CostCentre { get; init; }

    /// <summary>
    /// Who the money went to or came from. Required when saving, but nullable here: lines
    /// written before that rule existed have none, and making the column NOT NULL would make
    /// every one of them unloadable. They render as a dash and must name a person the next time
    /// they are edited — which moves the data forward instead of destroying it.
    /// </summary>
    public string? PersonId { get; set; }
    [JsonIgnore] public Customer? Person { get; init; }

    public string? Description { get; set; }

    /// <summary>Total tonnage this line was spread over.</summary>
    public decimal? QuantityBasisMt { get; set; }

    /// <summary>Cost per tonne — the USD amount over the tonnage above.</summary>
    public decimal? UnitPriceUSD { get; set; }

    /// <summary>Empty on a GENERAL line; at least one on an INVOICE line.</summary>
    public ICollection<ChargeAllocation> Allocations { get; init; } = [];
}

/// <summary>One good's share of a charge line. Split equally by default, in whole cents, and
/// adjustable per good.</summary>
public sealed class ChargeAllocation
{
    public required string Id { get; init; }
    public required string LineId { get; init; }
    [JsonIgnore] public ChargeLine? Line { get; init; }

    public required string InvoiceItemId { get; init; }

    /// <summary>Chain-stable key — see <see cref="InvoiceItem.ReferenceDocumentItemId"/>.</summary>
    public required string ReferenceDocumentItemId { get; set; }

    /// <summary>Snapshots taken from the invoice line, never supplied by the client.</summary>
    public required string Product { get; set; }

    public decimal QuantityMt { get; set; }
    public decimal Amount { get; set; }
    public decimal AmountUSD { get; set; }
}

/// <summary>
/// A claim raised on a trade document, itemised per good.
///
/// <para>
/// The side IS the invoice's side: a sale claim sits on a sale invoice. There is no mapping —
/// an earlier naming implied the opposite document, and every stored claim's side is re-derived
/// from its own invoice rather than trusted.
/// </para>
/// </summary>
public sealed class Claim
{
    public required string Id { get; init; }

    /// <summary>Immutable, and always equal to the invoice's own side.</summary>
    public ClaimSide Side { get; init; }

    public required string Title { get; set; }

    /// <summary>Required and immutable.</summary>
    public required string InvoiceId { get; init; }
    [JsonIgnore] public Invoice? Invoice { get; init; }

    /// <summary>Taken from the invoice's customer, never supplied — which is what stops a claim
    /// appearing under the wrong person.</summary>
    public required string PartyId { get; init; }
    [JsonIgnore] public Customer? Party { get; init; }

    public ClaimType ClaimType { get; set; }
    public DateTimeOffset Date { get; set; }
    public Currency Currency { get; set; }
    public decimal FxRate { get; set; } = 1m;

    /// <summary>The sum of the items; not typed by hand.</summary>
    public decimal Amount { get; set; }

    public decimal AmountUSD { get; set; }
    public string? Description { get; set; }
    public RecordStatus Status { get; set; } = RecordStatus.ACTIVE;
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;

    public ICollection<ClaimItem> Items { get; init; } = [];
}

/// <summary>One good's part of a claim.</summary>
public sealed class ClaimItem
{
    public required string Id { get; init; }
    public required string ClaimId { get; init; }
    [JsonIgnore] public Claim? Claim { get; init; }

    public required string InvoiceItemId { get; init; }

    /// <summary>Chain-stable key — see <see cref="InvoiceItem.ReferenceDocumentItemId"/>.</summary>
    public required string ReferenceDocumentItemId { get; set; }

    public required string Product { get; set; }
    public decimal QuantityMt { get; set; }

    /// <summary>The one figure the user types on a claim; everything above is derived from it.</summary>
    public decimal Amount { get; set; }

    public decimal AmountUSD { get; set; }
    public string? Description { get; set; }
}
