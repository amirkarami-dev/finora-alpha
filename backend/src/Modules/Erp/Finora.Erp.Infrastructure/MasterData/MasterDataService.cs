using System.Globalization;
using System.Linq.Expressions;
using System.Text.RegularExpressions;
using Finora.BuildingBlocks.Domain;
using Finora.Erp.Domain;
using Microsoft.EntityFrameworkCore;

namespace Finora.Erp.Infrastructure.MasterData;

/// <summary>
/// The seven reference lists the trading documents point at: people, partners, warehouses, cost
/// centres, goods, financial accounts and charge categories.
///
/// <para>
/// These move to the server first because they are the only writes with no dependants: nothing
/// is derived from them, so a rule enforced here cannot disagree with a balance computed in the
/// browser. Every guard below mirrors the SPA's <c>api.ts</c> exactly — same order, same codes,
/// same trimming and casing — because the SPA keeps its own copy of these functions for when the
/// API is unreachable, and two implementations that disagree are worse than one that is wrong.
/// </para>
///
/// <para>
/// Ids are derived from the code the server assigns (<c>cust-1</c>, <c>ptnr-1</c>, <c>wh-1</c>)
/// where the code is unique, and sequential otherwise (<c>cc-0001</c>). They are readable, they
/// appear in the sample data, and the reference contract is identified by its literal number — a
/// Guid here would break all of that.
/// </para>
/// </summary>
public sealed partial class MasterDataService(ErpDbContext db)
{
    /* --------------------------------- Customers -------------------------------- */

    public async Task<MasterDataResult<Customer>> CreateCustomerAsync(
        CustomerInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        Customer customer = null!;
        await SaveWithOneRetryAsync(async () =>
        {
            var code = Numbering.NextIntegerCode(
                await db.Customers.Select(c => c.Code).ToListAsync(cancellationToken));
            var id = $"cust-{code}";

            customer = new Customer
            {
                Id = id,
                Name = input.Name.Trim(),
                Code = code,
                CreatedAt = DateTimeOffset.UtcNow,
            };

            Apply(customer, input);
            db.Customers.Add(customer);
            await AssignPortalAccountAsync(id, input.PortalAccount, cancellationToken);
        }, cancellationToken);

        return await ResultAsync(db.Customers, c => c.Id, customer.Id, cancellationToken);
    }

    public async Task<MasterDataResult<Customer>> UpdateCustomerAsync(
        string id, CustomerInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        var customer = await FindAsync(db.Customers, id, Codes.PersonNotFound, cancellationToken);

        // Id, code and createdAt are immutable; everything else is replaced.
        Apply(customer, input);
        await AssignPortalAccountAsync(id, input.PortalAccount, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);

        return await ResultAsync(db.Customers, c => c.Id, customer.Id, cancellationToken);
    }

    public async Task<MasterDataResult<Customer>> SetCustomerActiveAsync(
        string id, bool active, CancellationToken cancellationToken = default)
    {
        var customer = await FindAsync(db.Customers, id, Codes.PersonNotFound, cancellationToken);
        customer.Active = active;

        // A deactivated customer cannot keep a live portal login: the flag would otherwise point
        // the portal at an inactive record, with nothing on screen to say so.
        if (!active)
        {
            customer.PortalAccount = false;
        }

        await db.SaveChangesAsync(cancellationToken);
        return await ResultAsync(db.Customers, c => c.Id, customer.Id, cancellationToken);
    }

    private static void Apply(Customer customer, CustomerInput input)
    {
        customer.Name = input.Name.Trim();
        customer.DefaultCurrency = input.DefaultCurrency;
        customer.CustomerType = input.CustomerType;
        customer.ContactName = Blank(input.ContactName);
        customer.Email = Blank(input.Email);
        customer.Phone = Blank(input.Phone);
        customer.Country = Blank(input.Country);
        customer.PaymentTermsDays = input.PaymentTermsDays;
        customer.CreditLimit = input.CreditLimit;
        customer.PortalAccount = input.PortalAccount ?? false;
    }

    /// <summary>At most one customer may hold the portal account, so granting it here takes it
    /// from everyone else. No-op when the flag is not being set.</summary>
    private async Task AssignPortalAccountAsync(
        string keepId, bool? next, CancellationToken cancellationToken)
    {
        if (next != true)
        {
            return;
        }

        var others = await db.Customers
            .Where(c => c.Id != keepId && c.PortalAccount)
            .ToListAsync(cancellationToken);

        foreach (var other in others)
        {
            other.PortalAccount = false;
        }
    }

    /* ---------------------------------- Partners -------------------------------- */

    public async Task<MasterDataResult<Partner>> CreatePartnerAsync(
        PartnerInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        var id = "";
        await SaveWithOneRetryAsync(async () =>
        {
            var code = Numbering.NextIntegerCode(
                await db.Partners.Select(p => p.Code).ToListAsync(cancellationToken));
            id = $"ptnr-{code}";
            db.Partners.Add(new Partner { Id = id, Name = input.Name.Trim(), Code = code });
        }, cancellationToken);

        return await ResultAsync(db.Partners, p => p.Id, id, cancellationToken);
    }

    public async Task<MasterDataResult<Partner>> UpdatePartnerAsync(
        string id, PartnerInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        var partner = await FindAsync(db.Partners, id, Codes.PartnerNotFound, cancellationToken);
        partner.Name = input.Name.Trim(); // code immutable
        await db.SaveChangesAsync(cancellationToken);

        return await ResultAsync(db.Partners, p => p.Id, id, cancellationToken);
    }

    public async Task<MasterDataResult<Partner>> SetPartnerActiveAsync(
        string id, bool active, CancellationToken cancellationToken = default)
    {
        var partner = await FindAsync(db.Partners, id, Codes.PartnerNotFound, cancellationToken);
        partner.Active = active;
        await db.SaveChangesAsync(cancellationToken);

        return await ResultAsync(db.Partners, p => p.Id, id, cancellationToken);
    }

    /* --------------------------------- Warehouses ------------------------------- */

    public async Task<MasterDataResult<Warehouse>> CreateWarehouseAsync(
        WarehouseInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        var id = "";
        await SaveWithOneRetryAsync(async () =>
        {
            var code = Numbering.NextIntegerCode(
                await db.Warehouses.Select(w => w.Code).ToListAsync(cancellationToken));
            id = $"wh-{code}";
            db.Warehouses.Add(new Warehouse
            {
                Id = id,
                Name = input.Name.Trim(),
                Code = code,
                Location = Blank(input.Location),
            });
        }, cancellationToken);

        return await ResultAsync(db.Warehouses, w => w.Id, id, cancellationToken);
    }

    public async Task<MasterDataResult<Warehouse>> UpdateWarehouseAsync(
        string id, WarehouseInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        var warehouse = await FindAsync(db.Warehouses, id, Codes.WarehouseNotFound, cancellationToken);
        warehouse.Name = input.Name.Trim(); // code immutable
        warehouse.Location = Blank(input.Location);
        await db.SaveChangesAsync(cancellationToken);

        return await ResultAsync(db.Warehouses, w => w.Id, id, cancellationToken);
    }

    public async Task<MasterDataResult<Warehouse>> SetWarehouseActiveAsync(
        string id, bool active, CancellationToken cancellationToken = default)
    {
        var warehouse = await FindAsync(db.Warehouses, id, Codes.WarehouseNotFound, cancellationToken);
        warehouse.Active = active;
        await db.SaveChangesAsync(cancellationToken);

        return await ResultAsync(db.Warehouses, w => w.Id, id, cancellationToken);
    }

    /* -------------------------------- Cost centres ------------------------------ */

    public async Task<MasterDataResult<CostCentre>> CreateCostCentreAsync(
        CostCentreInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        var id = "";
        await SaveWithOneRetryAsync(async () =>
        {
            var code = Numbering.NextIntegerCode(
                await db.CostCentres.Select(c => c.Code).ToListAsync(cancellationToken));
            id = NextSequentialId(
                await db.CostCentres.Select(c => c.Id).ToListAsync(cancellationToken), "cc");

            db.CostCentres.Add(new CostCentre
            {
                Id = id,
                Name = input.Name.Trim(),
                Code = code,
                Description = Blank(input.Description),
            });
        }, cancellationToken);

        return await ResultAsync(db.CostCentres, c => c.Id, id, cancellationToken);
    }

    public async Task<MasterDataResult<CostCentre>> UpdateCostCentreAsync(
        string id, CostCentreInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        var centre = await FindAsync(db.CostCentres, id, Codes.CostCentreNotFound, cancellationToken);
        centre.Name = input.Name.Trim(); // code immutable
        centre.Description = Blank(input.Description);
        await db.SaveChangesAsync(cancellationToken);

        return await ResultAsync(db.CostCentres, c => c.Id, id, cancellationToken);
    }

    public async Task<MasterDataResult<CostCentre>> SetCostCentreActiveAsync(
        string id, bool active, CancellationToken cancellationToken = default)
    {
        var centre = await FindAsync(db.CostCentres, id, Codes.CostCentreNotFound, cancellationToken);
        centre.Active = active;
        await db.SaveChangesAsync(cancellationToken);

        return await ResultAsync(db.CostCentres, c => c.Id, id, cancellationToken);
    }

    /* ----------------------------------- Goods ---------------------------------- */

    /// <summary>Guards in order: name-required, duplicate-name. The code is minted from the metal
    /// type. The name is checked because a contract line matches a good by NAME — two goods
    /// sharing one defeat the entire point of the list.</summary>
    public async Task<MasterDataResult<Good>> CreateGoodAsync(
        GoodInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        var name = input.Name.Trim();
        if (name.Length == 0)
        {
            throw new DomainException(Codes.NameRequired);
        }

        // Lowered here rather than inside the expression: EF translates `g.Name.ToLower()` to
        // PostgreSQL's `lower()`, but the comparand has to arrive as a plain parameter.
        var lowered = name.ToLowerInvariant();
        if (await db.Goods.AnyAsync(g => g.Name.ToLower() == lowered, cancellationToken))
        {
            throw new DomainException(Codes.DuplicateName);
        }

        Good good = null!;
        await SaveWithOneRetryAsync(async () =>
        {
            var code = Numbering.NextGoodCode(
                input.MetalType, await db.Goods.Select(g => g.Code).ToListAsync(cancellationToken));
            var id = NextSequentialId(
                await db.Goods.Select(g => g.Id).ToListAsync(cancellationToken), "good");

            good = new Good { Id = id, Name = name, Code = code };
            Apply(good, input);
            db.Goods.Add(good);
        }, cancellationToken);

        return await ResultAsync(db.Goods, g => g.Id, good.Id, cancellationToken);
    }

    /// <summary>Guards in order: not-found, name-required, duplicate-name (excluding itself).
    /// The code is immutable, matching cost centres and charge categories.</summary>
    public async Task<MasterDataResult<Good>> UpdateGoodAsync(
        string id, GoodInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        var good = await FindAsync(db.Goods, id, Codes.GoodNotFound, cancellationToken);

        var name = input.Name.Trim();
        if (name.Length == 0)
        {
            throw new DomainException(Codes.NameRequired);
        }

        var lowered = name.ToLowerInvariant();
        if (await db.Goods.AnyAsync(
                g => g.Id != id && g.Name.ToLower() == lowered, cancellationToken))
        {
            throw new DomainException(Codes.DuplicateName);
        }

        good.Name = name;
        ApplyEditable(good, input);
        await db.SaveChangesAsync(cancellationToken);

        return await ResultAsync(db.Goods, g => g.Id, id, cancellationToken);
    }

    public async Task<MasterDataResult<Good>> SetGoodActiveAsync(
        string id, bool active, CancellationToken cancellationToken = default)
    {
        var good = await FindAsync(db.Goods, id, Codes.GoodNotFound, cancellationToken);
        good.Active = active;
        await db.SaveChangesAsync(cancellationToken);

        return await ResultAsync(db.Goods, g => g.Id, id, cancellationToken);
    }

    private static void Apply(Good good, GoodInput input)
    {
        good.MetalType = input.MetalType;
        ApplyEditable(good, input);
    }

    /// <summary>Everything a good may change after creation. The metal type stays: the code
    /// carries it (<c>copper-001</c>), and a code that lies about its metal is worse than a
    /// second good.</summary>
    private static void ApplyEditable(Good good, GoodInput input)
    {
        good.Form = input.Form;
        good.Unit = input.Unit;
        good.HsCode = Blank(input.HsCode);
        good.Description = Blank(input.Description);
    }

    /* ----------------------------- Financial accounts --------------------------- */

    public async Task<MasterDataResult<FinancialAccount>> CreateFinancialAccountAsync(
        FinancialAccountInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        var id = NextSequentialId(
            await db.FinancialAccounts.Select(a => a.Id).ToListAsync(cancellationToken), "fa");

        var account = new FinancialAccount
        {
            Id = id,
            Name = input.Name.Trim(),
            Type = input.Type,
            Currency = input.Currency,
        };

        await NormalizeAsync(account, input, cancellationToken);
        db.FinancialAccounts.Add(account);
        await db.SaveChangesAsync(cancellationToken);

        return await ResultAsync(db.FinancialAccounts, a => a.Id, id, cancellationToken);
    }

    /// <summary>
    /// Type and currency are immutable: an account's currency defines what its balance means, so
    /// changing it would silently restate every transfer already booked against it. Both are read
    /// off the stored record and whatever arrived is ignored.
    /// </summary>
    public async Task<MasterDataResult<FinancialAccount>> UpdateFinancialAccountAsync(
        string id, FinancialAccountInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        var account = await FindAsync(
            db.FinancialAccounts, id, Codes.BankAccountNotFound, cancellationToken);

        await NormalizeAsync(
            account,
            input with { Type = account.Type, Currency = account.Currency },
            cancellationToken);

        await db.SaveChangesAsync(cancellationToken);
        return await ResultAsync(db.FinancialAccounts, a => a.Id, id, cancellationToken);
    }

    public async Task<MasterDataResult<FinancialAccount>> SetFinancialAccountActiveAsync(
        string id, bool active, CancellationToken cancellationToken = default)
    {
        var account = await FindAsync(
            db.FinancialAccounts, id, Codes.BankAccountNotFound, cancellationToken);
        account.Active = active;
        await db.SaveChangesAsync(cancellationToken);

        return await ResultAsync(db.FinancialAccounts, a => a.Id, id, cancellationToken);
    }

    /// <summary>
    /// Guards in order: name-required, duplicate-name (within the same type — a bank and a cash
    /// safe may legitimately share a name), then for BANK only account-number-required,
    /// iban-required, duplicate-account-number.
    ///
    /// <para>
    /// A cash safe's bank-only fields are cleared rather than stored. Leaving an IBAN behind after
    /// someone fills the form, switches type and saves would put data on a record that can never
    /// display it.
    /// </para>
    /// </summary>
    private async Task NormalizeAsync(
        FinancialAccount account, FinancialAccountInput input, CancellationToken cancellationToken)
    {
        var name = input.Name.Trim();
        if (name.Length == 0)
        {
            throw new DomainException(Codes.NameRequired);
        }

        var type = input.Type;
        var id = account.Id;
        var lowered = name.ToLowerInvariant();
        if (await db.FinancialAccounts.AnyAsync(
                a => a.Id != id && a.Type == type && a.Name.ToLower() == lowered,
                cancellationToken))
        {
            throw new DomainException(Codes.DuplicateName);
        }

        string? accountNumber = null;
        string? iban = null;
        if (type == FinancialAccountType.BANK)
        {
            accountNumber = Blank(input.AccountNumber);
            if (accountNumber is null)
            {
                throw new DomainException(Codes.AccountNumberRequired);
            }

            iban = Blank(input.Iban)?.ToUpperInvariant();
            if (iban is null)
            {
                throw new DomainException(Codes.IbanRequired);
            }

            if (await db.FinancialAccounts.AnyAsync(
                    a => a.Id != id && a.Type == FinancialAccountType.BANK &&
                         a.AccountNumber == accountNumber,
                    cancellationToken))
            {
                throw new DomainException(Codes.DuplicateAccountNumber);
            }
        }

        // Nothing above this line has touched the account: every guard runs first, so a rejected
        // edit leaves the tracked entity exactly as it was found.
        account.Name = name;
        account.Description = Blank(input.Description);
        account.AccountNumber = accountNumber;
        account.Iban = iban;
        account.SwiftCode = type == FinancialAccountType.BANK
            ? Blank(input.SwiftCode)?.ToUpperInvariant()
            : null;
        account.Address = type == FinancialAccountType.BANK ? Blank(input.Address) : null;
    }

    /* ----------------------------- Charge categories ---------------------------- */

    /// <summary>Guards in order: name-required. The code is minted per direction — EXPENSE and
    /// REVENUE are maintained as independent lists, so each counts its own codes from one.</summary>
    public async Task<MasterDataResult<ChargeCategory>> CreateChargeCategoryAsync(
        ChargeCategoryInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        var name = input.Name.Trim();
        if (name.Length == 0)
        {
            throw new DomainException(Codes.NameRequired);
        }

        var id = "";
        await SaveWithOneRetryAsync(async () =>
        {
            var direction = input.Direction;
            var code = Numbering.NextIntegerCode(
                await db.ChargeCategories
                    .Where(c => c.Direction == direction)
                    .Select(c => c.Code)
                    .ToListAsync(cancellationToken));

            id = NextSequentialId(
                await db.ChargeCategories.Select(c => c.Id).ToListAsync(cancellationToken), "ccat");

            db.ChargeCategories.Add(new ChargeCategory
            {
                Id = id,
                Name = name,
                Code = code,
                Direction = direction,
                Scope = input.Scope,
                Description = Blank(input.Description),
            });
        }, cancellationToken);

        return await ResultAsync(db.ChargeCategories, c => c.Id, id, cancellationToken);
    }

    /// <summary>Guards in order: not-found, name-required. Code, direction and scope are
    /// immutable.</summary>
    public async Task<MasterDataResult<ChargeCategory>> UpdateChargeCategoryAsync(
        string id, ChargeCategoryInput input, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        var category = await FindAsync(
            db.ChargeCategories, id, Codes.CategoryNotFound, cancellationToken);

        var name = input.Name.Trim();
        if (name.Length == 0)
        {
            throw new DomainException(Codes.NameRequired);
        }

        // code, direction and scope are immutable on edit.
        category.Name = name;
        category.Description = Blank(input.Description);
        await db.SaveChangesAsync(cancellationToken);

        return await ResultAsync(db.ChargeCategories, c => c.Id, id, cancellationToken);
    }

    public async Task<MasterDataResult<ChargeCategory>> SetChargeCategoryActiveAsync(
        string id, bool active, CancellationToken cancellationToken = default)
    {
        var category = await FindAsync(
            db.ChargeCategories, id, Codes.CategoryNotFound, cancellationToken);
        category.Active = active;
        await db.SaveChangesAsync(cancellationToken);

        return await ResultAsync(db.ChargeCategories, c => c.Id, id, cancellationToken);
    }

    /* ---------------------------------- Shared ---------------------------------- */

    /// <summary>The codes these guards raise. Spelled out rather than inlined so the set the
    /// server can return is readable in one place, and every one is in
    /// <c>backend/contracts/error-codes.json</c>.</summary>
    private static class Codes
    {
        public const string DuplicateCode = "duplicate-code";
        public const string DuplicateName = "duplicate-name";
        public const string DuplicateAccountNumber = "duplicate-account-number";
        public const string NameRequired = "name-required";
        public const string AccountNumberRequired = "account-number-required";
        public const string IbanRequired = "iban-required";
        public const string PersonNotFound = "person-not-found";
        public const string PartnerNotFound = "partner-not-found";
        public const string WarehouseNotFound = "warehouse-not-found";
        public const string CostCentreNotFound = "cost-centre-not-found";
        public const string GoodNotFound = "good-not-found";
        public const string BankAccountNotFound = "bank-account-not-found";
        public const string CategoryNotFound = "category-not-found";
    }

    /// <summary>
    /// Saves, and on a unique-index collision (two users minted the same code in the same second)
    /// lets the caller mint again — once. A second collision is reported as duplicate-code rather
    /// than looped on, because two collisions in a row means something other than timing. Shared
    /// with <see cref="Trade.InvoiceService"/> — see <see cref="UniqueRetry"/>.
    /// </summary>
    private Task SaveWithOneRetryAsync(Func<Task> mintAndAdd, CancellationToken cancellationToken) =>
        UniqueRetry.SaveWithOneRetryAsync(db, mintAndAdd, Codes.DuplicateCode, cancellationToken);

    /// <summary>An empty or whitespace-only string means "not given" here, exactly as the SPA's
    /// <c>input.x?.trim() || undefined</c> does. Storing "" instead would make a blank field
    /// collide with a real one on the next uniqueness check.</summary>
    private static string? Blank(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }

    private static async Task<T> FindAsync<T>(
        DbSet<T> set, string id, string notFoundCode, CancellationToken cancellationToken)
        where T : class =>
        await set.FindAsync([id], cancellationToken) ?? throw new NotFoundException(notFoundCode);

    /// <summary>
    /// The saved record plus the whole list, ordered by id.
    ///
    /// <para>
    /// Ordered on purpose: PostgreSQL returns an updated row wherever the new tuple landed in the
    /// heap, so an unordered read makes a row jump to the bottom of the table the moment someone
    /// edits it. The client replaces its whole collection with this list, and a table that
    /// reshuffles itself on save looks like a bug.
    /// </para>
    /// </summary>
    private static async Task<MasterDataResult<T>> ResultAsync<T>(
        DbSet<T> set, Expression<Func<T, string>> idOf, string id, CancellationToken cancellationToken)
        where T : class
    {
        var all = await set.AsNoTracking().OrderBy(idOf).ToListAsync(cancellationToken);

        var read = idOf.Compile();
        var entity = all.Single(e => string.Equals(read(e), id, StringComparison.Ordinal));
        return new MasterDataResult<T>(entity, all);
    }

    /// <summary>
    /// The next <c>prefix-0001</c> id: one past the highest number already used.
    ///
    /// <para>
    /// Max-plus-one rather than a database sequence, because the sample data ships ids in exactly
    /// this shape and a sequence would start at 1 alongside them. Ids are never reused — nothing
    /// here is ever deleted, only deactivated.
    /// </para>
    /// </summary>
    private static string NextSequentialId(IEnumerable<string> existing, string prefix)
    {
        var pattern = SequentialId();
        var max = 0;
        foreach (var id in existing)
        {
            var match = pattern.Match(id);
            if (match.Success && match.Groups[1].Value == prefix &&
                int.TryParse(match.Groups[2].Value, CultureInfo.InvariantCulture, out var number))
            {
                max = Math.Max(max, number);
            }
        }

        return $"{prefix}-{(max + 1).ToString("D4", CultureInfo.InvariantCulture)}";
    }

    [GeneratedRegex(@"^([a-z]+)-(\d+)$")]
    private static partial Regex SequentialId();
}
