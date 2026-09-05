# Invoices over the contract, and contract quantity changes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a trade document carry more of a goods line than the contract says, show the overrun on the document and the contract, and give the contract a formal "change quantity" action with a history.

**Architecture:** The server's contract-quantity ceiling is removed (three throw sites in `InvoiceService`, one in `ContractService`); the figures stay derived. A new child table `contract_item_changes` under a goods line records each formal change; the goods line's `QuantityMt` stays the single truth and the history explains how it got there. The SPA reads the new rows through the existing snapshot and contract list (the rows travel inside the goods line), computes "original", "changes" and "over contract" client-side in `services/api.ts`, and swaps its quantity ceilings for warnings with a link to the contract.

**Tech Stack:** .NET 10 / EF Core 10 / Npgsql / xUnit + Testcontainers (backend); Vite 6 / React 18 / TypeScript strict / AntD 5 / React Query / react-i18next (SPA).

**Spec:** `docs/superpowers/specs/2026-09-05-contract-quantity-changes-design.md`

## Global Constraints

- Backend builds with warnings as errors; `Finora.ArchitectureTests` fails on cross-module references, EF Core in a Domain project, `float`/`double` in domain files, or `Math.Round` outside `BuildingBlocks.Domain.Rounding`. Round quantities with `Rounding.Quantity` (6 dp) on the server and `roundMt` in the SPA.
- Every API failure is RFC 9457 ProblemDetails with `extensions.code`; every code lives in `backend/contracts/error-codes.json`, and `Finora.UnitTests.ErrorCodeContractTests` fails if the SPA never branches `code === '<code>'` on a listed code (or the code is in `BackendOnlyCodes`). Never put `status` in a DomainException payload (ProblemDetails owns that name).
- SPA: all reads through hooks in `services/queries.ts`; components never import `db` or a service file. Every user-facing string is a key in all four locale files (`en`, `ar`, `fa`, `ku`). Layout stays RTL-safe (logical CSS only). Colours through `theme.useToken()`. `npm run lint`, `npm run typecheck`, `npm run build` clean before each commit.
- No files under `docs/` are edited by these tasks (owner's rule); `CLAUDE.md` at the repo root may get one line.
- Bump `SCHEMA_VERSION` in `apps/erp-panel/src/mock/data.ts` when an entity shape changes.
- Commands run from the repo root unless a step says otherwise. Backend tests need Docker Desktop running (Testcontainers); if `dotnet test` reports `DockerUnavailableException`, start Docker Desktop first.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## File structure

| File | Responsibility |
|---|---|
| `backend/src/Modules/Erp/Finora.Erp.Domain/Trade.cs` | `ContractItemChange` entity; `ContractItem.Changes` |
| `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Configuration/TradeConfiguration.cs` | EF mapping for the new table |
| `backend/src/Modules/Erp/Finora.Erp.Infrastructure/ErpDbContext.cs` | `ContractItemChanges` DbSet |
| `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Migrations/*_AddContractItemChanges.cs` | generated migration |
| `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Snapshot/SnapshotService.cs` | include the rows in the read path |
| `backend/src/Modules/Erp/Finora.Erp.Application/ContractContracts.cs` | `ContractItemChangeInput` |
| `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Trade/ContractService.cs` | includes; `ChangeItemQuantityAsync`; drop the shrink refusal |
| `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Trade/InvoiceService.cs` | drop the three ceiling throws |
| `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Trade/ContractQuantityGuard.cs` | deleted |
| `backend/src/Finora.Api/Endpoints/ContractEndpoints.cs` | the change endpoint |
| `backend/contracts/error-codes.json` | codes in / out |
| `backend/tests/Finora.IntegrationTests/{ContractTests,InvoiceTests}.cs` | tests |
| `apps/erp-panel/src/types/index.ts`, `mock/data.ts`, `mock/sampleData.ts` | `ItemChange`, schema bump, sample rows |
| `apps/erp-panel/src/services/{contracts,api,queries}.ts` | wire call, selectors, hooks |
| `apps/erp-panel/src/pages/contracts/changeQuantityErrors.ts` | maps the three codes to messages |
| `apps/erp-panel/src/pages/contracts/ChangeQuantityModal.tsx` | the dialog |
| `apps/erp-panel/src/pages/contracts/{ContractDetailPage,ContractsPage,ItemFormModal}.tsx` | columns, history, tag, drop old branch |
| `apps/erp-panel/src/pages/tradeInvoices/overContract.ts` | one helper computing the over figure per goods line on a document |
| `apps/erp-panel/src/pages/tradeInvoices/{AddItemsModal,EditLineModal,ConfirmInvoiceModal,InvoiceDetailPage}.tsx` | warnings + link instead of ceilings |
| `apps/erp-panel/src/pages/tradeInvoices/qtyExceedsContract.ts` | deleted |
| `apps/erp-panel/src/i18n/locales/{en,ar,fa,ku}.json` | strings |

---

### Task 1: `ContractItemChange` entity, table, migration, and it travels with the goods line

**Files:**
- Modify: `backend/src/Modules/Erp/Finora.Erp.Domain/Trade.cs` (after `ItemPartner`, and the `Partners` property on `ContractItem`)
- Modify: `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Configuration/TradeConfiguration.cs` (after `ItemPartnerConfiguration`)
- Modify: `backend/src/Modules/Erp/Finora.Erp.Infrastructure/ErpDbContext.cs` (DbSet list, after `ItemPartners`)
- Modify: `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Trade/ContractService.cs` (`ListAsync`, `LoadAsync`)
- Modify: `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Snapshot/SnapshotService.cs:39-41`
- Create: `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Migrations/<timestamp>_AddContractItemChanges.cs` (generated)
- Test: `backend/tests/Finora.IntegrationTests/ContractTests.cs`

**Interfaces:**
- Produces: `Finora.Erp.Domain.ContractItemChange { string Id; string ContractItemId; DateTimeOffset At; Guid UserId; string UserName; decimal DeltaMt; decimal BeforeMt; decimal AfterMt; string Note }`, `ContractItem.Changes : ICollection<ContractItemChange>`, `ErpDbContext.ContractItemChanges`.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/Finora.IntegrationTests/ContractTests.cs`, before the closing `}` of the class:

```csharp
    [Fact]
    public async Task A_quantity_change_travels_inside_its_goods_line()
    {
        // Written straight into the store, the way the snapshot replace path does, then read
        // back over the contract list: the rows are children of the goods line, so they must
        // come out wherever the goods line comes out.
        using (var scope = fixture.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<SnapshotService>().ReplaceAsync(new ErpSnapshot
            {
                Customers = [new Customer { Id = "cust-am", Name = "Alco Metal Trading", Code = "AM" }],
                Contracts =
                [
                    new Contract
                    {
                        Id = "ctr-1", CustomerId = "cust-am", Destination = "NINGBO",
                        Items =
                        [
                            new ContractItem
                            {
                                Id = "item-1", ContractId = "ctr-1", Product = "98% Copper Ingots",
                                QuantityMt = 120m, RemainingMt = 120m,
                                Changes =
                                [
                                    new ContractItemChange
                                    {
                                        Id = "chg-1", At = DateTimeOffset.Parse("2026-09-05T08:00:00Z", System.Globalization.CultureInfo.InvariantCulture),
                                        UserId = Guid.Parse("11111111-1111-1111-1111-111111111111"),
                                        UserName = "Amir Karami", DeltaMt = 20m, BeforeMt = 100m, AfterMt = 120m,
                                        Note = "Client asked for two more trucks",
                                    },
                                ],
                            },
                        ],
                    },
                ],
            });
        }

        using var client = await AsManagerAsync(fixture);
        var contracts = await client.GetFromJsonAsync<JsonElement>(new Uri("/api/erp/contracts", UriKind.Relative), Json);
        var change = contracts.EnumerateArray().Single().GetProperty("items")[0].GetProperty("changes")[0];

        Assert.Equal(20m, change.GetProperty("deltaMt").GetDecimal());
        Assert.Equal(100m, change.GetProperty("beforeMt").GetDecimal());
        Assert.Equal(120m, change.GetProperty("afterMt").GetDecimal());
        Assert.Equal("Amir Karami", change.GetProperty("userName").GetString());
        Assert.Equal("Client asked for two more trucks", change.GetProperty("note").GetString());

        var snapshot = await client.GetFromJsonAsync<JsonElement>(new Uri("/api/erp/snapshot", UriKind.Relative), Json);
        Assert.Equal(1, snapshot.GetProperty("contracts")[0].GetProperty("items")[0].GetProperty("changes").GetArrayLength());
    }
```

- [ ] **Step 2: Run it to verify it fails**

Run: `dotnet test backend/tests/Finora.IntegrationTests --filter "FullyQualifiedName~A_quantity_change_travels" --nologo`
Expected: build error `'ContractItem' does not contain a definition for 'Changes'` (the type does not exist yet).

- [ ] **Step 3: Add the entity**

In `backend/src/Modules/Erp/Finora.Erp.Domain/Trade.cs`, after the `Partners` property of `ContractItem` add:

```csharp
    /// <summary>Formal quantity changes, oldest first. The quantity above is the current truth;
    /// these rows say how it got there. Never edited or deleted.</summary>
    public ICollection<ContractItemChange> Changes { get; init; } = [];
```

After the `ItemPartner` class add:

```csharp
/// <summary>
/// One formal change to a goods line's quantity: who, when, by how much, and why.
///
/// <para>The goods line's <see cref="ContractItem.QuantityMt"/> is already updated when a row is
/// written; <see cref="BeforeMt"/> and <see cref="AfterMt"/> are copied so the row reads on its
/// own. The original quantity is <c>QuantityMt − Σ DeltaMt</c>, derived, never stored.</para>
/// </summary>
public sealed class ContractItemChange
{
    public required string Id { get; init; }

    /// <summary>Set by EF from the parent when the graph is saved — a change only ever arrives
    /// nested inside its goods line.</summary>
    public string ContractItemId { get; init; } = string.Empty;
    [JsonIgnore] public ContractItem? ContractItem { get; init; }

    public DateTimeOffset At { get; init; }
    public Guid UserId { get; init; }
    public required string UserName { get; init; }

    /// <summary>Positive or negative, never zero.</summary>
    public decimal DeltaMt { get; init; }
    public decimal BeforeMt { get; init; }
    public decimal AfterMt { get; init; }
    public required string Note { get; init; }
}
```

- [ ] **Step 4: Map the table**

In `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Configuration/TradeConfiguration.cs`, after `ItemPartnerConfiguration` add:

```csharp
internal sealed class ContractItemChangeConfiguration : IEntityTypeConfiguration<ContractItemChange>
{
    public void Configure(EntityTypeBuilder<ContractItemChange> builder)
    {
        builder.ToTable("contract_item_changes", t =>
            t.HasCheckConstraint("ck_contract_item_changes_delta", "delta_mt <> 0"));

        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id).HasIdColumn();
        builder.Property(c => c.ContractItemId).HasIdColumn();
        builder.Property(c => c.UserName).HasMaxLength(200);
        builder.Property(c => c.DeltaMt).HasQuantityColumn();
        builder.Property(c => c.BeforeMt).HasQuantityColumn();
        builder.Property(c => c.AfterMt).HasQuantityColumn();
        builder.Property(c => c.Note).HasMaxLength(300);

        builder.HasOne(c => c.ContractItem).WithMany(i => i!.Changes)
            .HasForeignKey(c => c.ContractItemId).OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(c => c.ContractItemId);
    }
}
```

In `backend/src/Modules/Erp/Finora.Erp.Infrastructure/ErpDbContext.cs`, after the `ItemPartners` DbSet add:

```csharp
    public DbSet<ContractItemChange> ContractItemChanges => Set<ContractItemChange>();
```

- [ ] **Step 5: Include the rows wherever goods lines are read with their partners**

In `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Trade/ContractService.cs`, `ListAsync` and `LoadAsync` both have `.Include(c => c.Items).ThenInclude(i => i.Partners)`. Change each to:

```csharp
            .Include(c => c.Items).ThenInclude(i => i.Partners)
            .Include(c => c.Items).ThenInclude(i => i.Changes)
```

In `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Snapshot/SnapshotService.cs` (the `Contracts = await db.Contracts.AsNoTracking()` query in the read path, around line 39) make the same change. Leave `ReadForCustomerAsync` alone (the portal deliberately excludes partners, and needs no history either).

- [ ] **Step 6: Generate the migration and check it**

Run:

```bash
dotnet ef migrations add AddContractItemChanges --project backend/src/Modules/Erp/Finora.Erp.Infrastructure --startup-project backend/src/Finora.Api --context ErpDbContext --output-dir Migrations
```

Open the generated `Migrations/<timestamp>_AddContractItemChanges.cs` and check: it creates `contract_item_changes` in schema `erp` with columns `id`, `contract_item_id`, `at`, `user_id`, `user_name` (max 200), `delta_mt`/`before_mt`/`after_mt` as `numeric(18,6)`, `note` (max 300), a foreign key to `contract_items` with cascade delete, an index on `contract_item_id`, and the check constraint. It must touch nothing else. If it drops or alters any other table, the model snapshot was stale: run `git status`, delete the generated pair, and investigate before retrying.

- [ ] **Step 7: Run the test to verify it passes**

Run: `dotnet test backend/tests/Finora.IntegrationTests --filter "FullyQualifiedName~ContractTests" --nologo`
Expected: all ContractTests PASS, including the new one.

- [ ] **Step 8: Commit**

```bash
git add backend/src/Modules/Erp backend/tests/Finora.IntegrationTests/ContractTests.cs
git commit -m "feat(contracts): quantity-change history rows under a goods line

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Remove the contract-quantity ceiling on the server

**Files:**
- Modify: `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Trade/InvoiceService.cs` (`AddItemsAsync`, `UpdateItemAsync`, `ConfirmAsync`)
- Modify: `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Trade/ContractService.cs` (`UpdateItemAsync`, `ClaimedMtAsync`, `Codes`)
- Delete: `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Trade/ContractQuantityGuard.cs`
- Modify: `backend/contracts/error-codes.json`
- Test: `backend/tests/Finora.IntegrationTests/InvoiceTests.cs`

**Interfaces:**
- Consumes: nothing new.
- Produces: the codes `qty-exceeds-remaining` and `quantity-below-invoiced` no longer exist. `ContractQuantityGuard` and `ContractQtyCheck` no longer exist (no test references them, so the whole file goes).

- [ ] **Step 1: Rewrite the five tests that pin the old ceiling**

In `backend/tests/Finora.IntegrationTests/InvoiceTests.cs`:

Replace `An_exact_fit_passes_and_a_thousandth_over_does_not` with:

```csharp
    [Fact]
    public async Task A_line_above_the_contract_is_accepted_and_remaining_floors_at_zero()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = await DraftAsync(c);

        var response = await c.PostAsJsonAsync(
            new Uri($"/api/erp/invoices/{id}/items", UriKind.Relative),
            new[] { new { contractItemId = "item-1", grossMt = 150m, tareMt = 0m, containerId = "cnt-1" } });
        response.EnsureSuccessStatusCode();

        // 150 against a 100 MT line: the document keeps the 150 and the contract shows nothing
        // left, never a negative figure.
        var result = await response.Content.ReadFromJsonAsync<JsonElement>(Json);
        Assert.Equal(150m, result.GetProperty("entity").GetProperty("items")[0].GetProperty("quantityMt").GetDecimal());
        var item = result.GetProperty("contracts")[0].GetProperty("items")[0];
        Assert.Equal(0m, item.GetProperty("remainingMt").GetDecimal());
    }
```

Replace `Adding_several_lines_at_once_is_all_or_nothing_and_counts_them_against_each_other` with:

```csharp
    [Fact]
    public async Task Several_lines_that_together_exceed_the_contract_are_all_accepted()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = await DraftAsync(c);

        var response = await c.PostAsJsonAsync(
            new Uri($"/api/erp/invoices/{id}/items", UriKind.Relative),
            new[]
            {
                new { contractItemId = "item-1", grossMt = 40m, tareMt = 0m, containerId = "cnt-1" },
                new { contractItemId = "item-1", grossMt = 40m, tareMt = 0m, containerId = "cnt-1" },
                new { contractItemId = "item-1", grossMt = 40m, tareMt = 0m, containerId = "cnt-1" },
            });
        response.EnsureSuccessStatusCode();

        var invoice = (await response.Content.ReadFromJsonAsync<JsonElement>(Json)).GetProperty("entity");
        Assert.Equal(3, invoice.GetProperty("items").GetArrayLength());
        Assert.Equal(120m, invoice.GetProperty("totalWeightMt").GetDecimal());
    }
```

Replace `Confirming_totals_a_contract_line_across_every_line_that_names_it` with:

```csharp
    [Fact]
    public async Task Confirming_a_document_that_exceeds_the_contract_succeeds()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var second = await DraftAsync(c, "SALE_ORDER");
        foreach (var _ in Enumerable.Range(0, 3))
        {
            await PostAsync(c, $"/api/erp/invoices/{second}/items",
                new[] { new { contractItemId = "item-1", quantityMt = 30m, containerId = (string?)null } });
        }

        var first = await DraftAsync(c, "SALE_PROVISIONAL");
        await AddLineAsync(c, first, 60m);
        await PriceAsync(c, first);
        await PostAsync(c, $"/api/erp/invoices/{first}/confirm");

        // 90 on this order plus 60 confirmed elsewhere is 150 against a 100 MT line. The
        // business sells what it sells; the contract page shows the overrun instead.
        var confirmed = await PostAsync(c, $"/api/erp/invoices/{second}/confirm");
        Assert.Equal("CONFIRMED", confirmed.GetProperty("entity").GetProperty("status").GetString());
    }
```

Delete `The_quantity_error_carries_the_whole_breakdown` entirely (there is no error to carry a breakdown any more).

Replace `A_contract_line_cannot_shrink_below_what_is_already_invoiced` with:

```csharp
    [Fact]
    public async Task A_contract_line_may_shrink_below_what_is_already_invoiced()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var draft = await DraftAsync(c);
        await AddLineAsync(c, draft, 60m);

        var response = await c.PutAsJsonAsync(
            new Uri("/api/erp/contracts/ctr-1/items/item-1", UriKind.Relative),
            new
            {
                product = "98% Copper Ingots", quantityMt = 50m, lmePercent = LmePercent,
                lmeFixed = true, fixedLmePrice = FixedLme, premium = 0m, incoterm = "CNF",
                status = "ACTIVE",
            });
        response.EnsureSuccessStatusCode();

        // The documents already claim 60; the line now holds 50; remaining floors at zero and
        // the contract page reports 10 over.
        var item = (await response.Content.ReadFromJsonAsync<JsonElement>(Json)).GetProperty("entity").GetProperty("items")[0];
        Assert.Equal(50m, item.GetProperty("quantityMt").GetDecimal());
        Assert.Equal(0m, item.GetProperty("remainingMt").GetDecimal());
    }
```

- [ ] **Step 2: Run them to verify they fail**

Run: `dotnet test backend/tests/Finora.IntegrationTests --filter "FullyQualifiedName~InvoiceTests" --nologo`
Expected: the four rewritten tests FAIL (422 `qty-exceeds-remaining` / `quantity-below-invoiced` where 200 is expected); everything else passes.

- [ ] **Step 3: Drop the three throws in `InvoiceService`**

In `AddItemsAsync`, replace the block from `var side = InvoiceMath.SideOf(invoice.InvoiceType);` down to the end of the first `for` loop with:

```csharp
        // Resolved up front, so a bad weight on the third line refuses the whole post before
        // the first line is staged.
        var resolved = items
            .Select(i => ResolveWeights(invoice.InvoiceType, i.QuantityMt, i.GrossMt, i.TareMt))
            .ToList();
        var quantities = resolved.Select(r => r.QuantityMt).ToList();

        // A document may claim more than the contract holds — the contract page reports the
        // overrun — but never a goods line that is not ACTIVE, and never one that is not there.
        foreach (var entry in items)
        {
            var contractItem = contract.Items.SingleOrDefault(i => i.Id == entry.ContractItemId)
                ?? throw new NotFoundException(Codes.ContractItemNotFound);
            RequireActive(contractItem);
        }
```

(`all`, `contract`, `resolved`, `quantities` are still used by the second loop; `side` and `staged` are gone.)

In `UpdateItemAsync`, replace the `if (quantity > line.QuantityMt) { ... }` block with:

```csharp
            if (quantity > line.QuantityMt)
            {
                // Growing a line is a new claim on the goods; a smaller weight, a container or a
                // description is not, so those stay editable after the goods line closes. The
                // contract's own quantity is not a ceiling any more.
                var contract = await LoadContractAsync(invoice.ContractId, cancellationToken);
                var contractItem = contract.Items.SingleOrDefault(i => i.Id == line.ContractItemId);
                if (contractItem is not null) RequireActive(contractItem);
            }
```

In `ConfirmAsync`, delete from `var contract = await LoadContractAsync(invoice.ContractId, cancellationToken);` through the closing brace of the `foreach (var group in ...)` loop, so the method goes straight from the container check to `invoice.Status = InvoiceStatus.CONFIRMED;`. Update the `///` summary on `ConfirmAsync` if it mentions the contract ceiling.

Delete the file `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Trade/ContractQuantityGuard.cs`.

- [ ] **Step 4: Drop the shrink refusal in `ContractService`**

In `UpdateItemAsync` delete the `var claimed = await ClaimedMtAsync(...)` line and the whole `if (Rounding.Quantity(input.QuantityMt) < claimed) { ... }` block. Delete the `ClaimedMtAsync` method and the `BelowInvoiced` constant in `Codes`. Replace the `<summary>` on `UpdateItemAsync` with:

```csharp
    /// <summary>
    /// Edits a goods line. Shrinking below what documents already claim is allowed: the remaining
    /// figure floors at zero and the contract page reports the overrun.
    /// </summary>
```

- [ ] **Step 5: Retire the two codes**

In `backend/contracts/error-codes.json` delete the lines `"qty-exceeds-remaining",` and `"quantity-below-invoiced",`.

- [ ] **Step 6: Build and run the backend suite**

Run: `dotnet build backend/Finora.slnx --nologo` then `dotnet test backend/Finora.slnx --nologo`
Expected: build clean (no unused-variable warnings, which are errors here); unit, architecture and integration tests all PASS. `ErrorCodeContractTests` passes because removing a code from the contract is never "missing".

- [ ] **Step 7: Commit**

```bash
git add backend/src backend/contracts/error-codes.json backend/tests/Finora.IntegrationTests/InvoiceTests.cs
git commit -m "feat(invoices): a document may exceed the contract quantity

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The change-quantity endpoint, with its client wrapper

**Files:**
- Modify: `backend/src/Modules/Erp/Finora.Erp.Application/ContractContracts.cs`
- Modify: `backend/src/Modules/Erp/Finora.Erp.Infrastructure/Trade/ContractService.cs`
- Modify: `backend/src/Finora.Api/Endpoints/ContractEndpoints.cs`
- Modify: `backend/contracts/error-codes.json`
- Modify: `apps/erp-panel/src/services/contracts.ts`
- Create: `apps/erp-panel/src/pages/contracts/changeQuantityErrors.ts`
- Test: `backend/tests/Finora.IntegrationTests/ContractTests.cs`

**Interfaces:**
- Consumes: `ContractItemChange`, `ContractItem.Changes` (Task 1).
- Produces: `POST /api/erp/contracts/{id}/items/{itemId}/changes` with body `{ deltaMt: number, note: string }` → `{ entity: Contract, all: Contract[] }`; codes `change-delta-zero`, `change-below-zero` (payload `quantityMt`, `deltaMt`), `change-note-required`; `contractsApi.changeItemQuantity(contractId, itemId, { deltaMt, note })`; `changeQuantityMessage(err, t): string`.

- [ ] **Step 1: Write the failing tests**

Append to `ContractTests.cs` before the class's closing `}`:

```csharp
    /* --------------------------- Changing a quantity --------------------------- */

    private async Task<(string ContractId, string ItemId)> ContractWithLineAsync(HttpClient client, decimal quantity = 100m)
    {
        var id = (await PostAsync(client, "/api/erp/contracts", Header()))
            .GetProperty("entity").GetProperty("id").GetString()!;
        var created = await PostAsync(client, $"/api/erp/contracts/{id}/items", Line(quantity));
        var itemId = created.GetProperty("entity").GetProperty("items")[0].GetProperty("id").GetString()!;
        return (id, itemId);
    }

    private static Task<HttpResponseMessage> ChangeAsync(HttpClient client, string contractId, string itemId, decimal deltaMt, string? note) =>
        client.PostAsJsonAsync(new Uri($"/api/erp/contracts/{contractId}/items/{itemId}/changes", UriKind.Relative),
            new { deltaMt, note });

    [Fact]
    public async Task A_change_moves_the_quantity_and_writes_one_history_row()
    {
        await ResetAsync();
        using var client = await AsManagerAsync(fixture);
        var (contractId, itemId) = await ContractWithLineAsync(client);
        var me = (await client.GetFromJsonAsync<JsonElement>(new Uri("/api/identity/me", UriKind.Relative), Json))
            .GetProperty("user").GetProperty("name").GetString();

        var response = await ChangeAsync(client, contractId, itemId, 20m, "  Client asked for two more trucks ");
        response.EnsureSuccessStatusCode();

        var item = (await response.Content.ReadFromJsonAsync<JsonElement>(Json)).GetProperty("entity").GetProperty("items")[0];
        Assert.Equal(120m, item.GetProperty("quantityMt").GetDecimal());
        Assert.Equal(120m, item.GetProperty("remainingMt").GetDecimal());

        var change = item.GetProperty("changes").EnumerateArray().Single();
        Assert.Equal(20m, change.GetProperty("deltaMt").GetDecimal());
        Assert.Equal(100m, change.GetProperty("beforeMt").GetDecimal());
        Assert.Equal(120m, change.GetProperty("afterMt").GetDecimal());
        Assert.Equal(me, change.GetProperty("userName").GetString());
        Assert.Equal("Client asked for two more trucks", change.GetProperty("note").GetString());
        Assert.True(change.GetProperty("at").GetDateTimeOffset() > DateTimeOffset.UtcNow.AddMinutes(-5));

        // A second, negative change stacks: 120 − 30 = 90, two rows, oldest first.
        var again = await ChangeAsync(client, contractId, itemId, -30m, "Shipment cut");
        again.EnsureSuccessStatusCode();
        var after = (await again.Content.ReadFromJsonAsync<JsonElement>(Json)).GetProperty("entity").GetProperty("items")[0];
        Assert.Equal(90m, after.GetProperty("quantityMt").GetDecimal());
        Assert.Equal(2, after.GetProperty("changes").GetArrayLength());
        Assert.Equal(120m, after.GetProperty("changes")[1].GetProperty("beforeMt").GetDecimal());
    }

    [Theory]
    [InlineData(0, "why", "change-delta-zero")]
    [InlineData(0.0000004, "why", "change-delta-zero")]
    [InlineData(-100, "why", "change-below-zero")]
    [InlineData(-150, "why", "change-below-zero")]
    [InlineData(5, "", "change-note-required")]
    [InlineData(5, "   ", "change-note-required")]
    [InlineData(5, null, "change-note-required")]
    public async Task A_change_is_refused_rule_by_rule(decimal deltaMt, string? note, string code)
    {
        await ResetAsync();
        using var client = await AsManagerAsync(fixture);
        var (contractId, itemId) = await ContractWithLineAsync(client);

        var response = await ChangeAsync(client, contractId, itemId, deltaMt, note);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(Json);
        Assert.Equal(code, problem.GetProperty("code").GetString());
        if (code == "change-below-zero")
        {
            Assert.Equal(100m, problem.GetProperty("quantityMt").GetDecimal());
            Assert.Equal(deltaMt, problem.GetProperty("deltaMt").GetDecimal());
        }

        // Nothing moved and nothing was written.
        var contracts = await client.GetFromJsonAsync<JsonElement>(new Uri("/api/erp/contracts", UriKind.Relative), Json);
        var item = contracts.EnumerateArray().Single().GetProperty("items")[0];
        Assert.Equal(100m, item.GetProperty("quantityMt").GetDecimal());
        Assert.Equal(0, item.GetProperty("changes").GetArrayLength());
    }

    [Fact]
    public async Task A_change_on_a_goods_line_that_does_not_exist_is_a_404()
    {
        await ResetAsync();
        using var client = await AsManagerAsync(fixture);
        var (contractId, _) = await ContractWithLineAsync(client);

        var response = await ChangeAsync(client, contractId, "nope", 5m, "why");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
```

- [ ] **Step 2: Run them to verify they fail**

Run: `dotnet test backend/tests/Finora.IntegrationTests --filter "FullyQualifiedName~A_change" --nologo`
Expected: FAIL with 404 on every POST (no route yet).

- [ ] **Step 3: Input record and codes**

Append to `backend/src/Modules/Erp/Finora.Erp.Application/ContractContracts.cs`:

```csharp
/// <summary>A formal change to a goods line's quantity: signed MT and the reason.</summary>
public sealed record ContractItemChangeInput(decimal DeltaMt, string? Note);
```

In `backend/contracts/error-codes.json` add, keeping the list sorted (they go right after `"change-…"` would sort — i.e. after `"cancel-blocked-successor"` and before `"claim-not-found"`):

```json
  "change-below-zero",
  "change-delta-zero",
  "change-note-required",
```

- [ ] **Step 4: The service method**

In `ContractService.cs`, in `Codes` add:

```csharp
        public const string ChangeDeltaZero = "change-delta-zero";
        public const string ChangeBelowZero = "change-below-zero";
        public const string ChangeNoteRequired = "change-note-required";
```

After `UpdateItemAsync` add:

```csharp
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
```

- [ ] **Step 5: The endpoint**

In `backend/src/Finora.Api/Endpoints/ContractEndpoints.cs` add `using System.Security.Claims;` at the top, and after the `UpdateContractItem` mapping add:

```csharp
        group.MapPost("/{id}/items/{itemId}/changes", async (
                string id, string itemId, ContractItemChangeInput input, ClaimsPrincipal principal,
                ContractService service, CancellationToken cancellationToken) =>
            {
                // Who made the change is stamped from the session, never taken from the body.
                var userId = Guid.Parse(principal.FindFirstValue(IdentityEndpoints.UserIdClaim)!);
                var userName = principal.FindFirstValue(ClaimTypes.Name) ?? "";
                var contract = await service.ChangeItemQuantityAsync(id, itemId, input, userId, userName, cancellationToken);
                return Results.Ok(await ResultAsync(service, contract, cancellationToken));
            })
            .WithName("ChangeContractItemQuantity");
```

- [ ] **Step 6: Run the backend tests**

Run: `dotnet test backend/Finora.slnx --nologo`
Expected: the three new tests PASS. `ErrorCodeContractTests.The_contract_holds_every_code_the_front_end_uses` FAILS with "The backend contract lists codes the client neither throws nor handles: change-below-zero, change-delta-zero, change-note-required" — Step 7 fixes that.

- [ ] **Step 7: The client wrapper and the message map**

In `apps/erp-panel/src/services/contracts.ts` add to the `contractsApi` object, after `updateItem`:

```ts
  changeItemQuantity: (contractId: string, itemId: string, input: { deltaMt: number; note: string }) =>
    request<ContractResult>(
      `/api/erp/contracts/${encodeURIComponent(contractId)}/items/${encodeURIComponent(itemId)}/changes`,
      { method: 'POST', body: JSON.stringify(input) },
    ),
```

Create `apps/erp-panel/src/pages/contracts/changeQuantityErrors.ts`:

```ts
import type { TFunction } from 'i18next';
import { formatMt } from '@/utils/format';

/** The message for a refused quantity change; the generic key when the code is not one of ours. */
export function changeQuantityMessage(err: unknown, t: TFunction): string {
  const code = err instanceof Error ? err.message : '';
  if (code === 'change-delta-zero') return t('contracts.changeDeltaZero');
  if (code === 'change-note-required') return t('contracts.changeNoteRequired');
  if (code === 'change-below-zero') {
    const quantity = (err as { quantityMt?: number }).quantityMt;
    return t('contracts.changeBelowZero', { mt: formatMt(quantity ?? 0) });
  }
  return t('common.saveFailed');
}
```

Add the three keys to the `contracts` block of all four locale files (the modal in Task 6 uses them too):

| key | en | ar | fa | ku |
|---|---|---|---|---|
| `changeDeltaZero` | The change cannot be 0 | لا يمكن أن يكون التغيير 0 | تغییر نمی‌تواند 0 باشد | گۆڕانکاری ناتوانێت 0 بێت |
| `changeNoteRequired` | Please write a note for this change | يرجى كتابة ملاحظة لهذا التغيير | لطفاً برای این تغییر یادداشتی بنویسید | تکایە تێبینییەک بۆ ئەم گۆڕانکارییە بنووسە |
| `changeBelowZero` | The quantity would go to 0 or below (now {{mt}} MT) | ستصبح الكمية 0 أو أقل (الآن {{mt}} طن) | مقدار به 0 یا کمتر می‌رسد (اکنون {{mt}} تن) | بڕەکە دەگاتە 0 یان کەمتر (ئێستا {{mt}} تەن) |

- [ ] **Step 8: Verify everything is green**

Run: `dotnet test backend/tests/Finora.UnitTests --nologo` and `npm run lint` and `npm run typecheck`
Expected: PASS / clean. (`changeQuantityErrors.ts` is not imported yet; that is fine for lint and tsc.)

- [ ] **Step 9: Commit**

```bash
git add backend/src backend/contracts/error-codes.json backend/tests/Finora.IntegrationTests/ContractTests.cs apps/erp-panel/src/services/contracts.ts apps/erp-panel/src/pages/contracts/changeQuantityErrors.ts apps/erp-panel/src/i18n/locales
git commit -m "feat(contracts): change a goods line's quantity with a history row

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: SPA data layer — types, selectors, hooks, sample data

**Files:**
- Modify: `apps/erp-panel/src/types/index.ts` (`Item`)
- Modify: `apps/erp-panel/src/mock/data.ts:80` (`SCHEMA_VERSION`)
- Modify: `apps/erp-panel/src/mock/sampleData.ts` (goods generation around lines 305-325 and the reference contract's items around line 439)
- Modify: `apps/erp-panel/src/services/api.ts` (`ContractRow`, `buildContractRows`, after `updateItem`, after `getContractRemaining`)
- Modify: `apps/erp-panel/src/services/queries.ts` (`qk`, `useInvalidateTrade`, after `useUpdateItem`)

**Interfaces:**
- Consumes: `contractsApi.changeItemQuantity` (Task 3).
- Produces:
  - `types`: `ItemChange { id; contractItemId; at; userId; userName; deltaMt; beforeMt; afterMt; note }`, `Item.changes: ItemChange[]`.
  - `api.ts`: `ContractRow.overMt: number`; `ContractItemOverview { itemId; product; quantityMt; originalMt; changesMt; confirmedInvoicedMt; overMt; remainingMt }`; `getContractItemOverview(contractId): Promise<ContractItemOverview[]>`; `changeItemQuantity(itemId, input: { deltaMt: number; note: string }): Promise<Item>`.
  - `queries.ts`: `useContractItemOverview(contractId)`, `useChangeItemQuantity()` (mutation `{ itemId, input }`).

- [ ] **Step 1: Types and schema bump**

In `apps/erp-panel/src/types/index.ts`, before `export interface Item {` add:

```ts
/** One formal change to a goods line's quantity. Never edited; oldest first. */
export interface ItemChange {
  id: string;
  contractItemId: string;
  /** ISO date-time. */
  at: string;
  userId: string;
  userName: string;
  /** Signed MT, never 0. */
  deltaMt: number;
  beforeMt: number;
  afterMt: number;
  note: string;
}
```

In `Item`, after `partners: ItemPartner[];` add:

```ts
  /** Formal quantity changes, oldest first. `quantityMt − Σ deltaMt` is the original quantity. */
  changes: ItemChange[];
```

In `apps/erp-panel/src/mock/data.ts` change `const SCHEMA_VERSION = 9;` to `const SCHEMA_VERSION = 10;`.

`roundMt` exists only as a private const inside `services/api.ts` (line ~696). Pages need the same rounding, so add to `apps/erp-panel/src/utils/calc.ts`:

```ts
/** Six decimals — one gram — the app's quantity precision (mirrors `Rounding.Quantity`). */
export const roundMt = (n: number): number => Math.round(n * 1_000_000) / 1_000_000;
```

and leave the private one in `api.ts` as it is.

- [ ] **Step 2: Sample data**

In `apps/erp-panel/src/mock/sampleData.ts`, in the goods loop, after `partners: [],` in the `item` literal add `changes: [],`. Do the same for the reference contract's item literal (the one with `remainingMt: 0, partners: [],` around line 439).

Right after the `for (let it = 0; it < itemCount; it++) { ... }` loop (still inside the contract loop, before `const contract: Contract = {`), add:

```ts
      // The first generated contract carries two formal quantity changes so the history panel
      // has something to show after "Load sample data".
      if (!historySeeded && items.length > 0) {
        historySeeded = true;
        const first = items[0];
        const original = first.quantityMt;
        first.changes = [
          {
            id: `${first.id}-C1`,
            contractItemId: first.id,
            at: contractDate.add(3, 'day').toISOString(),
            userId: '00000000-0000-0000-0000-000000000001',
            userName: 'Amir Karami',
            deltaMt: 20,
            beforeMt: original,
            afterMt: original + 20,
            note: 'Client asked for two more trucks',
          },
          {
            id: `${first.id}-C2`,
            contractItemId: first.id,
            at: contractDate.add(9, 'day').toISOString(),
            userId: '00000000-0000-0000-0000-000000000001',
            userName: 'Amir Karami',
            deltaMt: -5,
            beforeMt: original + 20,
            afterMt: original + 15,
            note: 'Short-loaded container',
          },
        ];
        first.quantityMt = original + 15;
        first.remainingMt = original + 15;
      }
```

and declare `let historySeeded = false;` inside `buildSampleData` (line ~210), just before `CUSTOMER_SEEDS.forEach((seed, ci) => {` (line ~269), so it resets on every generation.

- [ ] **Step 3: Selectors in `api.ts`**

In `ContractRow` add `overMt: number;` after `remainingMt: number;`. In `buildContractRows`, compute the confirmed claims once per side before the `map` (they walk every invoice, so never per row):

```ts
  const claimsBySide = { SALE: confirmedClaimsByItem('SALE'), PURCHASE: confirmedClaimsByItem('PURCHASE') };
```

then inside the `map`, before the `return {`, add:

```ts
    const claims = claimsBySide[contractSide(contract)];
    const overMt = contract.items.reduce((s, i) => s + overContractMt(claims, i), 0);
```

and add `overMt: roundMt(overMt),` to the returned object (`roundMt` is the file's own const).

Below `buildContractRows` add:

```ts
/** A contract's documents live on its own side: a SELL contract is claimed by sale documents. */
function contractSide(contract: Contract): InvoiceSide {
  return contract.contractType === 'SELL' ? 'SALE' : 'PURCHASE';
}

/** Confirmed claims above the goods line's quantity, floored at zero. Drafts never count. */
function overContractMt(claims: Map<string, number>, item: Item): number {
  return roundMt(Math.max((claims.get(item.id) ?? 0) - item.quantityMt, 0));
}

export interface ContractItemOverview {
  itemId: string;
  product: string;
  quantityMt: number;
  /** quantityMt − Σ changes. */
  originalMt: number;
  /** Σ deltaMt of the history rows (signed). */
  changesMt: number;
  /** Confirmed claims on the contract's side. */
  confirmedInvoicedMt: number;
  /** max(confirmedInvoicedMt − quantityMt, 0). */
  overMt: number;
  remainingMt: number;
}

/** Per goods line: where the quantity came from and how the documents stand against it. */
export async function getContractItemOverview(contractId: string): Promise<ContractItemOverview[]> {
  await delay(120);
  const contract = contractById.get(contractId);
  if (!contract) return [];
  const claims = confirmedClaimsByItem(contractSide(contract));
  return contract.items.map((item) => {
    const changesMt = roundMt(item.changes.reduce((s, c) => s + c.deltaMt, 0));
    const confirmedInvoicedMt = roundMt(claims.get(item.id) ?? 0);
    return {
      itemId: item.id,
      product: item.product,
      quantityMt: item.quantityMt,
      originalMt: roundMt(item.quantityMt - changesMt),
      changesMt,
      confirmedInvoicedMt,
      overMt: roundMt(Math.max(confirmedInvoicedMt - item.quantityMt, 0)),
      remainingMt: item.remainingMt,
    };
  });
}
```

`confirmedClaimsByItem` is declared later in the file as a function declaration, so it is hoisted; `contractById` is the existing lookup index. If `InvoiceSide` is not imported in `api.ts`, add it to the `@/types` import.

After `updateItem` add:

```ts
export async function changeItemQuantity(
  itemId: string,
  input: { deltaMt: number; note: string },
): Promise<Item> {
  const owner = db.contracts.find((c) => c.items.some((i) => i.id === itemId));
  if (!owner) throw new Error(`Item ${itemId} not found`);
  const contract = await contractWrite(() => contractsApi.changeItemQuantity(owner.id, itemId, input));
  return contract.items.find((i) => i.id === itemId)!;
}
```

- [ ] **Step 4: Hooks**

In `apps/erp-panel/src/services/queries.ts`, in `qk` add:

```ts
  contractOverview: (id: string) => ['contractOverview', id] as const,
```

In `useInvalidateTrade` add, after the `qk.contract(contractId)` line:

```ts
    qc.invalidateQueries({ queryKey: ['contractOverview'] });
    qc.invalidateQueries({ queryKey: ['contractRemaining'] });
```

After `useContract` add:

```ts
export const useContractItemOverview = (id: string) =>
  useQuery({
    queryKey: qk.contractOverview(id),
    queryFn: () => api.getContractItemOverview(id),
    enabled: !!id,
  });
```

After `useUpdateItem` add:

```ts
export const useChangeItemQuantity = () => {
  const invalidate = useInvalidateTrade();
  return useMutation({
    mutationFn: ({ itemId, input }: { itemId: string; input: { deltaMt: number; note: string } }) =>
      api.changeItemQuantity(itemId, input),
    onSuccess: (item) => invalidate(item.contractId),
  });
};
```

In `useInvalidateInvoices` (line ~458) add `qc.invalidateQueries({ queryKey: ['contractOverview'] });` next to its `qk.invoiceOptions` line, because confirming or cancelling a document changes "over contract".

- [ ] **Step 5: Verify**

Run: `npm run typecheck` and `npm run lint`
Expected: clean. (`Item.changes` is required, so any other place that builds an `Item` literal — search `partners: []` across `src` — must gain `changes: []`; tsc will list them.)

- [ ] **Step 6: Commit**

```bash
git add apps/erp-panel/src/types/index.ts apps/erp-panel/src/mock apps/erp-panel/src/services
git commit -m "feat(panel): goods-line change history in the store, overview selector, hooks

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Documents — warnings and a link instead of ceilings

**Files:**
- Create: `apps/erp-panel/src/pages/tradeInvoices/overContract.ts`
- Modify: `apps/erp-panel/src/pages/tradeInvoices/AddItemsModal.tsx`
- Modify: `apps/erp-panel/src/pages/tradeInvoices/EditLineModal.tsx`
- Modify: `apps/erp-panel/src/pages/tradeInvoices/ConfirmInvoiceModal.tsx`
- Modify: `apps/erp-panel/src/pages/tradeInvoices/InvoiceDetailPage.tsx`
- Delete: `apps/erp-panel/src/pages/tradeInvoices/qtyExceedsContract.ts`
- Modify: `apps/erp-panel/src/i18n/locales/{en,ar,fa,ku}.json`

**Interfaces:**
- Consumes: `useContractRemaining(contractId, side, invoiceId)` (existing; rows `{ itemId, product, status, quantityMt, uninvoicedMt }`), `ROUTES.contracts`.
- Produces: `overContractByItem(invoice, remaining): Map<string, number>` in `overContract.ts`.

- [ ] **Step 1: The helper**

Create `apps/erp-panel/src/pages/tradeInvoices/overContract.ts`:

```ts
import type { ContractRemainingRow } from '@/services/api';
import { roundMt } from '@/utils/calc';
import type { Invoice } from '@/types';

/**
 * Per goods line, how far THIS document's lines go past what the contract has left for it.
 * `remaining` must come from `useContractRemaining(contractId, side, invoice.id)` — with this
 * document excluded — so its own lines are counted once, here. Lines that fit are absent.
 */
export function overContractByItem(invoice: Invoice, remaining: ContractRemainingRow[] | undefined): Map<string, number> {
  const onDoc = new Map<string, number>();
  for (const line of invoice.items) {
    onDoc.set(line.contractItemId, (onDoc.get(line.contractItemId) ?? 0) + line.quantityMt);
  }
  const over = new Map<string, number>();
  for (const [itemId, mt] of onDoc) {
    const left = remaining?.find((r) => r.itemId === itemId)?.uninvoicedMt ?? 0;
    const excess = roundMt(mt - left);
    if (excess > 1e-9) over.set(itemId, excess);
  }
  return over;
}
```

- [ ] **Step 2: Locale keys**

Add to the `tradeInvoices` block of all four locale files:

| key | en | ar | fa | ku |
|---|---|---|---|---|
| `overContractHint` | {{mt}} MT more than the contract | {{mt}} طن أكثر من العقد | {{mt}} تن بیشتر از قرارداد | {{mt}} تەن زیاتر لە گرێبەستەکە |
| `openContract` | Open the contract | فتح العقد | باز کردن قرارداد | کردنەوەی گرێبەستەکە |
| `overContractAlertTitle` | This document goes above the contract | هذا المستند يتجاوز العقد | این سند از قرارداد بیشتر است | ئەم بەڵگەنامەیە لە گرێبەستەکە زیاترە |
| `overContractLine` | {{product}}: {{mt}} MT more than the contract | {{product}}: {{mt}} طن أكثر من العقد | {{product}}: {{mt}} تن بیشتر از قرارداد | {{product}}: {{mt}} تەن زیاتر لە گرێبەستەکە |
| `linesOverContract` | Goods above the contract | بضائع تتجاوز العقد | کالاهای بیشتر از قرارداد | کاڵای زیاتر لە گرێبەستەکە |

Remove from all four: `tradeInvoices.qtyExceedsRemaining`, `tradeInvoices.qtyExceedsContract`, `tradeInvoices.exceedsUninvoiced`.

- [ ] **Step 3: `AddItemsModal`**

- Remove the import of `qtyExceedsContractParams` and the `code === 'qty-exceeds-remaining'` branch in `submit`'s catch.
- Add `import { Link } from 'react-router-dom';` and `import { ROUTES } from '@/config/constants';`.
- In the weighed branch, delete the `if (net > row.uninvoicedMt + 1e-9) { throw ... }` lines from the tare validator. In the unweighed branch delete the `if (v > row.uninvoicedMt + 1e-9) { throw ... }` lines and the `max={row.uninvoicedMt}` prop.
- Inside the row `div`, right after the product/hint block (`<div style={{ flex: '1 1 160px', minWidth: 0 }}>…</div>`), add the warning, computed from the watched row:

```tsx
                      {(() => {
                        const w = watchedRows[field.name];
                        const qty = weighed ? netMtOf(w?.grossMt, w?.tareMt) : (w?.quantityMt ?? 0);
                        const over = included ? qty - row.uninvoicedMt : 0;
                        return over > 1e-9 ? (
                          <div style={{ flexBasis: '100%' }}>
                            <Text type="warning" style={{ fontSize: 12 }}>
                              {t('tradeInvoices.overContractHint', { mt: formatMt(over) })}
                            </Text>{' '}
                            <Link to={`${ROUTES.contracts}/${encodeURIComponent(invoice.contractId)}`} style={{ fontSize: 12 }}>
                              {t('tradeInvoices.openContract')}
                            </Link>
                          </div>
                        ) : null;
                      })()}
```

- [ ] **Step 4: `EditLineModal`**

- Remove the `qtyExceedsContractParams` import and the `qty-exceeds-remaining` catch branch.
- Add `import { Link } from 'react-router-dom';` and `import { ROUTES } from '@/config/constants';`.
- Replace the `ceilingMt` / `maxQty` block with:

```tsx
  // What the contract has left for this line's goods, this document's other lines included.
  // Not a ceiling any more: a value above it is allowed and shows a warning instead.
  const contractLeftMt = remainingRow ? Math.max(remainingRow.uninvoicedMt - otherLinesQty, 0) : item.quantityMt;
```

- In the tare validator replace the `if (netMtOf(gross, v) > ceilingMt + 1e-9) { throw ... }` lines with:

```tsx
                    if (goodsInactive && netMtOf(gross, v) > item.quantityMt + 1e-9) {
                      throw new Error(t('tradeInvoices.goodsNotActiveEditHint', { mt: formatMt(item.quantityMt) }));
                    }
```

- In the quantity validator replace `if (v > ceilingMt + 1e-9) { throw ... }` with the same rule on `v`; remove `max={maxQty}` from the quantity `InputNumber`.
- After the weighed/quantity `Form.Item`s (before the `goodsInactive` hint), add:

```tsx
        {(() => {
          const qty = weighed ? netMtOf(watchedGross, watchedTare) : (watchedQuantity ?? 0);
          const over = qty - contractLeftMt;
          return over > 1e-9 ? (
            <Form.Item style={{ marginTop: -12 }}>
              <Text type="warning" style={{ fontSize: 12 }}>
                {t('tradeInvoices.overContractHint', { mt: formatMt(over) })}
              </Text>{' '}
              <Link to={`${ROUTES.contracts}/${encodeURIComponent(invoice.contractId)}`} style={{ fontSize: 12 }}>
                {t('tradeInvoices.openContract')}
              </Link>
            </Form.Item>
          ) : null;
        })()}
```

and add `const watchedQuantity = Form.useWatch('quantityMt', form);` next to the other `useWatch` calls.

- [ ] **Step 5: `ConfirmInvoiceModal`**

- Remove the `qtyExceedsContractParams` import and the `qty-exceeds-remaining` branch.
- Add props `side: InvoiceSide` (import the type from `@/types`), and the imports `useContractRemaining` (from `@/services/queries`), `overContractByItem` (from `./overContract`), `Link` (from `react-router-dom`), `ROUTES` (from `@/config/constants`), `Typography` from antd (`const { Text } = Typography;`).
- Inside the component: `const { data: remaining } = useContractRemaining(invoice.contractId, side, invoice.id);` and `const over = overContractByItem(invoice, remaining);`.
- Add to the `Descriptions` items, when `over.size > 0`:

```tsx
          ...(over.size > 0
            ? [
                {
                  key: 'over',
                  label: t('tradeInvoices.linesOverContract'),
                  children: (
                    <div>
                      {[...over].map(([itemId, mt]) => (
                        <div key={itemId}>
                          <Text type="warning">
                            {t('tradeInvoices.overContractLine', {
                              product: invoice.items.find((l) => l.contractItemId === itemId)?.product ?? itemId,
                              mt: formatMt(mt),
                            })}
                          </Text>
                        </div>
                      ))}
                      <Link to={`${ROUTES.contracts}/${encodeURIComponent(invoice.contractId)}`}>
                        {t('tradeInvoices.openContract')}
                      </Link>
                    </div>
                  ),
                },
              ]
            : []),
```

- [ ] **Step 6: `InvoiceDetailPage`**

- Add a second remaining query next to the existing one, this document excluded:

```tsx
  const { data: remainingExcludingThis } = useContractRemaining(
    data?.invoice.contractId ?? '',
    data ? invoiceSide(data.invoice.invoiceType) : 'SALE',
    invoiceId,
  );
```

- After `const { invoice, contract, ... } = data;` add `const overByItem = overContractByItem(invoice, remainingExcludingThis);` (import from `./overContract`; also import `WarningOutlined` from `@ant-design/icons` and `Tooltip` from antd).
- In `itemColumns`, change the product column's render to:

```tsx
      render: (v, r) => {
        const over = overByItem.get(r.contractItemId);
        return (
          <Space size={6}>
            <Text strong>{v}</Text>
            {over !== undefined && (
              <Tooltip title={t('tradeInvoices.overContractHint', { mt: formatMt(over) })}>
                <WarningOutlined style={{ color: token.colorWarning }} />
              </Tooltip>
            )}
          </Space>
        );
      },
```

(`token` comes from `theme.useToken()`; add `theme` to the antd import and `const { token } = theme.useToken();` at the top of the component if the page does not already have it.)

- Above the existing `showUninvoicedAlert` alert add:

```tsx
      {overByItem.size > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('tradeInvoices.overContractAlertTitle')}
          description={
            <div>
              <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                {[...overByItem].map(([itemId, mt]) => (
                  <li key={itemId}>
                    {t('tradeInvoices.overContractLine', {
                      product: invoice.items.find((l) => l.contractItemId === itemId)?.product ?? itemId,
                      mt: formatMt(mt),
                    })}
                  </li>
                ))}
              </ul>
              {contract && (
                <Button
                  type="link"
                  style={{ padding: 0, height: 'auto' }}
                  onClick={() => navigate(`${ROUTES.contracts}/${encodeURIComponent(contract.id)}`)}
                >
                  {t('tradeInvoices.openContract')}
                </Button>
              )}
            </div>
          }
        />
      )}
```

- Where `<ConfirmInvoiceModal … />` is rendered, pass `side={side}`.
- Delete `apps/erp-panel/src/pages/tradeInvoices/qtyExceedsContract.ts`.

- [ ] **Step 7: Verify in the browser**

Run: `npm run lint && npm run typecheck && npm run build` — clean.
Then with the backend running (`dotnet run --project backend/src/Finora.AppHost`) and `npm run dev`, sign in as amir@finora.app / demo1234, load sample data (Settings → Danger zone), open a contract with a goods line, create a sale invoice on it, Add items with a gross above the uninvoiced figure: the orange hint and the link show, the save succeeds, the page shows the warning alert and the icon on the line, the confirm dialog lists the goods above the contract, confirming succeeds.

- [ ] **Step 8: Commit**

```bash
git add apps/erp-panel/src/pages/tradeInvoices apps/erp-panel/src/i18n/locales
git commit -m "feat(panel): documents above the contract warn and link instead of refusing

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Contract pages — columns, change-quantity dialog, history, list tag

**Files:**
- Create: `apps/erp-panel/src/pages/contracts/ChangeQuantityModal.tsx`
- Modify: `apps/erp-panel/src/pages/contracts/ContractDetailPage.tsx`
- Modify: `apps/erp-panel/src/pages/contracts/ContractsPage.tsx` (quantity column)
- Modify: `apps/erp-panel/src/pages/contracts/ItemFormModal.tsx:139-146`
- Modify: `apps/erp-panel/src/i18n/locales/{en,ar,fa,ku}.json`

**Interfaces:**
- Consumes: `useContractItemOverview`, `useChangeItemQuantity` (Task 4), `changeQuantityMessage` (Task 3), `Item.changes` (Task 4).

- [ ] **Step 1: Locale keys**

Add to the `contracts` block of all four locale files:

| key | en | ar | fa | ku |
|---|---|---|---|---|
| `changeQuantity` | Change quantity | تغيير الكمية | تغییر مقدار | گۆڕینی بڕ |
| `changeQuantityTitle` | Change quantity: {{product}} | تغيير الكمية: {{product}} | تغییر مقدار: {{product}} | گۆڕینی بڕ: {{product}} |
| `deltaMt` | Change (+/− MT) | التغيير (+/− طن) | تغییر (+/− تن) | گۆڕانکاری (+/− تەن) |
| `currentQuantity` | Current quantity | الكمية الحالية | مقدار فعلی | بڕی ئێستا |
| `newQuantity` | New quantity | الكمية الجديدة | مقدار جدید | بڕی نوێ |
| `changeNote` | Note (why) | ملاحظة (السبب) | یادداشت (دلیل) | تێبینی (بۆچی) |
| `quantityChanged` | Quantity changed | تم تغيير الكمية | مقدار تغییر کرد | بڕ گۆڕدرا |
| `originalMt` | Original (MT) | الأصلي (طن) | اولیه (تن) | ڕەسەن (تەن) |
| `changesMt` | Changes (MT) | التغييرات (طن) | تغییرات (تن) | گۆڕانکارییەکان (تەن) |
| `overMt` | Over contract (MT) | فوق العقد (طن) | بیش از قرارداد (تن) | زیاتر لە گرێبەست (تەن) |
| `overTag` | over | تجاوز | بیش از حد | زیاتر |
| `quantityHistory` | Quantity history | سجل الكمية | تاریخچه مقدار | مێژووی بڕ |
| `historyWhen` | When | متى | زمان | کەی |
| `historyWho` | Who | من | چه کسی | کێ |
| `historyBeforeAfter` | Before → after | قبل ← بعد | قبل ← بعد | پێش ← دوای |

Remove `items.quantityBelowInvoiced` from all four files.

- [ ] **Step 2: The dialog**

Create `apps/erp-panel/src/pages/contracts/ChangeQuantityModal.tsx`:

```tsx
import { App, Form, Input, InputNumber, Modal, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { useChangeItemQuantity } from '@/services/queries';
import { formatMt } from '@/utils/format';
import { roundMt } from '@/utils/calc';
import type { Item } from '@/types';
import { changeQuantityMessage } from './changeQuantityErrors';

const { Text } = Typography;

interface ChangeQuantityFormValues {
  deltaMt?: number;
  note?: string;
}

interface ChangeQuantityModalProps {
  open: boolean;
  onClose: () => void;
  item: Item;
}

/** +/− MT with a required note. The server moves the quantity and writes the history row. */
export function ChangeQuantityModal({ open, onClose, item }: ChangeQuantityModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<ChangeQuantityFormValues>();
  const changeMut = useChangeItemQuantity();
  const delta = Form.useWatch('deltaMt', form) ?? 0;
  const newQuantity = roundMt(item.quantityMt + delta);

  const submit = async () => {
    let values: ChangeQuantityFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    try {
      await changeMut.mutateAsync({
        itemId: item.id,
        input: { deltaMt: values.deltaMt ?? 0, note: values.note?.trim() ?? '' },
      });
      message.success(t('contracts.quantityChanged'));
      onClose();
    } catch (err) {
      message.error(changeQuantityMessage(err, t));
    }
  };

  return (
    <Modal
      open={open}
      title={t('contracts.changeQuantityTitle', { product: item.product })}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={changeMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Form key={item.id} form={form} layout="vertical" preserve={false}>
        <Form.Item label={t('contracts.currentQuantity')}>
          <Text strong>{formatMt(item.quantityMt)}</Text>
        </Form.Item>
        <Form.Item
          name="deltaMt"
          label={t('contracts.deltaMt')}
          rules={[
            { required: true, message: t('common.required') },
            {
              validator: async (_, v: number | undefined) => {
                if (v === undefined || v === null) return;
                if (roundMt(v) === 0) throw new Error(t('contracts.changeDeltaZero'));
                if (roundMt(item.quantityMt + v) <= 0) {
                  throw new Error(t('contracts.changeBelowZero', { mt: formatMt(item.quantityMt) }));
                }
              },
            },
          ]}
        >
          <InputNumber precision={6} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label={t('contracts.newQuantity')}>
          <Text strong type={newQuantity <= 0 ? 'danger' : undefined}>{formatMt(newQuantity)}</Text>
        </Form.Item>
        <Form.Item
          name="note"
          label={t('contracts.changeNote')}
          rules={[{ required: true, whitespace: true, message: t('contracts.changeNoteRequired') }]}
        >
          <Input.TextArea rows={3} maxLength={300} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}
```

- [ ] **Step 3: `ContractDetailPage`**

- Imports: add `useContractItemOverview` to the queries import; `SwapOutlined` to the icons import; `ChangeQuantityModal` from `./ChangeQuantityModal`; `Table` is already imported; add `type ItemChange` to the types import.
- State: `const [changeFor, setChangeFor] = useState<Item | undefined>(undefined);` and `const { data: overview } = useContractItemOverview(contractId);` then `const overviewById = new Map((overview ?? []).map((o) => [o.itemId, o]));`.
- In `itemColumns`, after the `quantityMt` column insert:

```tsx
    {
      title: t('contracts.originalMt'),
      key: 'originalMt',
      width: 120,
      align: 'right',
      render: (_, r) => formatMt(overviewById.get(r.id)?.originalMt ?? r.quantityMt),
    },
    {
      title: t('contracts.changesMt'),
      key: 'changesMt',
      width: 120,
      align: 'right',
      render: (_, r) => {
        const v = overviewById.get(r.id)?.changesMt ?? 0;
        if (Math.abs(v) < 1e-9) return <Text type="secondary">—</Text>;
        return <Text type={v > 0 ? 'success' : 'danger'}>{v > 0 ? `+${formatMt(v)}` : formatMt(v)}</Text>;
      },
    },
    {
      title: t('contracts.overMt'),
      key: 'overMt',
      width: 130,
      align: 'right',
      render: (_, r) => {
        const v = overviewById.get(r.id)?.overMt ?? 0;
        return v > 1e-9 ? <Text type="warning" strong>{formatMt(v)}</Text> : <Text type="secondary">—</Text>;
      },
    },
```

- In the actions column, widen to `width: 200` and render two buttons:

```tsx
      render: (_, r) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => setItemForm({ open: true, item: r })}>
            {t('common.edit')}
          </Button>
          <Button type="link" size="small" icon={<SwapOutlined />} onClick={() => setChangeFor(r)}>
            {t('contracts.changeQuantity')}
          </Button>
        </Space>
      ),
```

- Update the table's `scroll.x` to `isPurchase ? 2150 : 1890`.
- After the goods `Card`, add the history card:

```tsx
      {contract && contract.items.some((i) => i.changes.length > 0) && (
        <Card variant="borderless" title={t('contracts.quantityHistory')} style={{ marginTop: 16 }} styles={{ body: { padding: 12 } }}>
          <Table<ItemChange & { product: string }>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={contract.items
              .flatMap((i) => i.changes.map((c) => ({ ...c, product: i.product })))
              .sort((a, b) => b.at.localeCompare(a.at))}
            columns={[
              { title: t('contracts.historyWhen'), dataIndex: 'at', width: 160, render: (v: string) => formatDate(v, 'DD MMM YYYY HH:mm') },
              { title: t('items.product'), dataIndex: 'product', width: 200, render: (v: string) => <Text strong>{v}</Text> },
              { title: t('contracts.historyWho'), dataIndex: 'userName', width: 160 },
              {
                title: t('contracts.deltaMt'),
                dataIndex: 'deltaMt',
                width: 120,
                align: 'right',
                render: (v: number) => <Text type={v > 0 ? 'success' : 'danger'}>{v > 0 ? `+${formatMt(v)}` : formatMt(v)}</Text>,
              },
              {
                title: t('contracts.historyBeforeAfter'),
                key: 'beforeAfter',
                width: 180,
                align: 'right',
                render: (_: unknown, r: ItemChange) => `${formatMt(r.beforeMt)} → ${formatMt(r.afterMt)}`,
              },
              { title: t('contracts.changeNote'), dataIndex: 'note' },
            ]}
            scroll={{ x: 1000 }}
          />
        </Card>
      )}
```

- Render the dialog next to the other modals:

```tsx
      {changeFor && (
        <ChangeQuantityModal open onClose={() => setChangeFor(undefined)} item={changeFor} />
      )}
```

- [ ] **Step 4: `ContractsPage` and `ItemFormModal`**

In `ContractsPage.tsx`, the `contracts.quantity` column's render becomes:

```tsx
      render: (v, r) => (
        <Space size={6}>
          <span>{formatMt(v)}</span>
          {r.overMt > 1e-9 && (
            <Tag color="warning" bordered={false}>
              {t('contracts.overTag')}
            </Tag>
          )}
        </Space>
      ),
```

(add `Space` to the antd import).

In `ItemFormModal.tsx` replace the catch block that names `quantity-below-invoiced` with:

```tsx
    } catch {
      message.error(t('common.saveFailed'));
    }
```

- [ ] **Step 5: Verify in the browser**

Run: `npm run lint && npm run typecheck && npm run build` — clean.
With the backend and dev server running, on a contract page: the three new columns show; "Change quantity" with +20 and a note moves the quantity, the history card appears with the row (date, name, +20, before → after, note); a change of 0, an empty note, and a change that would reach 0 show the three messages; the contracts list shows the "over" tag on a contract whose confirmed documents exceed a goods line (make one in Task 5's flow).

- [ ] **Step 6: Commit**

```bash
git add apps/erp-panel/src/pages/contracts apps/erp-panel/src/i18n/locales
git commit -m "feat(panel): change goods quantity with history, over-contract columns and tag

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Whole-tree checks and the one-line note

**Files:**
- Modify: `CLAUDE.md` (Domain model section, after the invoice-line weights paragraph)

- [ ] **Step 1: Full verification**

Run, from the repo root:

```bash
dotnet build backend/Finora.slnx --nologo
dotnet test backend/Finora.slnx --nologo
npm run lint
npm run typecheck
npm run build
```

Expected: all green. Then `grep -rn "qty-exceeds-remaining\|quantity-below-invoiced\|ContractQuantityGuard\|qtyExceedsContract" backend/src backend/tests backend/contracts apps/erp-panel/src` prints nothing.

- [ ] **Step 2: The note**

In `CLAUDE.md`, after the paragraph that begins "An **invoice line** on the four invoice types carries…", add:

```markdown
A document may claim **more** of a goods line than the contract holds: nothing refuses it, the
document and the contract page show the overrun, and the contract page's "Change quantity"
writes a `ContractItemChange` history row. See
`docs/superpowers/specs/2026-09-05-contract-quantity-changes-design.md`.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note the over-contract rule and quantity history in CLAUDE.md

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
