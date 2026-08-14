using Finora.BuildingBlocks.Domain;
using Finora.Erp.Application;
using Finora.Erp.Domain;
using Microsoft.EntityFrameworkCore;

namespace Finora.Erp.Infrastructure.Trade;

/// <summary>
/// Shipping containers and the contract goods loaded into them.
///
/// <para>
/// Small, and overdue. Trade documents have been server-side since the invoice port, and their
/// lines carry a <c>container_id</c> — pointing at ids that until now were minted by a counter in
/// whichever browser typed them. Two people entering a container on the same day both produced
/// <c>cnt-1</c>, and whichever pushed second silently took the other's identity.
/// </para>
/// </summary>
public sealed class ContainerService(ErpDbContext db)
{
    internal static class Codes
    {
        public const string ContainerNotFound = "container-not-found";
        public const string ReferenceRequired = "reference-required";
        public const string GoodInUse = "good-in-use";
    }

    public async Task<List<Container>> ListAsync(CancellationToken cancellationToken = default) =>
        await db.Containers
            .Include(c => c.Goods)
            .OrderBy(c => c.Id)
            .ToListAsync(cancellationToken);

    public async Task<Container> CreateAsync(
        ContainerInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        var reference = Validate(input);

        var container = new Container
        {
            Id = await NextIdAsync(cancellationToken),
            Reference = reference,
            LoadDate = input.LoadDate,
            ArrivalDate = input.ArrivalDate,
            GrossWeightKg = input.GrossWeightKg,
            NetWeightKg = input.NetWeightKg,
            BlNumber = Trimmed(input.BlNumber),
            BookingNumber = Trimmed(input.BookingNumber),
            SealNumber = Trimmed(input.SealNumber),
            Goods = [.. input.Goods.Select(g => new ContainerGood
            {
                ContractItemId = g.ContractItemId,
                QuantityMt = Rounding.Quantity(g.QuantityMt),
            })],
        };

        db.Containers.Add(container);
        await db.SaveChangesAsync(cancellationToken);
        return container;
    }

    public async Task<Container> UpdateAsync(
        string id, ContainerInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        var container = await db.Containers
            .Include(c => c.Goods)
            .FirstOrDefaultAsync(c => c.Id == id, cancellationToken)
            ?? throw new DomainException(Codes.ContainerNotFound);

        var reference = Validate(input);
        await RefuseRemovingGoodInUseAsync(container, input.Goods, cancellationToken);

        container.Reference = reference;
        container.LoadDate = input.LoadDate;
        container.ArrivalDate = input.ArrivalDate;
        container.GrossWeightKg = input.GrossWeightKg;
        container.NetWeightKg = input.NetWeightKg;
        container.BlNumber = Trimmed(input.BlNumber);
        container.BookingNumber = Trimmed(input.BookingNumber);
        container.SealNumber = Trimmed(input.SealNumber);

        // Replaced wholesale, like the browser did: the form posts the whole list, and matching
        // rows up one by one would differ only in the ids nothing reads.
        db.ContainerGoods.RemoveRange(container.Goods);
        container.Goods.Clear();
        foreach (var good in input.Goods)
        {
            container.Goods.Add(new ContainerGood
            {
                ContainerId = container.Id,
                ContractItemId = good.ContractItemId,
                QuantityMt = Rounding.Quantity(good.QuantityMt),
            });
        }

        await db.SaveChangesAsync(cancellationToken);
        return container;
    }

    /// <summary>
    /// A good may not be taken off a container while a trade document still says it shipped in
    /// that container.
    ///
    /// <para>
    /// Checked BEFORE anything is written, and it names the documents: the dialog lists them, so
    /// the user knows which ones to correct first. Only goods being REMOVED are checked — editing
    /// a quantity is always allowed.
    /// </para>
    /// </summary>
    private async Task RefuseRemovingGoodInUseAsync(
        Container container, IReadOnlyList<ContainerGoodInput> next, CancellationToken cancellationToken)
    {
        var keeping = next.Select(g => g.ContractItemId).ToHashSet(StringComparer.Ordinal);

        foreach (var good in container.Goods)
        {
            if (keeping.Contains(good.ContractItemId))
            {
                continue;
            }

            var invoices = await db.InvoiceItems
                .Where(i => i.ContainerId == container.Id && i.ContractItemId == good.ContractItemId)
                .Select(i => i.Invoice!.InvoiceNumber)
                .Distinct()
                .ToListAsync(cancellationToken);

            if (invoices.Count > 0)
            {
                var product = await db.ContractItems
                    .Where(i => i.Id == good.ContractItemId)
                    .Select(i => i.Product)
                    .FirstOrDefaultAsync(cancellationToken);

                throw new DomainException(Codes.GoodInUse, new Dictionary<string, object?>
                {
                    ["invoices"] = invoices,
                    ["product"] = product ?? good.ContractItemId,
                });
            }
        }
    }

    private static string Validate(ContainerInput input)
    {
        var reference = input.Reference.Trim();
        return reference.Length == 0 ? throw new DomainException(Codes.ReferenceRequired) : reference;
    }

    private static string? Trimmed(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>
    /// Max-scan, never count-derived.
    ///
    /// <para>The browser counted the list and then walked forward past collisions, which is
    /// stable in one tab and not between two. One counter, on the server, is the fix.</para>
    /// </summary>
    private async Task<string> NextIdAsync(CancellationToken cancellationToken)
    {
        var ids = await db.Containers.Select(c => c.Id).ToListAsync(cancellationToken);
        var max = 0;
        foreach (var id in ids)
        {
            if (id.StartsWith("cnt-", StringComparison.Ordinal) &&
                int.TryParse(id.AsSpan(4), out var n))
            {
                max = Math.Max(max, n);
            }
        }

        return $"cnt-{max + 1}";
    }
}
