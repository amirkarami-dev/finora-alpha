# Customer Portal — Design Spec

**Date:** 2026-06-15
**Branch:** `claude/awesome-turing-b8ven2`
**Status:** Approved (design), pending plan

## 1. Goal

Add a **`Customer`** role to Finora: an external client of the metals-trading desk
who logs in and sees **only their own account** — a single self-service
**"My Account"** dashboard with accounts-receivable / credit KPIs (grounded in the
`financial-analyst` skill's receivables lens). Seed one sample Customer login mapped
to an existing seeded customer (**Alco Metal Trading / `cust-am`**).

This extends the existing RBAC system (CEO / Manager / Staff) and adds one new
dimension the earlier roles did not need: **per-customer data scoping**.

## 2. Scope & non-goals

**In scope**
- New `Customer` role wired through the existing RBAC (`config/roles.ts`, auth store,
  `RoleRoute`, `SidebarNav`, `AppHeader`, `LoginPage`).
- One scoped route + page: `/app/portal` → `CustomerPortalPage` ("My Account").
- `creditLimit` field on `Customer` (deterministic seed) to enable credit-utilization KPIs.
- One scoped API function + query hook returning everything the page needs.
- i18n in **en / ar / fa** (RTL-safe).
- A seeded sample Customer user.

**Non-goals (YAGNI)**
- No create/edit/delete from the portal — **read-only**.
- No separate "Financial Analyst" staff role (explicitly deferred).
- No dedicated Customer settings page — theme/language already live in the header.
- No second customer login, no real authentication/security (data is mock).
- No "average days-to-pay" KPI — payments are not invoice-linked and there is no
  per-invoice paid-date, so it cannot be computed honestly. Timeliness is expressed
  via **aging** + **on-time share** instead.

## 3. Data scoping approach

Auth is mock, so "row-level scoping" is achieved by:
1. Storing the user's `customerId` on the authenticated user.
2. The portal page/hook reading API data **filtered by that `customerId`**.
3. `RoleRoute` blocking every non-portal route for the `Customer` role (a Customer
   who types `/app/customers` is redirected to `/app/portal`).

A generic "data-filter context" was considered and rejected as overkill for a single
scoped page.

## 4. RBAC changes

### 4.1 Types (`src/types/index.ts`)
- `Role` union → add `'Customer'`: `'CEO' | 'Manager' | 'Staff' | 'Customer'`.
- `Customer` interface → add `creditLimit: number` (USD).

### 4.2 Auth (`src/store/useAuthStore.ts`)
- `AuthUser` → add `customerId?: string` (set only for `Customer` users).
- `login(email, password)` already matches `USERS` case-insensitively and validates the
  password; when the matched seeded user has a `customerId`, copy it onto the `AuthUser`.
- Persist `merge` already coerces role via `normalizeRole`; ensure `customerId` survives
  rehydration (it is part of the persisted `user` object — no extra work beyond keeping
  the field on `AuthUser`).

### 4.3 Roles config (`src/config/roles.ts`)
- `ROLE_ACCESS.Customer = ['portal']` — **only** the portal route key.
- `ROLE_HOME.Customer = ROUTES.portal`.
- `normalizeRole` valid-list → include `'Customer'` (still defaults unknown → `'Manager'`).
- `SeededUser` → add optional `customerId?: string`.
- `USERS` → append:
  ```ts
  { email: 'portal@alcometal.ae', password: 'Alco@2026', role: 'Customer',
    name: 'Alco Metal Trading', customerId: 'cust-am', avatarColor: '#b87333' }
  ```
- `NAV_ITEMS` → append `{ key: 'portal', route: ROUTES.portal, icon: 'wallet', group: 'main' }`.
  (A single-item `main` group is already an accepted pattern — CEO's `main` group holds
  only Executive.)

### 4.4 Routes (`src/config/constants.ts`, `src/routes/index.tsx`)
- `ROUTES.portal = '/app/portal'` (this auto-extends `RouteKey`, since `RouteKey` is
  derived from `ROUTES` keys minus `landing | login | app`).
- Add a guarded route `<RoleRoute routeKey="portal"><CustomerPortalPage/></RoleRoute>`.
- `RoleHome` index redirect already uses `ROLE_HOME[role]`, so a Customer landing on
  `/app` is sent to `/app/portal` automatically.

### 4.5 Chrome
- `SidebarNav` → add `wallet → <WalletOutlined/>` to its `ICONS` map. The menu already
  filters by `ROLE_ACCESS[role]`, so a Customer sees exactly one item: **My Account**.
- `AppHeader` → already renders `t('roles.' + normalizeRole(role))`; add `roles.Customer`
  to i18n (Section 7).
- `LoginPage` → already maps `USERS` to clickable account chips and lands via
  `ROLE_HOME[user.role]`; the new seeded user appears automatically.

## 5. Data layer

### 5.1 `creditLimit` seed (`src/mock/data.ts`)
After contracts/containers are built, run a **deterministic post-pass** assigning each
customer a `creditLimit` using the existing seeded PRNG instance (appending draws at the
end does not disturb earlier sequence):

```
for each customer:
  invoiced    = Σ invoiceUSD of their containers
  outstanding = Σ invoiceUSD of their non-PAID containers
  base = max(outstanding, invoiced * 0.4, 100_000)
  util = 0.50 + rng() * 0.35          // 0.50–0.85
  creditLimit = ceilTo(base / util, 250_000)   // round UP to nearest 250k
```

This yields believable utilization (~50–85% where outstanding drives the base), always
below 100%, with per-customer variety.

### 5.2 API (`src/services/api.ts`)
Add `getCustomerPortalSummary(customerId): Promise<CustomerPortalSummary>` reusing
`computeAccounts`, `buildInvoices`, and the existing per-customer payment/contract
filters. Aging and DSO use the **same pinned "today" = `dayjs('2026-06-13')`** the rest
of `api.ts` uses, for determinism.

```ts
export interface CustomerPortalSummary {
  // identity
  customerId: string;
  name: string;
  code: string;
  country: string;
  defaultCurrency: Customer['defaultCurrency'];
  paymentTermsDays: number;
  // headline KPIs (USD)
  totalInvoiced: number;
  totalPaid: number;
  outstanding: number;
  overdue: number;
  // ratios
  settlementRatePct: number;     // paid / invoiced * 100
  dsoDays: number;               // (outstanding / invoiced) * 365, rounded
  onTimeSharePct: number;        // current-bucket / outstanding * 100
  // credit
  creditLimit: number;
  creditUtilizationPct: number;  // outstanding / creditLimit * 100
  availableCredit: number;       // max(creditLimit - outstanding, 0)
  // breakdowns
  aging: AgingBucket[];          // scoped: current/days30/days60/days90/days90plus
  series: TimeSeriesPoint[];     // scoped 12-mo invoiced vs collected
  openInvoices: Invoice[];       // their non-PAID invoices (sorted by dueDate asc)
  recentPayments: PaymentRow[];  // their payments (date desc)
  contractsTotal: number;
  contractsActive: number;
  contractsValue: number;        // Σ contractValue of their contracts (USD)
}
```

Guard: if `customerId` matches no customer, return `undefined` (page shows a 404/empty
`Result`). Division guards: any `/ invoiced` or `/ creditLimit` returns `0` when the
denominator is `0`.

### 5.3 Query hook (`src/services/queries.ts`)
- `qk.customerPortal = (id) => ['customerPortal', id]`.
- `useCustomerPortal(id) = useQuery({ queryKey: qk.customerPortal(id), queryFn: () =>
  api.getCustomerPortalSummary(id), enabled: !!id })`.

## 6. The "My Account" page (`src/pages/portal/CustomerPortalPage.tsx`)

Reads `customerId` from `useAuthStore(s => s.user?.customerId)`; if absent, render a
`Result` empty state. Otherwise `useCustomerPortal(customerId)`. Reuses
`PageHeader`, the executive dashboard's `StatCard`, `Money`, `StatusTag`, and the chart
components (`BarChart`, `DonutChart`, `CashflowChart`) with a local `ChartCard` helper
(same pattern as `ExecutiveDashboardPage`).

Layout (RTL-safe, responsive `Row/Col`):
1. **PageHeader** — title = customer name, subtitle = `portal.subtitle`; trailing
   account-standing `Tag`: `portal.standingGood` (overdue = 0) or `portal.standingAttention`.
2. **KPI row** — four `StatCard`s: Outstanding (info) · Overdue (danger) · Available
   Credit (success) · Settlement rate % (primary).
3. **Health strip** — a card with three blocks: **DSO** (footer `portal.termsDays` with
   `paymentTermsDays`) · **Credit utilization** (`Progress` bar: used / limit, plus
   available) · **On-time share %**.
4. **Charts** — `ChartCard` Receivables aging (`BarChart`, multicolor by severity) +
   `ChartCard` Paid-vs-Outstanding (`DonutChart`, center = outstanding); then a
   full-width `ChartCard` Invoiced-vs-Collected (`CashflowChart`, scoped `series`).
5. **Tabs card** — `Open invoices` / `Payments` / `Contracts`, each a scoped `Table`.
   - Open invoices columns: reference, product, amount (`Money`), due date, days overdue
     (computed vs pinned today), status (`StatusTag`).
   - Payments columns: reuse the `CustomerDetailPage` payment columns (date, amount,
     amountUSD, method, reference).
   - Contracts columns: reuse the `CustomerDetailPage` contract columns (id, date,
     destination, quantity, value, status) — **non-clickable** (Customer has no contract
     detail route).

## 7. i18n (`src/i18n/locales/{en,ar,fa}.json`)

Add to all three, RTL-safe, reusing existing `payments.*` / `contracts.*` / `invoices.*`
/ `common.*` column keys where possible:
- `roles.Customer`
- `nav.portal` ("My Account")
- `portal.*`: `subtitle`, `standingGood`, `standingAttention`, `outstanding`, `overdue`,
  `availableCredit`, `settlementRate`, `dso`, `termsDays` (count-aware), `creditUtilization`,
  `creditUsed`, `creditLimitLabel`, `onTimeShare`, `agingTitle`, `paidVsOutstanding`,
  `invoicedVsCollected`, `openInvoices`, `payments`, `contracts`, `daysOverdue`,
  `dueDate`, `noOpenInvoices`.

## 8. File summary

| Action | File | Responsibility |
|---|---|---|
| Modify | `src/types/index.ts` | `Role` += `'Customer'`; `Customer.creditLimit` |
| Modify | `src/config/constants.ts` | `ROUTES.portal` |
| Modify | `src/config/roles.ts` | access/home/nav/normalize/seed-user |
| Modify | `src/store/useAuthStore.ts` | `customerId` on `AuthUser` + login copy |
| Modify | `src/mock/data.ts` | deterministic `creditLimit` post-pass |
| Modify | `src/services/api.ts` | `getCustomerPortalSummary` + `CustomerPortalSummary` |
| Modify | `src/services/queries.ts` | `qk.customerPortal` + `useCustomerPortal` |
| Modify | `src/routes/index.tsx` | guarded `portal` route |
| Modify | `src/components/layout/SidebarNav.tsx` | `wallet` icon |
| Create | `src/pages/portal/CustomerPortalPage.tsx` | the My Account page |
| Modify | `src/i18n/locales/en.json` | keys |
| Modify | `src/i18n/locales/ar.json` | keys |
| Modify | `src/i18n/locales/fa.json` | keys |

## 9. Verification

No component test framework exists. Gate every task with:
```
npm run typecheck && npm run lint && npm run build
```
Then live preview (port 3031):
- Log in as `portal@alcometal.ae` / `Alco@2026` → lands on `/app/portal`.
- Sidebar shows **exactly one** item ("My Account").
- KPIs/charts/tables render Alco-scoped numbers (cross-check Outstanding/Overdue against
  the admin Customer-detail view for `cust-am`).
- Navigating to `/app/customers` (admin route) redirects back to `/app/portal`.
- Toggle dark/light and ar/fa (RTL) — layout holds.

## 10. Success criteria

- Build + lint + typecheck clean.
- Customer sees only their own data and only the "My Account" menu item.
- Credit-utilization, DSO, aging, settlement-rate, on-time-share all render with sane,
  deterministic values for Alco.
- Existing roles (CEO/Manager/Staff) are unaffected.
