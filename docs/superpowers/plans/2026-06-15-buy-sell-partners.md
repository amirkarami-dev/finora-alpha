# Buy/Sell Contracts + Trading Partners Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add customer roles + sell/purchase contract types (tabbed UI, role-aware create dialog), hide containers on the contract detail, and add per-goods trading-partner allocations on purchase contracts.

**Architecture:** Entity fields (`Customer.customerType`, `Contract.contractType`, `Item.partners`) are **required** (forcing seed/literal updates together in Task 1); the input DTO fields (`ContractInput.contractType`, `ItemInput.partners`) are **optional with defaults**, so the existing forms keep compiling until their UI tasks land — every commit stays green. Partner allocations are seeded in a deterministic post-pass appended **after** the credit-limit pass.

**Tech Stack:** React 18 · TypeScript strict · Ant Design 5.22 · React Router 6 · TanStack Query 5 · react-i18next (en/ar/fa) · dayjs.

**Spec:** `docs/superpowers/specs/2026-06-15-buy-sell-partners-design.md`

**No component test framework.** Gate every task with `npm run typecheck && npm run lint && npm run build` (all exit 0) before committing. Use `git add <explicit paths>` (never `git add -A`); never stage `.claude/launch.json`. Each commit message ends with a blank line then `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File map

| Action | File | Responsibility |
|---|---|---|
| Modify | `src/types/index.ts` | new type unions + entity fields |
| Modify | `src/mock/data.ts` | seed customerType, contractType, partners, partner post-pass, `db.partners` |
| Modify | `src/services/api.ts` | DTO fields + persistence + `getPartners` |
| Modify | `src/services/queries.ts` | `qk.partners` + `usePartners` |
| Modify | `src/i18n/locales/{en,ar,fa}.json` | new keys + subtitle reword |
| Modify | `src/pages/contracts/ContractsPage.tsx` | Sell/Purchase tabs |
| Modify | `src/pages/contracts/ContractFormModal.tsx` | type header + customer filter + persist |
| Modify | `src/pages/contracts/ContractDetailPage.tsx` | remove containers; type tag; partners column |
| Modify | `src/pages/contracts/ItemFormModal.tsx` | partner Form.List (purchase) |

---

## Task 1: Data foundation (types + seed + API + query)

Grouped because making the entity fields required forces every object literal (seed + Alco IIFE + `createContract`/`createItem`) to set them in one green commit.

**Files:** Modify `src/types/index.ts`, `src/mock/data.ts`, `src/services/api.ts`, `src/services/queries.ts`

- [ ] **Step 1: Add type unions + entity fields** in `src/types/index.ts`

After the existing status unions (near the top), add:
```ts
export type CustomerType = 'BUYER' | 'SUPPLIER' | 'BOTH';
export type ContractType = 'SELL' | 'PURCHASE';

export interface Partner {
  id: string;
  name: string;
  code: string;
}

/** A partner's profit/cost share of one goods line (purchase contracts). */
export interface ItemPartner {
  partnerId: string;
  percent: number; // > 0; sum across a line ≤ 100 (company keeps 100 − sum)
}
```
In `interface Customer`, add after `creditLimit`:
```ts
  /** Trading role of this party. */
  customerType: CustomerType;
```
In `interface Contract`, add after `customerId`:
```ts
  contractType: ContractType;
```
In `interface Item`, add after `remainingMt`:
```ts
  /** Profit/cost-share partners (purchase contracts only; [] otherwise). */
  partners: ItemPartner[];
```

- [ ] **Step 2: Seed customer types** in `src/mock/data.ts`

Add the imports `CustomerType, ContractType, Partner, ItemPartner` to the existing
`import type { ... } from '@/types';` block.

Extend `interface CustomerSeed` (currently ends with `contracts: number;`) — add:
```ts
  type: CustomerType;
```
Add `type` to every `CUSTOMER_SEEDS` row (append `, type: '...'` before the closing `}` of each):
```
AM BUYER · MG BUYER · AJ SUPPLIER · SM BOTH · ZM BUYER · TM BOTH · NG BUYER ·
SH SUPPLIER · AR SUPPLIER · NM BUYER · QS BOTH · AC BUYER · GL SUPPLIER · EM BOTH
```
In the customer object literal (inside `CUSTOMER_SEEDS.forEach`), add after `paymentTermsDays: seed.terms,`:
```ts
    customerType: seed.type,
```
(Leave the existing `creditLimit: 0,` line as-is.)

- [ ] **Step 3: Seed contract type (inline, no PRNG)** in `src/mock/data.ts`

Inside the contract loop (`for (let k = 0; k < seed.contracts; k++)`), just before the
`const contract: Contract = {` literal, add:
```ts
    const contractType: ContractType =
      seed.type === 'BUYER'
        ? 'SELL'
        : seed.type === 'SUPPLIER'
          ? 'PURCHASE'
          : k % 2 === 0
            ? 'SELL'
            : 'PURCHASE';
```
Add `contractType,` to the `contract` literal (e.g. after `customerId: customer.id,`).
Add `partners: [],` to the **item** literal in the same loop (after `remainingMt: quantityMt,`).

- [ ] **Step 4: Update the Alco reference IIFE** in `src/mock/data.ts`

In the Alco IIFE, the `item` literal: add `partners: [],` (after `remainingMt: 0,`).
The `contract` literal: add `contractType: 'SELL',` (after `customerId: alco.id,`).

- [ ] **Step 5: Add the Partner master** in `src/mock/data.ts`

Near the other seed arrays (e.g. after `CONTAINER_PREFIXES`), add:
```ts
const PARTNER_SEEDS: Array<{ name: string; code: string }> = [
  { name: 'Crescent Capital Partners', code: 'CC' },
  { name: 'Gulf Metals JV', code: 'GM' },
  { name: 'Orion Commodities', code: 'OR' },
  { name: 'Meridian Trading Co', code: 'MT' },
  { name: 'Apex Resource Partners', code: 'AX' },
];
const partners: Partner[] = PARTNER_SEEDS.map((p) => ({
  id: `ptnr-${p.code.toLowerCase()}`,
  name: p.name,
  code: p.code,
}));
```

- [ ] **Step 6: Partner allocation post-pass** in `src/mock/data.ts`

Append **immediately after the existing `creditLimit` `customers.forEach(...)` block** and
**before** `export const db = {`:
```ts
/* ------------------------------------------------------------------ *
 * Partner allocations on purchase-contract goods. Appended AFTER the
 * credit-limit post-pass so earlier PRNG draws (and seeded credit
 * limits) stay byte-identical. Iterate the live arrays in declaration
 * order — no sort/filter-into-new-order — to keep determinism.
 * ------------------------------------------------------------------ */
for (const contract of contracts) {
  if (contract.contractType !== 'PURCHASE') continue;
  for (const item of contract.items) {
    if (rnd() < 0.6) {
      const count = rnd() < 0.5 ? 1 : 2;
      const pool = [...partners];
      const chosen: ItemPartner[] = [];
      let sum = 0;
      for (let i = 0; i < count && pool.length > 0; i++) {
        const partner = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
        const percent = 5 * intBetween(3, 8); // 15–40
        if (sum + percent > 80) break; // company keeps ≥ 20%
        sum += percent;
        chosen.push({ partnerId: partner.id, percent });
      }
      item.partners = chosen;
    }
  }
}
```
Add `partners,` to the `export const db = { ... }` object.

- [ ] **Step 7: API DTO fields, persistence, getPartners** in `src/services/api.ts`

Add `Partner, ItemPartner, ContractType` to the `import type { ... } from '@/types';` list.

`ContractInput` — add (optional, so existing callers compile):
```ts
  contractType?: ContractType;
```
In `createContract`, in the `Contract` literal, add:
```ts
    contractType: input.contractType ?? 'SELL',
```
(Do NOT add `contractType` to `updateContract` — type is fixed once created.)

`ItemInput` — add:
```ts
  partners?: ItemPartner[];
```
In `createItem`, in the `Item` literal, add:
```ts
    partners: input.partners ?? [],
```
In `updateItem`, add (non-destructive fallback) after the other `target.x = ...` lines:
```ts
  target.partners = input.partners ?? target.partners ?? [];
```
Add a getter near `getCustomers`:
```ts
export async function getPartners(): Promise<Partner[]> {
  await delay(120);
  return [...db.partners];
}
```
(`buildContractRows` needs no change — `ContractRow extends Contract`, so `contractType`
flows through the `...contract` spread automatically.)

- [ ] **Step 8: Query hook** in `src/services/queries.ts`

Add to the `qk` object:
```ts
  partners: ['partners'] as const,
```
Add a hook near `useCustomers`:
```ts
export const usePartners = () => useQuery({ queryKey: qk.partners, queryFn: api.getPartners });
```

- [ ] **Step 9: Gate**

Run: `npm run typecheck && npm run lint && npm run build` → all exit 0.

- [ ] **Step 10: Commit**
```bash
git add src/types/index.ts src/mock/data.ts src/services/api.ts src/services/queries.ts
git commit -m "feat(trade): customerType + contractType + partner master & allocations (data layer)"
```

---

## Task 2: i18n (en / ar / fa)

**Files:** Modify `src/i18n/locales/en.json`, `src/i18n/locales/ar.json`, `src/i18n/locales/fa.json`

- [ ] **Step 1: English** (`src/i18n/locales/en.json`)

In `customers`, add after `"creditUsed": "Credit used"` (add a comma):
```json
    "creditUsed": "Credit used",
    "type": "Type"
```
Change `contracts.subtitle`:
```json
    "subtitle": "Sell & purchase contracts and their goods",
```
In `contracts`, add after `"newContract": "New contract",`:
```json
    "typeSell": "Sell",
    "typePurchase": "Purchase",
    "newSell": "New sell contract",
    "newPurchase": "New purchase contract",
    "sellTab": "Sell contracts",
    "purchaseTab": "Purchase contracts",
```
In `items`, add after `"productPlaceholder": "Select or type a product"` (add a comma):
```json
    "productPlaceholder": "Select or type a product",
    "partners": "Partners",
    "partner": "Partner",
    "sharePercent": "Share %",
    "addPartner": "Add partner",
    "noPartners": "No partners",
    "ownShare": "Own share: {{percent}}%",
    "partnerTag": "{{name}} {{percent}}%",
    "partnerSumError": "Partner shares total {{sum}}% — must not exceed 100%",
    "partnerDupError": "Each partner can be added only once"
```
Add a new top-level block (e.g. right after the `roles` block):
```json
  "customerTypes": {
    "BUYER": "Buyer",
    "SUPPLIER": "Supplier",
    "BOTH": "Buyer & supplier"
  },
```

- [ ] **Step 2: Arabic** (`src/i18n/locales/ar.json`) — same keys/positions, Arabic values

`customers.type` → `"النوع"`. `contracts.subtitle` → `"عقود البيع والشراء وبضائعها"`.
`contracts`: `typeSell "بيع"`, `typePurchase "شراء"`, `newSell "عقد بيع جديد"`,
`newPurchase "عقد شراء جديد"`, `sellTab "عقود البيع"`, `purchaseTab "عقود الشراء"`.
`items`: `partners "الشركاء"`, `partner "الشريك"`, `sharePercent "الحصة %"`,
`addPartner "إضافة شريك"`, `noPartners "لا شركاء"`, `ownShare "حصتنا: {{percent}}%"`,
`partnerTag "{{name}} {{percent}}%"`,
`partnerSumError "إجمالي حصص الشركاء {{sum}}% — يجب ألا يتجاوز 100%"`,
`partnerDupError "لا يمكن إضافة الشريك أكثر من مرة"`.
New block:
```json
  "customerTypes": {
    "BUYER": "مشترٍ",
    "SUPPLIER": "مورّد",
    "BOTH": "مشترٍ ومورّد"
  },
```

- [ ] **Step 3: Persian** (`src/i18n/locales/fa.json`) — same keys/positions, Persian values

`customers.type` → `"نوع"`. `contracts.subtitle` → `"قراردادهای فروش و خرید و کالاهای آن‌ها"`.
`contracts`: `typeSell "فروش"`, `typePurchase "خرید"`, `newSell "قرارداد فروش جدید"`,
`newPurchase "قرارداد خرید جدید"`, `sellTab "قراردادهای فروش"`, `purchaseTab "قراردادهای خرید"`.
`items`: `partners "شرکا"`, `partner "شریک"`, `sharePercent "سهم %"`,
`addPartner "افزودن شریک"`, `noPartners "بدون شریک"`, `ownShare "سهم ما: {{percent}}%"`,
`partnerTag "{{name}} {{percent}}%"`,
`partnerSumError "مجموع سهم شرکا {{sum}}٪ است — نباید از ۱۰۰٪ بیشتر شود"`,
`partnerDupError "هر شریک فقط یک‌بار قابل افزودن است"`.
New block:
```json
  "customerTypes": {
    "BUYER": "خریدار",
    "SUPPLIER": "تأمین‌کننده",
    "BOTH": "خریدار و تأمین‌کننده"
  },
```

- [ ] **Step 4: Gate** — `npm run typecheck && npm run lint && npm run build` (the Vite build parses the JSON; a trailing comma fails here).

- [ ] **Step 5: Commit**
```bash
git add src/i18n/locales/en.json src/i18n/locales/ar.json src/i18n/locales/fa.json
git commit -m "feat(trade): i18n for customer types, contract types, partners (en/ar/fa)"
```

---

## Task 3: Contracts page — Sell/Purchase tabs

**Files:** Modify `src/pages/contracts/ContractsPage.tsx`

- [ ] **Step 1: Add tab state + counts + filter**

Add `Tabs` to the antd import (`import { Button, Card, Input, Progress, Segmented, Table, Tabs, Tag, Typography, theme } from 'antd';`).
Add `ContractType` to the types import (`import type { ContractStatus, ContractType } from '@/types';`).
After `const [statusFilter, ...]`, add:
```ts
  const [tab, setTab] = useState<ContractType>('SELL');
```
Add counts (after the `filtered` memo or before it):
```ts
  const sellCount = (data ?? []).filter((c) => c.contractType === 'SELL').length;
  const purchaseCount = (data ?? []).filter((c) => c.contractType === 'PURCHASE').length;
```
In the `filtered` memo's returned predicate, add `&& c.contractType === tab`:
```ts
      return matchesQ && matchesStatus && c.contractType === tab;
```
and add `tab` to the memo's dependency array: `[data, search, statusFilter, tab]`.

- [ ] **Step 2: Render the tabs + pass type to the form**

Inside the `<Card …>`, immediately before the existing toolbar `<div style={{ marginBottom: 16, … }}>`, add:
```tsx
        <Tabs
          activeKey={tab}
          onChange={(k) => setTab(k as ContractType)}
          items={[
            { key: 'SELL', label: `${t('contracts.sellTab')} (${sellCount})` },
            { key: 'PURCHASE', label: `${t('contracts.purchaseTab')} (${purchaseCount})` },
          ]}
        />
```
Change the form usage to pass the active type:
```tsx
      <ContractFormModal open={formOpen} onClose={() => setFormOpen(false)} contractType={tab} />
```

- [ ] **Step 3: Gate** — `npm run typecheck && npm run lint && npm run build`.

- [ ] **Step 4: Commit**
```bash
git add src/pages/contracts/ContractsPage.tsx
git commit -m "feat(trade): Sell/Purchase tabs on the contracts page"
```

---

## Task 4: Role-aware contract dialog

**Files:** Modify `src/pages/contracts/ContractFormModal.tsx`

- [ ] **Step 1: Imports + props + derived type**

Add `Tag` to the antd import (`import { App, DatePicker, Form, Input, Modal, Select, Tag } from 'antd';`).
Add types: `import type { Contract, ContractStatus, ContractType, CustomerType } from '@/types';`.
Add a prop to `ContractFormModalProps`:
```ts
  /** Contract direction for a new contract (ignored on edit, which keeps its own). */
  contractType?: ContractType;
```
Destructure `contractType` in the component params. After `const isEdit = !!contract;`, add:
```ts
  const type: ContractType = contract?.contractType ?? contractType ?? 'SELL';
  const allowed: CustomerType[] = type === 'SELL' ? ['BUYER', 'BOTH'] : ['SUPPLIER', 'BOTH'];
  const customerOptions = (() => {
    const list = (customers ?? []).filter((c) => allowed.includes(c.customerType));
    // On edit, keep the current customer selectable even if filtered out.
    if (contract && !list.some((c) => c.id === contract.customerId)) {
      const cur = (customers ?? []).find((c) => c.id === contract.customerId);
      if (cur) return [cur, ...list];
    }
    return list;
  })();
```

- [ ] **Step 2: Title, type tag, customer options, persist**

Change the modal `title` to:
```tsx
      title={isEdit ? t('contracts.editContract') : type === 'SELL' ? t('contracts.newSell') : t('contracts.newPurchase')}
```
Inside the `<Form …>`, as the **first** child (before the customer `Form.Item`), add the
read-only type tag:
```tsx
        <Tag
          color={type === 'SELL' ? 'green' : 'blue'}
          style={{ marginBottom: 16, borderRadius: 6, fontWeight: 600, padding: '2px 10px' }}
        >
          {type === 'SELL' ? t('contracts.typeSell') : t('contracts.typePurchase')}
        </Tag>
```
Change the customer `Select` options to `customerOptions`:
```tsx
            options={customerOptions.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))}
```
In `submit`, add `contractType: type,` to the `ContractInput` object.

- [ ] **Step 3: Gate** — `npm run typecheck && npm run lint && npm run build`.

- [ ] **Step 4: Commit**
```bash
git add src/pages/contracts/ContractFormModal.tsx
git commit -m "feat(trade): role-aware contract dialog (type header + filtered customers)"
```

---

## Task 5: Contract detail — remove containers, type tag, partners column

**Files:** Modify `src/pages/contracts/ContractDetailPage.tsx`

- [ ] **Step 1: Drop the containers wiring**

- Remove the `Containers` `<Card …>` block (the one titled `${t('containers.title')} · …`,
  containing the `<Table<ContainerRow> …>`).
- Remove the `<ContainerFormModal … />` JSX at the bottom.
- Remove `const [containerForm, setContainerForm] = useState…` and
  `const { data: containers } = useContainersByContract(contractId);`.
- Remove `containerColumns` (the whole `const containerColumns: ColumnsType<ContainerRow> = […]`).
- Remove imports that are now orphaned: `useContainersByContract` (keep `useContract`),
  `import type { ContainerRow } from '@/services/api';`, and
  `import { ContainerFormModal } from './ContainerFormModal';`.
- **Keep** `formatDate` (still used by the Descriptions date field) and all other imports.

- [ ] **Step 2: Add partners resolution + type tag**

Add `usePartners` to the queries import (`import { useContract, usePartners } from '@/services/queries';`).
Inside the component, add:
```ts
  const { data: partners } = usePartners();
  const partnerName = (id: string) => partners?.find((p) => p.id === id)?.name ?? id;
  const isPurchase = contract?.contractType === 'PURCHASE';
```
In the `PageHeader` `title` `<Space wrap>`, after the status `StatusTag`, add the type tag:
```tsx
            {contract && (
              <Tag color={contract.contractType === 'SELL' ? 'green' : 'blue'}>
                {t(contract.contractType === 'SELL' ? 'contracts.typeSell' : 'contracts.typePurchase')}
              </Tag>
            )}
```

- [ ] **Step 3: Add the Partners column (purchase only)**

Add `Space` to the antd import if not present (it is). Define the column object just before
`const itemColumns: ColumnsType<Item> = [`:
```tsx
  const partnersColumn = {
    title: t('items.partners'),
    key: 'partners',
    width: 260,
    render: (_: unknown, r: Item) => {
      if (!r.partners || r.partners.length === 0) return <Text type="secondary">—</Text>;
      const sum = r.partners.reduce((s, p) => s + p.percent, 0);
      return (
        <Space size={[4, 4]} wrap>
          {r.partners.map((p) => (
            <Tag key={p.partnerId} color="blue">
              {t('items.partnerTag', { name: partnerName(p.partnerId), percent: p.percent })}
            </Tag>
          ))}
          <Tag>{t('items.ownShare', { percent: 100 - sum })}</Tag>
        </Space>
      );
    },
  };
```
Insert it into `itemColumns` immediately before the final `actions` column object using a
conditional spread:
```tsx
    ...(isPurchase ? [partnersColumn] : []),
    {
      title: t('common.actions'),
      key: 'actions',
      …
```
Bump the goods table `scroll={{ x: 1410 }}` to `scroll={{ x: isPurchase ? 1670 : 1410 }}`.

- [ ] **Step 4: Pass the contract type to the goods form**

Change the `<ItemFormModal … />` usage to add `contractType={contract?.contractType}`:
```tsx
      <ItemFormModal
        open={itemForm.open}
        onClose={() => setItemForm((s) => ({ ...s, open: false }))}
        contractId={contractId}
        item={itemForm.item}
        contractType={contract?.contractType}
      />
```

- [ ] **Step 5: Gate** — `npm run typecheck && npm run lint && npm run build`. Confirm no
  unused-import errors (the orphaned container imports are gone; `formatDate` stays).

- [ ] **Step 6: Commit**
```bash
git add src/pages/contracts/ContractDetailPage.tsx
git commit -m "feat(trade): contract detail — hide containers, type tag, partners column"
```

---

## Task 6: Goods form — partner allocations (purchase)

**Files:** Modify `src/pages/contracts/ItemFormModal.tsx`

- [ ] **Step 1: Imports, props, form value**

Add `Button` to the antd import.
Add icons: `import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';`.
Add `usePartners` to the queries import.
Add `ItemPartner, ContractType` to the types import
(`import type { ContractType, Incoterm, Item, ItemPartner, ItemStatus } from '@/types';`).
Add `partners: ItemPartner[];` to the `ItemFormValues` interface.
Add a prop to `ItemFormModalProps`:
```ts
  /** Direction of the parent contract; the partner section shows only for PURCHASE. */
  contractType?: ContractType;
```
Destructure `contractType` and add:
```ts
  const isPurchase = contractType === 'PURCHASE';
  const { data: partnerList } = usePartners();
```

- [ ] **Step 2: Seed `partners` into initialValues + live own-share**

In `initialValues`, edit branch — add `partners: item.partners ?? [],`.
In `initialValues`, create branch — add `partners: [],`.
Near the other `Form.useWatch` calls, add:
```ts
  const partnersWatch = Form.useWatch('partners', form) as ItemPartner[] | undefined;
  const partnerSum = (partnersWatch ?? []).reduce((s, p) => s + (Number(p?.percent) || 0), 0);
```

- [ ] **Step 3: Validate + persist partners in `submit`**

Replace the `submit` body's input-build + validation. After `values = await form.validateFields();`
(which enforces per-row required rules), add before building `input`:
```ts
    const partnerRows = isPurchase
      ? (values.partners ?? []).filter((p) => p?.partnerId && typeof p.percent === 'number')
      : [];
    if (isPurchase) {
      const ids = partnerRows.map((p) => p.partnerId);
      if (new Set(ids).size !== ids.length) {
        message.error(t('items.partnerDupError'));
        return;
      }
      const sum = partnerRows.reduce((s, p) => s + p.percent, 0);
      if (sum > 100) {
        message.error(t('items.partnerSumError', { sum }));
        return;
      }
    }
```
Add `partners: partnerRows,` to the `input: ItemInput` object.

- [ ] **Step 4: Render the partner section (purchase only)**

Insert this block right after the `notes` `Form.Item` and before the price-preview `<div>`:
```tsx
        {isPurchase && (
          <div style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 8 }}>
              {t('items.partners')}
            </Text>
            <Form.List name="partners">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((field) => (
                    <Row gutter={8} key={field.key} align="top" style={{ marginBottom: 4 }}>
                      <Col flex="auto">
                        <Form.Item
                          name={[field.name, 'partnerId']}
                          rules={[{ required: true, message: t('common.required') }]}
                          style={{ marginBottom: 0 }}
                        >
                          <Select
                            showSearch
                            optionFilterProp="label"
                            placeholder={t('items.partner')}
                            options={(partnerList ?? []).map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))}
                          />
                        </Form.Item>
                      </Col>
                      <Col flex="130px">
                        <Form.Item
                          name={[field.name, 'percent']}
                          rules={[{ required: true, message: t('common.required') }]}
                          style={{ marginBottom: 0 }}
                        >
                          <InputNumber min={1} max={100} placeholder={t('items.sharePercent')} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col flex="32px">
                        <Button type="text" icon={<MinusCircleOutlined />} onClick={() => remove(field.name)} />
                      </Col>
                    </Row>
                  ))}
                  <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} block style={{ marginTop: 4 }}>
                    {t('items.addPartner')}
                  </Button>
                </>
              )}
            </Form.List>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
              {t('items.ownShare', { percent: Math.max(100 - partnerSum, 0) })}
            </Text>
          </div>
        )}
```

- [ ] **Step 5: Gate** — `npm run typecheck && npm run lint && npm run build`.

- [ ] **Step 6: Commit**
```bash
git add src/pages/contracts/ItemFormModal.tsx
git commit -m "feat(trade): partner allocations on purchase-contract goods"
```

---

## Task 7: Verification (no code)

- [ ] **Step 1: Gate clean** — `npm run typecheck && npm run lint && npm run build`.

- [ ] **Step 2: Live preview** (port 3031, logged in as Manager `amir@finora.app`/`demo1234`):
  - Contracts page shows **Sell contracts (n) / Purchase contracts (n)** tabs; switching filters the table; search + status still work within a tab.
  - New contract on **Sell** → title "New sell contract", green tag, customer list = Buyer + Buyer&supplier only. On **Purchase** → "New purchase contract", blue tag, customer list = Supplier + Buyer&supplier.
  - Open a **purchase** contract → goods table has a **Partners** column with `Name %` tags + `Own share: N%`; a sell contract has **no** partner column.
  - Add goods on a purchase contract → partner section visible; add 2 partners (e.g. 30 + 25) → "Own share: 45%"; same partner twice is blocked; sum > 100 blocked; a half-filled row is blocked.
  - **Edit a seeded purchase line** → its partner tags are **prefilled** and survive a no-op save (change only premium → partners intact).
  - Contract detail shows **no containers** section; the global Containers page still works.
  - **Determinism:** in the page console, `(await import('/src/services/api.ts')).getAccount('cust-am')` and `('cust-ng')` return the **same `creditLimit`** as before this feature (e.g. cust-am 2_750_000) — proves the post-pass ordering is correct and the Customer Portal is unaffected.
  - Alco `AM-P-251101156` is a **Sell** contract; its goods/pricing unchanged.
  - Toggle dark/light + ar/fa (RTL): tabs, dialog tag, partner column wrap, and own-share read correctly.

---

## Self-review (against the spec)

**Coverage:** customerType (T1 §2) · contractType (T1 §3–4) · Partner entity + allocations (T1 §5–6) · DTO/persistence + getPartners (T1 §7) · usePartners (T1 §8) · i18n incl. subtitle reword + interpolated keys (T2) · Sell/Purchase tabs (T3) · role-aware dialog with type tag + filtered/union customers (T4) · hide containers + type tag + partners column (T5) · partner Form.List + ≤100/duplicate/required validation + edit prefill (T6) · verification incl. determinism + edit-prefill + RTL (T7). ✓

**Determinism:** partner post-pass appended after the credit-limit `forEach` (T1 §6), pinned iteration over live arrays; no `rnd()` in contractType derivation (T1 §3). ✓

**Green commits:** entity fields required → all literals updated in T1; DTO fields optional with defaults → ContractFormModal/ItemFormModal compile before their UI tasks. ✓

**Type consistency:** `CustomerType`/`ContractType`/`Partner`/`ItemPartner` names identical across T1–T6; `contractType` prop threaded ContractsPage→ContractFormModal and ContractDetailPage→ItemFormModal; `usePartners`/`getPartners`/`qk.partners` consistent. ✓

**Placeholders:** none.
