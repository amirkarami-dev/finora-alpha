# Auto-generated codes and document numbers — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The server assigns every master-data code and every trade-document number; the user never types one.

**Architecture:** One pure `Numbering` helper in the ERP Domain project holds the three rules (next integer, `<metal>-NNN`, `YYMM` + 4 digits). `MasterDataService` and `InvoiceService` call it instead of validating user input; the `Code` / `InvoiceNumber` fields leave the create inputs. The SPA drops the code inputs from six forms and the number field from the document form, and its offline fallback in `api.ts` uses a TypeScript port of the same rules so the two sides never disagree.

**Tech Stack:** .NET 10 (EF Core, xUnit, Minimal APIs) · Vite 6 + React 18 + AntD 5 + TypeScript strict · react-i18next (en / ar / fa).

**Spec:** `docs/superpowers/specs/2026-09-03-auto-codes-design.md`

## Global Constraints

- Backend builds with warnings as errors: `dotnet build backend/Finora.slnx`.
- `Finora.ArchitectureTests`: no EF Core in a Domain project; `Math.Round` only in `BuildingBlocks.Domain.Rounding`; no `float`/`double` in domain files.
- Every user-facing string goes through `t('...')` and exists in **all three** locale files `en.json`, `ar.json`, `fa.json`.
- Every error code the server can return is listed in `backend/contracts/error-codes.json`; `ErrorCodeContractTests` enforces parity with the SPA.
- Codes stay `string` columns; no schema migration is needed (the database is empty).
- Month for a document number = the document's `invoiceDate` seen in Gulf time (UTC+4), so the calendar date the user picked is the date used.
- Commits: branch `feat/auto-codes`; messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Working directory for all commands: `D:\projects\Emad\finora-alpha` (Git Bash; use forward slashes).

---

### Task 1: The numbering rules, as pure functions

**Files:**
- Create: `backend/src/Modules/Erp/Finora.Erp.Domain/Numbering.cs`
- Test: `backend/tests/Finora.UnitTests/NumberingTests.cs`

**Interfaces:**
- Produces:
  - `static string Numbering.NextIntegerCode(IEnumerable<string> existing)` → `"1"`, `"2"`, …
  - `static string Numbering.NextGoodCode(MetalType metal, IEnumerable<string> existing)` → `"copper-001"`
  - `static string Numbering.NextDocumentNumber(DateTimeOffset date, IEnumerable<string> existing)` → `"26090001"`
  - `static readonly TimeSpan Numbering.GulfOffset` = `+04:00`

- [ ] **Step 1: Write the failing tests**

```csharp
// backend/tests/Finora.UnitTests/NumberingTests.cs
using Finora.Erp.Domain;

namespace Finora.UnitTests;

/// <summary>
/// The three code rules the server assigns on behalf of the user. Pure functions over the codes
/// already stored, so a rule change is a one-line diff here and nowhere else.
/// </summary>
public sealed class NumberingTests
{
    [Fact]
    public void An_empty_list_starts_at_one() =>
        Assert.Equal("1", Numbering.NextIntegerCode([]));

    [Fact]
    public void The_next_integer_is_one_past_the_highest_not_the_count() =>
        Assert.Equal("8", Numbering.NextIntegerCode(["1", "7", "3"]));

    [Fact]
    public void Codes_that_are_not_integers_are_ignored() =>
        Assert.Equal("3", Numbering.NextIntegerCode(["AM", "2", "CU-CATH", ""]));

    [Fact]
    public void A_good_code_is_the_lowercase_metal_and_three_digits() =>
        Assert.Equal("copper-001", Numbering.NextGoodCode(MetalType.COPPER, []));

    [Fact]
    public void Good_codes_count_per_metal() =>
        Assert.Equal("copper-003",
            Numbering.NextGoodCode(MetalType.COPPER, ["copper-001", "copper-002", "aluminium-001", "zinc-009"]));

    [Fact]
    public void Good_codes_grow_past_three_digits_instead_of_failing() =>
        Assert.Equal("copper-1000", Numbering.NextGoodCode(MetalType.COPPER, ["copper-999"]));

    [Fact]
    public void A_document_number_is_yymm_and_four_digits()
    {
        var date = new DateTimeOffset(2026, 9, 2, 8, 0, 0, TimeSpan.FromHours(4));
        Assert.Equal("26090001", Numbering.NextDocumentNumber(date, []));
    }

    [Fact]
    public void Document_numbers_share_one_sequence_within_a_month()
    {
        var date = new DateTimeOffset(2026, 9, 15, 8, 0, 0, TimeSpan.FromHours(4));
        Assert.Equal("26090003", Numbering.NextDocumentNumber(date, ["26090001", "26090002", "26080007"]));
    }

    [Fact]
    public void A_new_month_restarts_at_one()
    {
        var october = new DateTimeOffset(2026, 10, 1, 8, 0, 0, TimeSpan.FromHours(4));
        Assert.Equal("26100001", Numbering.NextDocumentNumber(october, ["26090001", "26090002"]));
    }

    [Fact]
    public void Past_9999_the_number_grows_to_five_digits()
    {
        var date = new DateTimeOffset(2026, 9, 30, 8, 0, 0, TimeSpan.FromHours(4));
        Assert.Equal("260910000", Numbering.NextDocumentNumber(date, ["26099999"]));
    }

    [Fact]
    public void Old_style_numbers_do_not_disturb_the_sequence()
    {
        var date = new DateTimeOffset(2026, 9, 2, 8, 0, 0, TimeSpan.FromHours(4));
        Assert.Equal("26090001", Numbering.NextDocumentNumber(date, ["PO-2026-0001", "SI-2026-0002"]));
    }

    [Fact]
    public void The_month_is_taken_in_gulf_time_not_utc()
    {
        // 31 Aug 22:00 UTC is already 1 Sep 02:00 in the Gulf — the day the user picked.
        var lateAugustUtc = new DateTimeOffset(2026, 8, 31, 22, 0, 0, TimeSpan.Zero);
        Assert.Equal("26090001", Numbering.NextDocumentNumber(lateAugustUtc, []));
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test backend/Finora.slnx --filter "FullyQualifiedName~NumberingTests" 2>&1 | tail -5`
Expected: build error — `Numbering` does not exist.

- [ ] **Step 3: Write the implementation**

```csharp
// backend/src/Modules/Erp/Finora.Erp.Domain/Numbering.cs
using System.Globalization;

namespace Finora.Erp.Domain;

/// <summary>
/// The codes and numbers the server assigns on the user's behalf. Pure functions over what is
/// already stored, so the rule lives in one place and the SPA's offline copy
/// (<c>apps/erp-panel/src/utils/numbering.ts</c>) can mirror it line for line.
///
/// <para>
/// Max-plus-one rather than a database sequence, for the same reason the invoice ids are: a
/// sequence leaves gaps an auditor reads as deleted rows, and it would not know about the
/// codes that arrived by snapshot. Nothing here is ever deleted, only deactivated, so a code is
/// never reused.
/// </para>
/// </summary>
public static class Numbering
{
    /// <summary>
    /// The desk sits in the Gulf. A document dated "1 Sep" by a user in Dubai arrives as
    /// 31 Aug 20:00Z, and its number must still say 2609 — so the month is read in Gulf time.
    /// </summary>
    public static readonly TimeSpan GulfOffset = TimeSpan.FromHours(4);

    /// <summary>"1", "2", … — one past the highest code that is an integer; strays ignored.</summary>
    public static string NextIntegerCode(IEnumerable<string> existing)
    {
        var highest = 0;
        foreach (var code in existing)
        {
            if (int.TryParse(code, NumberStyles.None, CultureInfo.InvariantCulture, out var n))
            {
                highest = Math.Max(highest, n);
            }
        }

        return (highest + 1).ToString(CultureInfo.InvariantCulture);
    }

    /// <summary>"copper-001" — the metal in lower case, then three digits counted per metal.</summary>
    public static string NextGoodCode(MetalType metal, IEnumerable<string> existing)
    {
        var prefix = metal.ToString().ToLowerInvariant() + "-";
        var highest = 0;
        foreach (var code in existing)
        {
            if (code.StartsWith(prefix, StringComparison.Ordinal)
                && int.TryParse(code[prefix.Length..], NumberStyles.None, CultureInfo.InvariantCulture, out var n))
            {
                highest = Math.Max(highest, n);
            }
        }

        return string.Create(CultureInfo.InvariantCulture, $"{prefix}{highest + 1:D3}");
    }

    /// <summary>"26090001" — YYMM of the document's date in Gulf time, then four digits counted
    /// across every document type, restarting each month.</summary>
    public static string NextDocumentNumber(DateTimeOffset date, IEnumerable<string> existing)
    {
        var month = date.ToOffset(GulfOffset).ToString("yyMM", CultureInfo.InvariantCulture);
        var highest = 0;
        foreach (var number in existing)
        {
            if (number.Length > month.Length
                && number.StartsWith(month, StringComparison.Ordinal)
                && int.TryParse(number[month.Length..], NumberStyles.None, CultureInfo.InvariantCulture, out var n))
            {
                highest = Math.Max(highest, n);
            }
        }

        return string.Create(CultureInfo.InvariantCulture, $"{month}{highest + 1:D4}");
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dotnet test backend/Finora.slnx --filter "FullyQualifiedName~NumberingTests" 2>&1 | tail -5`
Expected: `Passed! - Failed: 0, Passed: 12`

- [ ] **Step 5: Commit**

```bash
git add backend/src/Modules/Erp/Finora.Erp.Domain/Numbering.cs backend/tests/Finora.UnitTests/NumberingTests.cs
git commit -m "feat(erp): the three numbering rules, as pure functions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Master data — the server assigns the code

**Files:**
- Modify: `backend/src/Modules/Erp/Finora.Erp.Infrastructure/MasterData/MasterDataContracts.cs`
- Modify: `backend/src/Modules/Erp/Finora.Erp.Infrastructure/MasterData/MasterDataService.cs`
- Modify: `backend/contracts/error-codes.json`
- Modify: `backend/tests/Finora.UnitTests/ErrorCodeContractTests.cs`
- Test: `backend/tests/Finora.IntegrationTests/MasterDataTests.cs`

**Interfaces:**
- Consumes: `Numbering.NextIntegerCode`, `Numbering.NextGoodCode` (Task 1).
- Produces: input records **without** `Code`:
  - `CustomerInput(string Name, Currency DefaultCurrency, CustomerType CustomerType, string? ContactName, string? Email, string? Phone, string? Country, int PaymentTermsDays, decimal CreditLimit, bool? PortalAccount)`
  - `PartnerInput(string Name)`
  - `WarehouseInput(string Name, string? Location)`
  - `CostCentreInput(string Name, string? Description)`
  - `GoodInput(string Name, MetalType MetalType, GoodForm? Form, GoodUnit Unit, string? HsCode, string? Description)`
  - `ChargeCategoryInput(string Name, ChargeDirection Direction, ChargeScope Scope, string? Description)`
  - Ids: `cust-1`, `ptnr-1`, `wh-1` (from the code), `cc-0001`, `good-0001`, `ccat-0001` (sequential, unchanged).

- [ ] **Step 1: Rewrite the integration tests that name codes**

In `backend/tests/Finora.IntegrationTests/MasterDataTests.cs`:

Replace the two helper factories at the bottom of the class with:

```csharp
    private static CustomerInput Customer(string name) =>
        new(name, Currency.USD, CustomerType.BUYER, null, null, null, null, 30, 0m, null);

    private static GoodInput Good(string name, MetalType metal = MetalType.COPPER) =>
        new(name, metal, null, GoodUnit.MT, null, null);
```

Delete these tests outright (their guard no longer exists):
`A_repeated_customer_code_is_refused_with_duplicate_code`,
`A_charge_category_code_may_not_repeat_within_a_direction`.

Replace `A_customers_id_is_derived_from_its_code`, `Sequential_ids_continue_past_the_highest_already_stored`, `A_good_needs_both_a_name_and_a_code` and `A_charge_category_code_may_repeat_across_directions` with:

```csharp
    [Fact]
    public async Task Customers_are_numbered_from_one_and_the_id_follows_the_code()
    {
        var first = await _service.CreateCustomerAsync(Customer("Alco Metal Trading"));
        var second = await _service.CreateCustomerAsync(Customer("Million Gen Tr"));

        Assert.Equal("1", first.Entity.Code);
        Assert.Equal("cust-1", first.Entity.Id);
        Assert.Equal("2", second.Entity.Code);
        Assert.Equal("cust-2", second.Entity.Id);
    }

    [Fact]
    public async Task Partners_warehouses_and_cost_centres_count_separately()
    {
        await _service.CreatePartnerAsync(new PartnerInput("Crescent Capital"));
        var partner = await _service.CreatePartnerAsync(new PartnerInput("Gulf Metals JV"));
        var warehouse = await _service.CreateWarehouseAsync(new WarehouseInput("Main Warehouse", "Jebel Ali"));
        await _service.CreateCostCentreAsync(new CostCentreInput("Logistics", null));
        var centre = await _service.CreateCostCentreAsync(new CostCentreInput("Admin", null));

        Assert.Equal("2", partner.Entity.Code);
        Assert.Equal("ptnr-2", partner.Entity.Id);
        Assert.Equal("1", warehouse.Entity.Code);
        Assert.Equal("wh-1", warehouse.Entity.Id);
        Assert.Equal("2", centre.Entity.Code);
        Assert.Equal("cc-0002", centre.Entity.Id);
    }

    [Fact]
    public async Task Goods_are_coded_by_metal()
    {
        var cathode = await _service.CreateGoodAsync(Good("Copper Cathode"));
        var ingot = await _service.CreateGoodAsync(Good("Copper Ingot"));
        var aluminium = await _service.CreateGoodAsync(Good("Aluminium Ingot", MetalType.ALUMINIUM));

        Assert.Equal("copper-001", cathode.Entity.Code);
        Assert.Equal("copper-002", ingot.Entity.Code);
        Assert.Equal("aluminium-001", aluminium.Entity.Code);
    }

    [Fact]
    public async Task A_goods_metal_type_cannot_be_changed_after_creation()
    {
        var created = await _service.CreateGoodAsync(Good("Copper Cathode"));

        var edited = await _service.UpdateGoodAsync(
            created.Entity.Id, Good("Copper Cathode 99.9", MetalType.ALUMINIUM));

        Assert.Equal(MetalType.COPPER, edited.Entity.MetalType);
        Assert.Equal("copper-001", edited.Entity.Code);
        Assert.Equal("Copper Cathode 99.9", edited.Entity.Name);
    }

    [Fact]
    public async Task A_good_still_needs_a_name()
    {
        var error = await Assert.ThrowsAsync<DomainException>(() => _service.CreateGoodAsync(Good("  ")));
        Assert.Equal("name-required", error.Code);
    }

    [Fact]
    public async Task Expense_and_revenue_categories_count_separately()
    {
        var freight = await _service.CreateChargeCategoryAsync(
            new ChargeCategoryInput("Freight", ChargeDirection.EXPENSE, ChargeScope.INVOICE, null));
        var customs = await _service.CreateChargeCategoryAsync(
            new ChargeCategoryInput("Customs", ChargeDirection.EXPENSE, ChargeScope.INVOICE, null));
        var commission = await _service.CreateChargeCategoryAsync(
            new ChargeCategoryInput("Commission", ChargeDirection.REVENUE, ChargeScope.GENERAL, null));

        Assert.Equal("1", freight.Entity.Code);
        Assert.Equal("2", customs.Entity.Code);
        Assert.Equal("1", commission.Entity.Code);
    }
```

Then fix every other call site in this file that still passes a code: search the file for `Customer("` with two arguments, `new CostCentreInput(` with three arguments, `new ChargeCategoryInput(` with five arguments, `new WarehouseInput(` with three arguments, `new PartnerInput(` with two arguments, and `Good("` with a second string argument, and drop the code argument in each. (The remaining tests — portal account, bank accounts, edits, not-found — keep their meaning.)

- [ ] **Step 2: Run the master-data tests to verify they fail to compile**

Run: `dotnet test backend/Finora.slnx --filter "FullyQualifiedName~MasterDataTests" 2>&1 | grep -E "error|Passed|Failed" | head -5`
Expected: compile errors about the record constructors — the inputs still have `Code`.

- [ ] **Step 3: Remove `Code` from the six input records**

In `backend/src/Modules/Erp/Finora.Erp.Infrastructure/MasterData/MasterDataContracts.cs` replace the six records so they read exactly:

```csharp
public sealed record CustomerInput(
    string Name,
    Currency DefaultCurrency,
    CustomerType CustomerType,
    string? ContactName,
    string? Email,
    string? Phone,
    string? Country,
    int PaymentTermsDays,
    decimal CreditLimit,
    bool? PortalAccount);

public sealed record PartnerInput(string Name);

public sealed record WarehouseInput(string Name, string? Location);

public sealed record CostCentreInput(string Name, string? Description);

public sealed record GoodInput(
    string Name,
    MetalType MetalType,
    GoodForm? Form,
    GoodUnit Unit,
    string? HsCode,
    string? Description);

public sealed record ChargeCategoryInput(
    string Name,
    ChargeDirection Direction,
    ChargeScope Scope,
    string? Description);
```

And replace the comment block above `CustomerInput` with:

```csharp
// The inputs below mirror the `*Input` interfaces in the SPA's api.ts field for field. Codes are
// NOT here: the server assigns them (see Finora.Erp.Domain.Numbering) and a client that still
// posts one is ignored by System.Text.Json, so an older bundle keeps working. Where a field is
// immutable after create the server re-reads it from the stored record and ignores what arrived.
```

- [ ] **Step 4: Generate the codes in `MasterDataService`**

In `backend/src/Modules/Erp/Finora.Erp.Infrastructure/MasterData/MasterDataService.cs`:

`CreateCustomerAsync` — replace the block from `var code = input.Code...` through the duplicate check with:

```csharp
        var code = Numbering.NextIntegerCode(
            await db.Customers.Select(c => c.Code).ToListAsync(cancellationToken));
        var id = $"cust-{code}";
```

`CreatePartnerAsync` — same shape:

```csharp
        var code = Numbering.NextIntegerCode(
            await db.Partners.Select(p => p.Code).ToListAsync(cancellationToken));
        var id = $"ptnr-{code}";
```

`CreateWarehouseAsync`:

```csharp
        var code = Numbering.NextIntegerCode(
            await db.Warehouses.Select(w => w.Code).ToListAsync(cancellationToken));
        var id = $"wh-{code}";
```

`CreateCostCentreAsync` — replace the code line and the duplicate check with:

```csharp
        var code = Numbering.NextIntegerCode(
            await db.CostCentres.Select(c => c.Code).ToListAsync(cancellationToken));
```

`CreateGoodAsync` — delete the `code-required` and `duplicate-code` guards; after the duplicate-name check, mint the code from the metal:

```csharp
        var code = Numbering.NextGoodCode(
            input.MetalType, await db.Goods.Select(g => g.Code).ToListAsync(cancellationToken));
```

and change the summary to `/// <summary>Guards in order: name-required, duplicate-name. The code is minted from the metal type. …</summary>`.

`UpdateGoodAsync` — the metal type is now immutable. Replace `Apply(good, input);` in the update path with a call that skips it; simplest is to split `Apply`:

```csharp
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
```

and in `UpdateGoodAsync` use `ApplyEditable(good, input);`.

`CreateChargeCategoryAsync` — delete the `code-required` and `duplicate-code` guards; mint per direction:

```csharp
        var direction = input.Direction;
        var code = Numbering.NextIntegerCode(
            await db.ChargeCategories
                .Where(c => c.Direction == direction)
                .Select(c => c.Code)
                .ToListAsync(cancellationToken));
```

`UpdateChargeCategoryAsync` — delete the `code-required` guard (the one at the former line ~553) and fix its summary to `/// <summary>Guards in order: not-found, name-required. Code, direction and scope are immutable.</summary>`.

Finally, in the private `Codes` class delete `CodeRequired` (keep `DuplicateCode`; Task 2 Step 6 wires it to the unique-index retry). Fix the class summary of `MasterDataService` to say ids are derived from the **assigned** code (`cust-1`, `ptnr-1`, `wh-1`).

- [ ] **Step 5: Retry once on a unique-index collision**

Two users saving at the same second can compute the same code. Add this helper to the `Shared` region of `MasterDataService`:

```csharp
    /// <summary>
    /// Saves, and on a unique-index collision (two users minted the same code in the same second)
    /// lets the caller mint again — once. A second collision is reported as duplicate-code rather
    /// than looped on, because two collisions in a row means something other than timing.
    /// </summary>
    private async Task SaveWithOneRetryAsync(Func<Task> mintAndAdd, CancellationToken cancellationToken)
    {
        await mintAndAdd();
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException first) when (IsUniqueViolation(first))
        {
            db.ChangeTracker.Clear();
            await mintAndAdd();
            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException second) when (IsUniqueViolation(second))
            {
                throw new DomainException(Codes.DuplicateCode);
            }
        }
    }

    private static bool IsUniqueViolation(DbUpdateException exception) =>
        exception.InnerException is Npgsql.PostgresException { SqlState: "23505" };
```

Use it in `CreatePartnerAsync`, `CreateWarehouseAsync`, `CreateCostCentreAsync`, `CreateGoodAsync` and `CreateChargeCategoryAsync`: move the "mint code + build entity + `db.X.Add(...)`" lines into the `mintAndAdd` lambda and drop the direct `SaveChangesAsync`. `CreateCustomerAsync` also calls `AssignPortalAccountAsync` before saving — put that inside the lambda too, after the `Add`. Declare the entity variable outside the lambda (`Good good = null!;`) so the `ResultAsync` call after it can read the id. `Npgsql` is already referenced by the Infrastructure project (the DbContext uses it).

- [ ] **Step 6: Update the error-code contract**

In `backend/contracts/error-codes.json` remove the line `"code-required",`.
In `backend/tests/Finora.UnitTests/ErrorCodeContractTests.cs` add to `BackendOnlyCodes`, after the `"warehouse-not-found",` line:

```csharp
        // Codes are assigned by the server now, so the browser never raises this itself. It can
        // still come back when two people save in the same second and the retry also collides —
        // the modals show their generic failure message for it, which is honest for a race.
        "duplicate-code",
```

- [ ] **Step 7: Build and run the master-data and contract tests**

Run: `dotnet build backend/Finora.slnx 2>&1 | grep -E "error|Warn|Build succeeded" | head -10`
Expected: `Build succeeded.` with 0 warnings (warnings are errors).

Run: `dotnet test backend/Finora.slnx --filter "FullyQualifiedName~MasterDataTests|FullyQualifiedName~ErrorCodeContractTests|FullyQualifiedName~ArchitectureTests" 2>&1 | tail -5`
Expected: all passed. (If `ErrorCodeContractTests` reports `code-required` or `duplicate-code` as *missing*, the SPA still throws it somewhere — that is fixed in Task 4; re-run after Task 4.)

- [ ] **Step 8: Commit**

```bash
git add backend/src/Modules/Erp/Finora.Erp.Infrastructure/MasterData backend/contracts/error-codes.json backend/tests/Finora.UnitTests/ErrorCodeContractTests.cs backend/tests/Finora.IntegrationTests/MasterDataTests.cs
git commit -m "feat(erp): master-data codes are assigned by the server

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Trade documents — YYMM + 4 digits, one shared sequence

**Files:**
- Modify: `backend/src/Modules/Erp/Finora.Erp.Application/InvoiceContracts.cs`
- Modify: `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Trade/InvoiceService.cs`
- Modify: `backend/contracts/error-codes.json`
- Test: `backend/tests/Finora.IntegrationTests/InvoiceTests.cs`

**Interfaces:**
- Consumes: `Numbering.NextDocumentNumber` (Task 1).
- Produces: `InvoiceInput(string InvoiceType, string ContractId, DateTimeOffset InvoiceDate, string? Currency, decimal? ExchangeRate, string? Description)` and `InvoiceHeaderPatch(DateTimeOffset? InvoiceDate, string? Currency, decimal? ExchangeRate, string? Description)` — i.e. the existing records with the `InvoiceNumber` member removed and everything else unchanged. (Open the file and remove only that member from each; keep the other parameters and their order exactly as they are.)

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/Finora.IntegrationTests/InvoiceTests.cs`, inside the class, using the existing `AsManagerAsync`, `ResetAsync`, `PostAsync`, `DraftAsync` helpers:

```csharp
    /* --------------------------------- Numbering --------------------------------- */

    private static string Number(JsonElement result) =>
        result.GetProperty("entity").GetProperty("invoiceNumber").GetString()!;

    [Fact]
    public async Task Numbers_are_yymm_plus_four_digits_and_shared_across_types()
    {
        await ResetAsync();
        var c = await AsManagerAsync(fixture);

        var order = await PostAsync(c, "/api/erp/invoices",
            new { invoiceType = "PURCHASE_ORDER", contractId = "ctr-1", invoiceDate = "2026-09-05T08:00:00+04:00" });
        var sale = await PostAsync(c, "/api/erp/invoices",
            new { invoiceType = "SALE_INVOICE", contractId = "ctr-1", invoiceDate = "2026-09-20T08:00:00+04:00" });

        Assert.Equal("26090001", Number(order));
        Assert.Equal("26090002", Number(sale));
    }

    [Fact]
    public async Task A_new_month_restarts_the_sequence()
    {
        await ResetAsync();
        var c = await AsManagerAsync(fixture);

        await PostAsync(c, "/api/erp/invoices",
            new { invoiceType = "SALE_ORDER", contractId = "ctr-1", invoiceDate = "2026-09-05T08:00:00+04:00" });
        var october = await PostAsync(c, "/api/erp/invoices",
            new { invoiceType = "SALE_ORDER", contractId = "ctr-1", invoiceDate = "2026-10-01T08:00:00+04:00" });

        Assert.Equal("26100001", Number(october));
    }

    [Fact]
    public async Task A_posted_number_is_ignored_not_honoured()
    {
        await ResetAsync();
        var c = await AsManagerAsync(fixture);

        var created = await PostAsync(c, "/api/erp/invoices",
            new { invoiceType = "SALE_ORDER", contractId = "ctr-1", invoiceDate = "2026-09-05T08:00:00+04:00", invoiceNumber = "MINE-1" });

        Assert.Equal("26090001", Number(created));
    }

    [Fact]
    public async Task Editing_the_header_cannot_change_the_number()
    {
        await ResetAsync();
        var c = await AsManagerAsync(fixture);
        var id = DraftAsync(c, "SALE_ORDER").Result;

        var patched = await c.PatchAsJsonAsync(new Uri($"/api/erp/invoices/{id}", UriKind.Relative),
            new { invoiceNumber = "MINE-2", description = "still a draft" });
        patched.EnsureSuccessStatusCode();
        var body = await patched.Content.ReadFromJsonAsync<JsonElement>(Json);

        Assert.Equal("26080001", Number(body));
        Assert.Equal("still a draft", body.GetProperty("entity").GetProperty("description").GetString());
    }

    [Fact]
    public async Task A_converted_document_takes_the_month_it_is_made_in()
    {
        await ResetAsync();
        var c = await AsManagerAsync(fixture);
        var id = await DraftAsync(c, "SALE_ORDER");                 // dated 2026-08-13 → 26080001
        await AddLineAsync(c, id, 10m);
        await PostAsync(c, $"/api/erp/invoices/{id}/confirm");

        var converted = await PostAsync(c, $"/api/erp/invoices/{id}/convert", new { targetType = "SALE_INVOICE" });

        var expectedMonth = DateTimeOffset.UtcNow.ToOffset(Numbering.GulfOffset)
            .ToString("yyMM", System.Globalization.CultureInfo.InvariantCulture);
        Assert.StartsWith(expectedMonth, Number(converted), StringComparison.Ordinal);
        Assert.Equal(expectedMonth + "0001", Number(converted));
    }
```

Check the header-patch route and verb first: `grep -n "MapPatch\|MapPut" backend/src/Modules/Erp/Finora.Erp.Infrastructure/Trade/InvoiceEndpoints.cs` (or wherever `UpdateHeaderAsync` is mapped — `grep -rn "UpdateHeaderAsync" backend/src --include=*.cs`). If it is `MapPut`, use `PutAsJsonAsync` in the test above. Also confirm the confirm route needs a warehouse: `grep -n "confirm" backend/src/Modules/Erp/Finora.Erp.Infrastructure/Trade/InvoiceEndpoints.cs`; if confirming a SALE_ORDER needs no warehouse body (orders move no stock), the bare `PostAsync` above is right — otherwise copy the body another test in this file already uses for confirming an order.

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `dotnet test backend/Finora.slnx --filter "FullyQualifiedName~InvoiceTests.Numbers_are_yymm|FullyQualifiedName~InvoiceTests.A_new_month|FullyQualifiedName~InvoiceTests.A_posted_number|FullyQualifiedName~InvoiceTests.Editing_the_header_cannot|FullyQualifiedName~InvoiceTests.A_converted_document_takes" 2>&1 | tail -8`
Expected: FAIL — numbers come back as `PO-2026-0001` style, and `Numbering` is unused.

- [ ] **Step 3: Remove `InvoiceNumber` from the inputs**

In `backend/src/Modules/Erp/Finora.Erp.Application/InvoiceContracts.cs` delete the `string? InvoiceNumber,` parameter from `InvoiceInput` and from `InvoiceHeaderPatch`, and delete the `<param name="InvoiceNumber">…</param>` doc block above `InvoiceInput`.

- [ ] **Step 4: Number documents with `Numbering`**

In `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Trade/InvoiceService.cs`:

In `CreateAsync`, replace everything from `var number = input.InvoiceNumber?.Trim();` through the closing brace of the `else` with:

```csharp
        var number = NextNumber(all, input.InvoiceDate);
```

In `UpdateHeaderAsync`, delete the whole `var number = patch.InvoiceNumber?.Trim(); if (...) { ... }` block — the number is never editable.

In `ConvertAsync`, change `InvoiceNumber = NextNumber(all, target, today),` to `InvoiceNumber = NextNumber(all, today),`.

In the `Numbering` region: delete the `NumberPrefix` dictionary and the old `NextNumber` method (keep `IdPrefix` and `NextInvoiceId` — row ids are unchanged), and add:

```csharp
    /// <summary>
    /// The next document number: <c>YYMM</c> of the document's date plus four digits, counted
    /// across every type and every status — cancelled and old-style numbers included — so a
    /// number is never issued twice. See <see cref="Numbering.NextDocumentNumber"/>.
    /// </summary>
    private static string NextNumber(IEnumerable<Invoice> all, DateTimeOffset date) =>
        Numbering.NextDocumentNumber(date, all.Select(i => i.InvoiceNumber));
```

Delete `public const string DuplicateNumber = "duplicate-number";` from the service's `Codes` class (nothing raises it now), and remove `"duplicate-number",` from `backend/contracts/error-codes.json`.

- [ ] **Step 5: Build and run the invoice, contract and architecture tests**

Run: `dotnet build backend/Finora.slnx 2>&1 | grep -E "error|Build succeeded" | head -5`
Expected: `Build succeeded.`

Run: `dotnet test backend/Finora.slnx --filter "FullyQualifiedName~InvoiceTests|FullyQualifiedName~ErrorCodeContractTests|FullyQualifiedName~ArchitectureTests|FullyQualifiedName~SnapshotRoundTrip" 2>&1 | tail -5`
Expected: all passed. (`ErrorCodeContractTests` may still name `duplicate-number` as handled-but-absent until Task 4 removes it from the SPA; that direction only excuses, it does not fail.)

- [ ] **Step 6: Commit**

```bash
git add backend/src/Modules/Erp/Finora.Erp.Application/InvoiceContracts.cs backend/src/Modules/Erp/Finora.Erp.Infrastructure/Trade/InvoiceService.cs backend/contracts/error-codes.json backend/tests/Finora.IntegrationTests/InvoiceTests.cs
git commit -m "feat(erp): document numbers are YYMM plus four digits, one sequence for all types

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The SPA's data layer — no code in any input, same rules offline

**Files:**
- Create: `apps/erp-panel/src/utils/numbering.ts`
- Modify: `apps/erp-panel/src/services/api.ts` (the `*Input` interfaces and `create*Local` / `updateGoodLocal` functions named below; `nextInvoiceNumber`, `previewInvoiceNumber`, `InvoiceInput`, `InvoiceHeaderPatch`)
- Modify: `apps/erp-panel/src/mock/data.ts:68` (`SCHEMA_VERSION`)

**Interfaces:**
- Produces (TypeScript):
  - `nextIntegerCode(existing: readonly string[]): string`
  - `nextGoodCode(metal: MetalType, existing: readonly string[]): string`
  - `nextDocumentNumber(dateIso: string, existing: readonly string[]): string`
  - `CustomerInput`, `PartnerInput`, `WarehouseInput`, `CostCentreInput`, `GoodInput`, `ChargeCategoryInput` without `code`; `InvoiceInput` and `InvoiceHeaderPatch` without `invoiceNumber`.

- [ ] **Step 1: Write the numbering port**

```ts
// apps/erp-panel/src/utils/numbering.ts
import type { MetalType } from '@/types';

/**
 * The codes the server assigns, mirrored line for line from
 * `backend/src/Modules/Erp/Finora.Erp.Domain/Numbering.cs`.
 *
 * Used only by the offline fallback in `api.ts` (a browser that lost the API) and by the sample
 * data generator, so a record made without the server still carries the shape the server would
 * have given it. Change the C# and this file together.
 */

const GULF_OFFSET_MS = 4 * 60 * 60 * 1000;

/** "1", "2", … — one past the highest existing code that is an integer; strays ignored. */
export function nextIntegerCode(existing: readonly string[]): string {
  let highest = 0;
  for (const code of existing) {
    if (/^\d+$/.test(code)) highest = Math.max(highest, Number(code));
  }
  return String(highest + 1);
}

/** "copper-001" — lowercase metal, then three digits counted per metal (growing past 999). */
export function nextGoodCode(metal: MetalType, existing: readonly string[]): string {
  const prefix = `${metal.toLowerCase()}-`;
  let highest = 0;
  for (const code of existing) {
    if (code.startsWith(prefix) && /^\d+$/.test(code.slice(prefix.length))) {
      highest = Math.max(highest, Number(code.slice(prefix.length)));
    }
  }
  return `${prefix}${String(highest + 1).padStart(3, '0')}`;
}

/** "26090001" — YYMM of the date in Gulf time (UTC+4), then four digits counted across every
 *  document type, restarting each month and growing past 9999 rather than failing. */
export function nextDocumentNumber(dateIso: string, existing: readonly string[]): string {
  const gulf = new Date(new Date(dateIso).getTime() + GULF_OFFSET_MS);
  const month = `${String(gulf.getUTCFullYear() % 100).padStart(2, '0')}${String(gulf.getUTCMonth() + 1).padStart(2, '0')}`;
  let highest = 0;
  for (const number of existing) {
    if (number.length > 4 && number.startsWith(month) && /^\d+$/.test(number.slice(4))) {
      highest = Math.max(highest, Number(number.slice(4)));
    }
  }
  return `${month}${String(highest + 1).padStart(4, '0')}`;
}
```

- [ ] **Step 2: Remove `code` from the six input interfaces and use the rules in the offline paths**

In `apps/erp-panel/src/services/api.ts`, add `import { nextDocumentNumber, nextGoodCode, nextIntegerCode } from '@/utils/numbering';` near the other imports, then:

- `CustomerInput`: delete `code: string;`. In `createCustomerLocal` replace `const code = input.code.trim().toUpperCase(); const id = \`cust-${code.toLowerCase()}\`; if (db.customers.some((c) => c.id === id)) throw new Error('duplicate-code');` with
  ```ts
  const code = nextIntegerCode(db.customers.map((c) => c.code));
  const id = `cust-${code}`;
  ```
- `PartnerInput`: delete `code: string;`. In `createPartnerLocal` replace the three code/id/duplicate lines with
  ```ts
  const code = nextIntegerCode(db.partners.map((p) => p.code));
  const id = `ptnr-${code}`;
  ```
- `WarehouseInput`: delete `code: string;`. In `createWarehouseLocal` replace the three lines with
  ```ts
  const code = nextIntegerCode(db.warehouses.map((w) => w.code));
  const id = `wh-${code}`;
  ```
- `CostCentreInput`: delete `code: string;`. In `createCostCentreLocal` replace the code line and its `duplicate-code` throw with
  ```ts
  const code = nextIntegerCode(db.costCentres.map((cc) => cc.code));
  ```
- `GoodInput`: delete `code: string;`. In `createGoodLocal` delete the `code-required` and `duplicate-code` lines and, after the duplicate-name check, add
  ```ts
  const code = nextGoodCode(input.metalType, db.goods.map((g) => g.code));
  ```
  In `updateGoodLocal` delete the line `good.metalType = input.metalType;` (immutable now). Update the two doc comments above `createGood` / `updateGood` so they no longer list `code-required` / `duplicate-code`.
- `ChargeCategoryInput`: delete `code: string;`. In `createChargeCategoryLocal` delete the `code-required` line and the `duplicate-code` block and add
  ```ts
  const code = nextIntegerCode(
    db.chargeCategories.filter((c) => c.direction === input.direction).map((c) => c.code),
  );
  ```
  In `updateChargeCategoryLocal` delete `if (!input.code.trim()) throw new Error('code-required');` and fix the comment above `updateChargeCategory` (guards are now not-found → name-required).
- Check nothing else in `api.ts` reads `input.code`: `grep -n "input.code" apps/erp-panel/src/services/api.ts` must print nothing.

- [ ] **Step 3: Remove the invoice number from the SPA's inputs and delete the preview**

Still in `api.ts`:
- `InvoiceInput`: delete `invoiceNumber?: string;`. `InvoiceHeaderPatch`: delete `invoiceNumber?: string;` and change its doc comment to `/** DRAFT only. The number is assigned by the server and cannot be changed. */`.
- Delete `INVOICE_NUMBER_PREFIX`, `nextInvoiceNumber` and `previewInvoiceNumber` (the whole block from the prefix map through the end of `previewInvoiceNumber`). Then `grep -n "previewInvoiceNumber\|nextInvoiceNumber\|INVOICE_NUMBER_PREFIX" apps/erp-panel/src -r` must show only `CreateInvoiceModal.tsx` (fixed in Task 5).
- Keep `nextDocumentNumber` imported only if something in `api.ts` uses it; if the grep in the previous bullet shows no use, import it in Task 6 (sample data) instead and drop it from this import line to keep lint clean.

- [ ] **Step 4: Bump the schema version**

In `apps/erp-panel/src/mock/data.ts` change `const SCHEMA_VERSION = 6;` to `const SCHEMA_VERSION = 7;` and add to the comment block above it:

```
 * Schema v7 (2026-09-03): codes and document numbers are assigned by the server
 * (docs/superpowers/specs/2026-09-03-auto-codes-design.md). No field changed shape, but the
 * demo dataset's codes did, and a v6 blob would mix `AM`-style codes with `1`-style ones.
```

- [ ] **Step 5: Typecheck — expect only the form files to fail**

Run: `npm run typecheck -w @finora/erp-panel 2>&1 | grep "error TS" | cut -c1-120`
Expected: errors only in `src/pages/**/*FormModal.tsx` and `src/pages/tradeInvoices/CreateInvoiceModal.tsx` (they still build inputs with `code` / `invoiceNumber`). No errors in `api.ts`, `numbering.ts` or `data.ts`.

- [ ] **Step 6: Commit**

```bash
git add apps/erp-panel/src/utils/numbering.ts apps/erp-panel/src/services/api.ts apps/erp-panel/src/mock/data.ts
git commit -m "feat(erp): the data layer stops sending codes and mirrors the server's numbering offline

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The forms — no code to type, number assigned on save

**Files:**
- Modify: `apps/erp-panel/src/pages/customers/CustomerFormModal.tsx`
- Modify: `apps/erp-panel/src/pages/partners/PartnerFormModal.tsx`
- Modify: `apps/erp-panel/src/pages/warehouse/WarehouseFormModal.tsx`
- Modify: `apps/erp-panel/src/pages/baseInfo/CostCentreFormModal.tsx`
- Modify: `apps/erp-panel/src/pages/baseInfo/GoodFormModal.tsx`
- Modify: `apps/erp-panel/src/pages/baseInfo/ChargeCategoryFormModal.tsx`
- Modify: `apps/erp-panel/src/pages/tradeInvoices/CreateInvoiceModal.tsx`
- Modify: `apps/erp-panel/src/i18n/locales/en.json`, `ar.json`, `fa.json`

**Interfaces:**
- Consumes: the input types from Task 4.

- [ ] **Step 1: The same edit in each of the six master-data forms**

For **each** of `CustomerFormModal`, `PartnerFormModal`, `WarehouseFormModal`, `CostCentreFormModal`, `GoodFormModal`, `ChargeCategoryFormModal`:

1. In the form's values type (e.g. `CustomerFormValues`, `GoodFormValues`) delete the `code: string;` member.
2. In `initialValues` delete the `code: <entity>.code,` line.
3. In `submit`, delete `code: values.code.trim(),` from the input object.
4. Delete the `catch` branch that handles `'duplicate-code'` (the `form.setFields([{ name: 'code', … }])` block). Where that was the only branch in the `catch`, leave the generic `message.error(t('common.saveFailed'))`.
5. Replace the `<Form.Item name="code" …>…</Form.Item>` block with a read-only display shown **only when editing**:

```tsx
        {isEdit && (
          <Form.Item label={t('customers.code')}>
            <Input value={customer?.code} disabled />
          </Form.Item>
        )}
```

(use the form's own namespace and entity variable: `partners.code`/`partner`, `warehouse.code`/`warehouse`, `costCentres.code`/`costCentre`, `goods.code`/`good`, `chargeCategories.code`/`category` — check the prop name at the top of each file). In `CustomerFormModal` the field sits inside a `<Col xs={24} sm={12}>`; keep the `Col` and put the conditional inside it.

6. **`GoodFormModal` only:** the metal type is immutable after creation — add `disabled={isEdit}` to the `<Select …>` inside the `metalType` `Form.Item`.

- [ ] **Step 2: The document form**

In `apps/erp-panel/src/pages/tradeInvoices/CreateInvoiceModal.tsx`:
1. Delete `import { previewInvoiceNumber } from '@/services/api';` and the whole `useEffect` that calls it (the block beginning `// Prefill the auto-generated number…`). If `useEffect` is no longer used in the file, remove it from the React import.
2. Delete `invoiceNumber: string;` from `CreateInvoiceFormValues`, `invoiceNumber: invoice.invoiceNumber,` from `initialValues`, and the two `invoiceNumber: values.invoiceNumber,` lines in `submit` (patch and create).
3. Replace both `if (err instanceof Error && err.message === 'duplicate-number') { … } else { message.error(…) }` blocks with just `message.error(t('common.saveFailed'));`.
4. Replace the `<Form.Item name="invoiceNumber" …>…</Form.Item>` block with:

```tsx
        <Form.Item label={t('tradeInvoices.number')}>
          <Input
            value={isEdit ? invoice?.invoiceNumber : t('tradeInvoices.numberAssigned')}
            disabled
          />
        </Form.Item>
```

- [ ] **Step 3: Locale keys**

In all three files `apps/erp-panel/src/i18n/locales/{en,ar,fa}.json`:
- Delete the keys `codePlaceholder`, `codeInvalid` and `codeTaken` from the `customers`, `partners`, `warehouse`, `costCentres`, `goods` and `chargeCategories` sections. (Keep `code` — the label is still shown on edit.)
- In `tradeInvoices` delete `numberPlaceholder` and `numberTaken`, and add `numberAssigned`:

| file | value |
|---|---|
| `en.json` | `"numberAssigned": "Assigned automatically when you save"` |
| `ar.json` | `"numberAssigned": "يُعيَّن تلقائياً عند الحفظ"` |
| `fa.json` | `"numberAssigned": "هنگام ذخیره به‌صورت خودکار تعیین می‌شود"` |

Verify no leftover use: `grep -rn "codePlaceholder\|codeInvalid\|codeTaken\|numberPlaceholder\|numberTaken" apps/erp-panel/src` must print nothing.

- [ ] **Step 4: Typecheck, lint, build**

Run: `npm run typecheck -w @finora/erp-panel 2>&1 | tail -2 && npm run lint -w @finora/erp-panel 2>&1 | tail -3 && npm run build -w @finora/erp-panel 2>&1 | grep -E "built in|error"`
Expected: typecheck silent, lint `0 errors` (the pre-existing `statusColors.tsx` warning is allowed), build `✓ built in …`.

- [ ] **Step 5: Re-run the backend contract test (now that the SPA no longer throws the old codes)**

Run: `dotnet test backend/Finora.slnx --filter "FullyQualifiedName~ErrorCodeContractTests" 2>&1 | tail -3`
Expected: passed.

- [ ] **Step 6: Look at it in the browser**

Start the backend (`dotnet run --project backend/src/Finora.AppHost`) and the SPA (preview tool, `npm run dev`), sign in as `amir@finora.app` / `demo1234`, then:
- Base Info › Goods › New: no code field; save "Copper Cathode" (metal COPPER) → list shows `copper-001`. Edit it → code shown greyed, metal type greyed.
- Persons › New person: no code field; save → code `1`.
- Purchase › Orders › New order: the number field reads "Assigned automatically when you save"; after save the detail page shows `2609…0001` for today's month.
Take one screenshot of the goods list and one of the new document for the record.

- [ ] **Step 7: Commit**

```bash
git add apps/erp-panel/src/pages apps/erp-panel/src/i18n/locales
git commit -m "feat(erp): the forms stop asking for a code; the document number is assigned on save

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Sample data in the new shape

**Files:**
- Modify: `apps/erp-panel/src/mock/sampleData.ts` (goods seeds ~lines 120-129, partner seeds ~151-155, customer seeds ~170-179, the `id: \`cust-${seed.code.toLowerCase()}\`` line ~259, contract id line ~285, the four `invoiceNumber: '…'` literals ~659-790)

**Interfaces:**
- Consumes: `nextDocumentNumber`, `nextGoodCode`, `nextIntegerCode` from `@/utils/numbering` (Task 4).

- [ ] **Step 1: Codes come from the rules, not from the seed rows**

1. Import `{ nextDocumentNumber, nextGoodCode, nextIntegerCode } from '@/utils/numbering'` at the top of `sampleData.ts`.
2. **Goods**: remove the `code: 'CU-ING98'`-style property from every goods seed row and assign codes while building the `Good` objects, in array order, e.g.
   ```ts
   const goodCodes: string[] = [];
   const goods: Good[] = GOOD_SEEDS.map((seed, i) => {
     const code = nextGoodCode(seed.metalType, goodCodes);
     goodCodes.push(code);
     return { id: `good-${String(i + 1).padStart(4, '0')}`, code, /* …the existing fields… */ };
   });
   ```
   (Adapt to the loop the file already uses; the point is one `nextGoodCode` call per row, in order, so the first copper good is `copper-001`, the first aluminium good `aluminium-001`.)
3. **Partners**: drop the `code` property from the five seed rows; assign `nextIntegerCode` in order (`1`…`5`) and ids `ptnr-1`…`ptnr-5`.
4. **Customers**: drop the `code` property from the ten seed rows; assign `nextIntegerCode` in order (`1`…`10`); change the id line to ``id: `cust-${code}` ``; change the generated contract id line to use the assigned code (``${code}-P-…``). Keep the literal reference contract `AM-P-251101156` **exactly as it is** — it is the workbook's canonical check and is identified by its literal number; only its `customerId` must point at Alco's new id (`cust-1`, Alco being the first seed row).
5. **Invoice numbers**: add near the top of the invoice section
   ```ts
   const documentNumbers: string[] = [];
   const docNo = (dateIso: string): string => {
     const n = nextDocumentNumber(dateIso, documentNumbers);
     documentNumbers.push(n);
     return n;
   };
   ```
   and replace each `invoiceNumber: 'PO-2026-0001'` (and PP, PI, SO, and any others: `grep -n "invoiceNumber: '" apps/erp-panel/src/mock/sampleData.ts`) with `invoiceNumber: docNo(<that document's date variable>)`, e.g. `docNo(PURCHASE_ORDER_DATE)`. Documents must be created in date order so the sequence reads naturally; the existing code already does PO → PP → PI → SO.
6. Cost centres and charge categories in the sample: find their seed rows (`grep -n "costCentres\|chargeCategories" apps/erp-panel/src/mock/sampleData.ts | head`), drop the `code` property and assign `nextIntegerCode` in order — categories per direction.

- [ ] **Step 2: Check the generator still typechecks and the reference contract survives**

Run: `npm run typecheck -w @finora/erp-panel 2>&1 | tail -2 && grep -n "AM-P-251101156" apps/erp-panel/src/mock/sampleData.ts | head -3`
Expected: no type errors; the literal contract id is still present.

- [ ] **Step 3: Load it once**

With the dev backend and SPA running (Task 5 Step 6), Settings › Danger zone › Load sample data. Persons list shows codes `1`…`10`; Goods shows `copper-001`, `copper-002`, …, `aluminium-001`; Purchase › Orders shows an 8-digit number for the PO; the contract `AM-P-251101156` opens and its price per MT still reads 11,072.

- [ ] **Step 4: Commit**

```bash
git add apps/erp-panel/src/mock/sampleData.ts
git commit -m "feat(erp): the demo dataset carries server-shaped codes and numbers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Docs, full verification, merge

**Files:**
- Modify: `docs/flowcharts/finora-user-guide.html` (section 2 "Rules for codes" box, section 3 step 3, section 5 step 1's "PO-2026-0001")
- Modify: `docs/flowcharts/finora-flowcharts.html` (section 6 details: "Numbers are automatic per type and year (e.g. PO-2026-0001)")
- Modify: `CLAUDE.md` ("Domain model" / conventions: one line on server-assigned codes)

- [ ] **Step 1: Tell the users**

In `docs/flowcharts/finora-user-guide.html`:
- Section 2, replace the "Rules for codes" box content with:
  ```html
  <div class="box tip"><h3>Codes are automatic</h3><ul>
    <li>You never type a code. The system gives one when you save: persons, partners, warehouses, cost centres and categories count 1, 2, 3…; goods are named by metal, like <b>copper-001</b>.</li>
    <li>A code never changes. The metal type of a good is also fixed after saving.</li>
  </ul></div>
  ```
- Section 3, step 3 (`<b>Code</b> — short, example <i>AM</i>…`): replace with `<b>Code</b> — given by the system when you save (1, 2, 3…). It appears in contract numbers, e.g. <b>1-P-251101156</b>.` and drop the "This code is already in use" / "Letters, numbers and hyphens only" bullets from that page's "Cannot save?" box (replace the box with one bullet: "A person with the same name already exists — check the list before adding.").
- Section 5, step 1: change `a number like PO-2026-0001` to `a number like 26090001 — year, month, and a counter that restarts every month`.
- Section 2 step 1 also says "add each product… <b>code</b>" — delete the `<b>code</b>,` word there.

In `docs/flowcharts/finora-flowcharts.html`, section 6 details, replace the "Numbers are automatic per type and year (e.g. PO-2026-0001), editable while DRAFT." bullet with: `<li><b>Numbers</b> are assigned by the server: YYMM + 4 digits (e.g. <code>26090001</code>), one sequence for all six types, restarting each month. Never editable.</li>`.

In `CLAUDE.md` under "Conventions" add: `- **Codes and document numbers are server-assigned** (\`Finora.Erp.Domain.Numbering\`, mirrored in \`utils/numbering.ts\` for the offline path). Forms never take a code; see \`docs/superpowers/specs/2026-09-03-auto-codes-design.md\`.`

- [ ] **Step 2: Full verification**

Run, in order, and paste each tail into the commit or PR notes:
```bash
dotnet build backend/Finora.slnx 2>&1 | grep -E "error|warn|Build succeeded" | head -5
dotnet test backend/Finora.slnx 2>&1 | tail -6
npm run lint -w @finora/erp-panel 2>&1 | tail -3
npm run typecheck 2>&1 | tail -3
npm run build 2>&1 | grep -E "built in|error|Compiled" | head -5
```
Expected: build succeeded with 0 warnings; every test project green; lint 0 errors; typecheck silent; both apps build.

- [ ] **Step 3: Commit and merge**

```bash
git add docs/flowcharts/finora-user-guide.html docs/flowcharts/finora-flowcharts.html CLAUDE.md docs/superpowers/plans/2026-09-03-auto-codes.md
git commit -m "docs: codes are automatic — the guides and the project file say so

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git checkout main
git merge --no-ff feat/auto-codes -m "Merge feat/auto-codes: the server hands out every code and number"
git push origin main
```

Deployment (build the API + migrator + web images and ship them to 179.198.198.221) is a separate step the owner triggers; the three pre-existing rows on the new server (one good, two categories) are deleted with `DELETE FROM erp.charge_categories; DELETE FROM erp.goods;` before the new API starts, per the spec.
