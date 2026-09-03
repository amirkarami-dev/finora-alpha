using System.Globalization;
using Finora.BuildingBlocks.Domain;
using Finora.Erp.Application;
using Finora.Erp.Domain;
using Finora.Erp.Infrastructure.Money;
using Microsoft.EntityFrameworkCore;

namespace Finora.Erp.Infrastructure.Trade;

/// <summary>
/// Conversion documents: stock of some products becomes stock of others, and the cost follows.
///
/// <para>
/// A DRAFT is replaced whole on every save — the form edits three small tables at once, and
/// per-line endpoints would only add ways for them to disagree. Confirm is where the numbers
/// are fixed: the inputs are valued at the ledger's average, the workshop's costs are booked as
/// an expense on the people who were paid, and the total lands on the outputs by weight or by
/// the shares the desk chose. Nothing is recomputed afterwards.
/// </para>
/// </summary>
public sealed class ConversionService(ErpDbContext db, StockLedger ledger, ChargeService charges)
{
    internal static class Codes
    {
        public const string NotFound = "conversion-not-found";
        public const string NotDraft = "conversion-not-draft";
        public const string Empty = "conversion-empty";
        public const string InvalidShares = "invalid-shares";
        public const string CostCategoryInvalid = "cost-category-invalid";
        public const string WarehouseNotFound = "warehouse-not-found";
        public const string PersonNotFound = "person-not-found";
        public const string InvalidQuantity = "invalid-quantity";
        public const string InvalidAmount = "invalid-amount";
        public const string InvalidFx = "invalid-fx";
        public const string InsufficientStock = "insufficient-stock";
        public const string CancelBlockedStock = "cancel-blocked-stock";
    }

    public async Task<List<ConversionDocument>> ListAsync(CancellationToken cancellationToken = default) =>
        await db.ConversionDocuments
            .Include(c => c.Inputs).Include(c => c.Outputs).Include(c => c.Costs)
            .OrderBy(c => c.Id)
            .ToListAsync(cancellationToken);

    public async Task<ConversionDocument> CreateAsync(ConversionDocInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);
        await ValidateAsync(input, cancellationToken);

        var id = NextSequentialId(await db.ConversionDocuments.Select(c => c.Id).ToListAsync(cancellationToken), "cnv");
        var doc = new ConversionDocument
        {
            Id = id,
            DocNumber = await NextNumberAsync(input.Date, cancellationToken),
            WarehouseId = input.WarehouseId,
            Date = input.Date.ToUniversalTime(),
            Status = ConversionStatus.DRAFT,
            Notes = Blank(input.Notes),
            CreatedAt = DateTimeOffset.UtcNow,
        };
        await FillLinesAsync(doc, input, cancellationToken);
        db.ConversionDocuments.Add(doc);
        await db.SaveChangesAsync(cancellationToken);
        return await LoadAsync(id, cancellationToken);
    }

    public async Task<ConversionDocument> UpdateAsync(string id, ConversionDocInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);
        var doc = await LoadAsync(id, cancellationToken);
        RequireDraft(doc);
        await ValidateAsync(input, cancellationToken);

        doc.Date = input.Date.ToUniversalTime();
        doc.Notes = Blank(input.Notes);
        db.ConversionInputs.RemoveRange(doc.Inputs);
        db.ConversionOutputs.RemoveRange(doc.Outputs);
        db.ConversionCosts.RemoveRange(doc.Costs);
        doc.Inputs.Clear(); doc.Outputs.Clear(); doc.Costs.Clear();
        await FillLinesAsync(doc, input, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return await LoadAsync(id, cancellationToken);
    }

    public async Task<ConversionDocument> ConfirmAsync(string id, CancellationToken cancellationToken = default)
    {
        var doc = await LoadAsync(id, cancellationToken);
        RequireDraft(doc);
        if (doc.Inputs.Count == 0 || doc.Outputs.Count == 0)
        {
            throw new DomainException(Codes.Empty);
        }

        var shares = doc.Outputs.Select(o => o.SharePercent).ToList();
        if (!ConversionMath.SharesAreValid(shares))
        {
            throw new DomainException(Codes.InvalidShares);
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        // Inputs of one product are summed before the check, so two lines cannot each pass
        // against the same stock.
        var positions = await ledger.PositionsAsync(cancellationToken);
        var running = new Dictionary<string, decimal>(StringComparer.Ordinal);
        foreach (var input in doc.Inputs)
        {
            var key = StockLedger.Key(doc.WarehouseId, input.Product);
            var position = positions.GetValueOrDefault(key, new StockPosition(0m, 0m));
            var available = position.QuantityMt - running.GetValueOrDefault(key);
            if (input.QuantityMt > available)
            {
                throw new DomainException(Codes.InsufficientStock, new Dictionary<string, object?>
                {
                    ["product"] = input.Product,
                    ["available"] = Rounding.Quantity(Math.Max(available, 0m)),
                });
            }

            running[key] = running.GetValueOrDefault(key) + input.QuantityMt;
            input.UnitCostUsd = position.AverageUnitCost;
            input.CostUsd = Rounding.Money(input.UnitCostUsd * input.QuantityMt);
        }

        doc.TotalInputCostUsd = Rounding.Money(doc.Inputs.Sum(i => i.CostUsd));
        doc.TotalAddedCostUsd = Rounding.Money(doc.Costs.Sum(c => c.AmountUsd));

        if (doc.Costs.Count > 0)
        {
            var charge = await charges.CreateAsync(new ChargeDocInput
            {
                Direction = ChargeDirection.EXPENSE,
                Kind = ChargeScope.GENERAL,
                Title = string.Create(CultureInfo.InvariantCulture, $"Conversion {doc.DocNumber}"),
                Date = doc.Date,
                Description = doc.Notes,
            }, cancellationToken);
            foreach (var cost in doc.Costs)
            {
                await charges.AddLineAsync(charge.Id, new ChargeLineInput
                {
                    CategoryId = cost.CategoryId,
                    Date = doc.Date,
                    Amount = cost.Amount,
                    Currency = cost.Currency,
                    FxRate = cost.FxRate,
                    PersonId = cost.PersonId,
                    Description = cost.Description,
                }, cancellationToken);
            }

            doc.ChargeDocId = charge.Id;
        }

        var total = Rounding.Money(doc.TotalInputCostUsd + doc.TotalAddedCostUsd);
        var outputs = doc.Outputs.ToList();
        var split = ConversionMath.Distribute(total, outputs.Select(o => o.QuantityMt).ToList(), shares);
        for (var i = 0; i < outputs.Count; i++)
        {
            outputs[i].CostUsd = split[i];
            outputs[i].UnitCostUsd = outputs[i].QuantityMt == 0m ? 0m : Rounding.Rate(split[i] / outputs[i].QuantityMt);
        }

        doc.Status = ConversionStatus.CONFIRMED;
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return await LoadAsync(id, cancellationToken);
    }

    public async Task<ConversionDocument> CancelAsync(string id, CancellationToken cancellationToken = default)
    {
        var doc = await LoadAsync(id, cancellationToken);
        if (doc.Status == ConversionStatus.CANCELLED)
        {
            return doc;
        }

        if (doc.Status == ConversionStatus.CONFIRMED)
        {
            var positions = await ledger.PositionsAsync(cancellationToken);
            var running = new Dictionary<string, decimal>(StringComparer.Ordinal);
            foreach (var output in doc.Outputs)
            {
                var key = StockLedger.Key(doc.WarehouseId, output.Product);
                var left = positions.GetValueOrDefault(key, new StockPosition(0m, 0m)).QuantityMt - running.GetValueOrDefault(key) - output.QuantityMt;
                if (left < 0m)
                {
                    throw new DomainException(Codes.CancelBlockedStock, new Dictionary<string, object?> { ["product"] = output.Product });
                }

                running[key] = running.GetValueOrDefault(key) + output.QuantityMt;
            }

            if (doc.ChargeDocId is { } chargeId)
            {
                await charges.CancelAsync(chargeId, cancellationToken);
            }
        }

        doc.Status = ConversionStatus.CANCELLED;
        await db.SaveChangesAsync(cancellationToken);
        return doc;
    }

    /* ---------------------------------- helpers ---------------------------------- */

    private async Task<ConversionDocument> LoadAsync(string id, CancellationToken cancellationToken) =>
        await db.ConversionDocuments
            .Include(c => c.Inputs).Include(c => c.Outputs).Include(c => c.Costs)
            .FirstOrDefaultAsync(c => c.Id == id, cancellationToken)
        ?? throw new NotFoundException(Codes.NotFound);

    private static void RequireDraft(ConversionDocument doc)
    {
        if (doc.Status != ConversionStatus.DRAFT)
        {
            throw new DomainException(Codes.NotDraft);
        }
    }

    private async Task ValidateAsync(ConversionDocInput input, CancellationToken cancellationToken)
    {
        if (!await db.Warehouses.AnyAsync(w => w.Id == input.WarehouseId && w.Active, cancellationToken))
        {
            throw new DomainException(Codes.WarehouseNotFound);
        }

        foreach (var line in input.Inputs.Select(i => i.QuantityMt).Concat(input.Outputs.Select(o => o.QuantityMt)))
        {
            if (line <= 0m)
            {
                throw new DomainException(Codes.InvalidQuantity);
            }
        }

        if (!ConversionMath.SharesAreValid(input.Outputs.Select(o => o.SharePercent).ToList()))
        {
            throw new DomainException(Codes.InvalidShares);
        }

        foreach (var cost in input.Costs)
        {
            if (cost.Amount <= 0m)
            {
                throw new DomainException(Codes.InvalidAmount);
            }

            if (cost.Currency != Currency.USD && (cost.FxRate is null || cost.FxRate <= 0m))
            {
                throw new DomainException(Codes.InvalidFx);
            }

            var category = await db.ChargeCategories.FirstOrDefaultAsync(c => c.Id == cost.CategoryId, cancellationToken);
            if (category is null || !category.Active || category.Direction != ChargeDirection.EXPENSE || category.Scope != ChargeScope.GENERAL)
            {
                throw new DomainException(Codes.CostCategoryInvalid);
            }

            if (!await db.Customers.AnyAsync(p => p.Id == cost.PersonId, cancellationToken))
            {
                throw new DomainException(Codes.PersonNotFound);
            }
        }
    }

    private async Task FillLinesAsync(ConversionDocument doc, ConversionDocInput input, CancellationToken cancellationToken)
    {
        var nextIn = await NextSeqAsync(db.ConversionInputs.Select(i => i.Id), "cnvin-", cancellationToken);
        var nextOut = await NextSeqAsync(db.ConversionOutputs.Select(o => o.Id), "cnvout-", cancellationToken);
        var nextCost = await NextSeqAsync(db.ConversionCosts.Select(c => c.Id), "cnvcost-", cancellationToken);

        foreach (var line in input.Inputs)
        {
            doc.Inputs.Add(new ConversionInput { Id = $"cnvin-{nextIn++}", DocumentId = doc.Id, Product = line.Product.Trim(), QuantityMt = Rounding.Quantity(line.QuantityMt) });
        }

        foreach (var line in input.Outputs)
        {
            doc.Outputs.Add(new ConversionOutput { Id = $"cnvout-{nextOut++}", DocumentId = doc.Id, Product = line.Product.Trim(), QuantityMt = Rounding.Quantity(line.QuantityMt), SharePercent = line.SharePercent });
        }

        foreach (var line in input.Costs)
        {
            var fx = line.Currency == Currency.USD ? 1m : line.FxRate!.Value;
            doc.Costs.Add(new ConversionCost
            {
                Id = $"cnvcost-{nextCost++}", DocumentId = doc.Id, CategoryId = line.CategoryId, PersonId = line.PersonId,
                Amount = Rounding.Money(line.Amount), Currency = line.Currency, FxRate = fx,
                AmountUsd = Rounding.Money(line.Amount / fx), Description = Blank(line.Description),
            });
        }
    }

    private async Task<string> NextNumberAsync(DateTimeOffset date, CancellationToken cancellationToken)
    {
        var taken = (await db.ConversionDocuments.Select(c => c.DocNumber).ToListAsync(cancellationToken)).ToHashSet(StringComparer.Ordinal);
        var year = date.ToOffset(Numbering.GulfOffset).Year;
        for (var n = 1; n <= 9999; n++)
        {
            var candidate = string.Create(CultureInfo.InvariantCulture, $"CNV-{year}-{n:D4}");
            if (taken.Add(candidate))
            {
                return candidate;
            }
        }

        return string.Create(CultureInfo.InvariantCulture, $"CNV-{year}-{taken.Count + 1}");
    }

    private static async Task<int> NextSeqAsync(IQueryable<string> ids, string prefix, CancellationToken cancellationToken)
    {
        var max = 0;
        foreach (var id in await ids.ToListAsync(cancellationToken))
        {
            if (id.StartsWith(prefix, StringComparison.Ordinal) && int.TryParse(id.AsSpan(prefix.Length), out var n))
            {
                max = Math.Max(max, n);
            }
        }

        return max + 1;
    }

    private static string NextSequentialId(IEnumerable<string> ids, string prefix)
    {
        var max = 0;
        foreach (var id in ids)
        {
            if (id.StartsWith(prefix + "-", StringComparison.Ordinal) && int.TryParse(id.AsSpan(prefix.Length + 1), out var n))
            {
                max = Math.Max(max, n);
            }
        }

        return string.Create(CultureInfo.InvariantCulture, $"{prefix}-{max + 1:D4}");
    }

    private static string? Blank(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }
}
