using Finora.BuildingBlocks.Domain;
using Finora.Erp.Application;
using Finora.Erp.Domain;
using Microsoft.EntityFrameworkCore;

namespace Finora.Erp.Infrastructure.Trade;

/// <summary>
/// Warehouse receipts and issues, and the stock they add up to.
///
/// <para>
/// Stock has no table. It is folded on read from every CONFIRMED document — receipts add, issues
/// subtract — and the key is the warehouse plus the product NAME, lower-cased and trimmed, taken
/// from the snapshot each document line carries. Not a goods id: two contract lines may name the
/// same metal, and the desk counts the metal, not the paperwork. Keying stock by id instead reads
/// as an obvious tidy-up and reproduces none of the numbers.
/// </para>
/// </summary>
public sealed class WarehouseDocumentService(ErpDbContext db)
{
    internal static class Codes
    {
        public const string DocumentNotFound = "inventory-doc-not-found";
        public const string NoItems = "no-items";
        public const string WarehouseRequired = "warehouse-required";
        public const string InvoiceNotFound = "invoice-not-found";
        public const string InvoiceSideMismatch = "invoice-side-mismatch";
        public const string InvoiceNotConfirmed = "invoice-not-confirmed";
        public const string LineNotOnInvoice = "line-not-on-invoice";
        public const string InvalidQuantity = "invalid-quantity";
        public const string ExceedsRemaining = "exceeds-remaining";
        public const string InsufficientStock = "insufficient-stock";
        public const string CancelBlockedStock = "cancel-blocked-stock";
    }

    /// <summary>Warehouse plus product name, lower-cased and trimmed — the key stock is counted by.</summary>
    private static string StockKey(string warehouseId, string product) =>
        $"{warehouseId}::{product.Trim().ToLowerInvariant()}";

    public async Task<List<InventoryDocument>> ListAsync(CancellationToken cancellationToken = default) =>
        await db.InventoryDocuments
            .Include(d => d.Items)
            .OrderBy(d => d.Id)
            .ToListAsync(cancellationToken);

    /// <summary>
    /// Current stock, per warehouse and product.
    ///
    /// <para>CONFIRMED only: a cancelled document never moved any metal.</para>
    /// </summary>
    public async Task<Dictionary<string, decimal>> StockAsync(CancellationToken cancellationToken = default)
    {
        var docs = await db.InventoryDocuments
            .Where(d => d.Status == DocumentStatus.CONFIRMED)
            .Include(d => d.Items)
            .ToListAsync(cancellationToken);

        var stock = new Dictionary<string, decimal>(StringComparer.Ordinal);
        foreach (var doc in docs)
        {
            var sign = doc.Type == InventoryDocType.IN ? 1m : -1m;
            foreach (var item in doc.Items)
            {
                var key = StockKey(doc.WarehouseId, item.Product);
                stock[key] = Rounding.Money(stock.GetValueOrDefault(key) + (sign * item.QuantityMt));
            }
        }

        return stock;
    }

    public async Task<InventoryDocument> CreateAsync(
        InventoryDocInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        if (input.Items.Count == 0)
        {
            throw new DomainException(Codes.NoItems);
        }

        var warehouse = await db.Warehouses
            .FirstOrDefaultAsync(w => w.Id == input.WarehouseId && w.Active, cancellationToken)
            ?? throw new DomainException(Codes.WarehouseRequired);

        var invoices = await db.Invoices.Include(i => i.Items).ToListAsync(cancellationToken);
        var invoice = invoices.FirstOrDefault(i => i.Id == input.InvoiceId)
            ?? throw new DomainException(Codes.InvoiceNotFound);

        // A receipt takes metal off a purchase; an issue puts it onto a sale.
        var side = input.Type == InventoryDocType.IN ? InvoiceSide.PURCHASE : InvoiceSide.SALE;
        if (InvoiceMath.SideOf(invoice.InvoiceType) != side)
        {
            throw new DomainException(Codes.InvoiceSideMismatch);
        }

        // Only against the live tip of a chain, and only against a document that carries prices —
        // an order is a promise, not a shipment.
        var isLeaf = InvoiceMath.IsPricedType(invoice.InvoiceType) &&
                     InvoiceMath.ChainLeafDocs(invoices, side, includeDraft: false)
                         .Exists(i => i.Id == invoice.Id);
        if (!isLeaf)
        {
            throw new DomainException(Codes.InvoiceNotConfirmed);
        }

        var byRefId = invoice.Items.ToDictionary(i => i.ReferenceDocumentItemId, StringComparer.Ordinal);
        var used = await UsedByReferenceAsync(cancellationToken);
        var stock = input.Type == InventoryDocType.OUT
            ? await StockAsync(cancellationToken)
            : null;

        var docId = await NextIdAsync(cancellationToken);
        var lines = new List<InventoryDocumentItem>();
        var nextItem = await NextItemSeqAsync(cancellationToken);

        foreach (var line in input.Items)
        {
            if (!byRefId.TryGetValue(line.ReferenceDocumentItemId, out var invoiceItem))
            {
                throw new DomainException(Codes.LineNotOnInvoice);
            }

            if (line.QuantityMt <= 0)
            {
                throw new DomainException(Codes.InvalidQuantity);
            }

            var usedMt = used.GetValueOrDefault(line.ReferenceDocumentItemId);
            var remaining = Rounding.Quantity(Math.Max(invoiceItem.QuantityMt - usedMt, 0m));
            if (line.QuantityMt > remaining)
            {
                throw new DomainException(Codes.ExceedsRemaining, new Dictionary<string, object?>
                {
                    ["product"] = invoiceItem.Product,
                    ["remaining"] = remaining,
                });
            }

            // Accumulated as we go, not read once before the loop. Two lines naming the same
            // invoice line are checked against each other, not each against the same stale figure
            // — otherwise a document can ship the same metal twice inside itself.
            used[line.ReferenceDocumentItemId] = usedMt + line.QuantityMt;

            if (stock is not null)
            {
                var key = StockKey(warehouse.Id, invoiceItem.Product);
                var available = stock.GetValueOrDefault(key);
                if (line.QuantityMt > available)
                {
                    throw new DomainException(Codes.InsufficientStock, new Dictionary<string, object?>
                    {
                        ["product"] = invoiceItem.Product,
                        ["available"] = Rounding.Money(Math.Max(available, 0m)),
                    });
                }

                // Same running rule, for the same reason.
                stock[key] = Rounding.Money(available - line.QuantityMt);
            }

            lines.Add(new InventoryDocumentItem
            {
                Id = $"idocitem-{nextItem++}",
                DocumentId = docId,
                InvoiceItemId = invoiceItem.Id,
                ReferenceDocumentItemId = line.ReferenceDocumentItemId,
                // The product NAME is copied, because stock is counted by it and a later rename
                // must not move metal between piles.
                Product = invoiceItem.Product,
                QuantityMt = Rounding.Quantity(line.QuantityMt),
            });
        }

        var doc = new InventoryDocument
        {
            Id = docId,
            DocNumber = await NextNumberAsync(input.Type, input.Date, cancellationToken),
            WarehouseId = warehouse.Id,
            InvoiceId = invoice.Id,
            Type = input.Type,
            Date = input.Date,
            Status = DocumentStatus.CONFIRMED,
            Notes = string.IsNullOrWhiteSpace(input.Notes) ? null : input.Notes.Trim(),
            Items = lines,
        };

        db.InventoryDocuments.Add(doc);
        await db.SaveChangesAsync(cancellationToken);
        return doc;
    }

    /// <summary>
    /// Cancels a document. Idempotent.
    ///
    /// <para>
    /// Cancelling a RECEIPT takes metal back out, so it is refused when that would drive any of
    /// its products negative — checked in the document's OWN warehouse, because a receipt only
    /// ever credited that one, and with the same running accumulation so two lines of the same
    /// product cannot both pass against one snapshot.
    /// </para>
    ///
    /// <para>Cancelling an ISSUE only puts metal back, which can never go negative.</para>
    /// </summary>
    public async Task<InventoryDocument> CancelAsync(
        string id, CancellationToken cancellationToken = default)
    {
        var doc = await db.InventoryDocuments
            .Include(d => d.Items)
            .FirstOrDefaultAsync(d => d.Id == id, cancellationToken)
            ?? throw new DomainException(Codes.DocumentNotFound);

        if (doc.Status == DocumentStatus.CANCELLED)
        {
            return doc;
        }

        if (doc.Type == InventoryDocType.IN)
        {
            var stock = await StockAsync(cancellationToken);
            foreach (var item in doc.Items)
            {
                var key = StockKey(doc.WarehouseId, item.Product);
                var current = stock.GetValueOrDefault(key);
                if (current - item.QuantityMt < 0m)
                {
                    throw new DomainException(Codes.CancelBlockedStock, new Dictionary<string, object?>
                    {
                        ["product"] = item.Product,
                    });
                }

                stock[key] = Rounding.Money(current - item.QuantityMt);
            }
        }

        doc.Status = DocumentStatus.CANCELLED;
        await db.SaveChangesAsync(cancellationToken);
        return doc;
    }

    /// <summary>How much of each invoice line live documents have already moved.</summary>
    private async Task<Dictionary<string, decimal>> UsedByReferenceAsync(CancellationToken cancellationToken)
    {
        var rows = await db.InventoryDocumentItems
            .Where(i => i.Document!.Status != DocumentStatus.CANCELLED)
            .Select(i => new { i.ReferenceDocumentItemId, i.QuantityMt })
            .ToListAsync(cancellationToken);

        var used = new Dictionary<string, decimal>(StringComparer.Ordinal);
        foreach (var row in rows)
        {
            used[row.ReferenceDocumentItemId] =
                used.GetValueOrDefault(row.ReferenceDocumentItemId) + row.QuantityMt;
        }

        return used;
    }

    /// <summary>
    /// GRN for a receipt, GDN for an issue, then the year and the first free number.
    ///
    /// <para>The first FREE full number wins, so gaps are filled. The prefix is part of what is
    /// checked, which means each kind counts from one — GRN-2026-0001 and GDN-2026-0001 coexist,
    /// exactly as the browser numbered them.</para>
    /// </summary>
    private async Task<string> NextNumberAsync(
        InventoryDocType type, DateTimeOffset date, CancellationToken cancellationToken)
    {
        var taken = (await db.InventoryDocuments.Select(d => d.DocNumber).ToListAsync(cancellationToken))
            .ToHashSet(StringComparer.Ordinal);

        var prefix = type == InventoryDocType.IN ? "GRN" : "GDN";
        var year = date.Year;

        for (var n = 1; n <= 9999; n++)
        {
            var candidate = $"{prefix}-{year}-{n:D4}";
            if (taken.Add(candidate))
            {
                return candidate;
            }
        }

        return $"{prefix}-{year}-{taken.Count + 1}";
    }

    private async Task<string> NextIdAsync(CancellationToken cancellationToken)
    {
        var ids = await db.InventoryDocuments.Select(d => d.Id).ToListAsync(cancellationToken);
        var max = 0;
        foreach (var id in ids)
        {
            if (id.StartsWith("idoc-", StringComparison.Ordinal) &&
                int.TryParse(id.AsSpan(5), out var n))
            {
                max = Math.Max(max, n);
            }
        }

        return $"idoc-{max + 1:D4}";
    }

    private async Task<int> NextItemSeqAsync(CancellationToken cancellationToken)
    {
        var ids = await db.InventoryDocumentItems.Select(i => i.Id).ToListAsync(cancellationToken);
        var max = 0;
        foreach (var id in ids)
        {
            if (id.StartsWith("idocitem-", StringComparison.Ordinal) &&
                int.TryParse(id.AsSpan(9), out var n))
            {
                max = Math.Max(max, n);
            }
        }

        return max + 1;
    }
}
