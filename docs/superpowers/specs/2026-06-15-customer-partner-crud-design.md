# Customers & Partners CRUD — Design Spec

**Date:** 2026-06-15
**Branch:** `claude/awesome-turing-b8ven2`
**Status:** Approved (design), pending plan

## 1. Goal

Make **Customers** and **Partners** fully manageable from the UI: create, edit, and
**deactivate / reactivate** (soft delete via an `active` flag). Add a dedicated **Partners**
management page (route + nav + RBAC). Inactive records are hidden from the pickers that feed
new work (contract customer dropdown; goods partner select) but remain referenced by existing
data.

## 2. Scope & non-goals

**In scope**
- `active: boolean` on `Customer` and `Partner` (seeded `true`).
- `CustomerFormModal` (create + edit) wired into the Customers page and the Customer detail page.
- Customers page: Active/Inactive/All filter, New button, per-row Edit + Activate/Deactivate.
- New **Partners** page + `PartnerFormModal` (create + edit) + Active/Inactive/All filter + row actions.
- Routing/nav/RBAC for the Partners page (Operations group; Manager + Staff).
- API CRUD + active toggles; query mutation hooks + invalidation.
- Exclude inactive customers from the contract create dropdown and inactive partners from the
  goods partner select.
- i18n (en/ar/fa, RTL-safe).

**Non-goals (YAGNI)**
- No hard delete. No cascade — deactivating a customer keeps its contracts; deactivating a
  partner keeps existing goods allocations (names still resolve).
- No Partner detail page (list-only).
- `code` is immutable after creation (the entity id derives from it).
- No new-customer creation of contracts in the same flow (separate features).

## 3. Data model (`src/types/index.ts`)

- `Customer` → add `active: boolean;` (after `customerType`).
- `Partner` → add `active: boolean;` (after `code`).
- `CustomerAccount extends Customer` already, so `active` flows through `computeAccounts`'
  `...customer` spread automatically.

## 4. API (`src/services/api.ts`)

Follow the existing mutation pattern (mutate `db`, then `reindex()` where lookup maps depend
on the change). `getCustomers()` and `getPartners()` keep returning **all** rows (active +
inactive); callers filter.

### 4.1 Customers
```ts
export interface CustomerInput {
  name: string;
  code: string;
  defaultCurrency: Currency;
  customerType: CustomerType;
  contactName?: string;
  email?: string;
  phone?: string;
  country?: string;
  paymentTermsDays: number;
  creditLimit: number;
}

export async function createCustomer(input: CustomerInput): Promise<Customer>;
// normalize code = input.code.trim().toUpperCase(); id = `cust-${code.toLowerCase()}`;
// if any existing customer shares that id, throw new Error('duplicate-code'); store the
// NORMALIZED code (so it matches the id basis AND the nextContractId `${code}-P-…`
// uppercase/no-space convention); active: true; createdAt: dayjs().toISOString();
// trim free-text fields; push to db.customers; reindex(); return the new customer.

export async function updateCustomer(id: string, input: CustomerInput): Promise<Customer>;
// MUTATE the existing db.customers object IN PLACE (like updateContract): update name,
// defaultCurrency, customerType, contactName, email, phone, country, paymentTermsDays,
// creditLimit (all trimmed). NEVER reassign .id / .code / .createdAt — so contract.customerId
// and payment.customerId joins stay valid. reindex(); return it.

export async function setCustomerActive(id: string, active: boolean): Promise<Customer>;
// find the existing object by id; set .active; return it. (No reindex needed — no map
// depends on `active`.)
```

### 4.2 Partners
```ts
export interface PartnerInput {
  name: string;
  code: string;
}

export async function createPartner(input: PartnerInput): Promise<Partner>;
// normalize code = input.code.trim().toUpperCase(); id = `ptnr-${code.toLowerCase()}`;
// throw 'duplicate-code' on id collision; store the normalized code; active: true; trim name;
// push to db.partners; return it.

export async function updatePartner(id: string, input: PartnerInput): Promise<Partner>;
// find the existing object by id (throw if missing); update name (trimmed); NEVER touch
// .id / .code; return it.

export async function setPartnerActive(id: string, active: boolean): Promise<Partner>;

// No reindex() is needed for any partner mutation — no lookup map in api.ts indexes partners;
// usePartners() (qk.partners) is the only partner-derived read, refreshed via invalidation.
```

## 5. Queries (`src/services/queries.ts`)

Add mutation hooks. Customer mutations invalidate the customer-derived reads; partner
mutations invalidate `partners`.
```ts
// customers
useCreateCustomer / useUpdateCustomer / useSetCustomerActive
//   onSuccess → invalidate qk.customers, qk.accounts, qk.kpis, qk.executiveSummary
//   useUpdateCustomer & useSetCustomerActive ALSO invalidate qk.account(id) AND
//   qk.customerPortal(id) — the Customer-portal view reads name/code/country/currency/terms/
//   creditLimit, so without this it shows stale data after an edit/deactivate.
// partners
useCreatePartner / useUpdatePartner / useSetPartnerActive
//   onSuccess → invalidate qk.partners
```
(`qk.customers`, `qk.accounts`, `qk.account`, `qk.kpis`, `qk.executiveSummary`,
`qk.customerPortal`, `qk.partners` already exist.)

**KPI policy (explicit):** the dashboard/executive `customers` count and the Top-customers
list intentionally keep including inactive customers (soft-delete = still a customer) — no
change to `getKpis` / `getExecutiveSummary` / `getAccounts`.

## 6. Customers page (`src/pages/customers/CustomersPage.tsx`)

- Add `const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active')`
  rendered as an AntD `Segmented`. Pin the options to value order
  **`['active','inactive','all']`** (labels `common.active` / `common.inactive` / `common.all`),
  default `'active'`. The `filtered` memo keeps a row when
  `(statusFilter === 'all' || (statusFilter === 'active' ? a.active : !a.active))` AND it matches
  the search. (Relies on `CustomerAccount.active` from §3 + the §13 seed — those land first so
  the build fails loudly rather than blanking the list.)
- Wire the existing **New customer** button to open `CustomerFormModal` (create) instead of
  `message.info(comingSoon)`.
- Add an **Actions** column (fixed right) with
  `onCell={() => ({ onClick: (e) => e.stopPropagation() })}` (so the whole cell is inert to the
  row's navigate `onClick`): an **Edit** link (opens `CustomerFormModal` with the account) and an
  Activate/Deactivate `Popconfirm` (`setCustomerActive`). Keep `e.stopPropagation()` on the Edit
  handler too.
- Show a muted inactive tag next to the name when `!a.active`, via
  `<Tag>{t('common.inactive')}</Tag>` (no hard-coded string).
- Render `<CustomerFormModal open={...} onClose={...} customer={editing} />` (state holds the
  row being edited, or undefined for create).

## 7. CustomerFormModal (`src/pages/customers/CustomerFormModal.tsx`, new)

AntD `Modal` + `Form` using the established pattern (`key`, `initialValues`,
`destroyOnHidden`, `App.useApp()` messages, `preserve={false}`). Props: `{ open, onClose,
customer?: CustomerAccount | Customer }`. Fields (two-column `Row/Col`):
- Labels use dedicated keys (NOT the table-header `customers.name`/`customers.terms`):
  `name` (Input, label `customers.nameLabel`, required), `code` (Input, label `customers.code`,
  required, **`disabled` on edit**, rule `{ pattern: /^[A-Za-z0-9-]+$/, message:
  t('customers.codeInvalid') }`), `customerType` (Select via `customerTypes.*`, required),
  `defaultCurrency` (Select USD/AED, required), `contactName` (Input), `email` (Input, optional,
  rule `{ type: 'email', message: t('customers.emailInvalid') }`), `phone` (Input), `country`
  (Input), `paymentTermsDays` (InputNumber min 0, label `customers.termsLabel`, required),
  `creditLimit` (InputNumber min 0 step 1000, label `customers.creditLimit`, required).
- Create defaults: `{ defaultCurrency: 'AED', customerType: 'BUYER', paymentTermsDays: 30,
  creditLimit: 0 }`.
- Submit: **trim** all free-text fields (name, code, contactName, email, phone, country) when
  building `CustomerInput`; `createCustomer`/`updateCustomer`. On create, **catch
  `'duplicate-code'`** and surface it as a field error on `code`
  (`form.setFields([{ name: 'code', errors: [t('customers.codeTaken')] }])`) rather than a
  toast. Success → `message.success(t('customers.created'|'customers.updated'))`, close,
  invalidate (via the hook).

## 8. Customer detail page (`src/pages/customers/CustomerDetailPage.tsx`)

- Add an **Edit** button to the `PageHeader` `extra` (opens `CustomerFormModal` with the
  account; on success the page's `useAccount` refetches via invalidation).
- When `account && !account.active`, render `<Tag>{t('common.inactive')}</Tag>` near the title.

## 9. Partners page (`src/pages/partners/PartnersPage.tsx`, new) + `PartnerFormModal`

- **PartnersPage**: `PageHeader` (title `partners.title`, subtitle `partners.subtitle`, New
  button) + `Card` with a `Segmented` filter (value order `['active','inactive','all']`,
  default `'active'`) and a `Table` (columns: name; code (monospace `Tag`); a status cell that
  shows `<Tag>{t('common.inactive')}</Tag>` when `!p.active`; Actions). The Actions column uses
  `onCell={() => ({ onClick: (e) => e.stopPropagation() })}` = Edit + Activate/Deactivate
  `Popconfirm`. Data via `usePartners()` filtered by the status filter. List-only (no detail page).
- **PartnerFormModal** (`src/pages/partners/PartnerFormModal.tsx`, new): Modal + Form with
  `name` (required, trimmed) and `code` (required, **disabled on edit**, rule
  `{ pattern: /^[A-Za-z0-9-]+$/, message: t('partners.codeInvalid') }`, trimmed). Submit →
  `createPartner`/`updatePartner`; duplicate-code → field error on `code`
  (`partners.codeTaken`); success `partners.created`/`partners.updated`.

## 10. Routing / Nav / RBAC

Apply in this order so `RouteKey` (derived from `ROUTES`) includes `'partners'` before it's referenced:
1. `src/config/constants.ts`: `ROUTES.partners = '/app/partners'`.
2. `src/config/roles.ts`: `NAV_ITEMS` += `{ key: 'partners', route: ROUTES.partners, icon:
   'apartment', group: 'operations' }`; `ROLE_ACCESS` — add `'partners'` to **Manager** and
   **Staff** (not CEO, not Customer).
3. `src/components/layout/SidebarNav.tsx`: import `ApartmentOutlined`, add `apartment:
   <ApartmentOutlined />` to `ICONS`. (The `icon` string is unchecked — a missing `apartment`
   entry renders no icon silently, so add it in the same task as the NAV_ITEMS entry.)
4. `src/routes/index.tsx`: import `PartnersPage`; add (keep the `RoleRoute` wrapper verbatim so
   direct-URL access is guarded):
   `<Route path="partners" element={<RoleRoute routeKey="partners"><PartnersPage /></RoleRoute>} />`.

## 11. Dropdown exclusions

- `src/pages/contracts/ContractFormModal.tsx`: base filter becomes
  `allowed.includes(c.customerType) && c.active`. **Keep the existing edit-mode union exactly
  as-is** — the current-customer re-add (`(customers ?? []).find(c => c.id === contract.customerId)`
  prepended when absent from the filtered list) must keep pulling from the **unfiltered**
  `customers` list, so an inactive (or wrong-type) customer on an existing contract stays
  selectable. Do NOT active-filter that `.find`.
- `src/pages/contracts/ItemFormModal.tsx`: build the partner option pool as active partners
  **plus any partner already allocated on the line being edited** (so an inactive-but-allocated
  partner stays selectable with its label and is not dropped on save), then apply the existing
  exclude-already-chosen-in-other-rows filter on top:
  `(partnerList ?? []).filter((p) => p.active || (item?.partners ?? []).some((ap) => ap.partnerId === p.id))`.
  The `ContractDetailPage` partner-name resolver keeps using the full `usePartners()` list so
  inactive allocations still render their name.

## 12. i18n (`src/i18n/locales/{en,ar,fa}.json`, RTL-safe)

- `common`: `active`, `inactive`, `activate`, `deactivate`, `deactivateConfirm`,
  `activateConfirm`.
- `customers`: `nameLabel` ("Name"), `termsLabel` ("Payment terms (days)"), `creditLimit`,
  `editCustomer`, `created`, `updated`, `deactivated`, `activated`, `status`, `codeTaken`,
  `codeInvalid`, `emailInvalid`, `namePlaceholder`, `codePlaceholder`, `emailPlaceholder`,
  `phonePlaceholder`, `countryPlaceholder`. (Reuse existing `customers.{code,currency,contact,
  country,type}` and `customerTypes.*`; do **not** reuse `customers.name`/`customers.terms` as
  form labels — those are table headers.)
- new `partners` block: `title`, `subtitle`, `newPartner`, `editPartner`, `name`, `code`,
  `created`, `updated`, `deactivated`, `activated`, `codeTaken`, `codeInvalid`,
  `namePlaceholder`, `codePlaceholder`.
- `nav.partners`.

## 13. File summary

| Action | File | Responsibility |
|---|---|---|
| Modify | `src/types/index.ts` | `active` on Customer + Partner |
| Modify | `src/mock/data.ts` | seed `active: true` on customer literal + partner map |
| Modify | `src/services/api.ts` | Customer/Partner CRUD + active toggles |
| Modify | `src/services/queries.ts` | 6 mutation hooks + invalidation |
| Create | `src/pages/customers/CustomerFormModal.tsx` | create/edit customer |
| Modify | `src/pages/customers/CustomersPage.tsx` | filter, New, row actions, inactive tag |
| Modify | `src/pages/customers/CustomerDetailPage.tsx` | Edit button + inactive tag |
| Create | `src/pages/partners/PartnersPage.tsx` | partners list + actions |
| Create | `src/pages/partners/PartnerFormModal.tsx` | create/edit partner |
| Modify | `src/config/constants.ts` | `ROUTES.partners` |
| Modify | `src/config/roles.ts` | nav item + Manager/Staff access |
| Modify | `src/components/layout/SidebarNav.tsx` | `apartment` icon |
| Modify | `src/routes/index.tsx` | guarded partners route |
| Modify | `src/pages/contracts/ContractFormModal.tsx` | exclude inactive customers |
| Modify | `src/pages/contracts/ItemFormModal.tsx` | exclude inactive partners |
| Modify | `src/i18n/locales/{en,ar,fa}.json` | keys |

## 14. Verification

No component test framework. Gate each task with `npm run typecheck && npm run lint &&
npm run build`. Then live (port 3031):
- As Manager: Customers page → New customer (with a fresh code) appears in the list; a
  duplicate code shows a field error; Edit changes persist; Deactivate (confirm) → row hides
  under the Active filter, shows under Inactive/All with an "Inactive" tag; Reactivate works.
- New contract dialog: the deactivated customer is **absent** from the customer dropdown;
  editing an existing contract whose customer is inactive still shows that customer.
- Partners page exists in the sidebar (Operations) for Manager and Staff, **not** for CEO or
  the Customer portal role. CRUD + deactivate work; a deactivated partner is **absent** from
  the goods partner select, but an existing goods allocation for that partner still renders
  its name on the contract detail.
- As CEO and as the Customer-portal user, navigating **directly** to `/app/partners` redirects
  to the role home (the `RoleRoute` guard, not just sidebar hiding).
- Editing a goods line whose allocation references a now-inactive partner still shows that
  partner (with its name) in the select, and a no-op save preserves the allocation.
- Editing a customer (e.g. credit limit) and reopening that customer's My-Account portal shows
  the updated value (no stale data).
- Customer detail page has a working Edit button + inactive tag.
- Dark/light + ar/fa (RTL) hold.

## 15. Success criteria

- Build + lint + typecheck clean.
- Customers & Partners are fully create/edit/deactivate-able; inactive records are excluded
  from new-work pickers but preserved in existing data.
- Partners page is RBAC-gated to Manager + Staff.
- No regressions to existing features (contracts, goods/partners, customer portal, dashboards).
