using Finora.BuildingBlocks.Domain;
using Finora.Erp.Application;
using Finora.Erp.Domain;
using Microsoft.EntityFrameworkCore;

namespace Finora.Erp.Infrastructure.Money;

/// <summary>
/// Payments, their lines, the split of each line across an invoice, and the cheques that settle
/// them.
///
/// <para>
/// A header is a control total: the person declares what they handed over, the lines say where
/// it went, and confirming is refused while the two disagree. Every balance in the application
/// reads the LINES, which is why nothing counts until the payment is CONFIRMED.
/// </para>
/// </summary>
public sealed class PaymentService(ErpDbContext db)
{
    internal static class Codes
    {
        public const string PaymentNotFound = "payment-not-found";
        public const string PaymentConfirmed = "payment-confirmed";
        public const string PaymentItemNotFound = "payment-item-not-found";
        public const string PersonNotFound = "person-not-found";
        public const string DateRequired = "date-required";
        public const string InvalidAmount = "invalid-amount";
        public const string InvalidFx = "invalid-fx";
        public const string NoPaymentItems = "no-payment-items";
        public const string PaymentTotalMismatch = "payment-total-mismatch";

        public const string InvoiceRequired = "invoice-required";
        public const string InvoiceNotFound = "invoice-not-found";
        public const string InvoiceNotAllowed = "invoice-not-allowed";
        public const string AllocationsNotAllowed = "allocations-not-allowed";
        public const string AllocationsRequired = "allocations-required";
        public const string ItemNotOnInvoice = "item-not-on-invoice";
        public const string DuplicateAllocation = "duplicate-allocation";
        public const string InvalidAllocationAmount = "invalid-allocation-amount";
        public const string OverAllocated = "over-allocated";
        public const string AllocationMismatch = "allocation-mismatch";

        public const string BankAccountRequired = "bank-account-required";
        public const string BankAccountNotFound = "bank-account-not-found";
        public const string BankAccountInactive = "bank-account-inactive";
        public const string AccountTypeMismatch = "account-type-mismatch";

        public const string ChequeRequired = "cheque-required";
        public const string ChequeNotFound = "cheque-not-found";
        public const string ChequeNotPending = "cheque-not-pending";
        public const string NumberRequired = "number-required";
        public const string BankNameRequired = "bank-name-required";
        public const string OwnerRequired = "owner-required";
        public const string DueDateRequired = "due-date-required";
        public const string DuplicateChequeNumber = "duplicate-cheque-number";
    }

    /* ------------------------------- Payments -------------------------------- */

    public async Task<List<Payment>> ListAsync(CancellationToken cancellationToken = default)
    {
        var payments = await db.Payments
            .Include(p => p.Items!).ThenInclude(i => i.Allocations)
            .OrderBy(p => p.Id)
            .ToListAsync(cancellationToken);

        foreach (var payment in payments)
        {
            Shape(payment);
        }

        return payments;
    }

    /// <summary>
    /// Restores the third state, which neither the table nor the change tracker can hold.
    ///
    /// <para>
    /// A legacy payment has no lines and never will, but EF materialises an empty collection for
    /// it — and `Add` does the same to one created with null. Left alone, that empty list means
    /// "lines belong here and none were entered", so confirming answers `no-payment-items` and
    /// every single-shot payment becomes permanently unconfirmable. The absent status is what
    /// says which it is.
    /// </para>
    /// </summary>
    private static Payment Shape(Payment payment)
    {
        if (payment.RawType is null)
        {
            payment.Items = null;
            return payment;
        }

        // Ordered here rather than in the query, because an edited line is rebuilt and re-added,
        // which puts it last in the tracked collection while a fresh read has it wherever the
        // database happens to return it. The screen renders the collection as given, so without
        // this a line jumps to the bottom when you edit it and back on the next reload.
        payment.Items = [.. payment.Items!.OrderBy(i => LineOrder(i.Id))];
        return payment;
    }

    public async Task<Payment> CreateAsync(PaymentInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        // The same unguarded division the charge lines already close: a non-USD amount recorded
        // against a zero or negative rate produces an infinity that then poisons every aggregate
        // that sums payments.
        if (input.Currency != Currency.USD && input.FxRate is not > 0)
        {
            throw new DomainException(Codes.InvalidFx);
        }

        if (!await db.Customers.AnyAsync(c => c.Id == input.CustomerId, cancellationToken))
        {
            throw new DomainException(Codes.PersonNotFound);
        }

        var invoice = input.InvoiceId is null
            ? null
            : await db.Invoices.FirstOrDefaultAsync(i => i.Id == input.InvoiceId, cancellationToken);

        // A named document decides the direction by itself. Money on account does not — somebody
        // has to say whether it came in or went out, and defaulting it puts every supplier
        // prepayment on the wrong side of that person's balance.
        var direction = invoice is not null
            ? InvoiceMathSide(invoice.InvoiceType) == InvoiceSide.PURCHASE
                ? MoneyDirection.OUT
                : MoneyDirection.IN
            : input.Direction ?? MoneyDirection.IN;

        var amountUsd = input.Currency == Currency.USD
            ? input.Amount
            : Rounding.Money(input.Amount / input.FxRate!.Value);

        var payment = new Payment
        {
            Id = await NextPaymentIdAsync(cancellationToken),
            CustomerId = input.CustomerId,
            Date = input.Date,
            Currency = input.Currency,
            Amount = input.Amount,
            FxRate = input.FxRate ?? 1m,
            AmountUSD = amountUsd,
            Method = input.Method,
            Reference = invoice?.InvoiceNumber,
            Notes = input.Notes ?? string.Empty,
            InvoiceId = input.InvoiceId,
            Direction = direction,

            // Naming a type opts into the header-and-lines flow. Omitting it is the single-shot
            // flow, whose header IS the settlement: no status, no lines, and both absences are
            // read back as "already recorded" rather than as a draft with nothing on it.
            RawType = input.Type,
            Status = input.Type is null ? null : PaymentStatus.DRAFT,
            Items = input.Type is null ? null : [],
        };

        db.Payments.Add(payment);
        await db.SaveChangesAsync(cancellationToken);
        return Shape(payment);
    }

    public async Task<Payment> UpdateHeaderAsync(
        string id, PaymentHeaderInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        var payment = await LoadAsync(id, cancellationToken);
        RefuseWhenConfirmed(payment);

        if (input.Date == default)
        {
            throw new DomainException(Codes.DateRequired);
        }

        if (input.Amount <= 0)
        {
            throw new DomainException(Codes.InvalidAmount);
        }

        if (!await db.Customers.AnyAsync(c => c.Id == input.CustomerId, cancellationToken))
        {
            throw new DomainException(Codes.PersonNotFound);
        }

        payment.CustomerId = input.CustomerId;
        payment.Date = input.Date;
        payment.Amount = Rounding.Money(input.Amount);
        payment.Currency = input.Currency;
        payment.Notes = input.Notes?.Trim() ?? string.Empty;

        // With lines, the converted total belongs to the lines and is recomputed from them.
        // Without, the header's own conversion is all there is.
        if (payment.Items is null or { Count: 0 })
        {
            payment.AmountUSD = payment.Currency == Currency.USD
                ? payment.Amount
                : Rounding.Money(payment.Amount / payment.FxRate);
        }

        await db.SaveChangesAsync(cancellationToken);
        return payment;
    }

    /// <summary>
    /// DRAFT to CONFIRMED and back. Reversible on purpose — reopening is how a difference gets
    /// fixed, so it is never blocked.
    /// </summary>
    public async Task<Payment> SetStatusAsync(
        string id, PaymentStatus status, CancellationToken cancellationToken = default)
    {
        var payment = await LoadAsync(id, cancellationToken);

        // `Items is null` is the legacy single-shot shape, where the header itself is the
        // settlement. There is nothing to check it against, so both checks are skipped — exactly
        // as the browser skips them. Treating it as an empty list instead makes every one of
        // those payments permanently unconfirmable.
        if (status == PaymentStatus.CONFIRMED && payment.Items is not null)
        {
            if (payment.Items.Count == 0)
            {
                // Confirming a payment with nothing on it moves every balance by zero and still
                // reads as a real settlement in every report.
                throw new DomainException(Codes.NoPaymentItems);
            }

            var aedPerUsd = await AedPerUsdAsync(cancellationToken);
            var headerUsd = PaymentMath.HeaderUsd(payment, aedPerUsd);
            var linesUsd = PaymentMath.LinesUsd(payment);

            if (Math.Abs(linesUsd - headerUsd) > PaymentMath.HeaderLinesTolerance)
            {
                throw new DomainException(Codes.PaymentTotalMismatch, new Dictionary<string, object?>
                {
                    ["headerUSD"] = headerUsd,
                    ["linesUSD"] = linesUsd,
                });
            }
        }

        payment.Status = status;
        await db.SaveChangesAsync(cancellationToken);
        return payment;
    }

    /* ------------------------------ Payment lines ----------------------------- */

    public async Task<Payment> AddItemAsync(
        string paymentId, PaymentItemInput input, CancellationToken cancellationToken = default)
    {
        var payment = await LoadAsync(paymentId, cancellationToken);
        RefuseWhenConfirmed(payment);

        var line = await BuildItemAsync(payment, input, existing: null, cancellationToken);

        // Adding a line is what turns "the header IS the settlement" into "lines flow here", so
        // the shape is promoted with it. Without this the row is written and then hidden on every
        // read — the header's converted total silently re-based on a line nobody can see, and
        // confirming skipping the check that would have caught it.
        payment.RawType ??= payment.Type;
        (payment.Items ??= []).Add(line);

        RecomputeTotals(payment);
        await db.SaveChangesAsync(cancellationToken);
        return payment;
    }

    public async Task<Payment> UpdateItemAsync(
        string paymentId, string itemId, PaymentItemInput input,
        CancellationToken cancellationToken = default)
    {
        var payment = await LoadAsync(paymentId, cancellationToken);
        RefuseWhenConfirmed(payment);

        var existing = payment.Items?.FirstOrDefault(i => i.Id == itemId)
            ?? throw new DomainException(Codes.PaymentItemNotFound);

        // Everything is validated before anything is attached, so a rejected edit cannot leave
        // the payment half-changed. The rebuilt line keeps the old line's id.
        var rebuilt = await BuildItemAsync(payment, input, existing, cancellationToken);

        db.PaymentItemAllocations.RemoveRange(existing.Allocations);
        payment.Items!.Remove(existing);
        db.PaymentItems.Remove(existing);
        payment.Items.Add(rebuilt);

        RecomputeTotals(payment);
        await db.SaveChangesAsync(cancellationToken);
        return payment;
    }

    public async Task<Payment> RemoveItemAsync(
        string paymentId, string itemId, CancellationToken cancellationToken = default)
    {
        var payment = await LoadAsync(paymentId, cancellationToken);
        RefuseWhenConfirmed(payment);

        var line = payment.Items?.FirstOrDefault(i => i.Id == itemId);
        if (line is not null)
        {
            payment.Items!.Remove(line);
            db.PaymentItems.Remove(line);
            RecomputeTotals(payment);
            await db.SaveChangesAsync(cancellationToken);
        }

        return payment;
    }

    /// <summary>
    /// Builds one line, validating everything BEFORE anything is attached.
    ///
    /// <para>
    /// Guards in order: the payment's own shape (a document payment demands an invoice, money on
    /// account refuses one) → date → amount → rate → the account the method requires → the cheque
    /// → then the split, line by line.
    /// </para>
    /// </summary>
    private async Task<PaymentItem> BuildItemAsync(
        Payment payment, PaymentItemInput input, PaymentItem? existing,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(input);

        // Money on account settles no particular document, so its lines take no invoice and no
        // split. Refusing them rather than ignoring them means a caller sending the wrong shape
        // is told, instead of having half its input silently dropped.
        Invoice? invoice = null;
        if (payment.Type == PaymentType.GENERAL)
        {
            if (input.InvoiceId is not null)
            {
                throw new DomainException(Codes.InvoiceNotAllowed);
            }

            if (input.Allocations is { Count: > 0 })
            {
                throw new DomainException(Codes.AllocationsNotAllowed);
            }
        }
        else
        {
            if (string.IsNullOrWhiteSpace(input.InvoiceId))
            {
                throw new DomainException(Codes.InvoiceRequired);
            }

            invoice = await db.Invoices
                .Include(i => i.Items)
                .FirstOrDefaultAsync(i => i.Id == input.InvoiceId, cancellationToken)
                ?? throw new DomainException(Codes.InvoiceNotFound);
        }

        if (input.Date == default)
        {
            throw new DomainException(Codes.DateRequired);
        }

        if (input.Amount <= 0)
        {
            throw new DomainException(Codes.InvalidAmount);
        }

        var fxRate = 1m;
        if (input.Currency != Currency.USD)
        {
            // An omitted rate is refused, not read as 1. Defaulted, a dirham line books its
            // amount verbatim as dollars — 3.67x too much — with nothing to show it happened.
            if (input.FxRate is not > 0)
            {
                throw new DomainException(Codes.InvalidFx);
            }

            fxRate = input.FxRate.Value;
        }

        // TT moves money through a bank and Cash through a safe, and both name the account in the
        // same field — so only the account's own type tells them apart.
        var requiredType = PaymentMath.RequiredAccountType(input.Method);
        if (requiredType is not null)
        {
            if (string.IsNullOrWhiteSpace(input.BankAccountId))
            {
                throw new DomainException(Codes.BankAccountRequired);
            }

            var account = await db.FinancialAccounts
                .FirstOrDefaultAsync(a => a.Id == input.BankAccountId, cancellationToken)
                ?? throw new DomainException(Codes.BankAccountNotFound);

            if (!account.Active)
            {
                throw new DomainException(Codes.BankAccountInactive);
            }

            if (account.Type != requiredType)
            {
                throw new DomainException(Codes.AccountTypeMismatch);
            }
        }

        // A cheque line either points at one already in the register or carries a new one.
        // Validated HERE and minted at the very bottom, once the whole line is known to be good —
        // otherwise a rejected line leaves an orphan cheque behind.
        ChequeParts? chequeParts = null;
        if (input.Method == PaymentMethod.Cheque)
        {
            if (input.ChequeId is not null)
            {
                if (!await db.Cheques.AnyAsync(c => c.Id == input.ChequeId, cancellationToken))
                {
                    throw new DomainException(Codes.ChequeNotFound);
                }
            }
            else if (input.Cheque is not null)
            {
                chequeParts = await ValidateChequeAsync(input.Cheque, excludeId: null, cancellationToken);
            }
            else
            {
                throw new DomainException(Codes.ChequeRequired);
            }
        }

        var amount = Rounding.Money(input.Amount);
        var amountUsd = PaymentMath.LineUsd(amount, fxRate);
        var itemId = existing?.Id ?? await NextItemIdAsync(cancellationToken);

        var requested = new List<AllocationInput>();
        if (invoice is not null)
        {
            if (input.Allocations is not null)
            {
                requested.AddRange(input.Allocations);
            }
            else
            {
                var all = await ListAsync(cancellationToken);
                // Ordered before the walk. The order IS the rule — first line to last, each
                // taking what it owes — and a set returned by the database has no order at all;
                // it merely looks stable until a row is updated and moves.
                var ordered = new Invoice
                {
                    Id = invoice.Id, InvoiceNumber = invoice.InvoiceNumber,
                    ContractId = invoice.ContractId, CustomerId = invoice.CustomerId,
                    Items = [.. invoice.Items.OrderBy(i => LineOrder(i.Id))],
                };

                foreach (var (invoiceItemId, usd) in
                         PaymentMath.AutoFillAllocations(ordered, amountUsd, all, payment.Id))
                {
                    requested.Add(new AllocationInput
                    {
                        InvoiceItemId = invoiceItemId,
                        Amount = Rounding.Money(usd * fxRate),
                    });
                }
            }

            await ValidateAllocationsAsync(payment, invoice, requested, amount, fxRate, cancellationToken);
        }

        // Nothing below this point can throw, so the cheque is safe to mint.
        var chequeId = input.ChequeId;
        if (chequeParts is not null)
        {
            var minted = await MintChequeAsync(input.Cheque!, chequeParts, cancellationToken);
            chequeId = minted.Id;
        }

        return new PaymentItem
        {
            Id = itemId,
            PaymentId = payment.Id,
            InvoiceId = invoice?.Id,
            Date = input.Date,
            Amount = amount,
            Currency = input.Currency,
            FxRate = fxRate,
            AmountUSD = amountUsd,
            Method = input.Method,
            BankAccountId = requiredType is not null ? input.BankAccountId : null,
            ChequeId = input.Method == PaymentMethod.Cheque ? chequeId : null,
            Allocations = requested.Select((allocation, index) =>
            {
                var line = invoice!.Items.First(i => i.Id == allocation.InvoiceItemId);
                return new PaymentItemAllocation
                {
                    Id = $"{itemId}-a{index + 1}",
                    PaymentItemId = itemId,
                    InvoiceItemId = line.Id,
                    // Taken from the invoice, never from the caller: this is what survives a
                    // provisional becoming a final document.
                    ReferenceDocumentItemId = line.ReferenceDocumentItemId,
                    Product = line.Product,
                    Amount = Rounding.Money(allocation.Amount),
                    AmountUSD = PaymentMath.LineUsd(allocation.Amount, fxRate),
                };
            }).ToList(),
        };
    }

    private async Task ValidateAllocationsAsync(
        Payment payment, Invoice invoice, List<AllocationInput> requested,
        decimal lineAmount, decimal fxRate, CancellationToken cancellationToken)
    {
        var onInvoice = invoice.Items.ToDictionary(i => i.Id, StringComparer.Ordinal);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var all = await ListAsync(cancellationToken);

        foreach (var allocation in requested)
        {
            if (!onInvoice.TryGetValue(allocation.InvoiceItemId, out var invoiceItem))
            {
                throw new DomainException(Codes.ItemNotOnInvoice);
            }

            if (!seen.Add(allocation.InvoiceItemId))
            {
                throw new DomainException(Codes.DuplicateAllocation);
            }

            if (allocation.Amount <= 0)
            {
                throw new DomainException(Codes.InvalidAllocationAmount);
            }

            // A line may never pay an invoice line more than it still owes. This payment is
            // excluded from the sum, so re-saving an unchanged line does not block itself.
            var owedUsd = PaymentMath.InvoiceItemRemainingUsd(
                all, allocation.InvoiceItemId, invoiceItem.Amount, payment.Id);

            if (PaymentMath.LineUsd(allocation.Amount, fxRate) > owedUsd + PaymentMath.AllocationTolerance)
            {
                throw new DomainException(Codes.OverAllocated);
            }
        }

        if (requested.Count == 0)
        {
            throw new DomainException(Codes.AllocationsRequired);
        }

        var total = Rounding.Money(requested.Sum(a => a.Amount));
        if (Math.Abs(total - lineAmount) > PaymentMath.AllocationTolerance)
        {
            throw new DomainException(Codes.AllocationMismatch);
        }
    }

    /// <summary>
    /// The header's converted total is the sum of the lines once there are any — that sum is what
    /// every balance reads. With no lines, the header keeps its own declared conversion.
    /// </summary>
    private static void RecomputeTotals(Payment payment)
    {
        if (payment.Items is not { Count: > 0 })
        {
            return;
        }

        payment.AmountUSD = Rounding.Money(payment.Items.Sum(i => i.AmountUSD));
    }

    /* -------------------------------- Cheques --------------------------------- */

    public async Task<Cheque> CreateChequeAsync(
        ChequeInput input, CancellationToken cancellationToken = default)
    {
        var parts = await ValidateChequeAsync(input, excludeId: null, cancellationToken);
        var cheque = await MintChequeAsync(input, parts, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return cheque;
    }

    /// <summary>
    /// Editable only while PENDING.
    ///
    /// <para>A cheque that has cleared, bounced, expired or been replaced is a historical fact,
    /// and its amount is what the payment lines pointing at it are worth. Correcting one means
    /// moving it back to PENDING first — which un-banks it — so that changing a settled record is
    /// an explicit act rather than a side effect of opening a form.</para>
    /// </summary>
    public async Task<Cheque> UpdateChequeAsync(
        string id, ChequeInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        var cheque = await db.Cheques.FirstOrDefaultAsync(c => c.Id == id, cancellationToken)
            ?? throw new DomainException(Codes.ChequeNotFound);

        if (cheque.Status != ChequeStatus.PENDING)
        {
            throw new DomainException(Codes.ChequeNotPending);
        }

        var parts = await ValidateChequeAsync(input, excludeId: id, cancellationToken);

        cheque.Type = input.Type;
        cheque.Number = parts.Number;
        cheque.BankName = parts.BankName;
        cheque.DueDate = input.DueDate;
        cheque.Amount = Rounding.Money(input.Amount);
        cheque.Currency = input.Currency;
        cheque.OwnerName = parts.OwnerName;
        cheque.Notes = string.IsNullOrWhiteSpace(input.Notes) ? null : input.Notes.Trim();

        await db.SaveChangesAsync(cancellationToken);
        return cheque;
    }

    /// <summary>
    /// Moves a cheque through its life. Any status may follow any other — what is guarded is the
    /// money, not the graph, because a cheque's status is a statement about the real world and
    /// the real world can be corrected.
    ///
    /// <para>Entering PAID demands a live account, because PAID is the moment the money lands:
    /// it is what makes the cheque count towards an account balance and towards a person's
    /// ledger. Leaving PAID clears the account again, or an uncleared cheque would go on
    /// reporting a bank it is no longer in.</para>
    /// </summary>
    public async Task<Cheque> SetChequeStatusAsync(
        string id, ChequeStatusInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        var cheque = await db.Cheques.FirstOrDefaultAsync(c => c.Id == id, cancellationToken)
            ?? throw new DomainException(Codes.ChequeNotFound);

        if (cheque.Status == input.Status)
        {
            return cheque;
        }

        if (input.Status == ChequeStatus.PAID)
        {
            if (string.IsNullOrWhiteSpace(input.BankAccountId))
            {
                throw new DomainException(Codes.BankAccountRequired);
            }

            var account = await db.FinancialAccounts
                .FirstOrDefaultAsync(a => a.Id == input.BankAccountId, cancellationToken)
                ?? throw new DomainException(Codes.BankAccountNotFound);

            if (!account.Active)
            {
                throw new DomainException(Codes.BankAccountInactive);
            }

            // Deliberately NOT checking the account's type. A cheque cashed over the counter into
            // a safe is a real thing the desk does, and the browser permits it.
            cheque.BankAccountId = input.BankAccountId;
        }
        else if (cheque.Status == ChequeStatus.PAID)
        {
            cheque.BankAccountId = null;
        }

        cheque.Status = input.Status;
        await db.SaveChangesAsync(cancellationToken);
        return cheque;
    }

    public async Task<List<Cheque>> ListChequesAsync(CancellationToken cancellationToken = default) =>
        await db.Cheques.OrderBy(c => c.Id).ToListAsync(cancellationToken);

    private sealed record ChequeParts(string Number, string BankName, string OwnerName);

    /// <summary>Validates and normalises, touching nothing — so an inline cheque can be checked
    /// before the line that carries it, and minted only once that line is known to be good.</summary>
    private async Task<ChequeParts> ValidateChequeAsync(
        ChequeInput input, string? excludeId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(input);

        var number = input.Number.Trim();
        if (number.Length == 0)
        {
            throw new DomainException(Codes.NumberRequired);
        }

        var bankName = input.BankName.Trim();
        if (bankName.Length == 0)
        {
            throw new DomainException(Codes.BankNameRequired);
        }

        var ownerName = input.OwnerName.Trim();
        if (ownerName.Length == 0)
        {
            throw new DomainException(Codes.OwnerRequired);
        }

        if (input.DueDate == default)
        {
            throw new DomainException(Codes.DueDateRequired);
        }

        if (input.Amount <= 0)
        {
            throw new DomainException(Codes.InvalidAmount);
        }

        await AssertChequeNumberFreeAsync(number, bankName, excludeId, cancellationToken);
        return new ChequeParts(number, bankName, ownerName);
    }

    /// <summary>
    /// Numbers are unique PER ISSUING BANK, not globally — two banks may legitimately issue the
    /// same one, and a cheque received from a customer is drawn on THEIR bank.
    ///
    /// <para>One exception: a RETURNED cheque's number may be reused, because that is exactly how
    /// a bounced cheque is replaced. Compared trimmed and case-insensitively, so "ENBD" and
    /// "enbd " do not quietly become two banks.</para>
    /// </summary>
    private async Task AssertChequeNumberFreeAsync(
        string number, string bankName, string? excludeId, CancellationToken cancellationToken)
    {
        var candidates = await db.Cheques
            .Where(c => c.Status != ChequeStatus.RETURNED && c.Id != excludeId)
            .Select(c => new { c.Number, c.BankName })
            .ToListAsync(cancellationToken);

        var clash = candidates.Any(c =>
            string.Equals(c.Number.Trim(), number, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(c.BankName.Trim(), bankName, StringComparison.OrdinalIgnoreCase));

        if (clash)
        {
            throw new DomainException(Codes.DuplicateChequeNumber);
        }
    }

    private async Task<Cheque> MintChequeAsync(
        ChequeInput input, ChequeParts parts, CancellationToken cancellationToken)
    {
        var cheque = new Cheque
        {
            Id = await NextChequeIdAsync(cancellationToken),
            Type = input.Type,
            Number = parts.Number,
            BankName = parts.BankName,
            DueDate = input.DueDate,
            Amount = Rounding.Money(input.Amount),
            Currency = input.Currency,
            OwnerName = parts.OwnerName,
            Status = ChequeStatus.PENDING,
            Notes = string.IsNullOrWhiteSpace(input.Notes) ? null : input.Notes.Trim(),
        };

        db.Cheques.Add(cheque);
        return cheque;
    }

    /* --------------------------------- Plumbing ------------------------------- */

    /// <summary>
    /// The number inside an id like <c>payitem-12</c> or <c>invitem-3</c>.
    ///
    /// <para>Ids are minted max-scan-plus-one, so ascending order is the order the lines were
    /// created — which is the document order every screen shows and the order the auto-fill rule
    /// is written against. Anything unparseable sorts last rather than throwing.</para>
    /// </summary>
    private static int LineOrder(string id)
    {
        var dash = id.LastIndexOf('-');
        return dash >= 0 && int.TryParse(id.AsSpan(dash + 1), out var n) ? n : int.MaxValue;
    }

    private async Task<Payment> LoadAsync(string id, CancellationToken cancellationToken) =>
        Shape(await db.Payments
            .Include(p => p.Items!).ThenInclude(i => i.Allocations)
            .FirstOrDefaultAsync(p => p.Id == id, cancellationToken)
            ?? throw new DomainException(Codes.PaymentNotFound));

    /// <summary>A confirmed payment is reopened before it is edited — that is what makes changing
    /// settled money a deliberate act.</summary>
    private static void RefuseWhenConfirmed(Payment payment)
    {
        if (payment.EffectiveStatus == PaymentStatus.CONFIRMED)
        {
            throw new DomainException(Codes.PaymentConfirmed);
        }
    }

    private async Task<decimal> AedPerUsdAsync(CancellationToken cancellationToken)
    {
        var raw = await db.Settings
            .Where(s => s.Key == Snapshot.SnapshotService.FxRateKey)
            .Select(s => s.Value)
            .FirstOrDefaultAsync(cancellationToken);

        return raw is null
            ? 3.6725m
            : decimal.Parse(raw, System.Globalization.CultureInfo.InvariantCulture);
    }

    private static InvoiceSide InvoiceMathSide(InvoiceType type) =>
        type is InvoiceType.PURCHASE_ORDER or InvoiceType.PURCHASE_PROVISIONAL or InvoiceType.PURCHASE_INVOICE
            ? InvoiceSide.PURCHASE
            : InvoiceSide.SALE;

    /// <summary>Max-scan, never count-derived, so removing a payment can never make the next id
    /// collide with a live one.</summary>
    private async Task<string> NextPaymentIdAsync(CancellationToken cancellationToken)
    {
        var ids = await db.Payments.Select(p => p.Id).ToListAsync(cancellationToken);
        var max = 0;
        foreach (var id in ids)
        {
            if (id.StartsWith("NIZ", StringComparison.Ordinal) &&
                int.TryParse(id.AsSpan(3), out var n))
            {
                max = Math.Max(max, n);
            }
        }

        return $"NIZ{max + 1:D3}";
    }

    private async Task<string> NextItemIdAsync(CancellationToken cancellationToken)
    {
        var ids = await db.PaymentItems.Select(i => i.Id).ToListAsync(cancellationToken);
        var max = 0;
        foreach (var id in ids)
        {
            if (id.StartsWith("payitem-", StringComparison.Ordinal) &&
                int.TryParse(id.AsSpan(8), out var n))
            {
                max = Math.Max(max, n);
            }
        }

        return $"payitem-{max + 1}";
    }

    private async Task<string> NextChequeIdAsync(CancellationToken cancellationToken)
    {
        var ids = await db.Cheques.Select(c => c.Id).ToListAsync(cancellationToken);
        var max = 0;
        foreach (var id in ids)
        {
            if (id.StartsWith("chq-", StringComparison.Ordinal) &&
                int.TryParse(id.AsSpan(4), out var n))
            {
                max = Math.Max(max, n);
            }
        }

        return $"chq-{max + 1:D4}";
    }
}
