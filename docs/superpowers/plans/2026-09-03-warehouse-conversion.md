# Warehouse conversion documents and stock cost — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Conversion document turns stock of one product into stock of others inside a warehouse, carries the cost (plus typed workshop costs, booked as an expense) onto the outputs, and every receipt and issue stores its cost per MT so stock has a value and a sale has a cost of sales.

**Architecture:** Cost is **stored at confirm time**, never recomputed on read. One server class, `StockLedger`, folds quantity and value per (warehouse, product) from confirmed receipts, issues, conversion inputs and outputs, and yields the moving-average unit cost. `ConversionService` validates and confirms in one transaction, creating the expense through the existing `ChargeService`. The SPA gets a Conversions tab, value columns on Inventory, and a cost-of-sales line on sale invoices; its `api.ts` mirrors the fold for display only.

**Tech Stack:** .NET 10 (EF Core + Npgsql, Minimal APIs, xUnit + Testcontainers) · Vite 6 + React 18 + AntD 5 + TypeScript strict · react-i18next (en / ar / fa / ku).

**Spec:** `docs/superpowers/specs/2026-09-03-warehouse-conversion-design.md`

## Global Constraints

- `dotnet build backend/Finora.slnx` treats warnings as errors; no EF Core in the Domain project; no `float`/`double` in domain files; `Math.Round` only via `Rounding.Money` (2 dp) / `Rounding.Quantity` (3 dp) / `Rounding.Rate` (4 dp).
- Every code the server can raise is in `backend/contracts/error-codes.json`; codes no screen branches on go in `ErrorCodeContractTests.BackendOnlyCodes` with a comment.
- Stock key = `warehouseId + "::" + product.Trim().ToLowerInvariant()` (as `WarehouseDocumentService.StockKey` today).
- Average unit cost = value ÷ quantity over CONFIRMED movements, 0 when quantity is 0 (spec §2.3).
- Numbers: conversions `CNV-YYYY-NNNN` (first free per year, like GRN/GDN); ids `cnv-0001`, lines `cnvin-N`, `cnvout-N`, `cnvcost-N`.
- Permission code **`conversions.confirm`**, Manager only; everything else on conversions uses `warehouse`.
- Every user-facing string via `t('...')` and present in **all four** locale files (`en`, `ar`, `fa`, `ku`) with identical key sets; RTL-safe layout (logical CSS).
- `SCHEMA_VERSION` in `apps/erp-panel/src/mock/data.ts` bumps to 8.
- Branch `feat/warehouse-conversion`; commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; commands run from `D:\projects\Emad\finora-alpha` with forward-slash paths (Git Bash). Docker Desktop must be running for the integration tests.

---

### Task 1: Domain — entities, status enum, and the cost split maths

**Files:**
- Create: `backend/src/Modules/Erp/Finora.Erp.Domain/Conversions.cs`
- Create: `backend/src/Modules/Erp/Finora.Erp.Domain/ConversionMath.cs`
- Modify: `backend/src/Modules/Erp/Finora.Erp.Domain/Enums.cs` (add `ConversionStatus` after `DocumentStatus`, ~line 208)
- Modify: `backend/src/Modules/Erp/Finora.Erp.Domain/Trade.cs` (`InventoryDocumentItem`, ~line 272: add two properties)
- Modify: `apps/erp-panel/src/types/index.ts` (add `ConversionStatus` union next to `InventoryDocType`, ~line 437)
- Modify: `backend/tests/Finora.UnitTests/EnumParityTests.cs` (add `ConversionStatus` to the `Enums()` theory data)
- Test: `backend/tests/Finora.UnitTests/ConversionMathTests.cs`

**Interfaces:**
- Produces:
  - `enum ConversionStatus { DRAFT, CONFIRMED, CANCELLED }` (C#) and `type ConversionStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED'` (TS).
  - Entities `ConversionDocument`, `ConversionInput`, `ConversionOutput`, `ConversionCost` (properties below).
  - `InventoryDocumentItem.UnitCostUsd` and `.CostUsd` (`decimal`, default 0).
  - `static decimal[] ConversionMath.Distribute(decimal total, IReadOnlyList<decimal> quantities, IReadOnlyList<decimal?> shares)` → cost per output, summing exactly to `total`.
  - `static decimal ConversionMath.Yield(decimal inputMt, decimal outputMt)` → percent, 2 dp, 0 when inputMt is 0.
  - `static bool ConversionMath.SharesAreValid(IReadOnlyList<decimal?> shares)`.

- [ ] **Step 1: Write the failing tests**

```csharp
// backend/tests/Finora.UnitTests/ConversionMathTests.cs
using Finora.Erp.Domain;

namespace Finora.UnitTests;

/// <summary>How a conversion's total cost lands on its outputs — the only arithmetic in the feature.</summary>
public sealed class ConversionMathTests
{
    [Fact]
    public void Without_shares_the_cost_follows_the_weight()
    {
        var split = ConversionMath.Distribute(10000m, [0.650m, 0.350m], [null, null]);
        Assert.Equal(new[] { 6500m, 3500m }, split);
    }

    [Fact]
    public void With_shares_the_cost_follows_the_shares()
    {
        var split = ConversionMath.Distribute(10000m, [0.650m, 0.350m], [98m, 2m]);
        Assert.Equal(new[] { 9800m, 200m }, split);
    }

    [Fact]
    public void The_last_output_absorbs_the_rounding_so_the_parts_sum_to_the_total()
    {
        var split = ConversionMath.Distribute(100m, [1m, 1m, 1m], [null, null, null]);
        Assert.Equal(new[] { 33.33m, 33.33m, 33.34m }, split);
        Assert.Equal(100m, split.Sum());
    }

    [Fact]
    public void A_single_output_takes_everything()
    {
        Assert.Equal(new[] { 10800m }, ConversionMath.Distribute(10800m, [0.600m], [null]));
    }

    [Fact]
    public void Shares_must_all_be_given_or_all_be_absent_and_sum_to_a_hundred()
    {
        Assert.True(ConversionMath.SharesAreValid([null, null]));
        Assert.True(ConversionMath.SharesAreValid([60m, 40m]));
        Assert.True(ConversionMath.SharesAreValid([33.33m, 33.33m, 33.34m]));
        Assert.False(ConversionMath.SharesAreValid([60m, null]));
        Assert.False(ConversionMath.SharesAreValid([60m, 30m]));
        Assert.False(ConversionMath.SharesAreValid([-10m, 110m]));
    }

    [Theory]
    [InlineData(1.000, 0.650, 65.00)]
    [InlineData(0.650, 0.600, 92.31)]
    [InlineData(0, 0.5, 0)]
    public void Yield_is_output_over_input_in_percent(decimal input, decimal output, decimal expected) =>
        Assert.Equal(expected, ConversionMath.Yield(input, output));
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test backend/Finora.slnx --filter "FullyQualifiedName~ConversionMathTests" 2>&1 | grep -E "error|Passed|Failed" | head -5`
Expected: compile errors — `ConversionMath` does not exist.

- [ ] **Step 3: Write the domain**

```csharp
// backend/src/Modules/Erp/Finora.Erp.Domain/Enums.cs — add after DocumentStatus
/// <summary>A conversion is edited as a DRAFT, moves stock and cost when CONFIRMED, and is
/// CANCELLED rather than deleted. Its own enum: <see cref="DocumentStatus"/> has no DRAFT and
/// backs a CHECK constraint on receipts and issues that must not widen.</summary>
public enum ConversionStatus
{
    DRAFT,
    CONFIRMED,
    CANCELLED,
}
```

```csharp
// backend/src/Modules/Erp/Finora.Erp.Domain/Trade.cs — inside InventoryDocumentItem, after QuantityMt
    /// <summary>USD per MT this line was valued at when confirmed: the invoice price for a
    /// receipt, the warehouse's average cost for an issue. 0 on lines from before costing.</summary>
    public decimal UnitCostUsd { get; set; }

    /// <summary>QuantityMt × UnitCostUsd, rounded to cents — the figure the stock value sums.</summary>
    public decimal CostUsd { get; set; }
```

```csharp
// backend/src/Modules/Erp/Finora.Erp.Domain/Conversions.cs
using System.Text.Json.Serialization;

namespace Finora.Erp.Domain;

/// <summary>
/// Stock of some products becomes stock of others, in one warehouse: cable is stripped to
/// copper, copper is melted to ingot. The document carries the cost along — what the inputs
/// were worth, plus whatever the workshop charged — so the outputs know what they cost.
/// </summary>
public sealed class ConversionDocument
{
    public required string Id { get; init; }

    /// <summary>'CNV-2026-0001'.</summary>
    public required string DocNumber { get; set; }

    public required string WarehouseId { get; init; }
    [JsonIgnore] public Warehouse? Warehouse { get; init; }

    public DateTimeOffset Date { get; set; }
    public ConversionStatus Status { get; set; } = ConversionStatus.DRAFT;
    public string? Notes { get; set; }

    /// <summary>The GENERAL expense document the cost lines were booked as, on confirm.</summary>
    public string? ChargeDocId { get; set; }

    /// <summary>Stored on confirm: Σ input CostUsd.</summary>
    public decimal TotalInputCostUsd { get; set; }

    /// <summary>Stored on confirm: Σ cost-line AmountUsd.</summary>
    public decimal TotalAddedCostUsd { get; set; }

    public DateTimeOffset CreatedAt { get; init; }

    public ICollection<ConversionInput> Inputs { get; init; } = [];
    public ICollection<ConversionOutput> Outputs { get; init; } = [];
    public ICollection<ConversionCost> Costs { get; init; } = [];
}

/// <summary>Metal that leaves the warehouse into the conversion.</summary>
public sealed class ConversionInput
{
    public required string Id { get; init; }
    public required string DocumentId { get; init; }
    [JsonIgnore] public ConversionDocument? Document { get; init; }

    /// <summary>Product NAME — stock is counted by it, exactly like receipts and issues.</summary>
    public required string Product { get; set; }
    public decimal QuantityMt { get; set; }

    /// <summary>The warehouse's average cost at confirm time; 0 while DRAFT.</summary>
    public decimal UnitCostUsd { get; set; }
    public decimal CostUsd { get; set; }
}

/// <summary>Metal that comes back out of the conversion.</summary>
public sealed class ConversionOutput
{
    public required string Id { get; init; }
    public required string DocumentId { get; init; }
    [JsonIgnore] public ConversionDocument? Document { get; init; }

    public required string Product { get; set; }
    public decimal QuantityMt { get; set; }

    /// <summary>Percent of the total cost this output takes. Null on every line means "by
    /// weight"; given, the lines must sum to 100.</summary>
    public decimal? SharePercent { get; set; }

    public decimal UnitCostUsd { get; set; }
    public decimal CostUsd { get; set; }
}

/// <summary>What the workshop charged: labour, gas, power. Booked as an expense on confirm.</summary>
public sealed class ConversionCost
{
    public required string Id { get; init; }
    public required string DocumentId { get; init; }
    [JsonIgnore] public ConversionDocument? Document { get; init; }

    /// <summary>An EXPENSE category with scope GENERAL.</summary>
    public required string CategoryId { get; set; }
    [JsonIgnore] public ChargeCategory? Category { get; init; }

    /// <summary>Who is paid.</summary>
    public required string PersonId { get; set; }
    [JsonIgnore] public Customer? Person { get; init; }

    public decimal Amount { get; set; }
    public Currency Currency { get; set; }
    public decimal FxRate { get; set; } = 1m;
    public decimal AmountUsd { get; set; }
    public string? Description { get; set; }
}
```

```csharp
// backend/src/Modules/Erp/Finora.Erp.Domain/ConversionMath.cs
using Finora.BuildingBlocks.Domain;

namespace Finora.Erp.Domain;

/// <summary>The arithmetic of a conversion, kept pure so it can be pinned by unit tests.</summary>
public static class ConversionMath
{
    /// <summary>
    /// Splits <paramref name="total"/> over the outputs. With no shares the split follows the
    /// weight; with shares it follows them. Every part is rounded to cents and the LAST output
    /// absorbs whatever rounding left over, so the parts always sum to the total exactly.
    /// </summary>
    public static decimal[] Distribute(
        decimal total, IReadOnlyList<decimal> quantities, IReadOnlyList<decimal?> shares)
    {
        var n = quantities.Count;
        var result = new decimal[n];
        if (n == 0)
        {
            return result;
        }

        var byShares = shares.Count == n && shares.All(s => s.HasValue);
        var totalQty = quantities.Sum();
        var allocated = 0m;
        for (var i = 0; i < n - 1; i++)
        {
            var fraction = byShares
                ? shares[i]!.Value / 100m
                : totalQty == 0m ? 0m : quantities[i] / totalQty;
            result[i] = Rounding.Money(total * fraction);
            allocated += result[i];
        }

        result[n - 1] = Rounding.Money(total - allocated);
        return result;
    }

    /// <summary>All given and summing to 100 (± 0.01), or all absent.</summary>
    public static bool SharesAreValid(IReadOnlyList<decimal?> shares)
    {
        if (shares.All(s => !s.HasValue))
        {
            return true;
        }

        if (shares.Any(s => !s.HasValue || s.Value < 0m))
        {
            return false;
        }

        return Math.Abs(shares.Sum(s => s!.Value) - 100m) <= 0.01m;
    }

    /// <summary>Output over input, as a percent to 2 dp; 0 when there is no input.</summary>
    public static decimal Yield(decimal inputMt, decimal outputMt) =>
        inputMt == 0m ? 0m : Rounding.Money(outputMt / inputMt * 100m);
}
```

TypeScript twin, in `apps/erp-panel/src/types/index.ts` right after `export type InventoryDocType = 'IN' | 'OUT';`:

```ts
/** A conversion is edited as a DRAFT, moves stock and cost when CONFIRMED, cancelled not deleted. */
export type ConversionStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
```

And in `backend/tests/Finora.UnitTests/EnumParityTests.cs`, add to the `Enums()` theory data after the `InvoiceStatus` row: `{ "ConversionStatus", EnumNames.Of<ConversionStatus>().ToArray() },`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dotnet test backend/Finora.slnx --filter "FullyQualifiedName~ConversionMathTests|FullyQualifiedName~EnumParityTests|FullyQualifiedName~ArchitectureTests" 2>&1 | tail -4`
Expected: all passed (the architecture tests confirm no EF/float slipped into Domain).

- [ ] **Step 5: Commit**

```bash
git add backend/src/Modules/Erp/Finora.Erp.Domain apps/erp-panel/src/types/index.ts backend/tests/Finora.UnitTests
git commit -m "feat(erp): conversion documents in the domain, and the cost split maths

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Persistence — EF configuration, migration, snapshot

**Files:**
- Create: `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Configuration/ConversionConfiguration.cs`
- Modify: `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Configuration/TradeConfiguration.cs` (`InventoryDocumentItemConfiguration`, ~line 256: two columns)
- Modify: `backend/src/Modules/Erp/Finora.Erp.Infrastructure/ErpDbContext.cs` (four `DbSet`s after `InventoryDocumentItems`, ~line 55)
- Modify: `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Snapshot/ErpSnapshot.cs` (~line 35: `Conversions`)
- Modify: `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Snapshot/SnapshotService.cs` (read ~line 51, replace ~line 201, clear ~line 260)
- Create: `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Migrations/<timestamp>_AddConversions.cs` (+ `.Designer.cs`, generated)
- Test: `backend/tests/Finora.IntegrationTests/SnapshotRoundTripTests.cs` (one new fact)

**Interfaces:**
- Consumes: the four entities and `ConversionStatus` (Task 1).
- Produces: `ErpDbContext.ConversionDocuments / ConversionInputs / ConversionOutputs / ConversionCosts`; `ErpSnapshot.Conversions : IReadOnlyList<ConversionDocument>`; tables `erp.conversion_documents`, `erp.conversion_inputs`, `erp.conversion_outputs`, `erp.conversion_costs`; columns `unit_cost_usd`, `cost_usd` on `erp.inventory_document_items`.

- [ ] **Step 1: Write the failing round-trip test**

Append to `backend/tests/Finora.IntegrationTests/SnapshotRoundTripTests.cs` (follow the file's existing helper for replacing and re-reading a snapshot; the fact below assumes a `RoundTripAsync(ErpSnapshot)` helper exists — if the file names it differently, use that name):

```csharp
    [Fact]
    public async Task A_conversion_survives_the_round_trip_with_its_three_line_kinds()
    {
        var snapshot = new ErpSnapshot
        {
            Warehouses = [new Warehouse { Id = "wh-1", Name = "Main", Code = "1" }],
            Customers = [new Customer { Id = "cust-1", Name = "Workshop", Code = "1" }],
            ChargeCategories = [new ChargeCategory { Id = "ccat-0001", Name = "Processing", Code = "1", Direction = ChargeDirection.EXPENSE, Scope = ChargeScope.GENERAL }],
            Conversions =
            [
                new ConversionDocument
                {
                    Id = "cnv-0001", DocNumber = "CNV-2026-0001", WarehouseId = "wh-1",
                    Date = DateTimeOffset.Parse("2026-09-03T00:00:00Z"), Status = ConversionStatus.CONFIRMED,
                    TotalInputCostUsd = 10000m, TotalAddedCostUsd = 500m,
                    CreatedAt = DateTimeOffset.Parse("2026-09-03T00:00:00Z"),
                    Inputs = [new ConversionInput { Id = "cnvin-1", DocumentId = "cnv-0001", Product = "Copper cable", QuantityMt = 1m, UnitCostUsd = 10000m, CostUsd = 10000m }],
                    Outputs = [new ConversionOutput { Id = "cnvout-1", DocumentId = "cnv-0001", Product = "Stripped copper", QuantityMt = 0.65m, UnitCostUsd = 16153.85m, CostUsd = 10500m }],
                    Costs = [new ConversionCost { Id = "cnvcost-1", DocumentId = "cnv-0001", CategoryId = "ccat-0001", PersonId = "cust-1", Amount = 500m, Currency = Currency.USD, FxRate = 1m, AmountUsd = 500m }],
                },
            ],
        };

        var back = await RoundTripAsync(snapshot);

        var cnv = Assert.Single(back.Conversions);
        Assert.Equal("CNV-2026-0001", cnv.DocNumber);
        Assert.Single(cnv.Inputs);
        Assert.Single(cnv.Outputs);
        Assert.Single(cnv.Costs);
        Assert.Equal(10500m, cnv.Outputs.Single().CostUsd);
    }
```

- [ ] **Step 2: Run it to verify it fails**

Run: `dotnet test backend/Finora.slnx --filter "FullyQualifiedName~SnapshotRoundTripTests.A_conversion_survives" 2>&1 | grep -E "error|Passed|Failed" | head -3`
Expected: compile error — `ErpSnapshot` has no `Conversions`.

- [ ] **Step 3: Configure the entities**

```csharp
// backend/src/Modules/Erp/Finora.Erp.Infrastructure/Configuration/ConversionConfiguration.cs
using Finora.Erp.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Finora.Erp.Infrastructure.Configuration;

internal sealed class ConversionDocumentConfiguration : IEntityTypeConfiguration<ConversionDocument>
{
    public void Configure(EntityTypeBuilder<ConversionDocument> builder)
    {
        builder.ToTable("conversion_documents", t =>
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("conversion_documents", "status"),
                ErpModelBuilderExtensions.EnumCheck<ConversionStatus>("status")));

        builder.HasKey(d => d.Id);
        builder.Property(d => d.Id).HasIdColumn();
        builder.Property(d => d.DocNumber).HasMaxLength(64).IsRequired();
        builder.Property(d => d.WarehouseId).HasIdColumn();
        builder.Property(d => d.ChargeDocId).HasOptionalIdColumn();
        builder.Property(d => d.Status).HasEnumColumn();
        builder.Property(d => d.Notes).HasMaxLength(2000);
        builder.Property(d => d.TotalInputCostUsd).HasPrecision(18, 2);
        builder.Property(d => d.TotalAddedCostUsd).HasPrecision(18, 2);

        builder.HasOne(d => d.Warehouse).WithMany()
            .HasForeignKey(d => d.WarehouseId).OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(d => d.DocNumber).IsUnique();
        builder.HasIndex(d => d.WarehouseId);
    }
}

internal sealed class ConversionInputConfiguration : IEntityTypeConfiguration<ConversionInput>
{
    public void Configure(EntityTypeBuilder<ConversionInput> builder)
    {
        builder.ToTable("conversion_inputs");
        builder.HasKey(i => i.Id);
        builder.Property(i => i.Id).HasIdColumn();
        builder.Property(i => i.DocumentId).HasIdColumn();
        builder.Property(i => i.Product).HasMaxLength(200).IsRequired();
        builder.Property(i => i.QuantityMt).HasQuantityColumn();
        builder.Property(i => i.UnitCostUsd).HasUnitPriceColumn();
        builder.Property(i => i.CostUsd).HasPrecision(18, 2);
        builder.HasOne(i => i.Document).WithMany(d => d!.Inputs)
            .HasForeignKey(i => i.DocumentId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(i => i.DocumentId);
    }
}

internal sealed class ConversionOutputConfiguration : IEntityTypeConfiguration<ConversionOutput>
{
    public void Configure(EntityTypeBuilder<ConversionOutput> builder)
    {
        builder.ToTable("conversion_outputs");
        builder.HasKey(o => o.Id);
        builder.Property(o => o.Id).HasIdColumn();
        builder.Property(o => o.DocumentId).HasIdColumn();
        builder.Property(o => o.Product).HasMaxLength(200).IsRequired();
        builder.Property(o => o.QuantityMt).HasQuantityColumn();
        builder.Property(o => o.SharePercent).HasPercentColumn();
        builder.Property(o => o.UnitCostUsd).HasUnitPriceColumn();
        builder.Property(o => o.CostUsd).HasPrecision(18, 2);
        builder.HasOne(o => o.Document).WithMany(d => d!.Outputs)
            .HasForeignKey(o => o.DocumentId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(o => o.DocumentId);
    }
}

internal sealed class ConversionCostConfiguration : IEntityTypeConfiguration<ConversionCost>
{
    public void Configure(EntityTypeBuilder<ConversionCost> builder)
    {
        builder.ToTable("conversion_costs", t =>
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("conversion_costs", "currency"),
                ErpModelBuilderExtensions.EnumCheck<Currency>("currency")));
        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id).HasIdColumn();
        builder.Property(c => c.DocumentId).HasIdColumn();
        builder.Property(c => c.CategoryId).HasIdColumn();
        builder.Property(c => c.PersonId).HasIdColumn();
        builder.Property(c => c.Amount).HasPrecision(18, 2);
        builder.Property(c => c.Currency).HasEnumColumn();
        builder.Property(c => c.FxRate).HasRateColumn();
        builder.Property(c => c.AmountUsd).HasPrecision(18, 2);
        builder.Property(c => c.Description).HasMaxLength(2000);
        builder.HasOne(c => c.Document).WithMany(d => d!.Costs)
            .HasForeignKey(c => c.DocumentId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(c => c.Category).WithMany()
            .HasForeignKey(c => c.CategoryId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(c => c.Person).WithMany()
            .HasForeignKey(c => c.PersonId).OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(c => c.DocumentId);
    }
}
```

Check how money columns are declared elsewhere before relying on `HasPrecision(18, 2)`: `grep -n "HasPrecision\|HasMoneyColumn" backend/src/Modules/Erp/Finora.Erp.Infrastructure/Configuration/*.cs | head -5` — if the codebase has a `HasMoneyColumn()` helper, use it instead of `HasPrecision(18, 2)` everywhere above (consistency is what the reviewer will look for). The configurations are picked up automatically if `ErpDbContext.OnModelCreating` calls `ApplyConfigurationsFromAssembly`; verify with `grep -n "ApplyConfigurationsFromAssembly" backend/src/Modules/Erp/Finora.Erp.Infrastructure/ErpDbContext.cs` and, if it applies configurations one by one instead, add the four.

In `TradeConfiguration.cs`'s `InventoryDocumentItemConfiguration`, after `QuantityMt`:

```csharp
        builder.Property(i => i.UnitCostUsd).HasUnitPriceColumn();
        builder.Property(i => i.CostUsd).HasPrecision(18, 2);
```

In `ErpDbContext.cs`, after `InventoryDocumentItems`:

```csharp
    public DbSet<ConversionDocument> ConversionDocuments => Set<ConversionDocument>();
    public DbSet<ConversionInput> ConversionInputs => Set<ConversionInput>();
    public DbSet<ConversionOutput> ConversionOutputs => Set<ConversionOutput>();
    public DbSet<ConversionCost> ConversionCosts => Set<ConversionCost>();
```

- [ ] **Step 4: Snapshot**

In `ErpSnapshot.cs`, after `InventoryDocs`: `public IReadOnlyList<ConversionDocument> Conversions { get; init; } = [];`

In `SnapshotService.cs`: where `InventoryDocs` is read (~line 51) add, in the same style,
`Conversions = await db.ConversionDocuments.AsNoTracking().Include(c => c.Inputs).Include(c => c.Outputs).Include(c => c.Costs).OrderBy(c => c.Id).ToListAsync(cancellationToken),`;
where `InventoryDocs` is added on replace (~line 201) add `db.ConversionDocuments.AddRange(snapshot.Conversions);` **before** the inventory docs are added is not required, but it must come **after** `Warehouses`, `Customers` and `ChargeCategories` (foreign keys); where tables are cleared (~line 260) add `await db.ConversionDocuments.ExecuteDeleteAsync(cancellationToken);` **before** the warehouses/customers/categories deletes (the child tables cascade).

- [ ] **Step 5: Generate the migration**

The repo pins EF Core to the .NET 10 line; the global `dotnet-ef` tool is 9.0.10, so update it first, then generate against the API as the startup project:

```bash
dotnet tool update --global dotnet-ef
dotnet ef migrations add AddConversions --project backend/src/Modules/Erp/Finora.Erp.Infrastructure --startup-project backend/src/Finora.Api --context ErpDbContext --output-dir Migrations 2>&1 | tail -5
```

If that fails with a design-time error, look for the factory the earlier migrations used (`grep -rn "IDesignTimeDbContextFactory" backend/src --include=*.cs`) and run the same command with `--startup-project` pointing at the project that holds it (e.g. `backend/src/Finora.Migrator`). Open the generated `Up` and check it does exactly: create four tables with the columns above (snake_case names), add `unit_cost_usd` and `cost_usd` (numeric, default 0) to `erp.inventory_document_items`, and create the indexes. Delete any unrelated change the generator proposes — there must be none; if there is, stop and report it.

- [ ] **Step 6: Build, run the round-trip test and the whole integration suite's smoke**

Run: `dotnet build backend/Finora.slnx 2>&1 | grep -E "error|warn|Build succeeded" | head -5`
Expected: `Build succeeded.`

Run: `dotnet test backend/Finora.slnx --filter "FullyQualifiedName~SnapshotRoundTripTests|FullyQualifiedName~WarehouseDocumentTests|FullyQualifiedName~ArchitectureTests" 2>&1 | tail -4`
Expected: all passed (the migrator applies the new migration on the test container).

- [ ] **Step 7: Commit**

```bash
git add backend/src/Modules/Erp/Finora.Erp.Infrastructure backend/tests/Finora.IntegrationTests/SnapshotRoundTripTests.cs
git commit -m "feat(erp): conversion tables, cost columns on movements, and the snapshot carries them

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: StockLedger — quantity, value and average cost; receipts and issues store their cost

**Files:**
- Create: `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Trade/StockLedger.cs`
- Modify: `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Trade/WarehouseDocumentService.cs` (`StockAsync` ~line 51, `CreateAsync` ~lines 108-172, `CancelAsync` ~line 220, `StockKey` ~line 37)
- Modify: `backend/src/Modules/Erp/Finora.Erp.Infrastructure/ErpModule.cs` (~line 45: register `StockLedger`)
- Test: `backend/tests/Finora.IntegrationTests/WarehouseDocumentTests.cs`

**Interfaces:**
- Produces:
  - `public sealed record StockPosition(decimal QuantityMt, decimal ValueUsd) { public decimal AverageUnitCost => QuantityMt == 0m ? 0m : Rounding.Rate(ValueUsd / QuantityMt); }`
  - `public sealed class StockLedger(ErpDbContext db)` with `static string Key(string warehouseId, string product)` and `Task<Dictionary<string, StockPosition>> PositionsAsync(CancellationToken ct)` — folds CONFIRMED receipts (+qty, +cost), issues (−qty, −cost), conversion outputs (+), conversion inputs (−). Keys are stock keys.
  - `WarehouseDocumentService.StockAsync` keeps its signature (`Dictionary<string, decimal>`) but delegates to the ledger (`PositionsAsync` → `QuantityMt`), so callers do not change.
- Consumes: the entities from Task 1, DbSets from Task 2.

- [ ] **Step 1: Write the failing tests**

Append to `WarehouseDocumentTests.cs` (reuse its `AsManagerAsync`, `ResetAsync`, `Doc` helpers; the PI in `ResetAsync` has one line of 100 MT — look at `Doc(...)`'s `InvoiceItem` and note its `Amount`; if it is 0, give the purchase invoice's line `Amount = 1_000_000m` (i.e. 10,000 USD/MT) and `Currency = Currency.USD`, `ExchangeRate = 1m` on the invoice so the test below has a price to read):

```csharp
    [Fact]
    public async Task A_receipt_stores_the_invoice_price_per_mt_and_an_issue_stores_the_average()
    {
        await ResetAsync();
        var c = await AsManagerAsync(fixture);

        var receipt = await c.PostAsJsonAsync(new Uri("/api/erp/inventory-documents", UriKind.Relative), new
        {
            type = "IN", warehouseId = "wh-1", invoiceId = "inv-pi-0001", date = Date,
            items = new[] { new { referenceDocumentItemId = "pref-1", quantityMt = 100m } },
        });
        receipt.EnsureSuccessStatusCode();
        var grn = (await receipt.Content.ReadFromJsonAsync<JsonElement>(Json)).GetProperty("entity");
        var grnLine = grn.GetProperty("items")[0];
        Assert.Equal(10000m, grnLine.GetProperty("unitCostUsd").GetDecimal());
        Assert.Equal(1_000_000m, grnLine.GetProperty("costUsd").GetDecimal());

        var issue = await c.PostAsJsonAsync(new Uri("/api/erp/inventory-documents", UriKind.Relative), new
        {
            type = "OUT", warehouseId = "wh-1", invoiceId = "inv-si-0001", date = Date,
            items = new[] { new { referenceDocumentItemId = "sref-1", quantityMt = 40m } },
        });
        issue.EnsureSuccessStatusCode();
        var gdnLine = (await issue.Content.ReadFromJsonAsync<JsonElement>(Json)).GetProperty("entity").GetProperty("items")[0];
        Assert.Equal(10000m, gdnLine.GetProperty("unitCostUsd").GetDecimal());
        Assert.Equal(400_000m, gdnLine.GetProperty("costUsd").GetDecimal());
    }

    [Fact]
    public async Task The_ledger_folds_value_as_well_as_quantity()
    {
        await ResetAsync();
        var c = await AsManagerAsync(fixture);
        (await c.PostAsJsonAsync(new Uri("/api/erp/inventory-documents", UriKind.Relative), new
        {
            type = "IN", warehouseId = "wh-1", invoiceId = "inv-pi-0001", date = Date,
            items = new[] { new { referenceDocumentItemId = "pref-1", quantityMt = 100m } },
        })).EnsureSuccessStatusCode();

        using var scope = fixture.Services.CreateScope();
        var ledger = scope.ServiceProvider.GetRequiredService<StockLedger>();
        var positions = await ledger.PositionsAsync();
        var position = positions[StockLedger.Key("wh-1", Copper)];

        Assert.Equal(100m, position.QuantityMt);
        Assert.Equal(1_000_000m, position.ValueUsd);
        Assert.Equal(10000m, position.AverageUnitCost);
    }
```

- [ ] **Step 2: Run them to verify they fail**

Run: `dotnet test backend/Finora.slnx --filter "FullyQualifiedName~WarehouseDocumentTests.A_receipt_stores|FullyQualifiedName~WarehouseDocumentTests.The_ledger_folds" 2>&1 | grep -E "error|Passed|Failed" | head -4`
Expected: compile error (`StockLedger` missing) or `unitCostUsd` = 0.

- [ ] **Step 3: Write the ledger**

```csharp
// backend/src/Modules/Erp/Finora.Erp.Infrastructure/Trade/StockLedger.cs
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
```

Register it in `ErpModule.cs` next to `WarehouseDocumentService`: `builder.Services.AddScoped<StockLedger>();`.

- [ ] **Step 4: Make receipts and issues carry cost**

In `WarehouseDocumentService`:
- Change the constructor to `public sealed class WarehouseDocumentService(ErpDbContext db, StockLedger ledger)`.
- Replace the body of `StockAsync` with: `return (await ledger.PositionsAsync(cancellationToken)).ToDictionary(p => p.Key, p => p.Value.QuantityMt, StringComparer.Ordinal);` and replace the private `StockKey` with `StockLedger.Key` at its call sites (delete the private method).
- In `CreateAsync`, load positions once before the loop when the type is OUT: `var positions = input.Type == InventoryDocType.OUT ? await ledger.PositionsAsync(cancellationToken) : null;` and keep the existing `stock` running dictionary for the quantity guard. Per line, compute the unit cost:

```csharp
            decimal unitCost;
            if (input.Type == InventoryDocType.IN)
            {
                // What was paid per tonne, in USD: the line's value in invoice currency, divided by
                // the header rate, divided by the line's quantity. A line priced at 0 (an unpriced
                // floating line) receives at 0 and shows as "cost unknown" until it is priced.
                unitCost = invoiceItem.QuantityMt == 0m
                    ? 0m
                    : Rounding.Rate(invoiceItem.Amount / invoice.ExchangeRate / invoiceItem.QuantityMt);
            }
            else
            {
                unitCost = positions!.GetValueOrDefault(StockLedger.Key(warehouse.Id, invoiceItem.Product), new StockPosition(0m, 0m)).AverageUnitCost;
            }
```

and set `UnitCostUsd = unitCost, CostUsd = Rounding.Money(unitCost * Rounding.Quantity(line.QuantityMt)),` on the new `InventoryDocumentItem`. Check the invoice header property names with `grep -n "ExchangeRate\|Amount" backend/src/Modules/Erp/Finora.Erp.Domain/Trade.cs | head` — `Invoice.ExchangeRate` and `InvoiceItem.Amount` are the names used by `InvoiceMath`.

- [ ] **Step 5: Run the warehouse tests**

Run: `dotnet test backend/Finora.slnx --filter "FullyQualifiedName~WarehouseDocumentTests|FullyQualifiedName~InvoiceTests|FullyQualifiedName~ChargeTests" 2>&1 | tail -4`
Expected: all passed — including the pre-existing warehouse tests, whose quantity behaviour is unchanged.

- [ ] **Step 6: Commit**

```bash
git add backend/src/Modules/Erp/Finora.Erp.Infrastructure backend/tests/Finora.IntegrationTests/WarehouseDocumentTests.cs
git commit -m "feat(erp): the stock ledger folds value as well as tonnes; receipts and issues store their cost

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: ConversionService, endpoints, permission

**Files:**
- Create: `backend/src/Modules/Erp/Finora.Erp.Application/ConversionContracts.cs`
- Create: `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Trade/ConversionService.cs`
- Create: `backend/src/Finora.Api/Endpoints/ConversionEndpoints.cs`
- Modify: `backend/src/Finora.Api/Program.cs` (or wherever `MapWarehouseDocumentEndpoints()` is called — `grep -rn "MapWarehouseDocumentEndpoints" backend/src`): add `app.MapConversionEndpoints();`
- Modify: `backend/src/Modules/Erp/Finora.Erp.Infrastructure/ErpModule.cs` (register `ConversionService`)
- Modify: `backend/src/Modules/Identity/Finora.Identity.Infrastructure/AccessCatalogue.cs` (~line 27: add `"conversions.confirm"` to Manager only)
- Modify: `backend/contracts/error-codes.json` (add `conversion-not-found`, `conversion-not-draft`, `conversion-empty`, `invalid-shares`, `cost-category-invalid`)
- Modify: `backend/tests/Finora.UnitTests/ErrorCodeContractTests.cs` (`BackendOnlyCodes`: add `conversion-not-found`, `conversion-not-draft` with a comment; the other three are named by the form in Task 6, so they are handled client-side)
- Test: `backend/tests/Finora.IntegrationTests/ConversionTests.cs`

**Interfaces:**
- Produces (Application records):
  ```csharp
  public sealed record ConversionInputLine(string Product, decimal QuantityMt);
  public sealed record ConversionOutputLine(string Product, decimal QuantityMt, decimal? SharePercent);
  public sealed record ConversionCostLine(string CategoryId, string PersonId, decimal Amount, Currency Currency, decimal? FxRate, string? Description);
  public sealed record ConversionInput(string WarehouseId, DateTimeOffset Date, string? Notes,
      IReadOnlyList<ConversionInputLine> Inputs, IReadOnlyList<ConversionOutputLine> Outputs, IReadOnlyList<ConversionCostLine> Costs);
  public sealed record ConversionResult(ConversionDocument Entity, IReadOnlyList<ConversionDocument> All);
  ```
  (Name the input record `ConversionDocInput` if `ConversionInput` collides with the domain entity of that name in the same namespace usage — it does; **use `ConversionDocInput`**.)
- Routes (all under `/api/erp/conversions`, group `.RequirePermission("warehouse")`): `GET /` → list; `POST /` → create DRAFT; `PUT /{id}` → replace DRAFT; `POST /{id}/cancel`; and `POST /{id}/confirm` with **its own** `.RequirePermission("conversions.confirm")`. Every write answers `ConversionResult`.
- Service: `ConversionService(ErpDbContext db, StockLedger ledger, ChargeService charges)` with `ListAsync`, `CreateAsync(ConversionDocInput)`, `UpdateAsync(id, ConversionDocInput)`, `ConfirmAsync(id)`, `CancelAsync(id)`.

- [ ] **Step 1: Write the failing tests**

```csharp
// backend/tests/Finora.IntegrationTests/ConversionTests.cs
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Finora.Erp.Domain;
using Finora.Erp.Infrastructure.Snapshot;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Finora.IntegrationTests;

/// <summary>Cable becomes copper becomes ingot, over real HTTP, with the cost following the metal.</summary>
[Collection(nameof(ApiCollection))]
public sealed class ConversionTests(ApiFixture fixture)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private const string Date = "2026-09-03T08:00:00+04:00";

    private static async Task<HttpClient> LoginAsync(ApiFixture fixture, string email, string password)
    {
        var client = fixture.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        (await client.PostAsJsonAsync(new Uri("/api/identity/login", UriKind.Relative), new { email, password })).EnsureSuccessStatusCode();
        return client;
    }

    private static Task<HttpClient> AsManagerAsync(ApiFixture f) => LoginAsync(f, "amir@finora.app", "demo1234");
    private static Task<HttpClient> AsStaffAsync(ApiFixture f) => LoginAsync(f, "staff@finora.app", "Staff@2026");

    /// <summary>One warehouse holding 1.000 MT of cable that cost 10,000 USD, a workshop person and a Processing category.</summary>
    private async Task ResetAsync()
    {
        using var scope = fixture.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<SnapshotService>().ReplaceAsync(new ErpSnapshot
        {
            Warehouses = [new Warehouse { Id = "wh-1", Name = "Main", Code = "1" }],
            Customers =
            [
                new Customer { Id = "cust-1", Name = "Cable Supplier", Code = "1", CustomerType = CustomerType.SUPPLIER },
                new Customer { Id = "cust-2", Name = "The Workshop", Code = "2", CustomerType = CustomerType.OTHER },
            ],
            ChargeCategories = [new ChargeCategory { Id = "ccat-0001", Name = "Processing", Code = "1", Direction = ChargeDirection.EXPENSE, Scope = ChargeScope.GENERAL }],
            Contracts = [new Contract { Id = "ctr-1", CustomerId = "cust-1", ContractType = ContractType.PURCHASE, Destination = "DXB",
                Items = [new ContractItem { Id = "item-1", ContractId = "ctr-1", Product = "Copper cable", QuantityMt = 1m, RemainingMt = 1m }] }],
            Invoices = [new Invoice { Id = "inv-pi-0001", InvoiceNumber = "26090001", InvoiceType = InvoiceType.PURCHASE_INVOICE,
                Status = InvoiceStatus.CONFIRMED, ContractId = "ctr-1", CustomerId = "cust-1", Currency = Currency.USD, ExchangeRate = 1m,
                Items = [new InvoiceItem { Id = "ii-1", InvoiceId = "inv-pi-0001", ContractItemId = "item-1", ReferenceDocumentItemId = "ref-1",
                    Product = "Copper cable", QuantityMt = 1m, Amount = 10000m }] }],
            InventoryDocs = [new InventoryDocument { Id = "idoc-0001", DocNumber = "GRN-2026-0001", WarehouseId = "wh-1", InvoiceId = "inv-pi-0001",
                Type = InventoryDocType.IN, Date = DateTimeOffset.Parse(Date), Status = DocumentStatus.CONFIRMED,
                Items = [new InventoryDocumentItem { Id = "idocitem-1", DocumentId = "idoc-0001", InvoiceItemId = "ii-1", ReferenceDocumentItemId = "ref-1",
                    Product = "Copper cable", QuantityMt = 1m, UnitCostUsd = 10000m, CostUsd = 10000m }] }],
        });
    }

    private static object Strip(decimal outMt = 0.65m, object[]? costs = null) => new
    {
        warehouseId = "wh-1", date = Date, notes = "strip",
        inputs = new[] { new { product = "Copper cable", quantityMt = 1m } },
        outputs = new[] { new { product = "Stripped copper", quantityMt = outMt, sharePercent = (decimal?)null } },
        costs = costs ?? [],
    };

    private static async Task<JsonElement> PostAsync(HttpClient c, string url, object? body = null)
    {
        var r = body is null ? await c.PostAsync(new Uri(url, UriKind.Relative), null) : await c.PostAsJsonAsync(new Uri(url, UriKind.Relative), body);
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<JsonElement>(Json);
    }

    private static JsonElement Entity(JsonElement r) => r.GetProperty("entity");
    private static string Id(JsonElement r) => Entity(r).GetProperty("id").GetString()!;

    [Fact]
    public async Task A_draft_is_numbered_and_moves_nothing()
    {
        await ResetAsync();
        var c = await AsStaffAsync(fixture);
        var created = await PostAsync(c, "/api/erp/conversions", Strip());
        Assert.Equal("CNV-2026-0001", Entity(created).GetProperty("docNumber").GetString());
        Assert.Equal("DRAFT", Entity(created).GetProperty("status").GetString());

        using var scope = fixture.Services.CreateScope();
        var positions = await scope.ServiceProvider.GetRequiredService<Finora.Erp.Infrastructure.Trade.StockLedger>().PositionsAsync();
        Assert.Equal(1m, positions[Finora.Erp.Infrastructure.Trade.StockLedger.Key("wh-1", "Copper cable")].QuantityMt);
    }

    [Fact]
    public async Task Confirming_moves_the_stock_and_the_cost_and_books_the_workshop_as_an_expense()
    {
        await ResetAsync();
        var staff = await AsStaffAsync(fixture);
        var id = Id(await PostAsync(staff, "/api/erp/conversions", Strip(costs:
            [new { categoryId = "ccat-0001", personId = "cust-2", amount = 500m, currency = "USD", fxRate = (decimal?)null, description = "labour" }])));

        var manager = await AsManagerAsync(fixture);
        var confirmed = Entity(await PostAsync(manager, $"/api/erp/conversions/{id}/confirm"));

        Assert.Equal("CONFIRMED", confirmed.GetProperty("status").GetString());
        Assert.Equal(10000m, confirmed.GetProperty("totalInputCostUsd").GetDecimal());
        Assert.Equal(500m, confirmed.GetProperty("totalAddedCostUsd").GetDecimal());
        var output = confirmed.GetProperty("outputs")[0];
        Assert.Equal(10500m, output.GetProperty("costUsd").GetDecimal());
        Assert.Equal(16153.8462m, output.GetProperty("unitCostUsd").GetDecimal());
        Assert.False(string.IsNullOrEmpty(confirmed.GetProperty("chargeDocId").GetString()));

        using var scope = fixture.Services.CreateScope();
        var ledger = scope.ServiceProvider.GetRequiredService<Finora.Erp.Infrastructure.Trade.StockLedger>();
        var positions = await ledger.PositionsAsync();
        Assert.Equal(0m, positions[Finora.Erp.Infrastructure.Trade.StockLedger.Key("wh-1", "Copper cable")].QuantityMt);
        var copper = positions[Finora.Erp.Infrastructure.Trade.StockLedger.Key("wh-1", "Stripped copper")];
        Assert.Equal(0.65m, copper.QuantityMt);
        Assert.Equal(10500m, copper.ValueUsd);

        var charges = await manager.GetFromJsonAsync<JsonElement>(new Uri("/api/erp/charges", UriKind.Relative), Json);
        var booked = charges.EnumerateArray().Single(d => d.GetProperty("id").GetString() == confirmed.GetProperty("chargeDocId").GetString());
        Assert.Equal("EXPENSE", booked.GetProperty("direction").GetString());
        Assert.Equal("GENERAL", booked.GetProperty("kind").GetString());
        Assert.Equal("cust-2", booked.GetProperty("lines")[0].GetProperty("personId").GetString());
        Assert.Equal(500m, booked.GetProperty("totalUSD").GetDecimal());
    }

    [Fact]
    public async Task Staff_may_draft_but_not_confirm()
    {
        await ResetAsync();
        var staff = await AsStaffAsync(fixture);
        var id = Id(await PostAsync(staff, "/api/erp/conversions", Strip()));
        var refused = await staff.PostAsync(new Uri($"/api/erp/conversions/{id}/confirm", UriKind.Relative), null);
        Assert.Equal(HttpStatusCode.Forbidden, refused.StatusCode);
    }

    [Fact]
    public async Task An_input_larger_than_the_stock_is_refused_with_the_available_figure()
    {
        await ResetAsync();
        var manager = await AsManagerAsync(fixture);
        var body = new { warehouseId = "wh-1", date = Date, notes = (string?)null,
            inputs = new[] { new { product = "Copper cable", quantityMt = 1.5m } },
            outputs = new[] { new { product = "Stripped copper", quantityMt = 1m, sharePercent = (decimal?)null } },
            costs = Array.Empty<object>() };
        var id = Id(await PostAsync(manager, "/api/erp/conversions", body));
        var refused = await manager.PostAsync(new Uri($"/api/erp/conversions/{id}/confirm", UriKind.Relative), null);
        var problem = await refused.Content.ReadFromJsonAsync<JsonElement>(Json);
        Assert.Equal("insufficient-stock", problem.GetProperty("code").GetString());
        Assert.Equal(1m, problem.GetProperty("available").GetDecimal());
    }

    [Fact]
    public async Task Two_outputs_split_the_cost_by_weight_unless_shares_are_given()
    {
        await ResetAsync();
        var manager = await AsManagerAsync(fixture);
        var body = new { warehouseId = "wh-1", date = Date, notes = (string?)null,
            inputs = new[] { new { product = "Copper cable", quantityMt = 1m } },
            outputs = new[]
            {
                new { product = "Stripped copper", quantityMt = 0.65m, sharePercent = (decimal?)98m },
                new { product = "Insulation scrap", quantityMt = 0.35m, sharePercent = (decimal?)2m },
            },
            costs = Array.Empty<object>() };
        var id = Id(await PostAsync(manager, "/api/erp/conversions", body));
        var confirmed = Entity(await PostAsync(manager, $"/api/erp/conversions/{id}/confirm"));
        Assert.Equal(9800m, confirmed.GetProperty("outputs")[0].GetProperty("costUsd").GetDecimal());
        Assert.Equal(200m, confirmed.GetProperty("outputs")[1].GetProperty("costUsd").GetDecimal());
    }

    [Fact]
    public async Task A_confirmed_conversion_cannot_be_edited_and_cancelling_it_reverses_stock_and_the_expense()
    {
        await ResetAsync();
        var manager = await AsManagerAsync(fixture);
        var id = Id(await PostAsync(manager, "/api/erp/conversions", Strip(costs:
            [new { categoryId = "ccat-0001", personId = "cust-2", amount = 500m, currency = "USD", fxRate = (decimal?)null, description = (string?)null }])));
        var confirmed = Entity(await PostAsync(manager, $"/api/erp/conversions/{id}/confirm"));

        var edit = await manager.PutAsJsonAsync(new Uri($"/api/erp/conversions/{id}", UriKind.Relative), Strip(0.6m));
        Assert.Equal("conversion-not-draft", (await edit.Content.ReadFromJsonAsync<JsonElement>(Json)).GetProperty("code").GetString());

        var cancelled = Entity(await PostAsync(manager, $"/api/erp/conversions/{id}/cancel"));
        Assert.Equal("CANCELLED", cancelled.GetProperty("status").GetString());

        using var scope = fixture.Services.CreateScope();
        var positions = await scope.ServiceProvider.GetRequiredService<Finora.Erp.Infrastructure.Trade.StockLedger>().PositionsAsync();
        Assert.Equal(1m, positions[Finora.Erp.Infrastructure.Trade.StockLedger.Key("wh-1", "Copper cable")].QuantityMt);
        var charges = await manager.GetFromJsonAsync<JsonElement>(new Uri("/api/erp/charges", UriKind.Relative), Json);
        var booked = charges.EnumerateArray().Single(d => d.GetProperty("id").GetString() == confirmed.GetProperty("chargeDocId").GetString());
        Assert.Equal("CANCELLED", booked.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Cancelling_is_blocked_once_an_output_was_consumed()
    {
        await ResetAsync();
        var manager = await AsManagerAsync(fixture);
        var strip = Id(await PostAsync(manager, "/api/erp/conversions", Strip()));
        await PostAsync(manager, $"/api/erp/conversions/{strip}/confirm");
        var melt = Id(await PostAsync(manager, "/api/erp/conversions", new { warehouseId = "wh-1", date = Date, notes = (string?)null,
            inputs = new[] { new { product = "Stripped copper", quantityMt = 0.65m } },
            outputs = new[] { new { product = "Copper ingot", quantityMt = 0.6m, sharePercent = (decimal?)null } },
            costs = Array.Empty<object>() }));
        await PostAsync(manager, $"/api/erp/conversions/{melt}/confirm");

        var blocked = await manager.PostAsync(new Uri($"/api/erp/conversions/{strip}/cancel", UriKind.Relative), null);
        Assert.Equal("cancel-blocked-stock", (await blocked.Content.ReadFromJsonAsync<JsonElement>(Json)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Cable_to_copper_to_ingot_to_sale_carries_the_cost_all_the_way()
    {
        await ResetAsync();
        var manager = await AsManagerAsync(fixture);
        var strip = Id(await PostAsync(manager, "/api/erp/conversions", Strip()));
        await PostAsync(manager, $"/api/erp/conversions/{strip}/confirm");
        var melt = Id(await PostAsync(manager, "/api/erp/conversions", new { warehouseId = "wh-1", date = Date, notes = (string?)null,
            inputs = new[] { new { product = "Stripped copper", quantityMt = 0.65m } },
            outputs = new[] { new { product = "Copper ingot", quantityMt = 0.6m, sharePercent = (decimal?)null } },
            costs = new[] { new { categoryId = "ccat-0001", personId = "cust-2", amount = 800m, currency = "USD", fxRate = (decimal?)null, description = "gas" } } }));
        var melted = Entity(await PostAsync(manager, $"/api/erp/conversions/{melt}/confirm"));
        Assert.Equal(10800m, melted.GetProperty("outputs")[0].GetProperty("costUsd").GetDecimal());
        Assert.Equal(18000m, melted.GetProperty("outputs")[0].GetProperty("unitCostUsd").GetDecimal());

        using var scope = fixture.Services.CreateScope();
        var ingot = (await scope.ServiceProvider.GetRequiredService<Finora.Erp.Infrastructure.Trade.StockLedger>().PositionsAsync())
            [Finora.Erp.Infrastructure.Trade.StockLedger.Key("wh-1", "Copper ingot")];
        Assert.Equal(0.6m, ingot.QuantityMt);
        Assert.Equal(10800m, ingot.ValueUsd);
        Assert.Equal(18000m, ingot.AverageUnitCost);
    }
}
```

The last test stops at the ingot position on purpose: issuing it on a sale invoice is already covered by `WarehouseDocumentTests.A_receipt_stores_the_invoice_price_per_mt_and_an_issue_stores_the_average` (Task 3), which proves an issue stores the average.

- [ ] **Step 2: Run them to verify they fail**

Run: `dotnet test backend/Finora.slnx --filter "FullyQualifiedName~ConversionTests" 2>&1 | grep -E "error|Passed|Failed" | head -4`
Expected: compile errors / 404s — nothing exists yet.

- [ ] **Step 3: Contracts, service, endpoints, permission, error codes**

`backend/src/Modules/Erp/Finora.Erp.Application/ConversionContracts.cs`:

```csharp
using Finora.Erp.Domain;

namespace Finora.Erp.Application;

public sealed record ConversionInputLine(string Product, decimal QuantityMt);
public sealed record ConversionOutputLine(string Product, decimal QuantityMt, decimal? SharePercent);
public sealed record ConversionCostLine(string CategoryId, string PersonId, decimal Amount, Currency Currency, decimal? FxRate, string? Description);

/// <summary>The whole document, header and all three line lists; a DRAFT is replaced with it on every save.</summary>
public sealed record ConversionDocInput(
    string WarehouseId,
    DateTimeOffset Date,
    string? Notes,
    IReadOnlyList<ConversionInputLine> Inputs,
    IReadOnlyList<ConversionOutputLine> Outputs,
    IReadOnlyList<ConversionCostLine> Costs);

public sealed record ConversionResult(ConversionDocument Entity, IReadOnlyList<ConversionDocument> All);
```

`backend/src/Modules/Erp/Finora.Erp.Infrastructure/Trade/ConversionService.cs`:

```csharp
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
```

Check two names before compiling: `ChargeService.AddLineAsync(string docId, ChargeLineInput input, CancellationToken)` and `ChargeService.CancelAsync(string id, CancellationToken)` — `grep -n "public async Task<ChargeDoc> AddLineAsync\|public async Task<ChargeDoc> CancelAsync" -A 2 backend/src/Modules/Erp/Finora.Erp.Infrastructure/Money/ChargeService.cs`; adapt the argument order if it differs. `NotFoundException` is in `Finora.BuildingBlocks.Domain` (used by `MasterDataService`). `ChargeService` and `ConversionService` share the scoped `ErpDbContext`, so the transaction opened above covers the expense too.

Register in `ErpModule.cs`: `builder.Services.AddScoped<ConversionService>();`.

`backend/src/Finora.Api/Endpoints/ConversionEndpoints.cs` (mirror `WarehouseDocumentEndpoints.cs`'s usings and `RequirePermission` helper):

```csharp
using Finora.Erp.Application;
using Finora.Erp.Infrastructure.Trade;

namespace Finora.Api.Endpoints;

public static class ConversionEndpoints
{
    public static IEndpointRouteBuilder MapConversionEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/erp/conversions")
            .WithTags("ERP warehouse")
            .RequirePermission("warehouse");

        group.MapGet("/", async (ConversionService service, CancellationToken ct) =>
            Results.Ok(await service.ListAsync(ct)))
            .WithName("ListConversions");

        group.MapPost("/", async (ConversionDocInput input, ConversionService service, CancellationToken ct) =>
            Results.Ok(new ConversionResult(await service.CreateAsync(input, ct), await service.ListAsync(ct))))
            .WithName("CreateConversion");

        group.MapPut("/{id}", async (string id, ConversionDocInput input, ConversionService service, CancellationToken ct) =>
            Results.Ok(new ConversionResult(await service.UpdateAsync(id, input, ct), await service.ListAsync(ct))))
            .WithName("UpdateConversion");

        group.MapPost("/{id}/cancel", async (string id, ConversionService service, CancellationToken ct) =>
            Results.Ok(new ConversionResult(await service.CancelAsync(id, ct), await service.ListAsync(ct))))
            .WithName("CancelConversion");

        // Confirm changes stock and cost, so it takes the manager-only permission on top of the
        // group's; a Staff session gets 403 here and nowhere else in this group.
        group.MapPost("/{id}/confirm", async (string id, ConversionService service, CancellationToken ct) =>
            Results.Ok(new ConversionResult(await service.ConfirmAsync(id, ct), await service.ListAsync(ct))))
            .RequirePermission("conversions.confirm")
            .WithName("ConfirmConversion");

        return app;
    }
}
```

Call it where the other ERP endpoint groups are mapped (`grep -rn "MapWarehouseDocumentEndpoints()" backend/src --include=*.cs`).

`AccessCatalogue.cs`: in the `["Manager"]` array add `"conversions.confirm",` after `"warehouse",` with the comment `// Not a route key: it gates one endpoint (confirming a conversion) and one button.` Nothing else in the catalogue changes; `IdentitySeeder` seeds missing permissions from `AllPermissions` on the next migrator run (confirmed by `IdentitySeeder.cs:34`). Check `IdentityTests` does not assert an exact permission count per role that would now be off by one for Manager (`grep -n "RolePermissions\[account.Role\].Length" backend/tests/Finora.IntegrationTests/IdentityTests.cs`) — it compares against the catalogue itself, so it self-adjusts.

`error-codes.json`: add `"conversion-empty"`, `"conversion-not-draft"`, `"conversion-not-found"`, `"cost-category-invalid"`, `"invalid-shares"` in alphabetical position. `ErrorCodeContractTests.BackendOnlyCodes`: add

```csharp
        // Conversions. A stale id and an edit on a confirmed document — the screen hides both
        // paths (the edit button appears on drafts only), so both get the generic message.
        "conversion-not-found",
        "conversion-not-draft",
```

(`conversion-empty`, `invalid-shares` and `cost-category-invalid` are named by the form in Task 6, which makes them "handled by the client" for the contract test; until Task 6 lands the contract test will list them as extra — run it again after Task 6.)

- [ ] **Step 4: Build and run the conversion, warehouse, charge and identity tests**

Run: `dotnet build backend/Finora.slnx 2>&1 | grep -E "error|warn|Build succeeded" | head -5`
Expected: `Build succeeded.`

Run: `dotnet test backend/Finora.slnx --filter "FullyQualifiedName~ConversionTests|FullyQualifiedName~WarehouseDocumentTests|FullyQualifiedName~ChargeTests|FullyQualifiedName~IdentityTests|FullyQualifiedName~ErpPermissionTests" 2>&1 | tail -4`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add backend/src backend/contracts/error-codes.json backend/tests
git commit -m "feat(erp): conversion documents — draft, confirm with cost and expense, cancel, manager-only confirm

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: SPA data layer — types, store, endpoints, reads, hooks, permission

**Files:**
- Modify: `apps/erp-panel/src/types/index.ts` (after `InventoryDocumentItem`: conversion types; `InventoryDocumentItem` gains `unitCostUsd`, `costUsd`)
- Modify: `apps/erp-panel/src/mock/data.ts` (`conversions: ConversionDocument[]` in `Db`, seed `[]`, `SCHEMA_VERSION = 8`, `isCompatible` requires `Array.isArray(conversions)`)
- Modify: `apps/erp-panel/src/services/snapshot.ts` (`EMPTY` gains `conversions: []`)
- Create: `apps/erp-panel/src/services/conversions.ts`
- Modify: `apps/erp-panel/src/services/api.ts` (`StockLevelRow` ~line 1795 + `getStockLevels`; new `getConversions`, `getInvoiceCostOfSales`, `createConversion`, `updateConversion`, `confirmConversion`, `cancelConversion` next to the warehouse-document block ~line 2086)
- Modify: `apps/erp-panel/src/services/queries.ts` (`qk.conversions`, hooks, invalidation)
- Modify: `apps/erp-panel/src/services/identity.ts` (`permissions: string[]` — see below) and `apps/erp-panel/src/store/useAuthStore.ts` (`permissions: string[]`), `apps/erp-panel/src/routes/index.tsx` (`RoleRoute` compares strings — no change needed once the store is `string[]`)

**Interfaces:**
- Produces (TS):
  ```ts
  export interface ConversionInput  { id: string; documentId: string; product: string; quantityMt: number; unitCostUsd: number; costUsd: number; }
  export interface ConversionOutput { id: string; documentId: string; product: string; quantityMt: number; sharePercent?: number | null; unitCostUsd: number; costUsd: number; }
  export interface ConversionCost   { id: string; documentId: string; categoryId: string; personId: string; amount: number; currency: Currency; fxRate: number; amountUsd: number; description?: string; }
  export interface ConversionDocument { id: string; docNumber: string; warehouseId: string; date: string; status: ConversionStatus; notes?: string; chargeDocId?: string | null; totalInputCostUsd: number; totalAddedCostUsd: number; createdAt: string; inputs: ConversionInput[]; outputs: ConversionOutput[]; costs: ConversionCost[]; }
  export interface ConversionDocInput { warehouseId: string; date: string; notes?: string; inputs: { product: string; quantityMt: number }[]; outputs: { product: string; quantityMt: number; sharePercent?: number | null }[]; costs: { categoryId: string; personId: string; amount: number; currency: Currency; fxRate?: number | null; description?: string }[]; }
  ```
  `StockLevelRow` gains `valueUsd: number; unitCostUsd: number; costKnown: boolean;`.
  Hooks: `useConversions()`, `useCreateConversion()`, `useUpdateConversion()`, `useConfirmConversion()`, `useCancelConversion()`, `useInvoiceCostOfSales(invoiceId)`.
  Permission: `useAuthStore((s) => s.permissions.includes('conversions.confirm'))`.
- Consumes: the server routes from Task 4.

- [ ] **Step 1: Types and store**

Add the interfaces above to `types/index.ts` after `InventoryDocumentItem`, and to `InventoryDocumentItem` add:

```ts
  /** USD per MT this line was valued at when confirmed (invoice price on a receipt, the
   *  warehouse average on an issue). 0 on lines from before costing existed. */
  unitCostUsd: number;
  costUsd: number;
```

In `mock/data.ts`: add `conversions: ConversionDocument[];` to the `Db` interface and `conversions: []` to the seed; in `isCompatible` add `Array.isArray(blob.conversions)` to the hard requirements; bump `const SCHEMA_VERSION = 8;` with the comment `* Schema v8 (2026-09-03): conversion documents and cost per MT on inventory lines (docs/superpowers/specs/2026-09-03-warehouse-conversion-design.md).` In `services/snapshot.ts` add `conversions: [],` to `EMPTY`.

`identity.ts`: `permissions: string[];` with the comment `/** Route keys plus fine-grained codes such as 'conversions.confirm' — whatever the server granted. */`; `useAuthStore.ts` line ~20: `permissions: string[];`. `RoleRoute` in `routes/index.tsx` keeps its `RouteKey` parameter and `permissions.includes(k)` still type-checks (`string[]` includes a `RouteKey`). `SidebarNav` filters `NAV_ITEMS` by `allowed.includes(item.key)` — unchanged.

- [ ] **Step 2: Endpoints and reads**

```ts
// apps/erp-panel/src/services/conversions.ts
import type { ConversionDocument, ConversionDocInput } from '@/types';
import { request } from '@/services/http';

/** Conversion documents. Every write answers the whole list — stock is folded from all of them. */
export interface ConversionResult {
  entity: ConversionDocument;
  all: ConversionDocument[];
}

const base = '/api/erp/conversions';

export const conversionsApi = {
  create: (input: ConversionDocInput) =>
    request<ConversionResult>(base, { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: ConversionDocInput) =>
    request<ConversionResult>(`${base}/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }),
  confirm: (id: string) =>
    request<ConversionResult>(`${base}/${encodeURIComponent(id)}/confirm`, { method: 'POST' }),
  cancel: (id: string) =>
    request<ConversionResult>(`${base}/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
};
```

In `api.ts`, replace `StockLevelRow` and `getStockLevels` with a fold that mirrors `StockLedger` (display only — the browser never decides a cost):

```ts
export interface StockLevelRow {
  warehouseId: string;
  /** Normalized key: trim().toLowerCase(). */
  productKey: string;
  /** First-seen display casing. */
  product: string;
  mt: number;
  /** Σ costUsd of what came in − Σ costUsd of what went out, over confirmed movements. */
  valueUsd: number;
  /** valueUsd ÷ mt, 4 dp; 0 when nothing is in stock. */
  unitCostUsd: number;
  /** False when metal is in stock but some movement behind it carries no cost (pre-costing rows). */
  costKnown: boolean;
}

/** Mirrors the server's StockLedger for display: receipts and conversion outputs add, issues
 *  and conversion inputs subtract, in tonnes and in USD. Never used to decide a cost. */
export async function getStockLevels(): Promise<StockLevelRow[]> {
  await delay(140);
  const rows = new Map<string, StockLevelRow>();
  const move = (warehouseId: string, product: string, mt: number, cost: number, known: boolean) => {
    const productKey = product.trim().toLowerCase();
    const key = `${warehouseId}::${productKey}`;
    const row = rows.get(key) ?? { warehouseId, productKey, product, mt: 0, valueUsd: 0, unitCostUsd: 0, costKnown: true };
    row.mt = round(row.mt + mt, 3);
    row.valueUsd = round(row.valueUsd + cost, 2);
    row.costKnown = row.costKnown && known;
    rows.set(key, row);
  };
  for (const doc of db.inventoryDocs) {
    if (doc.status !== 'CONFIRMED') continue;
    const sign = doc.type === 'IN' ? 1 : -1;
    for (const item of doc.items) {
      move(doc.warehouseId, item.product, sign * item.quantityMt, sign * item.costUsd, item.unitCostUsd > 0);
    }
  }
  for (const cnv of db.conversions) {
    if (cnv.status !== 'CONFIRMED') continue;
    for (const i of cnv.inputs) move(cnv.warehouseId, i.product, -i.quantityMt, -i.costUsd, true);
    for (const o of cnv.outputs) move(cnv.warehouseId, o.product, o.quantityMt, o.costUsd, true);
  }
  for (const row of rows.values()) {
    row.unitCostUsd = row.mt === 0 ? 0 : round(row.valueUsd / row.mt, 4);
    if (row.mt === 0) row.costKnown = true;
  }
  return [...rows.values()];
}
```

(`round(value, decimals)` — check the helper's name and signature in `api.ts` with `grep -n "^function round\|^const round" apps/erp-panel/src/services/api.ts` and use what exists.)

Add, next to the warehouse-document block:

```ts
/* ---------------------------- Conversions ---------------------------- */

export async function getConversions(): Promise<ConversionDocument[]> {
  await delay(140);
  return [...db.conversions].sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());
}

/** Σ costUsd of the confirmed issues that shipped this sale invoice — its cost of sales. */
export async function getInvoiceCostOfSales(invoiceId: string): Promise<{ costUsd: number; costKnown: boolean } | null> {
  await delay(80);
  const issues = db.inventoryDocs.filter((d) => d.type === 'OUT' && d.status === 'CONFIRMED' && d.invoiceId === invoiceId);
  if (issues.length === 0) return null;
  let cost = 0;
  let known = true;
  for (const doc of issues) for (const item of doc.items) {
    cost += item.costUsd;
    known = known && item.unitCostUsd > 0;
  }
  return { costUsd: round(cost, 2), costKnown: known };
}

function applyConversionResult(result: { entity: ConversionDocument; all: ConversionDocument[] }): ConversionDocument {
  db.conversions.splice(0, db.conversions.length, ...result.all);
  persistDb({ alreadySynced: true });
  return result.entity;
}

export const createConversion = async (input: ConversionDocInput) => applyConversionResult(await conversionsApi.create(input));
export const updateConversion = async (id: string, input: ConversionDocInput) => applyConversionResult(await conversionsApi.update(id, input));
export const confirmConversion = async (id: string) => applyConversionResult(await conversionsApi.confirm(id));
export const cancelConversion = async (id: string) => applyConversionResult(await conversionsApi.cancel(id));
```

Check how the existing warehouse-document writes update the store (`grep -n "warehouseDocsApi" -A 8 apps/erp-panel/src/services/api.ts | head -30`) and follow the same `persistDb` call shape. A confirmed conversion also books a charge document server-side: after `confirmConversion` and `cancelConversion`, the charge list in the store is stale — the queries layer (next step) invalidates the charges queries and the next `hydrateFromServer` fixes the store; simplest correct path is to re-hydrate: call `await hydrateFromServer()` (from `@/services/snapshot`) at the end of `confirmConversion` and `cancelConversion` before returning.

- [ ] **Step 3: Hooks**

In `queries.ts`: `conversions: ['conversions'] as const,` and `invoiceCostOfSales: (id: string) => ['invoiceCostOfSales', id] as const,` in `qk`; then

```ts
export const useConversions = () => useQuery({ queryKey: qk.conversions, queryFn: api.getConversions });
export const useInvoiceCostOfSales = (invoiceId: string) =>
  useQuery({ queryKey: qk.invoiceCostOfSales(invoiceId), queryFn: () => api.getInvoiceCostOfSales(invoiceId), enabled: !!invoiceId });

function useInvalidateConversions() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: qk.conversions });
    qc.invalidateQueries({ queryKey: qk.stock });
    qc.invalidateQueries({ queryKey: ['invoiceCostOfSales'] });
    // Confirm/cancel book or cancel an expense document on the workshop person.
    qc.invalidateQueries({ queryKey: qk.chargeDocs?.('EXPENSE') ?? ['chargeDocs'] });
    qc.invalidateQueries({ queryKey: qk.customers });
  };
}
export const useCreateConversion = () => { const inv = useInvalidateConversions(); return useMutation({ mutationFn: api.createConversion, onSuccess: () => inv() }); };
export const useUpdateConversion = () => { const inv = useInvalidateConversions(); return useMutation({ mutationFn: ({ id, input }: { id: string; input: ConversionDocInput }) => api.updateConversion(id, input), onSuccess: () => inv() }); };
export const useConfirmConversion = () => { const inv = useInvalidateConversions(); return useMutation({ mutationFn: api.confirmConversion, onSuccess: () => inv() }); };
export const useCancelConversion = () => { const inv = useInvalidateConversions(); return useMutation({ mutationFn: api.cancelConversion, onSuccess: () => inv() }); };
```

Look up the real query keys for charge documents and customers in `qk` (`grep -n "chargeDocs\|customers:" apps/erp-panel/src/services/queries.ts | head`) and use those exact keys instead of the guesses in the snippet.

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck -w @finora/erp-panel 2>&1 | grep "error TS" | head -5; npm run lint -w @finora/erp-panel 2>&1 | tail -2`
Expected: no type errors (nothing consumes the new hooks yet); lint 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/erp-panel/src/types/index.ts apps/erp-panel/src/mock/data.ts apps/erp-panel/src/services apps/erp-panel/src/store/useAuthStore.ts
git commit -m "feat(erp): the data layer knows conversions, stock value and cost of sales

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: UI — Conversions tab, form, value columns, cost of sales, four locales

**Files:**
- Create: `apps/erp-panel/src/pages/warehouse/ConversionFormModal.tsx`
- Create: `apps/erp-panel/src/pages/warehouse/ConversionsTab.tsx`
- Modify: `apps/erp-panel/src/pages/warehouse/WarehousePage.tsx` (`TAB_KEYS` ~line 25, `tabList` ~line 279, header `extra` ~line 246, inventory cards ~line 300-335)
- Modify: `apps/erp-panel/src/pages/tradeInvoices/InvoiceDetailPage.tsx` (`Descriptions` items ~line 541)
- Modify: `apps/erp-panel/src/i18n/locales/{en,ar,fa,ku}.json` (new `conversions` block; `warehouse.stockValue`, `warehouse.unitCost`, `warehouse.costUnknown`; `tradeInvoices.costOfSales`, `tradeInvoices.margin`)

**Interfaces:**
- Consumes: hooks and types from Task 5; `useGoods`, `useWarehouses`, `useChargeCategories`, `useCustomers` (existing hooks — confirm names with `grep -n "export const use\(Goods\|Warehouses\|ChargeCategories\|Customers\)" apps/erp-panel/src/services/queries.ts`).

- [ ] **Step 1: Locale keys (all four files, identical key sets)**

Add a top-level `conversions` block. English:

```json
"conversions": {
  "tab": "Conversions",
  "newConversion": "New conversion",
  "editConversion": "Edit conversion",
  "title": "Conversion",
  "number": "Number",
  "date": "Date",
  "warehouse": "Warehouse",
  "inputs": "Goods in (used)",
  "outputs": "Goods out (made)",
  "costs": "Workshop costs",
  "product": "Product",
  "quantityMt": "Quantity (MT)",
  "share": "Cost share %",
  "shareHint": "Leave empty to split by weight",
  "category": "Category",
  "person": "Paid to",
  "amount": "Amount",
  "currency": "Currency",
  "fxRate": "FX rate",
  "description": "Description",
  "addInput": "Add input",
  "addOutput": "Add output",
  "addCost": "Add cost",
  "yield": "Yield",
  "inputCost": "Input cost (USD)",
  "addedCost": "Added cost (USD)",
  "totalCost": "Total cost (USD)",
  "unitCost": "Cost / MT (USD)",
  "status": "Status",
  "statusDraft": "Draft",
  "statusConfirmed": "Confirmed",
  "statusCancelled": "Cancelled",
  "confirm": "Confirm",
  "confirmHint": "Confirming moves the stock and fixes the cost. Only a manager can confirm.",
  "cancel": "Cancel",
  "cancelConfirm": "Cancel this conversion?",
  "created": "Conversion created",
  "updated": "Conversion updated",
  "confirmed": "Conversion confirmed",
  "cancelled": "Conversion cancelled",
  "notes": "Notes",
  "summary": "{{inputs}} → {{outputs}}",
  "emptyTitle": "No conversions yet",
  "emptyHint": "Turn one stock item into another — strip cable into copper, melt copper into ingots — and the cost follows the metal.",
  "needInputAndOutput": "Add at least one input and one output",
  "invalidShares": "Cost shares must be empty on every line, or add up to 100",
  "costCategoryInvalid": "Pick an expense category with scope General",
  "insufficientStock": "Not enough {{product}} in this warehouse — available: {{available}} MT",
  "cancelBlockedStock": "{{product}} from this conversion has already been used — cancel those documents first",
  "linkedExpense": "Booked as expense"
}
```

Also add `"stockValue": "Value (USD)"`, `"unitCost": "Cost / MT"`, `"costUnknown": "cost unknown"` to `warehouse`, and `"costOfSales": "Cost of sales"`, `"margin": "Margin"` to `tradeInvoices`. Translate every value into Arabic, Persian and Sorani Kurdish for `ar.json`, `fa.json`, `ku.json` (same register as the surrounding text; keep `{{placeholders}}` and Latin digits). Verify with the four-file parity script (flatten each, compare key sets; all four must be equal) and paste its output in the report.

- [ ] **Step 2: The form**

`ConversionFormModal.tsx` — a `Modal` (width 960) with a `Form` for the header (`warehouseId` Select from `useWarehouses` filtered `active`, `date` DatePicker, `notes` TextArea) and three small editable tables kept in `useState` arrays:

- **Inputs / Outputs** rows: `product` (AntD `AutoComplete` over `useGoods()` names, allow free text), `quantityMt` (`InputNumber` min 0.001 step 0.001), and on outputs `sharePercent` (`InputNumber` 0–100, placeholder `conversions.shareHint`); a delete icon per row; `Add input` / `Add output` buttons append an empty row.
- **Costs** rows: `categoryId` (Select over `useChargeCategories()` filtered `direction === 'EXPENSE' && scope === 'GENERAL' && active`), `personId` (Select over `useCustomers()` active, label = name), `amount`, `currency` (Select `CURRENCIES`), `fxRate` (disabled and 1 when USD, else required, default `defaultFxFor(currency, rates)` from `useSettingsStore`), `description`.
- Live footer: `Yield` = Σ out ÷ Σ in as a percent (or "—"), Σ cost lines in USD.
- Props: `{ open; onClose; conversion?: ConversionDocument }` — when editing, pre-fill from the document; submit calls `useCreateConversion` or `useUpdateConversion`. Client-side checks before submit: at least one input and one output with product and quantity > 0 → else `message.error(t('conversions.needInputAndOutput'))`; shares valid (all empty or sum 100 ± 0.01) → else `conversions.invalidShares`. Server codes mapped in the `catch`: `'conversion-empty'` → `needInputAndOutput`, `'invalid-shares'` → `invalidShares`, `'cost-category-invalid'` → `costCategoryInvalid`, `'insufficient-stock'` → `insufficientStock` with `{ product, available }` from the `ApiError`'s extensions, anything else → `common.saveFailed`.

Follow `InventoryDocFormModal.tsx` for structure (imports, `App.useApp()` for messages, `destroyOnHidden`, `maskClosable={false}`) and its RTL `ltrTruncateStyle` note for the product column.

- [ ] **Step 3: The tab**

`ConversionsTab.tsx` — props `{ onEdit: (c: ConversionDocument) => void }`. A `Table<ConversionDocument>` from `useConversions()`: columns number (monospace), date (`formatDate`), warehouse name (map from `useWarehouses`), summary (`t('conversions.summary', { inputs: inputs.map(i => `${i.product} ${formatMt(i.quantityMt)}`).join(' + '), outputs: … })`), yield (`(Σ out / Σ in × 100).toFixed(2)%`), total cost (`<Money value={totalInputCostUsd + totalAddedCostUsd} />` when confirmed, else "—"), status `Tag` (blue DRAFT / green CONFIRMED / red CANCELLED, labels `conversions.status*`), actions: Edit (DRAFT only) → `onEdit`, **Confirm** (DRAFT only, rendered only when `useAuthStore((s) => s.permissions.includes('conversions.confirm'))`, `Popconfirm` with `conversions.confirmHint`, calls `useConfirmConversion`), Cancel (`Popconfirm` `conversions.cancelConfirm`, calls `useCancelConversion`; errors mapped: `'cancel-blocked-stock'` → `conversions.cancelBlockedStock` with `{ product }`). Expandable row: three small read-only tables (inputs with unit cost and cost when confirmed; outputs with share, unit cost, cost; costs with category, person, amount, USD) plus the linked expense id when present (`conversions.linkedExpense`). Empty state: `Empty` with `conversions.emptyTitle` / `emptyHint`.

In `WarehousePage.tsx`: `TAB_KEYS = ['warehouses', 'inventory', 'documents', 'conversions'] as const`; add `{ key: 'conversions', label: t('conversions.tab') }` to `tabList`; header `extra` for that tab = a primary button `conversions.newConversion` opening `ConversionFormModal`; render `<ConversionsTab onEdit={(c) => setConversionForm({ open: true, conversion: c })} />` for the tab; mount `ConversionFormModal` like `InventoryDocFormModal` (conditionally on `open`).

- [ ] **Step 4: Inventory value and cost of sales**

In the Inventory tab cards (`WarehousePage.tsx` ~line 320), show per row: product, `formatMt(r.mt)`, and a second muted line `t('warehouse.unitCost')}: {formatCurrency(r.unitCostUsd, 'USD')}` + `{t('warehouse.stockValue')}: {formatCurrency(r.valueUsd, 'USD')}`; when `!r.costKnown` render a small `Tag color="warning">{t('warehouse.costUnknown')}</Tag>` instead of the unit cost. Keep the layout logical-CSS only (`marginInlineStart`, no `left/right`).

In `InvoiceDetailPage.tsx`, when `invoice.invoiceType === 'SALE_INVOICE' && invoice.status === 'CONFIRMED'`, call `useInvoiceCostOfSales(invoice.id)` and append two `Descriptions` items after `weight` when the result is non-null: `costOfSales` → `<Money value={cost.costUsd} />` (with the `costUnknown` tag when `!cost.costKnown`) and `margin` → `<Money value={invoice.totalAmount − cost.costUsd} strong />`. Hooks must be called unconditionally — call it always with `enabled` handled by the hook (`!!invoiceId`), and only render the items under the condition.

- [ ] **Step 5: Verify**

Run: `npm run typecheck -w @finora/erp-panel 2>&1 | tail -2 && npm run lint -w @finora/erp-panel 2>&1 | tail -3 && npm run build -w @finora/erp-panel 2>&1 | grep -E "built in|error"`
Expected: typecheck silent; lint 0 errors (one known warning in `statusColors.tsx`); build succeeds.

Run: `dotnet test backend/Finora.slnx --filter "FullyQualifiedName~ErrorCodeContractTests" 2>&1 | tail -3`
Expected: passed (the three form-handled codes are now found in `src/pages`).

Browser check with the backend running (`dotnet run --project backend/src/Finora.AppHost`, then the `dev` preview on :3031, sign in as Manager via the demo-account click): Base Info › Goods has "Copper cable" and "Copper ingot"; Warehouse › Documents › New receipt of cable against a confirmed purchase invoice; Warehouse › Conversions › New conversion: input cable 1.000, output ingot 0.600, one cost line; save → DRAFT row; Confirm → CONFIRMED, expanded row shows costs; Inventory tab shows ingot with cost / MT and value; Expenses › General lists "Conversion CNV-…". Take one screenshot of the expanded confirmed row and one of the Inventory tab for the report.

- [ ] **Step 6: Commit**

```bash
git add apps/erp-panel/src/pages apps/erp-panel/src/i18n/locales
git commit -m "feat(erp): the Conversions tab, stock value on Inventory, cost of sales on a sale invoice

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Sample data, docs, full verification

**Files:**
- Modify: `apps/erp-panel/src/mock/sampleData.ts` (GRN block ~line 757: add `unitCostUsd`/`costUsd`; add one confirmed conversion; register `conversions` in the returned `Db` ~line 1862)
- Modify: `docs/flowcharts/finora-user-guide.html` (new short section after 7 "Record a container": "Convert stock"; renumber later sections and the contents list; footers "Page N / 17")
- Modify: `docs/flowcharts/copper-processing-flow.html` (page 1 steps 2 and 3: "not in the app yet" → the Conversions tab; page 2 "In the app today" table and "feature to add" boxes become "how it works now")
- Modify: `docs/flowcharts/finora-flowcharts.html` (section 7 gets the conversion in the lanes and details)
- Modify: `CLAUDE.md` (Domain model: one line on conversions and cost per MT; conventions: `StockLedger` is the only place stock and cost are folded server-side)

- [ ] **Step 1: Sample data**

In the GRN's items, add `unitCostUsd: round(it.amount / (pi.exchangeRate || 1) / it.quantityMt, 4)` and `costUsd: round(it.amount / (pi.exchangeRate || 1), 2)` per item (check the invoice-item field name for the line value — `amount` — with `grep -n "amount:" apps/erp-panel/src/mock/sampleData.ts | head -3`). Then, after the GRN, one confirmed conversion in `wh-1` dated `rel('2026-05-28')`: input = the GRN's first product (its full quantity), outputs = same product name with " ingot" appended at 92 % of the quantity (share null), one cost line (first EXPENSE/GENERAL category in the sample, first EMPLOYEE/OTHER person, 800 USD), with stored costs computed by the same rules (`unitCostUsd` of input = GRN unit cost; output `costUsd` = input cost + 800; `unitCostUsd` = that ÷ output MT), `docNumber: 'CNV-2026-0001'`, id `cnv-0001`, line ids `cnvin-1`, `cnvout-1`, `cnvcost-1`, `chargeDocId` = the id of a matching GENERAL expense document you also add to `chargeDocs` (title `Conversion CNV-2026-0001`, one line, ACTIVE). Push it to a `conversions: ConversionDocument[]` array returned in the `Db`. Any sale-side GDN in the sample gets `unitCostUsd`/`costUsd` from the GRN's unit cost (or 0 if its product was never received).

Run: `npm run typecheck -w @finora/erp-panel 2>&1 | tail -2` — silent.

- [ ] **Step 2: Docs**

User guide — insert after section 7, in the same simple English and the same page structure (`<section class="page">`, goal line, path bar, numbered steps, two boxes):

- Title "8 · Convert stock (strip, melt, cut)"; goal: turn one stock item into another and keep the cost. Path: Warehouse › Conversions › New conversion → inputs → outputs → costs → Save → Confirm (manager). Steps: pick warehouse and date; add the goods you use up (product, MT); add the goods you get (product, MT; leave cost share empty to split by weight); add workshop costs (category, who you paid, amount) — they are booked as an expense automatically; Save (draft); a Manager clicks Confirm. "You see": stock of the input goes down, stock of the output goes up, and the Inventory tab shows the new cost / MT. Boxes: "Good to know" (yield is shown; the cost never disappears with the lost weight; cancel is blocked once the output was used) and "If the app refuses" (insufficient stock; cost shares must sum to 100; category must be a General expense category).
- Renumber sections 8–16 to 9–17, update the contents list and every footer to `/ 17`.
- Section 12 (now 13, "Check a person's balance") unchanged; section 6 (Selling) step 5's "You see" gains ", and the invoice shows its cost of sales and margin".

Copper-processing doc: steps 2 and 3 lose the red "not in the app yet" style (`class="step"`) and their app cells read "Warehouse › Conversions › New conversion: OUT Copper cable 1.000 MT → IN Stripped copper 0.650 MT; cost line for labour; Confirm (manager)"; page 2's "In the app today" rows for steps 2–4 become "Yes"; the "feature to add" box becomes "How the app does it" (three bullets: conversion document, stored cost per MT, cost of sales on the sale invoice).

Flowcharts section 7: add a third lane "Conversion (CNV)" — "Inputs OUT → Outputs IN, costs added" ↓ "Stock and cost move; expense booked" — and a details bullet on the moving-average cost.

CLAUDE.md: under "Domain model" add `Conversion documents (Warehouse › Conversions) turn stock of one product into others inside a warehouse and carry the cost: every receipt, issue, conversion input and output stores its cost per MT; `StockLedger` folds quantity and value per (warehouse, product). See docs/superpowers/specs/2026-09-03-warehouse-conversion-design.md.`

- [ ] **Step 3: Full verification**

```bash
dotnet build backend/Finora.slnx 2>&1 | grep -E "error|warn|Build succeeded" | head -5
dotnet test backend/Finora.slnx 2>&1 | tail -6
npm run lint -w @finora/erp-panel 2>&1 | tail -3
npm run typecheck 2>&1 | tail -3
npm run build 2>&1 | grep -E "built in|error|Compiled" | head -5
```
Expected: build succeeded, 0 warnings; every test project green; lint 0 errors; typecheck silent; both apps build. Then load the sample data in the running app (Settings › Load sample data) and check Warehouse › Conversions shows `CNV-2026-0001` confirmed and Inventory shows the ingot's cost.

- [ ] **Step 4: Commit**

```bash
git add apps/erp-panel/src/mock/sampleData.ts docs/flowcharts CLAUDE.md
git commit -m "docs: conversions in the guides, the copper flow is now 'how the app does it', sample data carries one

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Merge, push and deployment (API + migrator + web images; the migrator applies `AddConversions` and seeds the new permission) are the controller's steps after the final review.
