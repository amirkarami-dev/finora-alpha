using Finora.Erp.Domain;
using Finora.Erp.Infrastructure.Money;

namespace Finora.UnitTests;

/// <summary>
/// The money arithmetic, driven directly.
///
/// <para>
/// These pin the rules that a reimplementation gets wrong quietly — where the wrong answer is a
/// plausible number rather than an exception. Each one fails if its rule is written the other,
/// equally reasonable-looking way.
/// </para>
/// </summary>
public sealed class PaymentMathTests
{
    private const decimal AedPerUsd = 3.6725m;

    private static Payment Header(Currency currency, decimal amount, decimal headerFxRate) => new()
    {
        Id = "NIZ001",
        CustomerId = "cust-am",
        Currency = currency,
        Amount = amount,
        FxRate = headerFxRate,
    };

    [Fact]
    public void A_header_converts_through_the_global_rate_not_its_own_column()
    {
        // What the SPA actually posts: AED 36,725 with fxRate 1, because the header form has no
        // rate field and never has had one.
        var payment = Header(Currency.AED, 36725m, headerFxRate: 1m);

        var usd = PaymentMath.HeaderUsd(payment, AedPerUsd);

        // 36,725 / 3.6725 = 10,000.00. Through the header's own stored rate it would be
        // 36,725 / 1 = 36,725.00 — the amount not converted at all, and 3.67x too large. It then
        // fails the confirm gate against lines that are correctly converted, so an AED payment
        // could never be confirmed at all.
        Assert.Equal(10000m, usd);
        Assert.NotEqual(payment.Amount / payment.FxRate, usd);
    }

    [Fact]
    public void A_dollar_header_is_the_case_where_both_rules_agree()
    {
        var payment = Header(Currency.USD, 10000m, headerFxRate: 1m);

        // Which is exactly why the wrong rule survives testing: for USD the global rate IS 1, so
        // the two implementations are indistinguishable here and only here.
        Assert.Equal(10000m, PaymentMath.HeaderUsd(payment, AedPerUsd));
        Assert.Equal(payment.Amount / payment.FxRate, PaymentMath.HeaderUsd(payment, AedPerUsd));
    }

    [Fact]
    public void A_line_converts_through_its_own_rate_and_a_header_does_not()
    {
        // The asymmetry, in one test: same currency, same amount, different answers, on purpose.
        // A line records a movement whose rate was agreed at the time; a header is a control
        // total in the currency the money arrived in.
        var payment = Header(Currency.AED, 3700m, headerFxRate: 1m);

        var headerUsd = PaymentMath.HeaderUsd(payment, AedPerUsd);   // via 3.6725
        var lineUsd = PaymentMath.LineUsd(3700m, lineFxRate: 3.70m); // via the typed 3.70

        Assert.Equal(1007.49m, headerUsd);
        Assert.Equal(1000m, lineUsd);
    }

    [Fact]
    public void An_iraqi_dinar_payment_uses_the_fixed_rate_not_the_dirham_one()
    {
        var payment = Header(Currency.IQD, 13100000m, headerFxRate: 1m);

        Assert.Equal(10000m, PaymentMath.HeaderUsd(payment, AedPerUsd));
    }

    [Fact]
    public void Only_a_paid_cheque_counts_as_honoured()
    {
        static Cheque WithStatus(ChequeStatus status) => new()
        {
            Id = "chq-1", Number = "000123", BankName = "ENBD", OwnerName = "Alco", Status = status,
        };

        Assert.True(PaymentMath.IsChequeHonoured(WithStatus(ChequeStatus.PAID)));

        // The four that are not PAID all mean the money has not arrived. RETURNED is the one that
        // matters: written as "PENDING means unpaid", a bounced cheque books at full value and
        // nets the debt to zero, removing it from the balance the desk works from.
        foreach (var status in new[]
                 {
                     ChequeStatus.PENDING, ChequeStatus.EXPIRED,
                     ChequeStatus.RETURNED, ChequeStatus.CHANGED,
                 })
        {
            Assert.False(PaymentMath.IsChequeHonoured(WithStatus(status)), $"{status} is not paid");
        }

        // A line pointing at a cheque that is not there books nothing rather than throwing —
        // the SPA reads it through an optional chain, and that is the spec.
        Assert.False(PaymentMath.IsChequeHonoured(null));
    }

    [Fact]
    public void A_draft_payment_reserves_nothing_but_a_confirmed_one_does()
    {
        static Payment WithAllocation(string id, PaymentStatus status, decimal usd) => new()
        {
            Id = id,
            CustomerId = "cust-am",
            Status = status,
            Items =
            [
                new PaymentItem
                {
                    Id = $"{id}-line", PaymentId = id,
                    Allocations =
                    [
                        new PaymentItemAllocation
                        {
                            Id = $"{id}-alloc", PaymentItemId = $"{id}-line",
                            InvoiceItemId = "invitem-1", ReferenceDocumentItemId = "ref-1",
                            Product = "98% Copper Ingots", AmountUSD = usd,
                        },
                    ],
                },
            ],
        };

        var draft = WithAllocation("NIZ001", PaymentStatus.DRAFT, 400m);
        var confirmed = WithAllocation("NIZ002", PaymentStatus.CONFIRMED, 300m);
        Payment[] all = [draft, confirmed];

        // Only the confirmed 300 is counted against the 1,000 owed.
        Assert.Equal(700m, PaymentMath.InvoiceItemRemainingUsd(all, "invitem-1", 1000m, null));

        // And a payment never counts against itself, or re-saving an unchanged line would find
        // itself already allocated and refuse.
        Assert.Equal(1000m, PaymentMath.InvoiceItemRemainingUsd(all, "invitem-1", 1000m, "NIZ002"));
    }

    [Fact]
    public void Auto_fill_pays_the_invoices_lines_in_order_until_the_money_runs_out()
    {
        var invoice = new Invoice
        {
            Id = "inv-si-0001", InvoiceNumber = "SI-2026-0001",
            ContractId = "ctr-1", CustomerId = "cust-am",
            Items =
            [
                new InvoiceItem { Id = "a", InvoiceId = "inv-si-0001", ContractItemId = "item-1", Product = "First", Amount = 300m, ReferenceDocumentItemId = "ref-a" },
                new InvoiceItem { Id = "b", InvoiceId = "inv-si-0001", ContractItemId = "item-1", Product = "Second", Amount = 300m, ReferenceDocumentItemId = "ref-b" },
                new InvoiceItem { Id = "c", InvoiceId = "inv-si-0001", ContractItemId = "item-1", Product = "Third", Amount = 300m, ReferenceDocumentItemId = "ref-c" },
            ],
        };

        var filled = PaymentMath.AutoFillAllocations(invoice, 500m, [], null);

        // 300 to the first, 200 to the second, nothing to the third — first to last, each taking
        // what it still owes. A set-based split that loses the invoice's line order produces a
        // different and equally plausible answer.
        Assert.Equal(2, filled.Count);
        Assert.Equal(("a", 300m), filled[0]);
        Assert.Equal(("b", 200m), filled[1]);
    }
}
