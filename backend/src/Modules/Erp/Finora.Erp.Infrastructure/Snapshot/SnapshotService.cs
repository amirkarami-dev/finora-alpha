using Finora.Erp.Domain;
using Microsoft.EntityFrameworkCore;

namespace Finora.Erp.Infrastructure.Snapshot;

/// <summary>Reads and replaces the whole ERP dataset. See <see cref="ErpSnapshot"/> for why.</summary>
public sealed class SnapshotService(ErpDbContext db)
{
    /// <summary>The default AED-per-USD rate, kept as a setting so the client sees the same one.</summary>
    public const string FxRateKey = "fxRate";

    public async Task<ErpSnapshot> ReadAsync(CancellationToken cancellationToken = default)
    {
        // AsNoTracking throughout: this is a read of everything, and tracking ~30 tables' worth
        // of entities would build a change-tracking graph nobody is going to save.
        var fxRate = await db.Settings
            .AsNoTracking()
            .Where(s => s.Key == FxRateKey)
            .Select(s => s.Value)
            .SingleOrDefaultAsync(cancellationToken);

        return new ErpSnapshot
        {
            // The master-data lists are ordered because the BaseInfo tables render them in array
            // order, with no sorter of their own. PostgreSQL puts an updated row wherever the new
            // tuple landed in the heap, so without this an edited good jumps to the bottom of the
            // list on the next load — and the master-data write endpoints, which return the whole
            // list back, would disagree with the snapshot about where it belongs.
            Customers = await db.Customers.AsNoTracking().OrderBy(c => c.Id).ToListAsync(cancellationToken),
            Partners = await db.Partners.AsNoTracking().OrderBy(p => p.Id).ToListAsync(cancellationToken),
            Warehouses = await db.Warehouses.AsNoTracking().OrderBy(w => w.Id).ToListAsync(cancellationToken),
            CostCentres = await db.CostCentres.AsNoTracking().OrderBy(c => c.Id).ToListAsync(cancellationToken),
            FinancialAccounts = await db.FinancialAccounts.AsNoTracking().OrderBy(a => a.Id).ToListAsync(cancellationToken),
            Goods = await db.Goods.AsNoTracking().OrderBy(g => g.Id).ToListAsync(cancellationToken),
            ChargeCategories = await db.ChargeCategories.AsNoTracking().OrderBy(c => c.Id).ToListAsync(cancellationToken),
            Cheques = await db.Cheques.AsNoTracking().ToListAsync(cancellationToken),
            ExchangeGainLosses = await db.ExchangeGainLosses.AsNoTracking().ToListAsync(cancellationToken),

            Contracts = await db.Contracts.AsNoTracking()
                .Include(c => c.Items).ThenInclude(i => i.Partners)
                .ToListAsync(cancellationToken),

            Containers = await db.Containers.AsNoTracking()
                .Include(c => c.Goods)
                .ToListAsync(cancellationToken),

            Invoices = await db.Invoices.AsNoTracking()
                .Include(i => i.Items)
                .ToListAsync(cancellationToken),

            InventoryDocs = await db.InventoryDocuments.AsNoTracking()
                .Include(d => d.Items)
                .ToListAsync(cancellationToken),

            Payments = await db.Payments.AsNoTracking()
                .Include(p => p.Items).ThenInclude(i => i.Allocations)
                .ToListAsync(cancellationToken),

            MoneyTransfers = await db.MoneyTransfers.AsNoTracking()
                .Include(t => t.Allocations)
                .ToListAsync(cancellationToken),

            ChargeDocs = await db.ChargeDocs.AsNoTracking()
                .Include(d => d.Lines).ThenInclude(l => l.Allocations)
                .ToListAsync(cancellationToken),

            Claims = await db.Claims.AsNoTracking()
                .Include(c => c.Items)
                .ToListAsync(cancellationToken),

            FxRate = fxRate is null ? 3.6725m : decimal.Parse(fxRate, System.Globalization.CultureInfo.InvariantCulture),
        };
    }

    /// <summary>
    /// Replaces everything with the given dataset, in one transaction.
    ///
    /// <para>
    /// Destructive by design — it is what "Load sample data" and "Reset" have always done. The
    /// delete order is the reverse of the dependency order, so foreign keys never block it, and
    /// the whole thing is one transaction: a half-replaced database is worse than either end
    /// state.
    /// </para>
    /// </summary>
    public async Task ReplaceAsync(ErpSnapshot snapshot, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(snapshot);

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        await DeleteEverythingAsync(cancellationToken);

        // ExecuteDelete goes straight to the database and leaves the change tracker untouched,
        // so anything this context had loaded still looks live to EF — and re-adding a row with
        // the same key then throws "another instance with the same key is already being
        // tracked". After deleting everything, nothing tracked can still be valid.
        db.ChangeTracker.Clear();

        // Insertion order follows the dependency order: a row is written only once everything
        // it points at exists. Children ride along with their parents through the graph.
        db.Partners.AddRange(snapshot.Partners);
        db.Customers.AddRange(snapshot.Customers);
        db.Warehouses.AddRange(snapshot.Warehouses);
        db.CostCentres.AddRange(snapshot.CostCentres);
        db.FinancialAccounts.AddRange(snapshot.FinancialAccounts);
        db.Goods.AddRange(snapshot.Goods);
        db.ChargeCategories.AddRange(snapshot.ChargeCategories);
        await db.SaveChangesAsync(cancellationToken);

        db.Contracts.AddRange(snapshot.Contracts);
        db.Containers.AddRange(snapshot.Containers);
        await db.SaveChangesAsync(cancellationToken);

        // Invoices reference each other through the conversion chain, so a document must be
        // written after the one it came from. Ordering by that link keeps the FK satisfiable
        // without deferring the constraint.
        foreach (var invoice in OrderByChain(snapshot.Invoices))
        {
            db.Invoices.Add(invoice);
        }

        await db.SaveChangesAsync(cancellationToken);

        db.Cheques.AddRange(snapshot.Cheques);
        await db.SaveChangesAsync(cancellationToken);

        db.InventoryDocuments.AddRange(snapshot.InventoryDocs);
        db.Payments.AddRange(snapshot.Payments);
        db.MoneyTransfers.AddRange(snapshot.MoneyTransfers);
        db.ChargeDocs.AddRange(snapshot.ChargeDocs);
        db.Claims.AddRange(snapshot.Claims);
        db.ExchangeGainLosses.AddRange(snapshot.ExchangeGainLosses);
        await db.SaveChangesAsync(cancellationToken);

        db.Settings.Add(new ErpSetting
        {
            Key = FxRateKey,
            Value = snapshot.FxRate.ToString(System.Globalization.CultureInfo.InvariantCulture),
        });
        await db.SaveChangesAsync(cancellationToken);

        await transaction.CommitAsync(cancellationToken);
    }

    /// <summary>
    /// Documents in an order where every <c>RefInvoiceId</c> is already written. A plain
    /// topological walk — the chain is short (order → provisional → invoice) but nothing
    /// guarantees the incoming array is in that order.
    /// </summary>
    private static List<Invoice> OrderByChain(IReadOnlyList<Invoice> invoices)
    {
        var byId = invoices.ToDictionary(i => i.Id, StringComparer.Ordinal);
        var emitted = new HashSet<string>(StringComparer.Ordinal);
        var ordered = new List<Invoice>(invoices.Count);

        void Emit(Invoice invoice)
        {
            if (!emitted.Add(invoice.Id)) return;

            if (invoice.RefInvoiceId is not null &&
                byId.TryGetValue(invoice.RefInvoiceId, out var predecessor) &&
                !emitted.Contains(predecessor.Id))
            {
                Emit(predecessor);
            }

            ordered.Add(invoice);
        }

        foreach (var invoice in invoices)
        {
            Emit(invoice);
        }

        return ordered;
    }

    private async Task DeleteEverythingAsync(CancellationToken cancellationToken)
    {
        // Children first, then parents. ExecuteDelete issues one statement per table rather
        // than loading every row to delete it.
        await db.ClaimItems.ExecuteDeleteAsync(cancellationToken);
        await db.Claims.ExecuteDeleteAsync(cancellationToken);
        await db.ChargeAllocations.ExecuteDeleteAsync(cancellationToken);
        await db.ChargeLines.ExecuteDeleteAsync(cancellationToken);
        await db.ChargeDocs.ExecuteDeleteAsync(cancellationToken);
        await db.MoneyTransferAllocations.ExecuteDeleteAsync(cancellationToken);
        await db.MoneyTransfers.ExecuteDeleteAsync(cancellationToken);
        await db.PaymentItemAllocations.ExecuteDeleteAsync(cancellationToken);
        await db.PaymentItems.ExecuteDeleteAsync(cancellationToken);
        await db.Payments.ExecuteDeleteAsync(cancellationToken);
        await db.ExchangeGainLosses.ExecuteDeleteAsync(cancellationToken);
        await db.Cheques.ExecuteDeleteAsync(cancellationToken);
        await db.InventoryDocumentItems.ExecuteDeleteAsync(cancellationToken);
        await db.InventoryDocuments.ExecuteDeleteAsync(cancellationToken);
        await db.InvoiceItems.ExecuteDeleteAsync(cancellationToken);

        // Invoices reference invoices, so one pass can leave a predecessor behind. Deleting
        // leaves repeatedly drains the chain from the tip down.
        while (await db.Invoices.AnyAsync(cancellationToken))
        {
            var removed = await db.Invoices
                .Where(i => !db.Invoices.Any(other => other.RefInvoiceId == i.Id))
                .ExecuteDeleteAsync(cancellationToken);

            // A cycle would loop forever. The schema does not permit one, but a corrupt import
            // could, and hanging is a worse failure than an error.
            if (removed == 0)
            {
                throw new InvalidOperationException(
                    "Invoice chain contains a cycle; refusing to loop.");
            }
        }

        await db.ContainerGoods.ExecuteDeleteAsync(cancellationToken);
        await db.Containers.ExecuteDeleteAsync(cancellationToken);
        await db.ItemPartners.ExecuteDeleteAsync(cancellationToken);
        await db.ContractItems.ExecuteDeleteAsync(cancellationToken);
        await db.Contracts.ExecuteDeleteAsync(cancellationToken);
        await db.ChargeCategories.ExecuteDeleteAsync(cancellationToken);
        await db.Goods.ExecuteDeleteAsync(cancellationToken);
        await db.FinancialAccounts.ExecuteDeleteAsync(cancellationToken);
        await db.CostCentres.ExecuteDeleteAsync(cancellationToken);
        await db.Warehouses.ExecuteDeleteAsync(cancellationToken);
        await db.Customers.ExecuteDeleteAsync(cancellationToken);
        await db.Partners.ExecuteDeleteAsync(cancellationToken);
        await db.Settings.ExecuteDeleteAsync(cancellationToken);
    }
}
