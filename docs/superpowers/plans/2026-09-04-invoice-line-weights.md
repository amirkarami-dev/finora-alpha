# Invoice Line Weights (gross, tare, net) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the four invoice types a line carries gross and tare weights typed by the user, and the server sets the net (= the existing `quantityMt`) that everything downstream already reads; orders keep one quantity field.

**Architecture:** Two nullable quantity columns (`gross_mt`, `tare_mt`) join `invoice_items`; `InvoiceService` resolves what to store per document type (orders: quantity from the client; invoice types: gross and tare from the client, net computed) in one helper used by add, edit and convert. The app's add-line and edit-line forms switch their quantity input for gross/tare inputs plus a live read-only net on invoice types, and the detail table shows the three columns. Nothing that reads `quantityMt` changes.

**Tech Stack:** .NET 10 / EF Core 10 / Npgsql / xUnit + Testcontainers (backend); Vite 6 / React 18 / TypeScript strict / AntD 5 / react-i18next (app).

**Spec:** `docs/superpowers/specs/2026-09-04-invoice-line-weights-design.md`

## Global Constraints

- Quantities are MT with **six decimals**: server `Rounding.Quantity`, app `roundMt`, columns via `HasQuantityColumn()` (`numeric(18,6)`). Never call `Math.Round` outside `Rounding` (architecture test).
- `dotnet build backend/Finora.slnx` treats warnings as errors.
- Every user-facing string goes through `t()` with the **same key set in `en`, `ar`, `fa`, `ku`** (real translations, not English copies).
- Components read data only through hooks in `services/queries.ts`; they never import `db` or a service file.
- Logical CSS only (`marginInlineEnd`, not `marginRight`).
- Error codes: every code the server throws must be in `backend/contracts/error-codes.json`, and either branched on in the SPA as `code === '<code>'` or listed in `ErrorCodeContractTests.BackendOnlyCodes` (the unit test enforces both directions).
- Commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Never commit `.superpowers/`.
- Docs for the owner are in **simple English**: short sentences, common words.
- Docker Desktop must be running for `dotnet test` (Testcontainers). `dotnet test backend/Finora.slnx` runs unit + architecture + integration (~2–3 minutes).

---

## File structure

| File | Responsibility |
|---|---|
| `backend/src/Modules/Erp/Finora.Erp.Domain/Trade.cs` | `InvoiceItem.GrossMt` / `TareMt` (nullable) |
| `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Configuration/TradeConfiguration.cs` | the two columns |
| `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Migrations/<stamp>_AddInvoiceLineWeights.cs` | add columns + data step for existing invoice-type lines |
| `backend/src/Modules/Erp/Finora.Erp.Application/InvoiceContracts.cs` | `InvoiceItemInput` / `InvoiceItemPatch` gain gross/tare; quantity optional |
| `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Trade/InvoiceService.cs` | `ResolveWeights` helper; add / edit / convert per spec §2; `weights-invalid` |
| `backend/contracts/error-codes.json`, `backend/tests/Finora.UnitTests/ErrorCodeContractTests.cs` | the new code |
| `backend/tests/Finora.IntegrationTests/InvoiceTests.cs`, `SnapshotRoundTripTests.cs` | tests |
| `apps/erp-panel/src/types/index.ts`, `services/api.ts`, `mock/data.ts` | types, inputs, `SCHEMA_VERSION` |
| `apps/erp-panel/src/utils/calc.ts` | exported `isPricedType` shared by page and forms (if not already exported elsewhere) |
| `apps/erp-panel/src/pages/tradeInvoices/AddItemsModal.tsx`, `EditLineModal.tsx` | gross / tare / net inputs |
| `apps/erp-panel/src/pages/tradeInvoices/InvoiceDetailPage.tsx` | Gross / Tare / Net columns on invoice types |
| `apps/erp-panel/src/pages/warehouse/InventoryDocFormModal.tsx` | "Net (MT)" unit label |
| `apps/erp-panel/src/i18n/locales/{en,ar,fa,ku}.json` | keys |
| `apps/erp-panel/src/mock/sampleData.ts` | gross/tare on sample invoice lines |
| `docs/flowcharts/finora-user-guide.html`, `CLAUDE.md` | docs |

---

### Task 1: The two columns, their migration, and the snapshot round-trip

**Files:**
- Modify: `backend/src/Modules/Erp/Finora.Erp.Domain/Trade.cs:202-203` (after `QuantityMt`)
- Modify: `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Configuration/TradeConfiguration.cs:197` (InvoiceItem configuration)
- Create: `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Migrations/<stamp>_AddInvoiceLineWeights.cs` (+ `.Designer.cs`, and the model snapshot, both generated)
- Test: `backend/tests/Finora.IntegrationTests/SnapshotRoundTripTests.cs:296-305` (the `InvoiceItem` in `Build()`) and `:86-88` (the assertions)

**Interfaces:**
- Produces: `InvoiceItem.GrossMt: decimal?`, `InvoiceItem.TareMt: decimal?` — null on order lines, set on invoice-type lines. Task 2 writes them; Tasks 3–4 read them as `grossMt` / `tareMt` in JSON (System.Text.Json web defaults camel-case them like every other property).

- [ ] **Step 1: Write the failing round-trip assertion**

In `backend/tests/Finora.IntegrationTests/SnapshotRoundTripTests.cs`, in `Build()`, change the `InvoiceItem` (around line 298) to carry weights whose difference is its quantity:

```csharp
                    new InvoiceItem
                    {
                        Id = "invitem-0001", InvoiceId = "inv-pi-0001", ContractItemId = "item-0001",
                        ReferenceDocumentItemId = "ref-item-1", Product = "Copper Cathode",
                        QuantityMt = 28.027m, GrossMt = 28.227m, TareMt = 0.2m,
                        LmePercent = 94.76m, LmeFixed = true,
                        FixedPrice = 11_685m, Premium = 0m, Amount = 327_500m, ContainerId = "cnt-0001",
                    },
```

In the test that asserts `28.027m` on the contract item (around line 86), add right after the `LmePercent` assertion:

```csharp
        // The weighed figures survive beside the net; the net is not recomputed on read.
        var invoiceLine = Assert.Single(Assert.Single(read.Invoices).Items);
        Assert.Equal(28.227m, invoiceLine.GrossMt);
        Assert.Equal(0.2m, invoiceLine.TareMt);
        Assert.Equal(28.027m, invoiceLine.QuantityMt);
```

(If `read.Invoices` holds more than one invoice in `Build()`, select the one with `Id == "inv-pi-0001"` instead of `Assert.Single`.)

- [ ] **Step 2: Run it to see it fail to compile**

Run: `dotnet build backend/Finora.slnx 2>&1 | grep -E "error|Build succeeded" | head -5`
Expected: errors `'InvoiceItem' does not contain a definition for 'GrossMt'` / `'TareMt'`.

- [ ] **Step 3: Add the properties**

In `backend/src/Modules/Erp/Finora.Erp.Domain/Trade.cs`, directly after `public decimal QuantityMt { get; set; }` (line 203):

```csharp
    /// <summary>
    /// What the scale showed, on the four invoice types: the net (<see cref="QuantityMt"/>) is
    /// gross − tare and is set by the server, never by the client. Both are null on an order
    /// line, which carries a quantity only because it is written before the goods are weighed.
    /// </summary>
    public decimal? GrossMt { get; set; }

    /// <summary>Packing and pallet weight. See <see cref="GrossMt"/>.</summary>
    public decimal? TareMt { get; set; }
```

In `TradeConfiguration.cs`, in `InvoiceItemConfiguration.Configure`, directly after `builder.Property(i => i.QuantityMt).HasQuantityColumn();` (line 197):

```csharp
        builder.Property(i => i.GrossMt).HasQuantityColumn();
        builder.Property(i => i.TareMt).HasQuantityColumn();
```

(The nullable overload of `HasQuantityColumn` already exists in `ErpModelBuilderExtensions.cs`.)

- [ ] **Step 4: Generate the migration and add the data step**

Run from the repo root:

```bash
dotnet ef migrations add AddInvoiceLineWeights --project backend/src/Modules/Erp/Finora.Erp.Infrastructure --startup-project backend/src/Finora.Api --context ErpDbContext --output-dir Migrations
```

Open the generated `Migrations/<stamp>_AddInvoiceLineWeights.cs`. Its `Up` has two `AddColumn<decimal>` calls (`gross_mt`, `tare_mt`, `type: "numeric(18,6)"`, `nullable: true`). Append the data step after them, inside `Up`:

```csharp
            // Lines that already exist on the four invoice types get gross = net and tare = 0,
            // so every stored invoice line satisfies the new rule (spec §2). Order lines stay
            // null — they carry a quantity only. The wire names are what `EnumNames.ToWire`
            // stores for `InvoiceType` (the enum member name).
            migrationBuilder.Sql("""
                UPDATE erp.invoice_items AS ii
                SET gross_mt = ii.quantity_mt, tare_mt = 0
                FROM erp.invoices AS i
                WHERE i.id = ii.invoice_id
                  AND i.invoice_type NOT IN ('PURCHASE_ORDER', 'SALE_ORDER');
                """);
```

Before relying on the two literals, confirm the wire form with one line in the test project or a scratch check: `EnumNames.ToWire(InvoiceType.PURCHASE_ORDER)` must return `"PURCHASE_ORDER"` (the `EnumParityTests` compare these names with the TypeScript union `'PURCHASE_ORDER' | …`, so they match; if `ToWire` ever returned something else, use that string). `Down` needs nothing beyond the generated `DropColumn` calls.

- [ ] **Step 5: Build and run the round-trip test**

Run: `dotnet build backend/Finora.slnx 2>&1 | grep -E "error|warn|Build succeeded" | head -5`
Expected: `Build succeeded.`

Run: `dotnet test backend/tests/Finora.IntegrationTests --filter "FullyQualifiedName~SnapshotRoundTripTests" 2>&1 | grep -E "Passed!|Failed!|\[FAIL\]"`
Expected: `Passed!` (the fixture applies the migration to a fresh Postgres container, so this also proves the migration runs).

- [ ] **Step 6: Commit**

```bash
git add backend/src/Modules/Erp/Finora.Erp.Domain/Trade.cs backend/src/Modules/Erp/Finora.Erp.Infrastructure/Configuration/TradeConfiguration.cs backend/src/Modules/Erp/Finora.Erp.Infrastructure/Migrations backend/tests/Finora.IntegrationTests/SnapshotRoundTripTests.cs
git commit -m "feat(erp): an invoice line stores its gross and tare weights beside the net

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The server rules — net is gross minus tare on invoice types, quantity on orders

**Files:**
- Modify: `backend/src/Modules/Erp/Finora.Erp.Application/InvoiceContracts.cs:25-36`
- Modify: `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Trade/InvoiceService.cs` — `Codes` (21-40), `AddItemsAsync` (164-231), `UpdateItemAsync` (244-296), `ConvertAsync` line copy (566-585), plus one new private helper
- Modify: `backend/contracts/error-codes.json` (alphabetical list)
- Modify: `backend/tests/Finora.UnitTests/ErrorCodeContractTests.cs:18` (`BackendOnlyCodes`)
- Test: `backend/tests/Finora.IntegrationTests/InvoiceTests.cs` (helper at 84-87, `ResetAsync` at 38-62, raw bodies, new tests)

**Interfaces:**
- Consumes: `InvoiceItem.GrossMt` / `TareMt` from Task 1.
- Produces:
  - `InvoiceItemInput(string ContractItemId, decimal? QuantityMt, decimal? GrossMt, decimal? TareMt, string? ContainerId, string? Description)`
  - `InvoiceItemPatch(decimal? QuantityMt, decimal? GrossMt, decimal? TareMt, string? ContainerId, string? Description, decimal? DiscountPercent)`
  - error `weights-invalid` with `extensions.rule ∈ { "gross", "tare", "tare-exceeds-gross", "quantity" }` — Task 3 branches on it.
  - JSON: every line now returns `grossMt` and `tareMt` (null on order lines).

- [ ] **Step 1: Make the existing tests send weights (they post invoice-type lines with a bare quantity)**

In `InvoiceTests.cs`:

1. Add a warehouse to `ResetAsync`'s snapshot (needed by the receipt test below). Inside the `new ErpSnapshot { … }`, after `Containers = […],` add:

```csharp
            Warehouses = [new Warehouse { Id = "wh-1", Name = "Main", Code = "1" }],
```

2. Change the helper so it satisfies both document kinds (the server ignores the field the type does not use):

```csharp
    /// <summary>Sends every quantity field: an order takes <c>quantityMt</c>, an invoice type
    /// takes <c>grossMt</c>/<c>tareMt</c> and ignores the rest. Tare 0 keeps net == qty.</summary>
    private static Task<JsonElement> AddLineAsync(
        HttpClient c, string id, decimal qty, string? container = "cnt-1") =>
        PostAsync(c, $"/api/erp/invoices/{id}/items",
            new[] { new { contractItemId = "item-1", quantityMt = qty, grossMt = qty, tareMt = 0m, containerId = container } });
```

3. Every other body in this file that posts to `/items` or `PUT …/items/{id}` with a `quantityMt = X` (around lines 120-128, 208-212, 253-262, 274-280, 300-305, 328-333, 414-418, 481-485, 611-615): add `grossMt = X, tareMt = 0m` beside it, with the same `X`. Then check nothing was missed:

```bash
grep -c "quantityMt = " backend/tests/Finora.IntegrationTests/InvoiceTests.cs
grep -c "grossMt = " backend/tests/Finora.IntegrationTests/InvoiceTests.cs
```

Expected: the two counts are equal (every invoice-line body now sends both).

- [ ] **Step 2: Write the new failing tests**

Append to `InvoiceTests.cs`, in a new region before the numbering tests:

```csharp
    /* ------------------------------- Weights ------------------------------- */

    private static object Weighed(decimal gross, decimal tare, string? container = "cnt-1") =>
        new[] { new { contractItemId = "item-1", grossMt = gross, tareMt = tare, containerId = container } };

    [Fact]
    public async Task Net_is_gross_minus_tare_and_it_prices_the_line()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = await DraftAsync(c);

        // quantityMt is sent on purpose and must be ignored on an invoice type.
        var line = (await PostAsync(c, $"/api/erp/invoices/{id}/items",
            new[] { new { contractItemId = "item-1", grossMt = 1.2m, tareMt = 0.2m, quantityMt = 99m, containerId = "cnt-1" } }))
            .GetProperty("entity").GetProperty("items")[0];

        Assert.Equal(1.2m, line.GetProperty("grossMt").GetDecimal());
        Assert.Equal(0.2m, line.GetProperty("tareMt").GetDecimal());
        Assert.Equal(1m, line.GetProperty("quantityMt").GetDecimal());
        // 11,685 × 94.76% = 11,072.706 USD/MT × 1.000 MT, to the cent.
        Assert.Equal(11072.71m, line.GetProperty("amount").GetDecimal());
    }

    [Theory]
    [InlineData(0, 0, "gross")]
    [InlineData(1, -0.1, "tare")]
    [InlineData(1, 1, "tare-exceeds-gross")]
    [InlineData(1, 1.5, "tare-exceeds-gross")]
    public async Task Weights_are_checked_rule_by_rule(decimal gross, decimal tare, string rule)
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = await DraftAsync(c);

        var response = await c.PostAsJsonAsync(new Uri($"/api/erp/invoices/{id}/items", UriKind.Relative), Weighed(gross, tare));

        var problem = await ProblemAsync(response);
        Assert.Equal("weights-invalid", problem.GetProperty("code").GetString());
        Assert.Equal(rule, problem.GetProperty("rule").GetString());
    }

    [Fact]
    public async Task A_missing_weight_on_an_invoice_type_is_refused_not_defaulted()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = await DraftAsync(c);

        var response = await c.PostAsJsonAsync(new Uri($"/api/erp/invoices/{id}/items", UriKind.Relative),
            new[] { new { contractItemId = "item-1", quantityMt = 10m, containerId = "cnt-1" } });

        var problem = await ProblemAsync(response);
        Assert.Equal("weights-invalid", problem.GetProperty("code").GetString());
        Assert.Equal("gross", problem.GetProperty("rule").GetString());
    }

    [Fact]
    public async Task An_order_line_takes_a_quantity_and_stores_no_weights()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var order = await DraftAsync(c, "SALE_ORDER");

        var line = (await PostAsync(c, $"/api/erp/invoices/{order}/items",
            new[] { new { contractItemId = "item-1", quantityMt = 25m, grossMt = 40m, tareMt = 1m } }))
            .GetProperty("entity").GetProperty("items")[0];

        Assert.Equal(25m, line.GetProperty("quantityMt").GetDecimal());
        Assert.Equal(JsonValueKind.Null, line.GetProperty("grossMt").ValueKind);
        Assert.Equal(JsonValueKind.Null, line.GetProperty("tareMt").ValueKind);

        var zero = await c.PostAsJsonAsync(new Uri($"/api/erp/invoices/{order}/items", UriKind.Relative),
            new[] { new { contractItemId = "item-1", quantityMt = 0m } });
        var problem = await ProblemAsync(zero);
        Assert.Equal("weights-invalid", problem.GetProperty("code").GetString());
        Assert.Equal("quantity", problem.GetProperty("rule").GetString());
    }

    [Fact]
    public async Task Editing_one_weight_moves_the_net_and_keeps_the_other()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = await DraftAsync(c);
        var lineId = (await PostAsync(c, $"/api/erp/invoices/{id}/items", Weighed(1.2m, 0.2m)))
            .GetProperty("entity").GetProperty("items")[0].GetProperty("id").GetString();

        var response = await c.PutAsJsonAsync(new Uri($"/api/erp/invoices/{id}/items/{lineId}", UriKind.Relative), new { grossMt = 2m });
        response.EnsureSuccessStatusCode();
        var edited = (await response.Content.ReadFromJsonAsync<JsonElement>(Json)).GetProperty("entity").GetProperty("items")[0];

        Assert.Equal(2m, edited.GetProperty("grossMt").GetDecimal());
        Assert.Equal(0.2m, edited.GetProperty("tareMt").GetDecimal());
        Assert.Equal(1.8m, edited.GetProperty("quantityMt").GetDecimal());

        var refused = await c.PutAsJsonAsync(new Uri($"/api/erp/invoices/{id}/items/{lineId}", UriKind.Relative), new { tareMt = 2.5m });
        var problem = await ProblemAsync(refused);
        Assert.Equal("weights-invalid", problem.GetProperty("code").GetString());
        Assert.Equal("tare-exceeds-gross", problem.GetProperty("rule").GetString());
    }

    [Fact]
    public async Task Converting_seeds_gross_from_an_orders_quantity_and_then_carries_the_weights()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var order = await DraftAsync(c, "SALE_ORDER");
        await AddLineAsync(c, order, 25m, container: null);
        await PostAsync(c, $"/api/erp/invoices/{order}/confirm");

        var provisional = await PostAsync(c, $"/api/erp/invoices/{order}/convert", new { targetType = "SALE_PROVISIONAL" });
        var pLine = provisional.GetProperty("entity").GetProperty("items")[0];
        Assert.Equal(25m, pLine.GetProperty("grossMt").GetDecimal());
        Assert.Equal(0m, pLine.GetProperty("tareMt").GetDecimal());
        Assert.Equal(25m, pLine.GetProperty("quantityMt").GetDecimal());

        // The desk weighs the goods and corrects the provisional, then it goes final.
        var pId = Id(provisional);
        var pLineId = pLine.GetProperty("id").GetString();
        await c.PutAsJsonAsync(new Uri($"/api/erp/invoices/{pId}/items/{pLineId}", UriKind.Relative),
            new { grossMt = 25.4m, tareMt = 0.4m, containerId = "cnt-1" });
        await PostAsync(c, $"/api/erp/invoices/{pId}/confirm");

        var final = (await PostAsync(c, $"/api/erp/invoices/{pId}/convert", new { targetType = "SALE_INVOICE" }))
            .GetProperty("entity").GetProperty("items")[0];
        Assert.Equal(25.4m, final.GetProperty("grossMt").GetDecimal());
        Assert.Equal(0.4m, final.GetProperty("tareMt").GetDecimal());
        Assert.Equal(25m, final.GetProperty("quantityMt").GetDecimal());
    }

    [Fact]
    public async Task A_receipt_against_the_line_consumes_the_net_not_the_gross()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = await DraftAsync(c, "PURCHASE_INVOICE");
        var line = (await PostAsync(c, $"/api/erp/invoices/{id}/items", Weighed(1.2m, 0.2m)))
            .GetProperty("entity").GetProperty("items")[0];
        await PostAsync(c, $"/api/erp/invoices/{id}/confirm");
        var refId = line.GetProperty("referenceDocumentItemId").GetString();

        await PostAsync(c, "/api/erp/inventory-documents", new
        {
            type = "IN", warehouseId = "wh-1", invoiceId = id, date = "2026-08-13T00:00:00Z",
            items = new[] { new { referenceDocumentItemId = refId, quantityMt = 1m } },
        });

        var over = await c.PostAsJsonAsync(new Uri("/api/erp/inventory-documents", UriKind.Relative), new
        {
            type = "IN", warehouseId = "wh-1", invoiceId = id, date = "2026-08-13T00:00:00Z",
            items = new[] { new { referenceDocumentItemId = refId, quantityMt = 0.1m } },
        });
        var problem = await ProblemAsync(over);
        Assert.Equal("exceeds-remaining", problem.GetProperty("code").GetString());
    }
```

- [ ] **Step 3: Run the new tests to see them fail**

Run: `dotnet test backend/tests/Finora.IntegrationTests --filter "FullyQualifiedName~InvoiceTests" 2>&1 | grep -E "Passed!|Failed!|\[FAIL\]" | head -12`
Expected: build errors on the `Weighed`/`grossMt` bodies are not possible (anonymous objects), so the run happens and the new tests FAIL — the server ignores `grossMt`/`tareMt` (unknown JSON) and stores `quantityMt`, and `A_missing_weight…` gets a 200.

- [ ] **Step 4: Change the input records**

`backend/src/Modules/Erp/Finora.Erp.Application/InvoiceContracts.cs`:

```csharp
/// <summary>
/// A goods line to add. Pricing is not accepted from the caller — it is copied from the contract
/// line, so a document cannot quietly disagree with the contract it is raised against.
///
/// <para>Which quantity fields count depends on the document (spec 2026-09-04 invoice line
/// weights, §2): an order takes <see cref="QuantityMt"/>; the four invoice types take
/// <see cref="GrossMt"/> and <see cref="TareMt"/> and the server sets the net itself.</para>
/// </summary>
public sealed record InvoiceItemInput(
    string ContractItemId,
    decimal? QuantityMt,
    decimal? GrossMt,
    decimal? TareMt,
    string? ContainerId,
    string? Description);

/// <summary>An edit to one line. Every field is optional; absent means unchanged.</summary>
public sealed record InvoiceItemPatch(
    decimal? QuantityMt,
    decimal? GrossMt,
    decimal? TareMt,
    string? ContainerId,
    string? Description,
    decimal? DiscountPercent);
```

- [ ] **Step 5: The service**

In `InvoiceService.cs`:

1. Add to `Codes`:

```csharp
        public const string WeightsInvalid = "weights-invalid";
```

2. Add this private helper next to `RequireDiscountInRange` (around line 675):

```csharp
    /// <summary>
    /// What a line stores, from what the caller sent, by document type (spec §2).
    ///
    /// <para>An order is written before the goods are weighed, so it takes a quantity and
    /// stores no weights. The four invoice types take gross and tare; the net is gross − tare
    /// and is computed HERE — a client's <c>quantityMt</c> is ignored on those types, so no
    /// screen can ever save a net that disagrees with its own gross and tare.</para>
    /// </summary>
    private static (decimal QuantityMt, decimal? GrossMt, decimal? TareMt) ResolveWeights(
        InvoiceType type, decimal? quantityMt, decimal? grossMt, decimal? tareMt)
    {
        if (!InvoiceMath.IsPricedType(type))
        {
            var quantity = Rounding.Quantity(quantityMt ?? 0m);
            return quantity > 0m ? (quantity, null, null) : throw WeightsInvalid("quantity");
        }

        if (grossMt is not { } grossRaw || Rounding.Quantity(grossRaw) <= 0m)
        {
            throw WeightsInvalid("gross");
        }

        if (tareMt is not { } tareRaw || Rounding.Quantity(tareRaw) < 0m)
        {
            throw WeightsInvalid("tare");
        }

        var gross = Rounding.Quantity(grossRaw);
        var tare = Rounding.Quantity(tareRaw);
        if (tare >= gross)
        {
            throw WeightsInvalid("tare-exceeds-gross");
        }

        return (Rounding.Quantity(gross - tare), gross, tare);
    }

    private static DomainException WeightsInvalid(string rule) =>
        new(Codes.WeightsInvalid, new Dictionary<string, object?> { ["rule"] = rule });
```

3. `AddItemsAsync`: replace

```csharp
        var quantities = items.Select(i => Rounding.Quantity(i.QuantityMt)).ToList();
```

with

```csharp
        // Resolved up front, so a bad weight on the third line refuses the whole post before
        // the first line is staged — same all-or-nothing as the contract guard below.
        var resolved = items
            .Select(i => ResolveWeights(invoice.InvoiceType, i.QuantityMt, i.GrossMt, i.TareMt))
            .ToList();
        var quantities = resolved.Select(r => r.QuantityMt).ToList();
```

and in the `new InvoiceItem { … }` initializer, after `QuantityMt = quantities[index],` add:

```csharp
                GrossMt = resolved[index].GrossMt,
                TareMt = resolved[index].TareMt,
```

4. `UpdateItemAsync`: replace the whole `if (patch.QuantityMt is { } requested) { … line.QuantityMt = quantity; }` block with:

```csharp
        // On an invoice type the weights are the input and the net follows; on an order the
        // quantity is the input. A patch that names none of them leaves the line's quantities.
        var priced = InvoiceMath.IsPricedType(invoice.InvoiceType);
        var touchesQuantity = priced
            ? patch.GrossMt is not null || patch.TareMt is not null
            : patch.QuantityMt is not null;

        if (touchesQuantity)
        {
            var (quantity, gross, tare) = ResolveWeights(
                invoice.InvoiceType,
                patch.QuantityMt,
                patch.GrossMt ?? line.GrossMt,
                patch.TareMt ?? line.TareMt);

            if (quantity > line.QuantityMt)
            {
                var contract = await LoadContractAsync(invoice.ContractId, cancellationToken);
                var contractItem = contract.Items.SingleOrDefault(i => i.Id == line.ContractItemId);
                var check = ContractQuantityGuard.Check(
                    all, contractItem, InvoiceMath.SideOf(invoice.InvoiceType), invoice.Id, quantity,
                    excludeInvoiceItemIds: [line.Id]);

                if (check.Exceeds)
                {
                    throw ContractQuantityGuard.Exceeded(check, line.Product);
                }
            }

            line.QuantityMt = quantity;
            line.GrossMt = gross;
            line.TareMt = tare;
        }
```

5. `ConvertAsync`: in the copied `new InvoiceItem { … }` (around line 575), after `QuantityMt = line.QuantityMt,` add:

```csharp
                    // Every convert target is an invoice type, which must carry weights. A line
                    // that came from an order has none yet, so gross starts as the quantity and
                    // tare as zero — valid at once, corrected when the goods are weighed.
                    GrossMt = line.GrossMt ?? line.QuantityMt,
                    TareMt = line.TareMt ?? 0m,
```

6. `backend/contracts/error-codes.json`: insert `"weights-invalid"` in alphabetical position (after `"warehouse-required"` if present, otherwise wherever `w…` sorts).

7. `ErrorCodeContractTests.cs`, `BackendOnlyCodes`: add, with the comment, so the parity test stays green until Task 3 adds the SPA branch:

```csharp
        // Invoice line weights (gross/tare). The SPA branch lands with the forms in the
        // same feature; remove this line when `code === 'weights-invalid'` exists in the SPA.
        "weights-invalid",
```

- [ ] **Step 6: Build, run the invoice and warehouse tests, then the whole suite**

Run: `dotnet build backend/Finora.slnx 2>&1 | grep -E "error|warn|Build succeeded" | head -5`
Expected: `Build succeeded.` (If `PaymentEndpointTests`, `ContractTests` or any other file constructs `InvoiceItemInput`/`InvoiceItemPatch` positionally, the compiler names it — add the two `null`s.)

Run: `dotnet test backend/tests/Finora.IntegrationTests --filter "FullyQualifiedName~InvoiceTests|FullyQualifiedName~WarehouseDocumentTests" 2>&1 | grep -E "Passed!|Failed!|\[FAIL\]"`
Expected: `Passed!`, no `[FAIL]`.

Run: `dotnet test backend/Finora.slnx 2>&1 | grep -E "Passed!|Failed!|\[FAIL\]"`
Expected: three `Passed!` lines (unit, architecture, integration).

- [ ] **Step 7: Commit**

```bash
git add backend/src backend/contracts/error-codes.json backend/tests
git commit -m "feat(erp): an invoice line's net is gross minus tare, set by the server; orders keep a quantity

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The forms — gross and tare in, net shown, on invoice types

**Files:**
- Modify: `apps/erp-panel/src/types/index.ts:388-389` (`InvoiceItem`)
- Modify: `apps/erp-panel/src/services/api.ts:1879-1885` (`InvoiceItemInput`), `:1911-1916` (`InvoiceItemPatch`), `:1944` (`isPricedType`)
- Modify: `apps/erp-panel/src/utils/calc.ts` (export `isPricedType` if it is not already exported from a shared module — see Step 2)
- Modify: `apps/erp-panel/src/mock/data.ts:76` (`SCHEMA_VERSION`)
- Modify: `apps/erp-panel/src/i18n/locales/{en,ar,fa,ku}.json` (`tradeInvoices` block)
- Modify: `apps/erp-panel/src/pages/tradeInvoices/AddItemsModal.tsx`, `EditLineModal.tsx`
- Modify: `backend/tests/Finora.UnitTests/ErrorCodeContractTests.cs` (remove the Task 2 `weights-invalid` entry)

**Interfaces:**
- Consumes: JSON `grossMt` / `tareMt` and `weights-invalid` + `rule` from Task 2.
- Produces: `InvoiceItem.grossMt?: number; tareMt?: number` (types), `isPricedType(type: InvoiceType): boolean` exported from `@/utils/calc`, i18n keys `tradeInvoices.grossMt`, `tareMt`, `netMt`, `weightsInvalidGross`, `weightsInvalidTare`, `weightsInvalidTareExceedsGross`, `weightsInvalidQuantity`, `warehouse.netMt`. Task 4 uses all of these.

- [ ] **Step 1: Types, inputs, schema version**

`types/index.ts`, in `InvoiceItem` after `quantityMt: number;`:

```ts
  /** Net weight is `quantityMt`. On the four invoice types the user enters these two and the
   *  server sets `quantityMt = grossMt − tareMt`; on an order line both are undefined. */
  grossMt?: number;
  tareMt?: number;
```

`services/api.ts`:

```ts
export interface InvoiceItemInput {
  contractItemId: string;
  /** Orders only — an invoice type ignores it and takes `grossMt`/`tareMt`. */
  quantityMt?: number;
  grossMt?: number;
  tareMt?: number;
  /** Container this line's goods were shipped in (optional while drafting; spec §7). */
  containerId?: string;
  description?: string;
}
```

```ts
export interface InvoiceItemPatch {
  quantityMt?: number;
  grossMt?: number;
  tareMt?: number;
  containerId?: string;
  description?: string;
  discountPercent?: number;
}
```

`mock/data.ts`: `const SCHEMA_VERSION = 9;` (a persisted entity's shape changed).

- [ ] **Step 2: One shared `isPricedType`**

Find how `InvoiceDetailPage.tsx` gets the `isPricedType` it calls at line ~133:

```bash
grep -rn "isPricedType" apps/erp-panel/src --include=*.ts --include=*.tsx
```

If it is a local function in the page or a non-exported one in `api.ts`, add to `apps/erp-panel/src/utils/calc.ts`:

```ts
import type { InvoiceType } from '@/types';

/** Orders are promises, not shipments: they carry no price, no container and no weights. */
export function isPricedType(type: InvoiceType): boolean {
  return type !== 'PURCHASE_ORDER' && type !== 'SALE_ORDER';
}
```

and make `api.ts` (line 1944) and the page import it from `@/utils/calc` instead of keeping their own copy. If it is already exported from a shared module, import that one in the two modals and skip this step.

- [ ] **Step 3: Locale keys**

Add inside the `"tradeInvoices": {` block of each file (any position; keep the block's alphabetical feel by placing them after `"exceedsUninvoiced"`):

`en.json`:

```json
    "grossMt": "Gross (MT)",
    "tareMt": "Tare (MT)",
    "netMt": "Net (MT)",
    "netHint": "Net = gross − tare",
    "weightsInvalidGross": "Gross weight must be more than 0",
    "weightsInvalidTare": "Tare weight cannot be less than 0",
    "weightsInvalidTareExceedsGross": "Tare must be less than gross",
    "weightsInvalidQuantity": "Quantity must be more than 0",
```

`ar.json`:

```json
    "grossMt": "الوزن القائم (طن)",
    "tareMt": "الوزن الفارغ (طن)",
    "netMt": "الوزن الصافي (طن)",
    "netHint": "الصافي = القائم − الفارغ",
    "weightsInvalidGross": "يجب أن يكون الوزن القائم أكبر من 0",
    "weightsInvalidTare": "لا يمكن أن يكون الوزن الفارغ أقل من 0",
    "weightsInvalidTareExceedsGross": "يجب أن يكون الوزن الفارغ أقل من الوزن القائم",
    "weightsInvalidQuantity": "يجب أن تكون الكمية أكبر من 0",
```

`fa.json`:

```json
    "grossMt": "وزن ناخالص (تن)",
    "tareMt": "وزن ظرف (تن)",
    "netMt": "وزن خالص (تن)",
    "netHint": "خالص = ناخالص − ظرف",
    "weightsInvalidGross": "وزن ناخالص باید بیشتر از 0 باشد",
    "weightsInvalidTare": "وزن ظرف نمی‌تواند کمتر از 0 باشد",
    "weightsInvalidTareExceedsGross": "وزن ظرف باید کمتر از وزن ناخالص باشد",
    "weightsInvalidQuantity": "مقدار باید بیشتر از 0 باشد",
```

`ku.json` (Sorani; use ی U+06CC, never ي U+064A):

```json
    "grossMt": "کێشی گشتی (MT)",
    "tareMt": "کێشی بەتاڵ (MT)",
    "netMt": "کێشی پاک (MT)",
    "netHint": "پاک = گشتی − بەتاڵ",
    "weightsInvalidGross": "کێشی گشتی دەبێت لە 0 زیاتر بێت",
    "weightsInvalidTare": "کێشی بەتاڵ ناتوانێت لە 0 کەمتر بێت",
    "weightsInvalidTareExceedsGross": "کێشی بەتاڵ دەبێت لە کێشی گشتی کەمتر بێت",
    "weightsInvalidQuantity": "بڕ دەبێت لە 0 زیاتر بێت",
```

Also add to the `"warehouse": {` block of each file: en `"netMt": "Net (MT)"`, ar `"netMt": "الوزن الصافي (طن)"`, fa `"netMt": "وزن خالص (تن)"`, ku `"netMt": "کێشی پاک (MT)"`.

Check parity:

```bash
node -e "const f=l=>Object.keys(require('./apps/erp-panel/src/i18n/locales/'+l+'.json').tradeInvoices);const en=f('en');for(const l of ['ar','fa','ku']){const k=f(l);const m=en.filter(x=>!k.includes(x));const e=k.filter(x=>!en.includes(x));console.log(l,'missing',m,'extra',e)}"
```

Expected: `missing [] extra []` for all three.

- [ ] **Step 4: A shared error mapper for `weights-invalid`**

Create `apps/erp-panel/src/pages/tradeInvoices/weightsInvalid.ts`:

```ts
import type { TFunction } from 'i18next';

/** The `rule` the server attaches to a `weights-invalid` refusal (spec §2). */
type WeightsRule = 'gross' | 'tare' | 'tare-exceeds-gross' | 'quantity';

const KEY_BY_RULE: Record<WeightsRule, string> = {
  gross: 'tradeInvoices.weightsInvalidGross',
  tare: 'tradeInvoices.weightsInvalidTare',
  'tare-exceeds-gross': 'tradeInvoices.weightsInvalidTareExceedsGross',
  quantity: 'tradeInvoices.weightsInvalidQuantity',
};

/** The message for a caught `weights-invalid` error; the generic key when the rule is unknown. */
export function weightsInvalidMessage(err: unknown, t: TFunction): string {
  const rule = (err as { rule?: string } | undefined)?.rule as WeightsRule | undefined;
  return t(rule && rule in KEY_BY_RULE ? KEY_BY_RULE[rule] : 'common.saveFailed');
}
```

(`ApiError` copies every server extension onto the error object — `err.rule` — see `services/http.ts`.)

- [ ] **Step 5: `AddItemsModal`**

Changes, in order:

1. Imports: add `isPricedType` from `@/utils/calc` (or wherever Step 2 put it) and `weightsInvalidMessage` from `./weightsInvalid`; add `roundMt`-like rounding locally — `const netOf = (g?: number, t?: number) => Math.round(((g ?? 0) - (t ?? 0)) * 1_000_000) / 1_000_000;` at module level under the imports.

2. `AddItemsFormRow`: add `grossMt?: number; tareMt?: number;` after `quantityMt?: number;`.

3. In the component body, right after `const [showAllContainers, …]`: `const weighed = isPricedType(invoice.invoiceType);`

4. `rows` memo: the mapped object gains `grossMt: undefined, tareMt: undefined,`.

5. `insertAll`:

```ts
  const insertAll = () => {
    const next = rows.map((r) =>
      weighed
        ? { ...r, include: true, grossMt: r.uninvoicedMt, tareMt: 0 }
        : { ...r, include: true, quantityMt: r.uninvoicedMt },
    );
    form.setFieldsValue({ rows: next });
  };
```

6. `submit`: the item mapping becomes

```ts
      .map((r) =>
        weighed
          ? { contractItemId: r.contractItemId, grossMt: r.grossMt, tareMt: r.tareMt, containerId: r.containerId }
          : { contractItemId: r.contractItemId, quantityMt: r.quantityMt ?? 0, containerId: r.containerId },
      );
```

and the `catch` gains a branch before the generic one:

```ts
      } else if (code === 'weights-invalid') {
        message.error(weightsInvalidMessage(err, t));
      } else message.error(t('common.saveFailed'));
```

7. The quantity block. Replace the `<div style={{ width: 170, … }}> … </div>` that wraps the `quantityMt` `Form.Item` with a conditional: the existing block when `!weighed`, and this when `weighed` (the row's live values come from `watchedRows[field.name]`):

```tsx
                      {weighed ? (
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                          <Form.Item
                            name={[field.name, 'grossMt']}
                            label={t('tradeInvoices.grossMt')}
                            style={{ marginBottom: 0, width: 130 }}
                            rules={included ? [{ required: true, message: t('common.required') }] : []}
                          >
                            <InputNumber min={0.000001} precision={6} style={{ width: '100%' }} disabled={!included} />
                          </Form.Item>
                          <Form.Item
                            name={[field.name, 'tareMt']}
                            label={t('tradeInvoices.tareMt')}
                            style={{ marginBottom: 0, width: 130 }}
                            dependencies={[['rows', field.name, 'grossMt']]}
                            rules={
                              included
                                ? [
                                    { required: true, message: t('common.required') },
                                    {
                                      validator: async (_, v) => {
                                        if (v === undefined || v === null) return;
                                        const gross = form.getFieldValue(['rows', field.name, 'grossMt']) as number | undefined;
                                        if (v < 0) throw new Error(t('tradeInvoices.weightsInvalidTare'));
                                        if (gross !== undefined && v >= gross) {
                                          throw new Error(t('tradeInvoices.weightsInvalidTareExceedsGross'));
                                        }
                                        const net = netOf(gross, v);
                                        if (net > row.uninvoicedMt + 1e-9) {
                                          throw new Error(t('tradeInvoices.exceedsUninvoiced', { mt: formatMt(row.uninvoicedMt) }));
                                        }
                                      },
                                    },
                                  ]
                                : []
                            }
                          >
                            <InputNumber min={0} precision={6} style={{ width: '100%' }} disabled={!included} />
                          </Form.Item>
                          <div style={{ width: 130 }}>
                            <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                              {t('tradeInvoices.netMt')}
                            </Text>
                            <Text strong>
                              {formatMt(netOf(watchedRows[field.name]?.grossMt, watchedRows[field.name]?.tareMt))}
                            </Text>
                          </div>
                        </div>
                      ) : (
                        /* the existing 170px quantity block, unchanged */
                      )}
```

Keep the `Form.Item`s' `rules` empty when the row is not included, exactly like the quantity input does today, so an unticked row never blocks the submit.

- [ ] **Step 6: `EditLineModal`**

1. Imports as in the other modal; the same module-level `netOf`.
2. `EditLineFormValues`: `quantityMt?: number; grossMt?: number; tareMt?: number;`.
3. `const weighed = isPricedType(invoice.invoiceType);` after the mutation hook.
4. `initialValues`: add `grossMt: item.grossMt, tareMt: item.tareMt,`.
5. `submit`'s `patch`: 

```ts
        patch: {
          ...(weighed
            ? { grossMt: values.grossMt, tareMt: values.tareMt }
            : { quantityMt: values.quantityMt }),
          containerId: values.containerId,
          discountPercent: values.discountPercent,
          description: values.description?.trim() || undefined,
        },
```

and the same `weights-invalid` branch in the `catch`.

6. Replace the single `quantityMt` `Form.Item` with: the existing item when `!weighed`; when `weighed`, a gross item, a tare item and a net line. Use `Form.useWatch('grossMt', form)` / `Form.useWatch('tareMt', form)` for the live net; the tare validator checks `v < 0`, `v >= gross`, and `netOf(gross, v) > ceilingMt + 1e-9` (message `tradeInvoices.exceedsUninvoiced` with `formatMt(ceilingMt)`), mirroring the quantity validator that exists today. Below the two inputs render:

```tsx
        <Form.Item label={t('tradeInvoices.netMt')} extra={t('tradeInvoices.netHint')}>
          <Text strong>{formatMt(netOf(watchedGross, watchedTare))}</Text>
        </Form.Item>
```

Keep `ceilingMt` / `maxQty` exactly as they are: they describe the net, which is what the contract guard tests.

- [ ] **Step 7: Retire the temporary allow-list entry**

Remove the `"weights-invalid"` line and its comment from `ErrorCodeContractTests.BackendOnlyCodes` (Task 2 added it). The SPA now contains `code === 'weights-invalid'` in both modals, which is what the test scans for.

- [ ] **Step 8: Verify**

```bash
npm run lint -w @finora/erp-panel
npm run typecheck -w @finora/erp-panel
npm run build -w @finora/erp-panel
dotnet test backend/Finora.slnx --filter "FullyQualifiedName~ErrorCodeContractTests"
```

Expected: lint 0 errors (the one pre-existing `react-refresh` warning is known), typecheck silent, build `✓ built`, contract test `Passed!`. Typecheck will flag `sampleData.ts` only if a required field was introduced — none was (both new fields are optional), so it must stay green.

- [ ] **Step 9: Commit**

```bash
git add apps/erp-panel/src backend/tests/Finora.UnitTests/ErrorCodeContractTests.cs
git commit -m "feat(erp): invoice lines take gross and tare, and show the net they make

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Where the weights show, sample data, docs, and the end-to-end check

**Files:**
- Modify: `apps/erp-panel/src/pages/tradeInvoices/InvoiceDetailPage.tsx:214-227` (item columns)
- Modify: `apps/erp-panel/src/pages/warehouse/InventoryDocFormModal.tsx:426-428` (the unit text beside the quantity input)
- Modify: `apps/erp-panel/src/mock/sampleData.ts:606-640` (`makeInvoiceItem`) and `:890-920` (the raw-shipment invoice line builder)
- Modify: `docs/flowcharts/finora-user-guide.html:300-341` (section 5) and `:342-379` (section 6)
- Modify: `CLAUDE.md:124-125`

**Interfaces:**
- Consumes: `InvoiceItem.grossMt` / `tareMt`, `isPricedType`, keys from Task 3.

- [ ] **Step 1: Detail-page columns**

In `InvoiceDetailPage.tsx`, the `itemColumns` array: replace the single `quantityMt` column with

```tsx
    ...(priced
      ? ([
          {
            title: t('tradeInvoices.grossMt'),
            dataIndex: 'grossMt',
            width: 110,
            align: 'right',
            render: (v?: number) => (v === undefined ? <Text type="secondary">—</Text> : formatMt(v)),
          },
          {
            title: t('tradeInvoices.tareMt'),
            dataIndex: 'tareMt',
            width: 110,
            align: 'right',
            render: (v?: number) => (v === undefined ? <Text type="secondary">—</Text> : formatMt(v)),
          },
          {
            title: t('tradeInvoices.netMt'),
            dataIndex: 'quantityMt',
            width: 110,
            align: 'right',
            render: (v: number) => <Text strong>{formatMt(v)}</Text>,
          },
        ] as ColumnsType<InvoiceItem>)
      : ([
          {
            title: t('items.quantityMt'),
            dataIndex: 'quantityMt',
            width: 110,
            align: 'right',
            render: (v: number) => formatMt(v),
          },
        ] as ColumnsType<InvoiceItem>)),
```

`priced` already exists in the page (`const priced = isPricedType(invoice.invoiceType)`), and `itemColumns` is built after it. The table's `scroll={{ x }}` (if set) may need +220 for the two extra columns.

- [ ] **Step 2: Warehouse form label**

In `InventoryDocFormModal.tsx`, the `<Text type="secondary">{t('common.mtUnit')}</Text>` beside the quantity input (line ~427) becomes `{t('warehouse.netMt')}`. The hint above it (`warehouse.remainingHint`) stays: it already speaks of the line's remaining net.

- [ ] **Step 3: Sample data**

In `sampleData.ts`, `makeInvoiceItem` (line ~606): the returned object gains, right after `quantityMt,`:

```ts
      // Invoice-type lines carry the weighed figures; the seed uses a 2 % tare so the numbers
      // look real. Order lines (PO/SO) get none — the caller strips them, see below.
      grossMt: round(quantityMt / 0.98, 6),
      tareMt: round(quantityMt / 0.98 - quantityMt, 6),
```

`round(x, 6)` — check the file's local `round(value, digits)` helper signature (it is used as `round(…, 3)` at line 407) and use it the same way. Then, wherever `makeInvoiceItem` is called for an order (`PURCHASE_ORDER` / `SALE_ORDER` — grep `makeInvoiceItem(` and look at the `invoiceType` of the document each call builds), spread the result without the weights:

```ts
const { grossMt: _g, tareMt: _t, ...orderLine } = makeInvoiceItem(...);
```

(or add a `weighed: boolean` parameter to `makeInvoiceItem` and return the two fields only when true — pick the smaller change). The raw-shipment builder at line ~896 (`quantityMt = raw.quantityMt`) builds only invoice-type documents (its comment says SALE_INVOICE / PURCHASE_INVOICE), so it gets the same two fields unconditionally.

Because gross − tare must equal `quantityMt` exactly after rounding, compute tare as `round(gross - quantityMt, 6)` **from the rounded gross**, not from the unrounded ratio:

```ts
      const grossMt = round(quantityMt / 0.98, 6);
      const tareMt = round(grossMt - quantityMt, 6);
```

and return those. Verify with a one-off check in the browser console after "Load sample data": every invoice-type line has `grossMt - tareMt === quantityMt` (allow 1e-9).

- [ ] **Step 4: Docs (simple English)**

`finora-user-guide.html`, section 5 (Buying), part **B** ("Convert to a provisional, then price it"): after the first `<li>` (the Convert step), insert a new step:

```html
    <li><div class="t">Open each line with <span class="btn">Edit</span> and type the <b>Gross (MT)</b> from the scale and the <b>Tare (MT)</b> (packing and pallet). The app shows the <b>Net (MT)</b> = gross − tare. You cannot type the net. The line total is net × unit price.<span class="see">the net is the quantity the warehouse will receive.</span></div></li>
```

In the same section's "Good to know" box add: `<li>Orders have one quantity. Provisional and final invoices have gross, tare and net.</li>`. In the "If the app refuses" box add: `<li><b>"Tare must be less than gross"</b> — check the two weights; the net must be more than 0.</li>`.

Section 6 (Selling): add the same edit step where the provisional is priced (mirror the wording; the sale side weighs its goods too).

`CLAUDE.md`, under the domain model, after the line that lists what an Item (goods) carries, add:

```
An **invoice line** on the four invoice types carries `grossMt` and `tareMt` typed by the user;
its `quantityMt` is the **net** (gross − tare) and is set by the server. Order lines carry
`quantityMt` only. See `docs/superpowers/specs/2026-09-04-invoice-line-weights-design.md`.
```

- [ ] **Step 5: Full verification**

```bash
npm run lint -w @finora/erp-panel && npm run typecheck && npm run build -w @finora/erp-panel
dotnet build backend/Finora.slnx
dotnet test backend/Finora.slnx
```

Expected: lint 0 errors, typecheck silent, build clean, backend `Build succeeded.`, three `Passed!` lines.

Then the browser check (the controller runs Aspire + vite and drives the browser; the implementer only needs to list what to check): sign in as Manager → Settings → Load sample data → open a purchase invoice → the line table shows Gross / Tare / Net → Edit a line: change tare, watch Net and Line total move, save → Add items on a draft sale invoice: Insert all fills gross = uninvoiced and tare = 0 → an order's Add items still shows one Quantity field → Warehouse › Documents › New receipt shows "Net (MT)" beside the quantity.

- [ ] **Step 6: Commit**

```bash
git add apps/erp-panel/src docs/flowcharts/finora-user-guide.html CLAUDE.md
git commit -m "feat(erp): gross, tare and net on the invoice page, in the sample data and in the guide

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## After the last task

Merge into `main` (`--no-ff`), push, and deploy **API + migrator + web** to 179.198.198.221 (the migrator applies `AddInvoiceLineWeights` and its data step on both tenants; verify with `select count(*) from erp.invoice_items where gross_mt is null` joined to non-order invoices = 0). These are the controller's steps after the final review.
