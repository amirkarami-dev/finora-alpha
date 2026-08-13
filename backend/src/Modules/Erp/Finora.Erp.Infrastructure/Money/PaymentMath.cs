using Finora.BuildingBlocks.Domain;
using Finora.Erp.Domain;

namespace Finora.Erp.Infrastructure.Money;

/// <summary>
/// The arithmetic of settling money, with no database in sight.
///
/// <para>
/// Separated from the service so the rules can be read without the persistence around them, and
/// so a test can drive them with a hand-built list. Every tolerance and every rounding decision
/// here is load-bearing and carries the reason it exists — several of them look like noise and
/// are the difference between a balance that reconciles and one that does not.
/// </para>
/// </summary>
internal static class PaymentMath
{
    /// <summary>
    /// Iraqi dinars per US dollar.
    ///
    /// <para>A constant, matching <c>DEFAULT_FX_IQD_PER_USD</c> in the SPA's constants. Unlike the
    /// dirham rate it is not user-editable, so it is not read from settings — if that ever
    /// changes, both sides change together or IQD payments silently disagree across the wire.</para>
    /// </summary>
    public const decimal IqdPerUsd = 1310m;

    /// <summary>
    /// A cent of slack when comparing a header against its lines.
    ///
    /// <para>Two independent conversions each round to 2dp, so they can legitimately land a cent
    /// apart on money that balances exactly.</para>
    /// </summary>
    public const decimal HeaderLinesTolerance = 0.01m;

    /// <summary>
    /// Half a cent, for comparing one converted amount against another.
    ///
    /// <para>Deliberately tighter than <see cref="HeaderLinesTolerance"/> and deliberately not the
    /// same number: this compares a single allocation against a single remaining balance, where
    /// only one rounding has happened.</para>
    /// </summary>
    public const decimal AllocationTolerance = 0.005m;

    /// <summary>
    /// Units of <paramref name="currency"/> per 1 USD, from the rates the rest of the
    /// application converts with.
    ///
    /// <para>
    /// Takes a CURRENCY, not a payment — and that is the whole point. The header carries its own
    /// <c>FxRate</c> column, and converting the header through it instead of through this is the
    /// single most plausible mistake in this file. The two agree exactly for USD, which is why
    /// the wrong version passes every dollar test and then misprices every dirham payment: the
    /// SPA posts <c>fxRate: 1</c> on every header regardless of currency, and no code path can
    /// change it, so an AED header converted through its own rate is not converted at all.
    /// </para>
    /// </summary>
    public static decimal UnitsPerUsd(Currency currency, decimal aedPerUsd) => currency switch
    {
        Currency.USD => 1m,
        Currency.AED => aedPerUsd,
        _ => IqdPerUsd,
    };

    /// <summary>The header's declared control total, in USD — what the person actually handed over.</summary>
    public static decimal HeaderUsd(Payment payment, decimal aedPerUsd)
    {
        ArgumentNullException.ThrowIfNull(payment);
        return Rounding.Money(payment.Amount / UnitsPerUsd(payment.Currency, aedPerUsd));
    }

    /// <summary>What the lines actually settle, in USD — what every balance downstream reads.</summary>
    public static decimal LinesUsd(Payment payment)
    {
        ArgumentNullException.ThrowIfNull(payment);
        return Rounding.Money(payment.Items.Sum(item => item.AmountUSD));
    }

    /// <summary>
    /// A line converts through the rate the USER typed on that line, not through the global one.
    ///
    /// <para>The opposite of <see cref="HeaderUsd"/>, and the asymmetry is deliberate: a header is
    /// a control total in the currency the money arrived in, while a line records an actual
    /// movement whose rate was agreed at the time. Using one rule for both collapses that.</para>
    /// </summary>
    public static decimal LineUsd(decimal amount, decimal lineFxRate) =>
        Rounding.Money(amount / lineFxRate);

    /// <summary>Only CONFIRMED money moves a balance — the single predicate every aggregate goes through.</summary>
    public static bool IsSettled(Payment payment)
    {
        ArgumentNullException.ThrowIfNull(payment);
        return payment.Status == PaymentStatus.CONFIRMED;
    }

    /// <summary>
    /// What one invoice line still owes, in USD.
    ///
    /// <para>
    /// Counts allocations from CONFIRMED payments only, and skips the payment being edited
    /// entirely. Both halves matter and for different reasons: without the CONFIRMED filter a
    /// half-finished draft would reserve money it has not settled; without the exclusion,
    /// re-saving a line unchanged would find itself already allocated and refuse.
    /// </para>
    ///
    /// <para>
    /// Two open drafts can therefore each be validated against the full outstanding, and together
    /// exceed it. That is not an oversight — it is why <c>SetStatusAsync</c> re-checks at confirm
    /// time, which is the moment the money becomes real.
    /// </para>
    /// </summary>
    public static decimal InvoiceItemRemainingUsd(
        IReadOnlyCollection<Payment> allPayments,
        string invoiceItemId,
        decimal invoiceItemAmount,
        string? excludePaymentId)
    {
        ArgumentNullException.ThrowIfNull(allPayments);

        var allocated = 0m;
        foreach (var payment in allPayments)
        {
            if (payment.Id == excludePaymentId || !IsSettled(payment))
            {
                continue;
            }

            foreach (var line in payment.Items)
            {
                foreach (var allocation in line.Allocations)
                {
                    if (allocation.InvoiceItemId == invoiceItemId)
                    {
                        allocated += allocation.AmountUSD;
                    }
                }
            }
        }

        return Rounding.Money(Math.Max(invoiceItemAmount - allocated, 0m));
    }

    /// <summary>
    /// Spreads a line's amount across an invoice's lines, first to last, each taking only what it
    /// still owes.
    ///
    /// <para>
    /// Order is the specification — "start from item 1 to end" — so the invoice's own line order
    /// decides who gets paid, and a set-based implementation that loses that order produces a
    /// different, equally plausible split.
    /// </para>
    ///
    /// <para>
    /// Works in USD and leaves the caller to convert back. That round trip quantises: a
    /// non-dollar line converts to USD at 2dp, splits, and converts each part back, so the parts
    /// can miss the line total by a cent or two — which is what <see cref="AllocationTolerance"/>
    /// absorbs. Splitting in the line's own currency instead would avoid it, and would also stop
    /// matching what every stored allocation was written with.
    /// </para>
    /// </summary>
    public static List<(string InvoiceItemId, decimal AmountUsd)> AutoFillAllocations(
        Invoice invoice,
        decimal amountUsd,
        IReadOnlyCollection<Payment> allPayments,
        string? excludePaymentId)
    {
        ArgumentNullException.ThrowIfNull(invoice);

        var left = Rounding.Money(amountUsd);
        var filled = new List<(string, decimal)>();

        foreach (var item in invoice.Items)
        {
            if (left <= 0m)
            {
                break;
            }

            var owed = InvoiceItemRemainingUsd(allPayments, item.Id, item.Amount, excludePaymentId);
            if (owed <= 0m)
            {
                continue;
            }

            var take = Rounding.Money(Math.Min(owed, left));
            filled.Add((item.Id, take));
            left = Rounding.Money(left - take);
        }

        return filled;
    }

    /// <summary>
    /// Whether a cheque line has actually been honoured.
    ///
    /// <para>
    /// PAID and only PAID. There are five statuses, and the four that are not PAID — PENDING,
    /// EXPIRED, RETURNED, CHANGED — all mean the money has not arrived. Writing this as
    /// "PENDING means unpaid" gets three of them backwards, and the one that matters most is
    /// RETURNED: a bounced cheque would be booked at full value, netting the debt to zero and
    /// removing it from the balance the desk works from.
    /// </para>
    ///
    /// <para>
    /// A null cheque is unpaid too, not an error — the SPA reads it through an optional chain, so
    /// a line pointing at a cheque that is not there books nothing rather than throwing.
    /// </para>
    /// </summary>
    public static bool IsChequeHonoured(Cheque? cheque) => cheque?.Status == ChequeStatus.PAID;

    /// <summary>
    /// Which kind of account a method must name.
    ///
    /// <para>TT moves through a bank and Cash through a safe, and both name the account in the
    /// SAME field — so only the account's own type tells them apart. Without this check a cash
    /// line could name a bank, and the two become indistinguishable in every balance and report
    /// that reads the field. Offset and Credit Note move no money and name nothing.</para>
    /// </summary>
    public static FinancialAccountType? RequiredAccountType(PaymentMethod method) => method switch
    {
        PaymentMethod.TT => FinancialAccountType.BANK,
        PaymentMethod.Cash => FinancialAccountType.CASH_SAFE,
        _ => null,
    };
}
