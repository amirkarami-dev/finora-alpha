using Finora.BuildingBlocks.Domain;
using Finora.Erp.Domain;
using Microsoft.EntityFrameworkCore;

namespace Finora.Erp.Infrastructure.Trade;

/// <summary>Quantity and value of one product in one warehouse, and what a tonne of it costs.</summary>
public sealed record StockPosition(decimal QuantityMt, decimal ValueUsd)
{
    /// <summary>Moving average, 4 dp; 0 when nothing is in stock.</summary>
    public decimal AverageUnitCost => QuantityMt == 0m ? 0m : Rounding.Rate(ValueUsd / QuantityMt);
}

/// <summary>
/// Stock has no table. It is folded from every CONFIRMED movement — receipts and conversion
/// outputs add, issues and conversion inputs subtract — in quantity AND in USD value, because
/// every outgoing line stored the average it was valued at, so value ÷ quantity is a moving
/// average without a ledger table. The key is the warehouse plus the product NAME, lower-cased
/// and trimmed: the desk counts the metal, not the paperwork.
/// </summary>
public sealed class StockLedger(ErpDbContext db)
{
    public static string Key(string warehouseId, string product) =>
        $"{warehouseId}::{product.Trim().ToLowerInvariant()}";

    /// <summary>
    /// Serialises every stock-changing write in one warehouse. Stock has no row to lock, so a
    /// transaction-scoped advisory lock stands in for one: the second confirm waits until the
    /// first has committed, then folds the ledger afresh and sees the metal already gone. Two
    /// warehouses never wait on each other. Must be called inside an open transaction — the lock
    /// is released with it.
    /// </summary>
    public Task LockWarehouseAsync(string warehouseId, CancellationToken cancellationToken = default) =>
        LockKeyAsync($"stock:{warehouseId}", cancellationToken);

    /// <summary>
    /// Same device for the "how much of this invoice line is already moved" check, which two
    /// documents against the same invoice would otherwise both pass. Taken AFTER the warehouse
    /// lock, always, so the two can never deadlock.
    /// </summary>
    public Task LockInvoiceAsync(string invoiceId, CancellationToken cancellationToken = default) =>
        LockKeyAsync($"invoice:{invoiceId}", cancellationToken);

    private async Task LockKeyAsync(string key, CancellationToken cancellationToken)
    {
        if (db.Database.CurrentTransaction is null)
        {
            throw new InvalidOperationException("A stock lock is only meaningful inside a transaction.");
        }

        // hashtext folds the key to an int4; the ::bigint keeps the single-argument overload.
        await db.Database.ExecuteSqlAsync($"SELECT pg_advisory_xact_lock(hashtext({key})::bigint)", cancellationToken);
    }

    public async Task<Dictionary<string, StockPosition>> PositionsAsync(CancellationToken cancellationToken = default)
    {
        var positions = new Dictionary<string, StockPosition>(StringComparer.Ordinal);

        void Move(string warehouseId, string product, decimal qty, decimal cost)
        {
            var key = Key(warehouseId, product);
            var current = positions.GetValueOrDefault(key, new StockPosition(0m, 0m));
            positions[key] = new StockPosition(
                Rounding.Quantity(current.QuantityMt + qty),
                Rounding.Money(current.ValueUsd + cost));
        }

        var docs = await db.InventoryDocuments
            .Where(d => d.Status == DocumentStatus.CONFIRMED)
            .Include(d => d.Items)
            .ToListAsync(cancellationToken);
        foreach (var doc in docs)
        {
            var sign = doc.Type == InventoryDocType.IN ? 1m : -1m;
            foreach (var item in doc.Items)
            {
                Move(doc.WarehouseId, item.Product, sign * item.QuantityMt, sign * item.CostUsd);
            }
        }

        var conversions = await db.ConversionDocuments
            .Where(c => c.Status == ConversionStatus.CONFIRMED)
            .Include(c => c.Inputs).Include(c => c.Outputs)
            .ToListAsync(cancellationToken);
        foreach (var conversion in conversions)
        {
            foreach (var input in conversion.Inputs)
            {
                Move(conversion.WarehouseId, input.Product, -input.QuantityMt, -input.CostUsd);
            }

            foreach (var output in conversion.Outputs)
            {
                Move(conversion.WarehouseId, output.Product, output.QuantityMt, output.CostUsd);
            }
        }

        return positions;
    }
}
