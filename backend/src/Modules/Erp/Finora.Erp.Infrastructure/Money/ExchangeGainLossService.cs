using Finora.BuildingBlocks.Domain;
using Finora.Erp.Application;
using Finora.Erp.Domain;
using Microsoft.EntityFrameworkCore;

namespace Finora.Erp.Infrastructure.Money;

/// <summary>
/// Standalone notes that currency moved for or against the company.
///
/// <para>
/// The simplest thing in the module, and the only one that really deletes. Everything else here
/// cancels, because other records point at it; nothing points at one of these, so leaving
/// struck-through rows behind would be clutter with no integrity argument behind it.
/// </para>
/// </summary>
public sealed class ExchangeGainLossService(ErpDbContext db)
{
    internal static class Codes
    {
        public const string NotFound = "gain-loss-not-found";
        public const string DateRequired = "date-required";
        public const string InvalidAmount = "invalid-amount";
    }

    public async Task<List<ExchangeGainLoss>> ListAsync(CancellationToken cancellationToken = default) =>
        await db.ExchangeGainLosses
            .OrderByDescending(g => g.Date)
            .ToListAsync(cancellationToken);

    public async Task<ExchangeGainLoss> CreateAsync(
        ExchangeGainLossInput input, CancellationToken cancellationToken = default)
    {
        var amount = Validate(input);
        var id = await NextIdAsync(cancellationToken);

        var record = new ExchangeGainLoss
        {
            Id = id,
            // The human number is the id without its prefix — derived, never stored separately,
            // so the two can never disagree.
            Number = $"EGL-{id[4..]}",
            Date = input.Date,
            Type = amount >= 0 ? ExchangeGainLossType.GAIN : ExchangeGainLossType.LOSS,
            Amount = amount,
            Notes = Trimmed(input.Notes),
            CreatedAt = input.Date,
        };

        db.ExchangeGainLosses.Add(record);
        await db.SaveChangesAsync(cancellationToken);
        return record;
    }

    public async Task<ExchangeGainLoss> UpdateAsync(
        string id, ExchangeGainLossInput input, CancellationToken cancellationToken = default)
    {
        var record = await db.ExchangeGainLosses
            .FirstOrDefaultAsync(g => g.Id == id, cancellationToken)
            ?? throw new DomainException(Codes.NotFound);

        var amount = Validate(input);
        record.Date = input.Date;
        record.Amount = amount;
        // Re-derived, so an edit that flips the sign flips the kind with it.
        record.Type = amount >= 0 ? ExchangeGainLossType.GAIN : ExchangeGainLossType.LOSS;
        record.Notes = Trimmed(input.Notes);

        await db.SaveChangesAsync(cancellationToken);
        return record;
    }

    /// <summary>A real delete — see the note on this class.</summary>
    public async Task DeleteAsync(string id, CancellationToken cancellationToken = default)
    {
        var record = await db.ExchangeGainLosses
            .FirstOrDefaultAsync(g => g.Id == id, cancellationToken)
            ?? throw new DomainException(Codes.NotFound);

        db.ExchangeGainLosses.Remove(record);
        await db.SaveChangesAsync(cancellationToken);
    }

    private static decimal Validate(ExchangeGainLossInput input)
    {
        ArgumentNullException.ThrowIfNull(input);

        if (input.Date == default)
        {
            throw new DomainException(Codes.DateRequired);
        }

        // Zero is refused as well: a gain of nothing is not a record, it is a blank row.
        if (input.Amount == 0m)
        {
            throw new DomainException(Codes.InvalidAmount);
        }

        return Rounding.Money(input.Amount);
    }

    private static string? Trimmed(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private async Task<string> NextIdAsync(CancellationToken cancellationToken)
    {
        var max = 0;
        foreach (var id in await db.ExchangeGainLosses.Select(g => g.Id).ToListAsync(cancellationToken))
        {
            if (id.StartsWith("egl-", StringComparison.Ordinal) &&
                int.TryParse(id.AsSpan(4), out var n))
            {
                max = Math.Max(max, n);
            }
        }

        return $"egl-{max + 1:D4}";
    }
}
