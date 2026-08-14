using Finora.BuildingBlocks.Domain;
using Finora.Erp.Application;
using Finora.Erp.Domain;
using Finora.Erp.Infrastructure.Trade;
using Microsoft.EntityFrameworkCore;

namespace Finora.Erp.Infrastructure.Money;

/// <summary>
/// Money moved between the company's own accounts.
///
/// <para>
/// Needs no invoice, no contract and no person. Parts of it may be linked to documents
/// afterwards, or never — the allocations are optional and may cover only part of the transfer.
/// </para>
///
/// <para>
/// The one thing it cannot do alone is value the money. A transfer out of a non-USD account is
/// worth what that account's holdings are worth, which comes from everything that has ever gone
/// into it: confirmed transfers, settled payments, and cheques that cleared. That is why this is
/// the last domain to move — it reads the payments ledger, and until that was here the rate would
/// have had to be guessed.
/// </para>
/// </summary>
public sealed class MoneyTransferService(ErpDbContext db)
{
    internal static class Codes
    {
        public const string TransferNotFound = "transfer-not-found";
        public const string TransferNotDraft = "transfer-not-draft";
        public const string TransferCancelled = "transfer-cancelled";
        public const string DateRequired = "date-required";
        public const string FromAccountRequired = "from-account-required";
        public const string FromAccountNotFound = "from-account-not-found";
        public const string ToAccountRequired = "to-account-required";
        public const string ToAccountNotFound = "to-account-not-found";
        public const string SameAccount = "same-account";
        public const string AccountInactive = "account-inactive";
        public const string InvalidAmount = "invalid-amount";
        public const string InvalidRate = "invalid-rate";
        public const string SameCurrencyRate = "same-currency-rate";
        public const string InvalidAllocationAmount = "invalid-allocation-amount";
        public const string InvoiceNotFound = "invoice-not-found";
        public const string OverAllocated = "over-allocated";
    }

    /// <summary>Half a cent, matching the allocation tolerance the payments use.</summary>
    private const decimal AllocationTolerance = 0.005m;

    public async Task<List<MoneyTransfer>> ListAsync(CancellationToken cancellationToken = default) =>
        await db.MoneyTransfers
            .Include(t => t.Allocations)
            .OrderBy(t => t.Id)
            .ToListAsync(cancellationToken);

    public async Task<MoneyTransfer> CreateAsync(
        MoneyTransferInput input, CancellationToken cancellationToken = default)
    {
        var transfer = await BuildAsync(input, existing: null, cancellationToken);
        db.MoneyTransfers.Add(transfer);
        await db.SaveChangesAsync(cancellationToken);
        return transfer;
    }

    public async Task<MoneyTransfer> UpdateAsync(
        string id, MoneyTransferInput input, CancellationToken cancellationToken = default)
    {
        var existing = await db.MoneyTransfers
            .Include(t => t.Allocations)
            .FirstOrDefaultAsync(t => t.Id == id, cancellationToken)
            ?? throw new DomainException(Codes.TransferNotFound);

        if (existing.Status != TransferStatus.DRAFT)
        {
            throw new DomainException(Codes.TransferNotDraft);
        }

        var rebuilt = await BuildAsync(input, existing, cancellationToken);

        db.MoneyTransferAllocations.RemoveRange(existing.Allocations);
        existing.Allocations.Clear();
        foreach (var allocation in rebuilt.Allocations)
        {
            existing.Allocations.Add(allocation);
        }

        existing.Date = rebuilt.Date;
        existing.FromAccountId = rebuilt.FromAccountId;
        existing.ToAccountId = rebuilt.ToAccountId;
        existing.FromCurrency = rebuilt.FromCurrency;
        existing.ToCurrency = rebuilt.ToCurrency;
        existing.FromAmount = rebuilt.FromAmount;
        existing.ToAmount = rebuilt.ToAmount;
        existing.ExchangeRate = rebuilt.ExchangeRate;
        existing.BaseAmount = rebuilt.BaseAmount;
        existing.Notes = rebuilt.Notes;

        await db.SaveChangesAsync(cancellationToken);
        return existing;
    }

    /// <summary>DRAFT to CONFIRMED to CANCELLED. Confirming is what moves the balance.</summary>
    public async Task<MoneyTransfer> SetStatusAsync(
        string id, TransferStatus status, CancellationToken cancellationToken = default)
    {
        var transfer = await db.MoneyTransfers
            .Include(t => t.Allocations)
            .FirstOrDefaultAsync(t => t.Id == id, cancellationToken)
            ?? throw new DomainException(Codes.TransferNotFound);

        if (transfer.Status == status)
        {
            return transfer;
        }

        if (transfer.Status == TransferStatus.CANCELLED)
        {
            throw new DomainException(Codes.TransferCancelled);
        }

        transfer.Status = status;
        await db.SaveChangesAsync(cancellationToken);
        return transfer;
    }

    private async Task<MoneyTransfer> BuildAsync(
        MoneyTransferInput input, MoneyTransfer? existing, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(input);

        if (input.Date == default)
        {
            throw new DomainException(Codes.DateRequired);
        }

        if (string.IsNullOrWhiteSpace(input.FromAccountId))
        {
            throw new DomainException(Codes.FromAccountRequired);
        }

        var from = await db.FinancialAccounts
            .FirstOrDefaultAsync(a => a.Id == input.FromAccountId, cancellationToken)
            ?? throw new DomainException(Codes.FromAccountNotFound);

        if (string.IsNullOrWhiteSpace(input.ToAccountId))
        {
            throw new DomainException(Codes.ToAccountRequired);
        }

        var to = await db.FinancialAccounts
            .FirstOrDefaultAsync(a => a.Id == input.ToAccountId, cancellationToken)
            ?? throw new DomainException(Codes.ToAccountNotFound);

        if (from.Id == to.Id)
        {
            throw new DomainException(Codes.SameAccount);
        }

        if (!from.Active || !to.Active)
        {
            throw new DomainException(Codes.AccountInactive);
        }

        if (input.FromAmount <= 0)
        {
            throw new DomainException(Codes.InvalidAmount);
        }

        if (input.ExchangeRate <= 0)
        {
            throw new DomainException(Codes.InvalidRate);
        }

        // One currency into the same currency can only ever be one for one. A rate here would
        // create or destroy money between two of the company's own accounts.
        if (from.Currency == to.Currency && Math.Abs(input.ExchangeRate - 1m) > 0.000001m)
        {
            throw new DomainException(Codes.SameCurrencyRate);
        }

        var fromAmount = Rounding.Money(input.FromAmount);
        var toAmount = Rounding.Money(fromAmount * input.ExchangeRate);

        // What the company gave up, in dollars. The sending side defines it, so the order of
        // these three branches is the rule and not a preference:
        //
        //   a dollar source states it already;
        //   otherwise, if the money LANDS in dollars, the destination states it exactly;
        //   otherwise it converts at the source account's own book rate.
        //
        // The last branch used to fall back to the transfer's own rate, which is destination
        // units per source unit, into a conversion expecting foreign units per dollar. On the
        // first transfer out of a fresh dirham account that valued 3,672.50 AED at $13,486
        // instead of $1,000. The fallback is 1 now, which is wrong by a knowable amount rather
        // than by a wildly wrong one.
        var bookRate = await BookRateAsync(from, cancellationToken);
        var baseAmount = from.Currency == Currency.USD
            ? fromAmount
            : to.Currency == Currency.USD
                ? toAmount
                : ToBaseUsd(fromAmount, from.Currency, bookRate ?? 1m);

        var id = existing?.Id ?? await NextIdAsync(cancellationToken);
        var nextAllocation = await NextAllocationSeqAsync(cancellationToken);

        var allocations = new List<MoneyTransferAllocation>();
        foreach (var allocation in input.Allocations ?? [])
        {
            if (allocation.Amount <= 0)
            {
                throw new DomainException(Codes.InvalidAllocationAmount);
            }

            if (!string.IsNullOrWhiteSpace(allocation.InvoiceId) &&
                !await db.Invoices.AnyAsync(i => i.Id == allocation.InvoiceId, cancellationToken))
            {
                throw new DomainException(Codes.InvoiceNotFound);
            }

            allocations.Add(new MoneyTransferAllocation
            {
                Id = $"tralloc-{nextAllocation++}",
                TransferId = id,
                InvoiceId = allocation.InvoiceId,
                InvoiceItemId = allocation.InvoiceItemId,
                Amount = Rounding.Money(allocation.Amount),
                Currency = from.Currency,
                BaseAmount = ToBaseUsd(allocation.Amount, from.Currency, bookRate ?? input.ExchangeRate),
                BaseCurrency = Currency.USD,
            });
        }

        // Allocations are optional and may cover only PART of the transfer — the unallocated
        // remainder stays valid, so there is no "must add up" check, only a ceiling.
        if (Rounding.Money(allocations.Sum(a => a.Amount)) > fromAmount + AllocationTolerance)
        {
            throw new DomainException(Codes.OverAllocated);
        }

        return new MoneyTransfer
        {
            Id = id,
            Number = existing?.Number ?? $"TR-{id[3..]}",
            Date = input.Date,
            FromAccountId = from.Id,
            ToAccountId = to.Id,
            FromCurrency = from.Currency,
            ToCurrency = to.Currency,
            FromAmount = fromAmount,
            ToAmount = toAmount,
            ExchangeRate = input.ExchangeRate,
            BaseAmount = baseAmount,
            Status = existing?.Status ?? TransferStatus.DRAFT,
            Notes = string.IsNullOrWhiteSpace(input.Notes) ? null : input.Notes.Trim(),
            Allocations = allocations,
        };
    }

    private static decimal ToBaseUsd(decimal amount, Currency currency, decimal rate) =>
        currency == Currency.USD ? Rounding.Money(amount) : Rounding.Money(amount / rate);

    /// <summary>
    /// What one unit of an account's currency has actually been worth, from everything that has
    /// gone into it.
    ///
    /// <para>
    /// The weighted average of the movements, not a market rate: confirmed transfers on both
    /// sides, settled payment lines that name this account, and cheque lines only once the cheque
    /// has cleared — an uncleared cheque names no account, so it moves no balance.
    /// </para>
    ///
    /// <para>Null when there is nothing to average, which is a fresh account.</para>
    /// </summary>
    private async Task<decimal?> BookRateAsync(FinancialAccount account, CancellationToken cancellationToken)
    {
        var balance = 0m;
        var baseUsd = 0m;

        var transfers = await db.MoneyTransfers
            .Where(t => t.Status == TransferStatus.CONFIRMED &&
                        (t.FromAccountId == account.Id || t.ToAccountId == account.Id))
            .ToListAsync(cancellationToken);

        foreach (var transfer in transfers)
        {
            if (transfer.FromAccountId == account.Id)
            {
                balance -= transfer.FromAmount;
                baseUsd -= transfer.BaseAmount;
            }

            if (transfer.ToAccountId == account.Id)
            {
                // The receiving side is worth exactly what the sending side gave up, which is
                // what makes the implied rate come out as the transfer's own.
                balance += transfer.ToAmount;
                baseUsd += transfer.BaseAmount;
            }
        }

        var payments = await db.Payments
            .Include(p => p.Items!)
            .ToListAsync(cancellationToken);
        var cheques = await db.Cheques.ToListAsync(cancellationToken);
        var invoices = await db.Invoices.Select(i => new { i.Id, i.InvoiceType }).ToListAsync(cancellationToken);

        foreach (var payment in payments.Where(PaymentMath.IsSettled))
        {
            foreach (var line in payment.Items ?? [])
            {
                string? target = null;
                if (PaymentMath.RequiredAccountType(line.Method) is not null)
                {
                    target = line.BankAccountId;
                }
                else if (line.Method == PaymentMethod.Cheque && line.ChequeId is not null)
                {
                    var cheque = cheques.FirstOrDefault(c => c.Id == line.ChequeId);
                    if (PaymentMath.IsChequeHonoured(cheque))
                    {
                        target = cheque!.BankAccountId;
                    }
                }

                // A line in another currency is skipped rather than converted: it did not move
                // this account's own currency, so it cannot say what that currency was worth.
                if (target != account.Id || line.Currency != account.Currency)
                {
                    continue;
                }

                var invoiceType = line.InvoiceId is null
                    ? null
                    : invoices.FirstOrDefault(i => i.Id == line.InvoiceId)?.InvoiceType;

                var sign = invoiceType is not null
                    ? InvoiceMath.SideOf(invoiceType.Value) == InvoiceSide.PURCHASE ? -1m : 1m
                    : payment.Direction == MoneyDirection.OUT ? -1m : 1m;

                balance += sign * line.Amount;
                baseUsd += sign * line.AmountUSD;
            }
        }

        balance = Rounding.Money(balance);
        baseUsd = Rounding.Money(baseUsd);

        return balance != 0m && baseUsd != 0m ? Rounding.Rate(balance / baseUsd) : null;
    }

    private async Task<string> NextIdAsync(CancellationToken cancellationToken) =>
        $"tr-{await NextSeqAsync(db.MoneyTransfers.Select(t => t.Id), "tr-", cancellationToken):D4}";

    private async Task<int> NextAllocationSeqAsync(CancellationToken cancellationToken) =>
        await NextSeqAsync(db.MoneyTransferAllocations.Select(a => a.Id), "tralloc-", cancellationToken);

    private static async Task<int> NextSeqAsync(
        IQueryable<string> ids, string prefix, CancellationToken cancellationToken)
    {
        var max = 0;
        foreach (var id in await ids.ToListAsync(cancellationToken))
        {
            if (id.StartsWith(prefix, StringComparison.Ordinal) &&
                int.TryParse(id.AsSpan(prefix.Length), out var n))
            {
                max = Math.Max(max, n);
            }
        }

        return max + 1;
    }
}
