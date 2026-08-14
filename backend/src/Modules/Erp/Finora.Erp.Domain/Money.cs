using System.Text.Json.Serialization;

namespace Finora.Erp.Domain;

// Money: payments and how they land on documents, cheques, transfers between the company's own
// accounts, and exchange gains and losses.

/// <summary>
/// Money moved with one person, on one date.
///
/// <para>
/// The header is a control total: the user declares an amount and a currency, and the lines are
/// checked against it. Every balance reads the LINES, not the header — which is why a payment
/// only counts once it is CONFIRMED, and why confirming is refused while the two disagree.
/// </para>
/// </summary>
public sealed class Payment
{
    public required string Id { get; init; }

    /// <summary>Settable, unlike a contract's: nothing copies a payment's person at creation, so
    /// moving one to the right person on a header edit orphans nothing.</summary>
    public required string CustomerId { get; set; }
    [JsonIgnore] public Customer? Customer { get; init; }

    public DateTimeOffset Date { get; set; }
    public Currency Currency { get; set; }
    public decimal Amount { get; set; }

    /// <summary>Foreign units per 1 USD; 1 when the currency is USD.</summary>
    public decimal FxRate { get; set; } = 1m;

    public decimal AmountUSD { get; set; }
    public PaymentMethod Method { get; set; }

    /// <summary>The document or container reference this settles, for the eye rather than for a join.</summary>
    public string? Reference { get; set; }

    public string? Notes { get; set; }

    /// <summary>Set only on the legacy single-shot flow; the header/lines flow leaves it null
    /// and each LINE names its own document.</summary>
    public string? InvoiceId { get; init; }

    /// <summary>
    /// Which way the money went. Derived from the linked invoice when there is one, and taken
    /// from the user for money on account, which has no document to ask.
    /// </summary>
    public MoneyDirection Direction { get; set; } = MoneyDirection.IN;

    /// <summary>
    /// Whether this settles a document or is money on account, AS STORED — null when the caller
    /// never said, which is the legacy single-shot shape.
    ///
    /// <para>
    /// This is the discriminator for <see cref="Items"/>, and it is this rather than
    /// <see cref="Status"/> because it is written once, at creation, and never again. A status is
    /// written every time somebody confirms or reopens a payment; keying the shape on it means
    /// the first reopen of a single-shot payment destroys the one bit that said it has no lines,
    /// and the payment can then never be confirmed again — its money leaving every balance while
    /// it sits in a draft nobody can clear.
    /// </para>
    ///
    /// <para>Sent as <c>type</c> and omitted when null, so the SPA reads it exactly as it wrote
    /// it and derives the meaning itself.</para>
    /// </summary>
    [JsonPropertyName("type")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public PaymentType? RawType { get; set; }

    /// <summary>
    /// What the type MEANS, derived the way <c>api.ts</c> derives it:
    /// <c>p.type ?? (p.invoiceId ? 'INVOICE' : 'GENERAL')</c>.
    ///
    /// <para>A fixed default of INVOICE reads harmless and flips a validation branch — money on
    /// account would start demanding a document on every line (<c>invoice-required</c>) when the
    /// rule is that it must refuse one (<c>invoice-not-allowed</c>).</para>
    /// </summary>
    [JsonIgnore]
    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    public PaymentType Type =>
        RawType ?? (InvoiceId is null ? PaymentType.GENERAL : PaymentType.INVOICE);

    /// <summary>
    /// Null means the header IS the settlement — the legacy single-shot shape.
    ///
    /// <para>
    /// Optional on purpose, mirroring <c>Payment.status?</c> in the SPA's types. The single-shot
    /// flow writes no status at all (<c>status: input.type ? 'DRAFT' : undefined</c>), and the
    /// reader treats the absence as CONFIRMED — read <see cref="EffectiveStatus"/>, never this,
    /// when deciding whether money counts. A payment read as DRAFT is skipped by every balance in
    /// the application, so getting this wrong removes real money from the customer's balance, the
    /// ageing buckets, the account movement report and the portal, with no error anywhere.
    /// </para>
    ///
    /// <para>
    /// </para>
    /// </summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public PaymentStatus? Status { get; set; }

    /// <summary>What the status MEANS: a payment that never named one is money already recorded.</summary>
    [JsonIgnore]
    public PaymentStatus EffectiveStatus => Status ?? PaymentStatus.CONFIRMED;

    /// <summary>
    /// The settlement lines, or null when the header itself is the settlement.
    ///
    /// <para>
    /// Three states, not two. <c>null</c> is "this payment has no lines and never will" — it
    /// skips the empty-lines and header-versus-lines checks entirely, because there is nothing to
    /// check against. An empty list is "lines flow here, none entered yet", which must refuse to
    /// confirm. Collapsing the two makes every legacy payment unconfirmable.
    ///
    /// <para>Which of the two a stored row is comes from <see cref="RawType"/>, not from the
    /// status — see there.</para>
    /// </para>
    /// </summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public ICollection<PaymentItem>? Items { get; set; } = [];
}

/// <summary>One settlement line, carrying its own currency, rate and method.</summary>
public sealed class PaymentItem
{
    public required string Id { get; init; }
    public required string PaymentId { get; init; }
    [JsonIgnore] public Payment? Payment { get; init; }

    /// <summary>The document this line settles. Absent on a general payment's lines, which
    /// settle nothing in particular and take their side from the header's direction.</summary>
    public string? InvoiceId { get; init; }
    [JsonIgnore] public Invoice? Invoice { get; init; }

    public DateTimeOffset Date { get; set; }

    /// <summary>The sum of this line's allocations.</summary>
    public decimal Amount { get; set; }

    public Currency Currency { get; set; }
    public decimal FxRate { get; set; } = 1m;
    public decimal AmountUSD { get; set; }
    public PaymentMethod Method { get; set; }

    /// <summary>Which company account the money moved through. Required for TT and Cash — a
    /// bank transfer names a bank and a cash payment names a safe, and pointing one at the
    /// other would make the two impossible to tell apart in any balance.</summary>
    public string? BankAccountId { get; set; }
    [JsonIgnore] public FinancialAccount? BankAccount { get; init; }

    /// <summary>Required for a cheque line. Points at a shared cheque rather than embedding its
    /// fields, because one cheque may settle lines on several invoices.</summary>
    public string? ChequeId { get; set; }
    [JsonIgnore] public Cheque? Cheque { get; init; }

    public ICollection<PaymentItemAllocation> Allocations { get; init; } = [];
}

/// <summary>
/// How much of a payment line lands on one invoice line. Filled from the first line down, each
/// taking only what it still owes, unless the user types a split.
/// </summary>
public sealed class PaymentItemAllocation
{
    public required string Id { get; init; }
    public required string PaymentItemId { get; init; }
    [JsonIgnore] public PaymentItem? PaymentItem { get; init; }

    public required string InvoiceItemId { get; init; }

    /// <summary>Chain-stable key — see <see cref="InvoiceItem.ReferenceDocumentItemId"/>.</summary>
    public required string ReferenceDocumentItemId { get; set; }

    /// <summary>Snapshot of the product name, so a settled allocation still reads correctly
    /// after the line it paid was renamed.</summary>
    public required string Product { get; set; }

    public decimal Amount { get; set; }
    public decimal AmountUSD { get; set; }
}

/// <summary>
/// A cheque. Its own record rather than a field on a payment, because one cheque can settle
/// lines on several invoices.
/// </summary>
public sealed class Cheque
{
    public required string Id { get; init; }
    public ChequeType Type { get; set; }
    public required string Number { get; set; }

    /// <summary>The issuing bank as written on the cheque. Free text, because a cheque received
    /// from a customer is drawn on THEIR bank. Numbers are unique per issuing bank: two banks
    /// may legitimately issue the same number.</summary>
    public required string BankName { get; set; }

    public DateTimeOffset DueDate { get; set; }
    public decimal Amount { get; set; }
    public Currency Currency { get; set; }
    public required string OwnerName { get; set; }

    /// <summary>The company account it cleared through. Set when the status becomes PAID and
    /// cleared when it leaves PAID — otherwise an uncleared cheque would keep reporting a bank.</summary>
    public string? BankAccountId { get; set; }
    [JsonIgnore] public FinancialAccount? BankAccount { get; init; }

    public ChequeStatus Status { get; set; } = ChequeStatus.PENDING;
    public string? Notes { get; set; }
}

/// <summary>
/// Money moved between the company's own accounts. Needs no invoice, no contract and no person;
/// parts of it may be linked to documents afterwards, or never.
/// </summary>
public sealed class MoneyTransfer
{
    public required string Id { get; init; }
    public required string Number { get; set; }
    public DateTimeOffset Date { get; set; }

    public required string FromAccountId { get; init; }
    [JsonIgnore] public FinancialAccount? FromAccount { get; init; }

    public required string ToAccountId { get; init; }
    [JsonIgnore] public FinancialAccount? ToAccount { get; init; }

    public Currency FromCurrency { get; init; }
    public Currency ToCurrency { get; init; }
    public decimal FromAmount { get; set; }
    public decimal ToAmount { get; set; }

    /// <summary>
    /// Destination units per source unit: <c>toAmount = fromAmount × rate</c>, and 1 for a
    /// same-currency transfer. Note this is the one rate in the system NOT expressed as foreign
    /// units per USD — the form asks for the familiar USD quote and converts before saving.
    /// </summary>
    public decimal ExchangeRate { get; set; } = 1m;

    /// <summary>What left the company, measured in USD.</summary>
    public decimal BaseAmount { get; set; }

    public TransferStatus Status { get; set; } = TransferStatus.DRAFT;
    public string? Notes { get; set; }

    public ICollection<MoneyTransferAllocation> Allocations { get; init; } = [];
}

/// <summary>Optionally ties part of a transfer to a document. A transfer may span several, and
/// may be left partly or wholly unallocated.</summary>
public sealed class MoneyTransferAllocation
{
    public required string Id { get; init; }
    public required string TransferId { get; init; }
    [JsonIgnore] public MoneyTransfer? Transfer { get; init; }

    public string? InvoiceId { get; init; }
    public string? InvoiceItemId { get; init; }

    public decimal Amount { get; set; }
    public Currency Currency { get; set; }
    public decimal BaseAmount { get; set; }

    /// <summary>Always the company base, USD. Stored so a historic row still says what it meant.</summary>
    public Currency BaseCurrency { get; set; } = Currency.USD;
}

/// <summary>
/// A gain or loss on foreign currency, written down directly.
///
/// <para>
/// Deliberately not tied to an account, a rate or a balance. It replaced a revaluation engine
/// whose book rates, previews and proportional allocation answered a question the desk was not
/// asking. The type follows the sign of the amount rather than being chosen separately, so the
/// two can never disagree.
/// </para>
/// </summary>
public sealed class ExchangeGainLoss
{
    public required string Id { get; init; }
    public required string Number { get; set; }
    public DateTimeOffset Date { get; set; }

    public ExchangeGainLossType Type { get; set; }

    /// <summary>Signed USD: positive is a gain, negative a loss.</summary>
    public decimal Amount { get; set; }

    public string? Notes { get; set; }
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
}
