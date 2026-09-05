using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Finora.BuildingBlocks.Domain;
using Finora.Erp.Application;
using Finora.Erp.Domain;
using Microsoft.EntityFrameworkCore;

namespace Finora.Erp.Infrastructure.Trade;

/// <summary>
/// Contracts and their goods lines — the first trade documents to leave the browser.
///
/// <para>
/// Contracts move before invoices because they are the parent: an invoice line points at a
/// contract line, so the reference has to exist on the server before anything can be raised
/// against it.
/// </para>
///
/// <para>
/// Ids are minted the way the browser minted them, because they are readable and people quote
/// them: <c>AM-P-2611150</c> for a contract, <c>AM-P-2611150-I1</c> for its first line. The
/// reference contract in the sample data is identified by its literal number, so a Guid here
/// would break the correctness check the whole pricing model is validated against.
/// </para>
/// </summary>
public sealed class ContractService(ErpDbContext db)
{
    public async Task<IReadOnlyList<Contract>> ListAsync(CancellationToken cancellationToken = default) =>
        await db.Contracts
            .AsNoTracking()
            .Include(c => c.Items).ThenInclude(i => i.Partners)
            .Include(c => c.Items).ThenInclude(i => i.Changes.OrderBy(ch => ch.At))
            .OrderBy(c => c.Id)
            .ToListAsync(cancellationToken);

    public async Task<Contract> CreateAsync(
        ContractInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        var customer = await db.Customers
            .Where(c => c.Id == input.CustomerId)
            .Select(c => new { c.Id, c.Code })
            .SingleOrDefaultAsync(cancellationToken)
            ?? throw new DomainException(Codes.CustomerNotFound);

        var contract = new Contract
        {
            Id = await NextContractIdAsync(customer.Code, input.Date, cancellationToken),
            CustomerId = customer.Id,
            ContractType = ParseEnum<ContractType>(input.ContractType, ContractType.SELL, Codes.InvalidContractType),
            Date = input.Date,
            Destination = input.Destination.Trim(),
            Status = ParseEnum<ContractStatus>(input.Status, ContractStatus.ACTIVE, Codes.InvalidStatus),
            Notes = Blank(input.Notes),
        };

        db.Contracts.Add(contract);
        await db.SaveChangesAsync(cancellationToken);

        return await SingleAsync(contract.Id, cancellationToken);
    }

    /// <summary>
    /// Edits the header.
    ///
    /// <para>
    /// Two fields are read only when creating: the direction, and the customer. The browser lets
    /// the customer be reassigned, but an invoice copies its customer from the contract at the
    /// moment it is raised and keeps it thereafter — so moving the contract to a different party
    /// leaves every document against it billed to the old one, with nothing to reconcile them.
    /// Both are ignored here rather than rejected, because the edit form posts the whole record
    /// back unchanged and refusing it would break saving a note.
    /// </para>
    /// </summary>
    public async Task<Contract> UpdateAsync(
        string id, ContractInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        var contract = await LoadAsync(id, cancellationToken);

        contract.Date = input.Date;
        contract.Destination = input.Destination.Trim();
        contract.Status = ParseEnum<ContractStatus>(input.Status, ContractStatus.ACTIVE, Codes.InvalidStatus);
        contract.Notes = Blank(input.Notes);

        await db.SaveChangesAsync(cancellationToken);
        return await SingleAsync(contract.Id, cancellationToken);
    }

    public async Task<Contract> AddItemAsync(
        string contractId, ContractItemInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        var contract = await LoadAsync(contractId, cancellationToken);
        await RequirePartnersExistAsync(input.Partners, cancellationToken);

        var item = new ContractItem
        {
            Id = NextItemId(contract),
            ContractId = contract.Id,
            Product = input.Product.Trim(),
            // Filled by the sweep below, from what the documents actually claim.
            RemainingMt = input.QuantityMt,
        };

        Apply(item, input);
        contract.Items.Add(item);
        await db.SaveChangesAsync(cancellationToken);
        await InvoiceService.RecomputeAllRemainingAsync(db, cancellationToken);

        return await SingleAsync(contract.Id, cancellationToken);
    }

    /// <summary>
    /// Edits a goods line. Shrinking below what documents already claim is allowed: the remaining
    /// figure floors at zero and the contract page reports the overrun.
    /// </summary>
    public async Task<Contract> UpdateItemAsync(
        string contractId, string itemId, ContractItemInput input,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        var contract = await LoadAsync(contractId, cancellationToken);
        var item = contract.Items.SingleOrDefault(i => i.Id == itemId)
            ?? throw new NotFoundException(Codes.ContractItemNotFound);

        await RequirePartnersExistAsync(input.Partners, cancellationToken);

        item.Product = input.Product.Trim();
        Apply(item, input);

        db.ItemPartners.RemoveRange(item.Partners);
        item.Partners.Clear();
        foreach (var partner in input.Partners ?? [])
        {
            item.Partners.Add(new ItemPartner { PartnerId = partner.PartnerId, Percent = partner.Percent });
        }

        await db.SaveChangesAsync(cancellationToken);
        await InvoiceService.RecomputeAllRemainingAsync(db, cancellationToken);
        return await SingleAsync(contract.Id, cancellationToken);
    }

    /// <summary>
    /// Changes a goods line's quantity the formal way: the line moves by <c>DeltaMt</c> and one
    /// history row records who, when, by how much and why. The plain edit (<see cref="UpdateItemAsync"/>)
    /// still changes the quantity directly and writes no row; only this path keeps history.
    /// </summary>
    public async Task<Contract> ChangeItemQuantityAsync(
        string contractId, string itemId, ContractItemChangeInput input, Guid userId, string userName,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        var contract = await LoadAsync(contractId, cancellationToken);
        var item = contract.Items.SingleOrDefault(i => i.Id == itemId)
            ?? throw new NotFoundException(Codes.ContractItemNotFound);

        var delta = Rounding.Quantity(input.DeltaMt);
        if (delta == 0m)
        {
            throw new DomainException(Codes.ChangeDeltaZero);
        }

        var note = Blank(input.Note) ?? throw new DomainException(Codes.ChangeNoteRequired);
        if (note.Length > 300)
        {
            note = note[..300];
        }

        var before = item.QuantityMt;
        var after = Rounding.Quantity(before + delta);
        if (after <= 0m)
        {
            throw new DomainException(Codes.ChangeBelowZero, new Dictionary<string, object?>
            {
                ["quantityMt"] = before,
                ["deltaMt"] = delta,
            });
        }

        item.QuantityMt = after;
        item.Changes.Add(new ContractItemChange
        {
            Id = Guid.CreateVersion7().ToString(),
            At = DateTimeOffset.UtcNow,
            UserId = userId,
            UserName = userName,
            DeltaMt = delta,
            BeforeMt = before,
            AfterMt = after,
            Note = note,
        });

        await db.SaveChangesAsync(cancellationToken);
        await InvoiceService.RecomputeAllRemainingAsync(db, cancellationToken);
        return await SingleAsync(contract.Id, cancellationToken);
    }

    /* ---------------------------------- Shared ---------------------------------- */

    private static class Codes
    {
        public const string ContractNotFound = "contract-not-found";
        public const string ContractItemNotFound = "contract-item-not-found";
        public const string CustomerNotFound = "person-not-found";
        public const string PartnerNotFound = "partner-not-found";
        public const string InvalidStatus = "invalid-status";
        public const string InvalidContractType = "invalid-contract-type";
        public const string InvalidIncoterm = "invalid-incoterm";
        public const string ChangeDeltaZero = "change-delta-zero";
        public const string ChangeBelowZero = "change-below-zero";
        public const string ChangeNoteRequired = "change-note-required";
    }

    private static void Apply(ContractItem item, ContractItemInput input)
    {
        item.QuantityMt = input.QuantityMt;
        item.LmePercent = input.LmePercent;
        item.LmeFixed = input.LmeFixed;
        item.FixedLmePrice = input.FixedLmePrice;
        item.Premium = input.Premium;
        item.Incoterm = ParseEnum<Incoterm>(input.Incoterm, Incoterm.CIF, Codes.InvalidIncoterm);
        item.Status = ParseEnum<ContractStatus>(input.Status, ContractStatus.ACTIVE, Codes.InvalidStatus);
        item.Notes = Blank(input.Notes);

        // On create the collection is empty, so this fills it; on update the caller has already
        // cleared it. Either way the incoming list is the whole truth about who shares this line.
        if (item.Partners.Count == 0)
        {
            foreach (var partner in input.Partners ?? [])
            {
                item.Partners.Add(new ItemPartner { PartnerId = partner.PartnerId, Percent = partner.Percent });
            }
        }
    }

    /// <summary>
    /// A partner id that does not resolve would be a share of the margin promised to nobody, and
    /// the foreign key would refuse it anyway — with a 500 rather than something the form can show
    /// against a field.
    /// </summary>
    private async Task RequirePartnersExistAsync(
        IReadOnlyList<ItemPartnerInput>? partners, CancellationToken cancellationToken)
    {
        if (partners is null || partners.Count == 0)
        {
            return;
        }

        var ids = partners.Select(p => p.PartnerId).Distinct(StringComparer.Ordinal).ToList();
        var known = await db.Partners.CountAsync(p => ids.Contains(p.Id), cancellationToken);
        if (known != ids.Count)
        {
            throw new DomainException(Codes.PartnerNotFound);
        }
    }

    /// <summary>
    /// <c>{CODE}-P-{yyMMdd}{nnn}</c>, first free suffix from 100. The shape is quoted by people
    /// and embedded in the sample data, so it is reproduced exactly rather than improved.
    /// </summary>
    private async Task<string> NextContractIdAsync(
        string customerCode, DateTimeOffset date, CancellationToken cancellationToken)
    {
        var prefix = string.Create(CultureInfo.InvariantCulture,
            $"{customerCode}-P-{date:yyMMdd}");

        var taken = await db.Contracts
            .Where(c => c.Id.StartsWith(prefix))
            .Select(c => c.Id)
            .ToListAsync(cancellationToken);

        for (var n = 100; n <= 999; n++)
        {
            var candidate = string.Create(CultureInfo.InvariantCulture, $"{prefix}{n}");
            if (!taken.Contains(candidate, StringComparer.Ordinal))
            {
                return candidate;
            }
        }

        // 900 contracts for one customer on one day. The browser fell back to a length-derived
        // suffix that could repeat; a timestamp cannot.
        return string.Create(CultureInfo.InvariantCulture, $"{prefix}-{DateTimeOffset.UtcNow.Ticks}");
    }

    private static string NextItemId(Contract contract)
    {
        var highest = 0;
        foreach (var item in contract.Items)
        {
            var dash = item.Id.LastIndexOf("-I", StringComparison.Ordinal);
            if (dash >= 0 &&
                int.TryParse(item.Id[(dash + 2)..], CultureInfo.InvariantCulture, out var n))
            {
                highest = Math.Max(highest, n);
            }
        }

        return string.Create(CultureInfo.InvariantCulture, $"{contract.Id}-I{highest + 1}");
    }

    // Enum values are read the way the JSON layer writes them, so a member whose wire spelling
    // differs from its C# name ([JsonStringEnumMemberName("ON HOLD")] OnHold) round-trips.
    // Enum.TryParse only knew the identifiers, which made ON HOLD unreachable from the app.
    private static readonly JsonSerializerOptions EnumJson = new()
    {
        Converters = { new JsonStringEnumConverter(namingPolicy: null, allowIntegerValues: false) },
    };

    private static TEnum ParseEnum<TEnum>(string? value, TEnum fallback, string code)
        where TEnum : struct, Enum
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return fallback;
        }

        try
        {
            return JsonSerializer.Deserialize<TEnum>(JsonSerializer.Serialize(value), EnumJson);
        }
        catch (JsonException)
        {
            throw new DomainException(code, new Dictionary<string, object?> { ["value"] = value });
        }
    }

    private static string? Blank(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }

    private async Task<Contract> LoadAsync(string id, CancellationToken cancellationToken) =>
        await db.Contracts
            .Include(c => c.Items).ThenInclude(i => i.Partners)
            .Include(c => c.Items).ThenInclude(i => i.Changes.OrderBy(ch => ch.At))
            .SingleOrDefaultAsync(c => c.Id == id, cancellationToken)
        ?? throw new NotFoundException(Codes.ContractNotFound);

    private async Task<Contract> SingleAsync(string id, CancellationToken cancellationToken) =>
        (await ListAsync(cancellationToken)).Single(c => c.Id == id);
}
