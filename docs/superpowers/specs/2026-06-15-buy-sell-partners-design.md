# Buy/Sell Contracts + Trading Partners — Design Spec

**Date:** 2026-06-15
**Branch:** `claude/awesome-turing-b8ven2`
**Status:** Approved (design), pending plan

## 1. Goal

Turn Finora's single contract list into a **two-sided trade book**: customers carry a
role (`customerType`), contracts carry a direction (`contractType` = Sell/Purchase), the
Contracts page splits into **Sell / Purchase** tabs, the create dialog is role-aware, the
contract detail hides containers, and **purchase-contract goods support multiple
profit-sharing partners** (a dedicated Partner master entity + per-goods percentage
allocations).

This mirrors the ERP "Business Partner with roles + document-level partner allocations"
standard (see the brainstorm research).

## 2. Scope & non-goals

**In scope**
- `customerType` on Customer; `contractType` on Contract; a new `Partner` master entity;
  `ItemPartner` allocations on Item.
- Deterministic seeding of all four across the existing mock dataset.
- Contracts page Sell/Purchase tabs.
- Role-aware New/Edit contract dialog (type header + filtered customer list).
- Contract detail: remove the containers section; add a contract-type tag; add a Partners
  column to the goods table (purchase only).
- Goods (Item) form: partner allocation section (purchase only) with ≤100 validation.
- API/query plumbing + i18n (en/ar/fa, RTL-safe).

**Non-goals (YAGNI)**
- No partner-management page (partners are a seeded master + a selector).
- No partners on sell contracts.
- No change to the global Containers page or sidebar nav (only the contract-detail section
  is removed).
- No contract-id scheme change (keeps the canonical `AM-P-251101156`).
- No re-typing contract type on edit (type is fixed once created).

## 3. Data model (`src/types/index.ts`)

```ts
export type CustomerType = 'BUYER' | 'SUPPLIER' | 'BOTH';
export type ContractType = 'SELL' | 'PURCHASE';

export interface Partner {
  id: string;        // e.g. "ptnr-cc"
  name: string;
  code: string;      // short code, e.g. "CC"
}

/** A partner's profit/cost share of one goods line (purchase contracts). */
export interface ItemPartner {
  partnerId: string;
  percent: number;   // > 0; sum across a line's partners must be ≤ 100 (company keeps 100 − sum)
}
```

- `Customer` gains `customerType: CustomerType` (after `creditLimit`).
- `Contract` gains `contractType: ContractType` (after `customerId`).
- `Item` gains `partners: ItemPartner[]` (always present; `[]` for sell items / no partners).

## 4. Seeding (`src/mock/data.ts`)

### 4.1 Customer types
First extend `interface CustomerSeed` (data.ts:78) with `type: CustomerType;`. Because
`CUSTOMER_SEEDS` is annotated `CustomerSeed[]`, this forces all 14 rows to supply the field
(compile error otherwise). Add `type` to each row per the table below, and set
`customerType: seed.type` in the customer object literal (data.ts:141). Deterministic
assignment (6 buyers / 4 suppliers / 4 both):

| code | customer | type |
|---|---|---|
| AM | Alco Metal Trading | BUYER |
| MG | Million Gen Tr | BUYER |
| AJ | Al Jesr Scrap Metal Tr | SUPPLIER |
| SM | Sun Metals Casting LLC | BOTH |
| ZM | Zurich Metal | BUYER |
| TM | Transmetals Trading DMCC | BOTH |
| NG | Ningbo Goosen International | BUYER |
| SH | Shar International TL | SUPPLIER |
| AR | Abdul Rahman Lobnani | SUPPLIER |
| NM | The Nile Metals | BUYER |
| QS | Quick Sea Freight | BOTH |
| AC | Advanced Cargo & Shipping | BUYER |
| GL | Goldline Recyclers FZE | SUPPLIER |
| EM | Eurasia Metals GmbH | BOTH |

### 4.2 Contract type (inline in the generation loop — no PRNG impact)
For each generated contract, derive from the customer type and the per-customer contract
index `k`:
```
BUYER    → 'SELL'
SUPPLIER → 'PURCHASE'
BOTH     → k % 2 === 0 ? 'SELL' : 'PURCHASE'   // BOTH customers produce a mix
```
Add `contractType` to the contract object literal. **All three Contract construction sites
must set it:** the generation-loop literal (data.ts:186, derived as above), the **Alco
reference IIFE** (data.ts:296 → `'SELL'` explicitly), and `api.createContract`
(api.ts:403 → from `input.contractType`). Derivation uses no `rnd()`, so the seeded
sequence is unchanged.

### 4.3 Partner master
Add `PARTNER_SEEDS` (~5 firms) → `partners: Partner[]`, exported as `db.partners`:
```
Crescent Capital Partners (CC), Gulf Metals JV (GM), Orion Commodities (OR),
Meridian Trading Co (MT), Apex Resource Partners (AX)
```

### 4.4 Partner allocations (post-pass — appended PRNG draws)
**Every `Item` construction site must initialize `partners: []`:** the generation-loop item
literal (data.ts:169), the **Alco IIFE item** (data.ts:282), and `api.createItem`
(api.ts:443, from `input.partners ?? []`). (All are `Item`-annotated, so a miss is a compile
error — but list them so none is overlooked.)

**Ordering is load-bearing:** the partner post-pass MUST be appended **after** the existing
`creditLimit` `customers.forEach` block (data.ts:377–389), immediately before
`export const db`. The credit-limit loop draws `rnd()` once per customer; inserting partner
draws *before* it would shift every seeded `creditLimit` and visibly regress the Customer
Portal (utilization / available credit). Appending after keeps all earlier draws — and the
canonical Alco contract — byte-identical.

**Pinned iteration (determinism):** iterate the live `contracts` array in declaration order
and each `contract.items` in order, reusing the module `rnd` — no `sort`, no
`filter`-into-a-new-array-then-iterate that changes traversal order:
```
for (const contract of contracts) {
  if (contract.contractType !== 'PURCHASE') continue;
  for (const item of contract.items) {
    if (rnd() < 0.6) {                          // ~60% of purchase goods get partners
      const n = rnd() < 0.5 ? 1 : 2;            // 1–2 partners
      // pick n distinct partners by rnd index into `partners`
      // each gets percent = 5 * intBetween(3, 8)  // 15–40, multiples of 5
      // if the running sum would exceed 80, stop adding (company keeps ≥ 20%)
      item.partners = [...allocations];          // each {partnerId, percent}, percent > 0
    }
  }
}
```
Sell-contract items (and skipped purchase items) keep `partners: []`. The Alco contract is
SELL, so it is skipped — its item stays `partners: []`.

## 5. Contracts page — Sell/Purchase tabs (`src/pages/contracts/ContractsPage.tsx`)

- Add a controlled tab state `tab: ContractType` (default `'SELL'`), rendered as an AntD
  `Tabs` (or `Segmented`) above the existing toolbar with labels
  `Sell contracts (n) / Purchase contracts (n)` (counts from `data`).
- The `filtered` memo additionally requires `c.contractType === tab`. Existing search +
  status filters apply within the active tab.
- `ContractRow` exposes `contractType` (Section 8). Optional small "Type" column is **not**
  added (the tab already conveys it).
- "New contract" passes the active `tab` as the new contract's type:
  `<ContractFormModal ... contractType={tab} />`.

## 6. New/Edit contract dialog (`src/pages/contracts/ContractFormModal.tsx`)

- New prop `contractType?: ContractType` (create only). Effective, **non-editable** type:
  `type = contract?.contractType ?? contractType ?? 'SELL'`. `contractType` is **not** a
  `Form.Item`/form value — it's derived from the prop/contract and injected in `submit`.
- **Type header (create AND edit)**: modal title is role-aware on create
  (`t('contracts.newSell')` / `t('contracts.newPurchase')`) and `t('contracts.editContract')`
  on edit. In **both** modes render a read-only colored `Tag` at the top of the form body
  (`contracts.typeSell` / `contracts.typePurchase`) so the side is always visible.
- **Customer filter**: options = `customers.filter(allowedFor(type))` where
  `SELL → ['BUYER','BOTH']`, `PURCHASE → ['SUPPLIER','BOTH']`. **On edit, union in the
  contract's current customer** if the filter would exclude it, so the existing selection
  never disappears from the dropdown (avoids a blank/forced-change Select).
- `submit` injects `contractType: type` into `ContractInput` (used on create; `updateContract`
  ignores it — see §9).

## 7. Contract detail (`src/pages/contracts/ContractDetailPage.tsx`)

- **Remove the Containers card** entirely, plus its `ContainerFormModal` usage,
  `containerForm` state, and `containerColumns`. Then remove **only the imports that become
  orphaned**: `useContainersByContract`, the `ContainerRow` type, and `ContainerFormModal`.
  **Keep `formatDate`** — it is still used by the Descriptions date field (line 197).
  `formatMt`, `formatNumber`, `CheckCircleTwoTone`, `CloseCircleOutlined`, `unitPrice`, etc.
  remain used by the goods table. Run lint to confirm no unused-import errors.
- Add a `contractType` tag next to the status tag in the `PageHeader` title
  (`contracts.typeSell` / `contracts.typePurchase`).
- Goods table: add a **Partners** column shown only when `contract.contractType ===
  'PURCHASE'`. Resolve `partnerId → name` via a `usePartners()` map. Render allocations in a
  wrap-safe `<Space size={[4, 4]} wrap>` of tags using `t('items.partnerTag', { name, percent })`
  (so RTL controls name/percent/`%` ordering), followed by a muted own-share tag
  `t('items.ownShare', { percent: 100 − sum })`. Items with no partners show `—`.
- **Pass `contractType={contract.contractType}`** into the `<ItemFormModal>` instance(s) on
  this page (available because `ContractRow extends Contract`) — this is what enables the
  purchase-only partner section in the goods form (§8).

## 8. Goods (Item) form (`src/pages/contracts/ItemFormModal.tsx`)

- New prop `contractType?: ContractType` (passed from ContractDetailPage). `isPurchase =
  contractType === 'PURCHASE'`.
- **Form value plumbing (required for edit to work):** add `partners: ItemPartner[]` to the
  local `ItemFormValues` interface; seed it in `initialValues` — **edit branch:
  `partners: item.partners ?? []`** (so existing allocations rehydrate the `Form.List`),
  create branch: `partners: []`.
- When `isPurchase`, render a **Partners** section using AntD `Form.List` named `partners`:
  each row = a partner `Select` (options from `usePartners()`, excluding partners already
  chosen in other rows) + a percent `InputNumber` (1–100) + a remove button; an "Add
  partner" button; and a live **`t('items.ownShare', { percent: 100 − sum })`** readout
  (same key/wording as the goods-table column). Own share may reach 0 (partners total 100).
  - **Per-row rules:** each row's partner `Select` and percent `InputNumber` get
    `[{ required: true, message: t('common.required') }]`; percent min 1, max 100.
  - **Form-level validation (on submit):** distinct `partnerId` across rows (else
    `t('items.partnerDupError')`); **sum of percents ≤ 100** (else
    `t('items.partnerSumError', { sum })`).
  - The section is hidden entirely on sell contracts.
- `submit` builds `partners` defensively: `(values.partners ?? []).filter(p => p?.partnerId
  && typeof p.percent === 'number')` — a half-filled row is rejected by the per-row rules,
  never silently persisted. `ItemInput.partners` = that array (`[]` when sell).
- `ItemInput` includes `partners: ItemPartner[]`. Persisted on create and update (§9).
- The existing LME-fixed behavior (fixed price / floating, unit-price preview) is unchanged.

## 9. API & queries

`src/services/api.ts`
- `ContractInput += contractType: ContractType`; `createContract` writes it; `updateContract`
  does **not** reassign `contractType` (type is fixed once created — leave the existing
  field). `buildContractRows` spreads it onto `ContractRow`.
- `ItemInput += partners: ItemPartner[]`; `createItem` writes `input.partners ?? []`;
  `updateItem` uses a **non-destructive fallback** `target.partners = input.partners ??
  target.partners ?? []` so an edit that doesn't carry partners can never wipe existing
  allocations (defence-in-depth alongside the §8 form prefill).
- `getPartners(): Promise<Partner[]>` returning `db.partners`.
- `getCustomers()` unchanged (form filters client-side by `customerType`).
- `nextContractId` unchanged.

`src/services/queries.ts`
- `qk.partners = ['partners']`; `usePartners()` query hook.
- `ContractInput`/`ItemInput` type changes flow through existing mutation hooks; existing
  `useInvalidateTrade` already invalidates contracts/contract/accounts/etc.

## 10. i18n (`src/i18n/locales/{en,ar,fa}.json`, RTL-safe)

**Add** (all three locales):
- `customers.type` + `customerTypes.{BUYER,SUPPLIER,BOTH}`. Localize BOTH as a real phrase,
  not a raw `&`: en `"Buyer & supplier"`, ar `"مشترٍ ومورّد"`, fa `"خریدار و تأمین‌کننده"`.
- `contracts.{typeSell,typePurchase,newSell,newPurchase,sellTab,purchaseTab}`.
- `items.{partners,partner,sharePercent,addPartner,noPartners}`.
- **Interpolated keys** (use `{{...}}` so RTL controls ordering — never concatenate in JSX):
  - `items.ownShare` = `"Own share: {{percent}}%"` (used by both the form readout §8 and the
    goods column §7).
  - `items.partnerTag` = `"{{name}} {{percent}}%"` (goods-column tag §7).
  - `items.partnerSumError` = `"Partner shares total {{sum}}% — must not exceed 100%"`.
  - `items.partnerDupError` = `"Each partner can be added only once"`.

**Update** (existing key, now wrong): `contracts.subtitle` is sell-only in all three locales
(en `"Sales contracts and their goods"`, ar/fa equivalents). Reword neutrally, e.g. en
`"Sell & purchase contracts and their goods"` + ar/fa equivalents.

## 11. File summary

| Action | File | Responsibility |
|---|---|---|
| Modify | `src/types/index.ts` | `CustomerType`, `ContractType`, `Partner`, `ItemPartner`; fields on Customer/Contract/Item |
| Modify | `src/mock/data.ts` | seed customerType, contractType, PARTNER_SEEDS, partner post-pass, `db.partners` |
| Modify | `src/services/api.ts` | `ContractInput`/`ItemInput` fields, persist, `getPartners`, `buildContractRows` |
| Modify | `src/services/queries.ts` | `qk.partners` + `usePartners` |
| Modify | `src/pages/contracts/ContractsPage.tsx` | Sell/Purchase tabs + filter + pass type |
| Modify | `src/pages/contracts/ContractFormModal.tsx` | type header + customer filter + persist |
| Modify | `src/pages/contracts/ContractDetailPage.tsx` | remove containers; type tag; partners column |
| Modify | `src/pages/contracts/ItemFormModal.tsx` | partner Form.List (purchase) + validation + persist |
| Modify | `src/i18n/locales/en.json` | keys |
| Modify | `src/i18n/locales/ar.json` | keys |
| Modify | `src/i18n/locales/fa.json` | keys |

## 12. Verification

No component test framework. Gate each task with `npm run typecheck && npm run lint &&
npm run build`. Then live (port 3031), logged in as Manager:
- Contracts page shows Sell/Purchase tabs with counts; switching filters the table.
- "New contract" on Sell → dialog header "New Sell contract", customer list = buyers + both;
  on Purchase → header "New Purchase contract", customer list = suppliers + both.
- Create a purchase contract, add goods with 2 partners (e.g., 30% + 25%) → "Own share: 45%";
  saving with partners summing > 100 is blocked (interpolated error); the **same partner
  twice** is blocked; a half-filled partner row is blocked by per-row required rules.
- Goods list on the purchase contract shows partner tags + own share; sell contract has no
  partner column.
- **Edit a seeded purchase line** → its partner allocations are **prefilled** in the form and
  **survive a no-op save** (changing only, e.g., premium does not wipe partners).
- Contract detail shows **no containers** section; the global Containers page still works.
- Alco `AM-P-251101156` is a Sell contract and its goods/pricing are unchanged.
- **Determinism guard:** sample `creditLimit` values (e.g. `cust-am`, `cust-ng`) are
  **byte-identical** to before this change (proves the partner post-pass is appended after the
  credit-limit loop; Customer Portal numbers unchanged).
- Dark/light + ar/fa (RTL) hold, including the wrap-safe partners column.

## 13. Success criteria

- Build + lint + typecheck clean.
- Both tabs populated from seed; role-aware dialog filters customers correctly.
- Purchase goods carry multiple partner allocations with ≤100 validation; sell goods do not.
- Containers hidden on contract detail only; canonical Alco data intact.
- Existing roles, pages, and the LME-fixed goods behavior are unaffected.
