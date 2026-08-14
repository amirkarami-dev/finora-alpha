using Finora.Erp.Domain;

namespace Finora.Erp.Application;

/// <summary>
/// What the trading desk sends when money moves.
///
/// <para>
/// Optional properties are optional deliberately, and each one means something the caller cannot
/// express any other way — see the remarks on each.
/// </para>
/// </summary>
public sealed record PaymentInput
{
    public required string CustomerId { get; init; }
    public required DateTimeOffset Date { get; init; }
    public required decimal Amount { get; init; }
    public required Currency Currency { get; init; }

    /// <summary>Units per USD as the caller declares them. Forced to 1 for USD.</summary>
    public decimal FxRate { get; init; } = 1m;

    public required PaymentMethod Method { get; init; }

    /// <summary>The document this settles, on the legacy single-shot flow. When present it also
    /// decides the direction, and the header takes the invoice's number as its reference.</summary>
    public string? InvoiceId { get; init; }

    public string? Notes { get; init; }

    /// <summary>
    /// Which way money on account moved. Ignored when an invoice is named, because the document
    /// already answers it; required in practice otherwise, since defaulting it puts every
    /// supplier prepayment on the wrong side of that person's balance.
    /// </summary>
    public MoneyDirection? Direction { get; init; }

    /// <summary>
    /// Naming a type opts into the header-and-lines flow: the payment starts as a DRAFT with an
    /// empty line collection. Omitting it is the single-shot flow, which is settled on arrival
    /// and whose header IS the settlement — it gets no status and no lines at all.
    /// </summary>
    public PaymentType? Type { get; init; }
}

/// <summary>Header edits. The amount stays the user's declared control total.</summary>
public sealed record PaymentHeaderInput
{
    public required string CustomerId { get; init; }
    public required DateTimeOffset Date { get; init; }
    public required decimal Amount { get; init; }
    public required Currency Currency { get; init; }
    public string? Notes { get; init; }
}

/// <summary>One settlement line.</summary>
public sealed record PaymentItemInput
{
    /// <summary>Required on a payment that settles documents, refused on money on account.</summary>
    public string? InvoiceId { get; init; }

    public required DateTimeOffset Date { get; init; }
    public required decimal Amount { get; init; }
    public required Currency Currency { get; init; }
    public decimal FxRate { get; init; } = 1m;
    public required PaymentMethod Method { get; init; }

    /// <summary>The bank (TT) or safe (Cash) the money moved through.</summary>
    public string? BankAccountId { get; init; }

    /// <summary>An EXISTING cheque, when editing a line that already has one.</summary>
    public string? ChequeId { get; init; }

    /// <summary>A NEW cheque to create with this line. Cheques are born here rather than picked,
    /// so every cheque in the register exists because somebody was paid with it.</summary>
    public ChequeInput? Cheque { get; init; }

    /// <summary>The split across the invoice's lines. Omitted means fill from the first line
    /// down, each taking what it still owes until the line's amount runs out.</summary>
    public IReadOnlyList<AllocationInput>? Allocations { get; init; }
}

public sealed record AllocationInput
{
    public required string InvoiceItemId { get; init; }
    public required decimal Amount { get; init; }
}

public sealed record ChequeInput
{
    public ChequeType Type { get; init; }
    public required string Number { get; init; }
    public required string BankName { get; init; }
    public required DateTimeOffset DueDate { get; init; }
    public required decimal Amount { get; init; }
    public required Currency Currency { get; init; }
    public required string OwnerName { get; init; }
    public string? Notes { get; init; }
}

/// <summary>Where a cheque now stands, and — when it is PAID — which account it landed in.</summary>
public sealed record ChequeStatusInput
{
    public required ChequeStatus Status { get; init; }
    public string? BankAccountId { get; init; }
}

public sealed record PaymentStatusInput
{
    public required PaymentStatus Status { get; init; }
}
