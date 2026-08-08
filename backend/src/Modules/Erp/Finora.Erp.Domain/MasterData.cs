namespace Finora.Erp.Domain;

// Master data — the reference lists the trading documents point at.
//
// Every id is a STRING, not a Guid. The front end mints readable ids it depends on
// (`cust-am`, `AM-P-251101156`, `inv-po-0001`, `chq-0001`), invoice ids encode their document
// type, and the reference contract is identified by its literal number in both the sample data
// and the correctness checks. Replacing them with Guids would break every one of those.

/// <summary>A profit/cost-share counterparty on purchase contract lines.</summary>
public sealed class Partner
{
    public required string Id { get; init; }
    public required string Name { get; set; }
    public required string Code { get; set; }

    /// <summary>Deactivating is how a partner is removed — the contracts that reference one
    /// keep working, and their history stays readable.</summary>
    public bool Active { get; set; } = true;
}

/// <summary>
/// A person or company the desk trades with. Called "Person" in the UI, because the list holds
/// employees and other non-trading parties too.
/// </summary>
public sealed class Customer
{
    public required string Id { get; init; }
    public required string Name { get; set; }

    /// <summary>Short code used inside contract ids, e.g. "AM" for Alco Metal.</summary>
    public required string Code { get; set; }

    public Currency DefaultCurrency { get; set; } = Currency.USD;
    public string? ContactName { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? Country { get; set; }

    /// <summary>Day-of-net credit terms.</summary>
    public int PaymentTermsDays { get; set; }

    /// <summary>Approved trading credit line, in USD.</summary>
    public decimal CreditLimit { get; set; }

    public CustomerType CustomerType { get; set; }
    public bool Active { get; set; } = true;
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;

    /// <summary>
    /// Scopes the customer-portal login to this one customer. At most one may hold it, and it
    /// clears when the customer is deactivated — otherwise a deactivated party would keep a
    /// live door into its own data.
    /// </summary>
    public bool PortalAccount { get; set; }

    public ICollection<Contract> Contracts { get; init; } = [];
}

/// <summary>Where stock is held.</summary>
public sealed class Warehouse
{
    public required string Id { get; init; }
    public required string Name { get; set; }
    public required string Code { get; set; }
    public string? Location { get; set; }
    public bool Active { get; set; } = true;
}

/// <summary>A department or activity that costs are attributed to.</summary>
public sealed class CostCentre
{
    public required string Id { get; init; }
    public required string Name { get; set; }

    /// <summary>Trimmed and uppercased; immutable after create.</summary>
    public required string Code { get; set; }

    public string? Description { get; set; }
    public bool Active { get; set; } = true;
}

/// <summary>
/// A company-owned account that holds money — a bank account or a cash safe.
///
/// <para>
/// One entity with a discriminator rather than two tables: transfers and payments reference an
/// account by id, and two id spaces would make that reference ambiguous. The BaseInfo screen
/// still shows two tabs, because that is how the desk thinks about them. The bank-only fields
/// are nullable here and required by the create rule when the type is BANK — a cash safe has no
/// IBAN.
/// </para>
/// </summary>
public sealed class FinancialAccount
{
    public required string Id { get; init; }
    public required string Name { get; set; }

    /// <summary>Immutable after create.</summary>
    public FinancialAccountType Type { get; init; }

    /// <summary>Immutable after create — changing it would silently restate every balance.</summary>
    public Currency Currency { get; init; }

    public bool Active { get; set; } = true;
    public string? Description { get; set; }

    /// <summary>BANK only, required.</summary>
    public string? AccountNumber { get; set; }

    /// <summary>BANK only, required.</summary>
    public string? Iban { get; set; }

    /// <summary>BANK only, optional.</summary>
    public string? SwiftCode { get; set; }

    /// <summary>BANK only, optional.</summary>
    public string? Address { get; set; }
}

/// <summary>
/// A tradeable product, as master data.
///
/// <para>
/// Holds only facts about the material. LME percent, premium, incoterm and quantity are terms
/// of a specific deal and live on the contract line — the same good sold to two customers
/// carries two different premiums.
/// </para>
///
/// <para>
/// This is a reference list, not a foreign key: a contract line's <c>Product</c> stays free
/// text, and this list feeds the autocomplete so names stay spelled consistently. Reports group
/// by that text, so a typo splits one product into two rows.
/// </para>
/// </summary>
public sealed class Good
{
    public required string Id { get; init; }
    public required string Name { get; set; }

    /// <summary>Trimmed, uppercased, unique; immutable after create.</summary>
    public required string Code { get; set; }

    public MetalType MetalType { get; set; }

    /// <summary>Physical form. Not every good has a meaningful one.</summary>
    public GoodForm? Form { get; set; }

    public GoodUnit Unit { get; set; } = GoodUnit.MT;

    /// <summary>Customs tariff classification, e.g. '7403.11'.</summary>
    public string? HsCode { get; set; }

    public string? Description { get; set; }
    public bool Active { get; set; } = true;
}

/// <summary>
/// A kind of cost or income. Editable data rather than values fixed in code, so a new category
/// is a row the desk adds, not a release.
/// </summary>
public sealed class ChargeCategory
{
    public required string Id { get; init; }
    public required string Name { get; set; }

    /// <summary>Trimmed and uppercased; immutable; unique WITHIN a direction, so EXPENSE and
    /// REVENUE may each have a "FRT".</summary>
    public required string Code { get; set; }

    /// <summary>Immutable.</summary>
    public ChargeDirection Direction { get; init; }

    /// <summary>Immutable. INVOICE categories attach to a document's goods; GENERAL ones do not.</summary>
    public ChargeScope Scope { get; init; }

    public string? Description { get; set; }
    public bool Active { get; set; } = true;
}
