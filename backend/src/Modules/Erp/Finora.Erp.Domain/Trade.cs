namespace Finora.Erp.Domain;

// Contracts, containers, trade documents and warehouse movements.
//
//   Customer 1─* Contract 1─* ContractItem (goods)
//   Container *─* ContractItem, through ContainerGood
//   Contract 1─* Invoice 1─* InvoiceItem
//   Invoice   1─* InventoryDocument 1─* InventoryDocumentItem

/// <summary>A trading agreement with one party, in one direction.</summary>
public sealed class Contract
{
    public required string Id { get; init; }
    public required string CustomerId { get; init; }
    public Customer? Customer { get; init; }

    public ContractType ContractType { get; init; }
    public DateTimeOffset Date { get; set; }
    public required string Destination { get; set; }
    public ContractStatus Status { get; set; } = ContractStatus.ACTIVE;
    public string? Notes { get; set; }

    public ICollection<ContractItem> Items { get; init; } = [];
}

/// <summary>
/// One goods line on a contract — the thing that is priced, invoiced and shipped.
///
/// <para>Pricing: <c>unitPriceUSD = fixedLmePrice × (lmePercent / 100) + premium</c>.</para>
/// </summary>
public sealed class ContractItem
{
    public required string Id { get; init; }
    public required string ContractId { get; init; }
    public Contract? Contract { get; init; }

    public required string Product { get; set; }
    public decimal QuantityMt { get; set; }

    /// <summary>Percentage of the LME reference that applies — metal content, or the agreed %.</summary>
    public decimal LmePercent { get; set; }

    public bool LmeFixed { get; set; }

    /// <summary>Locked LME price (USD/MT) when <see cref="LmeFixed"/>.</summary>
    public decimal FixedLmePrice { get; set; }

    /// <summary>Added on top of the LME-derived price (USD/MT).</summary>
    public decimal Premium { get; set; }

    public Incoterm Incoterm { get; set; }

    /// <summary>Same values as a contract's status — the TS side aliases the two.</summary>
    public ContractStatus Status { get; set; } = ContractStatus.ACTIVE;

    public string? Notes { get; set; }

    /// <summary>Derived as quantity minus shipped, but persisted: it is read on nearly every
    /// screen and recomputing it per read would mean walking every invoice each time.</summary>
    public decimal RemainingMt { get; set; }

    /// <summary>Profit/cost-share partners. Purchase contracts only; empty otherwise.</summary>
    public ICollection<ItemPartner> Partners { get; init; } = [];
}

/// <summary>A partner's share of one goods line. Each is &gt; 0 and they sum to ≤ 100 — the
/// company keeps the remainder.</summary>
public sealed class ItemPartner
{
    public required string ContractItemId { get; init; }
    public ContractItem? ContractItem { get; init; }

    public required string PartnerId { get; init; }
    public Partner? Partner { get; init; }

    public decimal Percent { get; set; }
}

/// <summary>
/// A shipment. Pure logistics: containers carry no money and no payment status, because the
/// financial truth lives on trade documents, which link to a container per line.
/// </summary>
public sealed class Container
{
    public required string Id { get; init; }

    /// <summary>Container/booking reference, e.g. "MSNU8018095".</summary>
    public required string Reference { get; set; }

    public DateTimeOffset LoadDate { get; set; }
    public DateTimeOffset? ArrivalDate { get; set; }

    // Kilograms, not tonnes — this is what the weighbridge and the B/L record.
    public decimal? GrossWeightKg { get; set; }
    public decimal? NetWeightKg { get; set; }

    /// <summary>Bill of Lading number — the transport contract and title document.</summary>
    public string? BlNumber { get; set; }

    public string? BookingNumber { get; set; }

    /// <summary>Container seal number, as recorded on the B/L.</summary>
    public string? SealNumber { get; set; }

    public ICollection<ContainerGood> Goods { get; init; } = [];
}

/// <summary>How much of one contract goods line a container holds.</summary>
public sealed class ContainerGood
{
    public required string ContainerId { get; init; }
    public Container? Container { get; init; }

    public required string ContractItemId { get; init; }
    public ContractItem? ContractItem { get; init; }

    public decimal QuantityMt { get; set; }
}

/// <summary>
/// A trade document. One entity covers all six types — purchase and sale, each as order,
/// provisional and invoice — because they differ in rules, not in shape.
///
/// <para>
/// Documents convert along a chain (order → provisional → invoice) and each keeps a link back
/// to what it came from. That chain is why a cost booked on a provisional still appears on the
/// final it became.
/// </para>
/// </summary>
public sealed class Invoice
{
    public required string Id { get; init; }

    /// <summary>Auto-generated, e.g. 'PO-2026-0001'. Editable only while DRAFT.</summary>
    public required string InvoiceNumber { get; set; }

    public InvoiceType InvoiceType { get; init; }
    public DateTimeOffset InvoiceDate { get; set; }

    public required string ContractId { get; init; }
    public Contract? Contract { get; init; }

    /// <summary>Taken from the contract at creation; immutable after.</summary>
    public required string CustomerId { get; init; }
    public Customer? Customer { get; init; }

    public InvoiceStatus Status { get; set; } = InvoiceStatus.DRAFT;
    public Currency Currency { get; set; } = Currency.USD;

    /// <summary>Foreign units per 1 USD; 1 when the currency is USD.</summary>
    public decimal ExchangeRate { get; set; } = 1m;

    public string? Description { get; set; }

    /// <summary>The document this one was converted FROM.</summary>
    public string? RefInvoiceId { get; set; }
    public Invoice? RefInvoice { get; init; }

    public DateTimeOffset? SentAt { get; set; }

    // Persisted totals, recomputed on every line change.
    public decimal TotalAmount { get; set; }
    public decimal TotalDiscount { get; set; }
    public decimal TotalWeightMt { get; set; }

    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;

    public ICollection<InvoiceItem> Items { get; init; } = [];
}

/// <summary>One priced line on a trade document.</summary>
public sealed class InvoiceItem
{
    public required string Id { get; init; }
    public required string InvoiceId { get; init; }
    public Invoice? Invoice { get; init; }

    public required string ContractItemId { get; init; }
    public ContractItem? ContractItem { get; init; }

    /// <summary>
    /// Chain-stable identity that survives provisional→final conversion and re-adding a line
    /// after deleting it.
    ///
    /// <para>
    /// This, not <see cref="Id"/>, is what warehouse movements, payment allocations, charge
    /// allocations and claim items key on. <see cref="Id"/> points at one concrete row and
    /// changes when a document converts; this one does not, which is the whole reason costs
    /// booked on a provisional are still attached to the invoice it becomes.
    /// </para>
    /// </summary>
    public required string ReferenceDocumentItemId { get; set; }

    public required string Product { get; set; }
    public decimal QuantityMt { get; set; }

    // Copied from the contract line when the line is added; read-only on every document type.
    public decimal LmePercent { get; set; }
    public bool LmeFixed { get; set; }

    /// <summary>The contract line's locked LME price.</summary>
    public decimal FixedPrice { get; set; }

    public decimal Premium { get; set; }

    /// <summary>The LME quotation used for a floating line. Set on provisional and final documents.</summary>
    public decimal? LmePrice { get; set; }

    public DateTimeOffset? LmeDate { get; set; }

    /// <summary>0–100.</summary>
    public decimal? DiscountPercent { get; set; }

    /// <summary>Line value in the document's currency. Zero while a floating line has no quotation.</summary>
    public decimal Amount { get; set; }

    /// <summary>Which container carried this line. Optional while drafting.</summary>
    public string? ContainerId { get; set; }
    public Container? Container { get; init; }

    public string? Description { get; set; }
}

/// <summary>Goods in (receipt) or goods out (issue), against a confirmed final invoice.</summary>
public sealed class InventoryDocument
{
    public required string Id { get; init; }

    /// <summary>'GRN-2026-0001' for a receipt, 'GDN-2026-0001' for an issue.</summary>
    public required string DocNumber { get; set; }

    public required string WarehouseId { get; init; }
    public Warehouse? Warehouse { get; init; }

    /// <summary>The final invoice that produced this movement.</summary>
    public string? InvoiceId { get; init; }
    public Invoice? Invoice { get; init; }

    public InventoryDocType Type { get; init; }
    public DateTimeOffset Date { get; set; }
    public DocumentStatus Status { get; set; } = DocumentStatus.CONFIRMED;
    public string? Notes { get; set; }

    public ICollection<InventoryDocumentItem> Items { get; init; } = [];
}

/// <summary>One movement line.</summary>
public sealed class InventoryDocumentItem
{
    public required string Id { get; init; }
    public required string DocumentId { get; init; }
    public InventoryDocument? Document { get; init; }

    /// <summary>The concrete invoice line, when there is one.</summary>
    public string? InvoiceItemId { get; init; }

    /// <summary>
    /// The chain-stable identity of the invoice line this receives or issues against — and the
    /// dedupe key. Deliberately different from <see cref="InvoiceItemId"/>, which points at one
    /// row: a movement recorded against a provisional must still count against the final.
    /// </summary>
    public required string ReferenceDocumentItemId { get; set; }

    public required string Product { get; set; }
    public decimal QuantityMt { get; set; }
}
