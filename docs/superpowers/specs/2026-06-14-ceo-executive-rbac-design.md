# CEO Executive Dashboard + Role-Based Access — Design

- **Date:** 2026-06-14
- **Status:** Approved (design); pending spec review
- **Area:** `finora-alpha` (Vite + React 18 + AntD 5 + TanStack Query + Zustand; mock data, no backend)

## Context

The app has a demo auth (`useAuthStore.login(email)` accepts any credentials and returns one
user with a free-text `role: 'Finance Manager'`). `RequireAuth` only gates on session;
the sidebar and routes are static and identical for everyone. There is an operational
dashboard and a reports page, but no executive view and no role separation.

This adds **three roles (CEO / Manager / Staff)**, a **seeded CEO login**, **role-aware menu
and route guarding**, and a **CEO Executive Dashboard**.

## Goals

- Define roles `CEO`, `Manager`, `Staff` and gate menu + routes by role.
- Seed login accounts mapping credentials → role (incl. a real CEO account).
- A curated CEO experience: Executive Dashboard + Reports + Settings only.
- An Executive Dashboard with headline KPIs+growth, revenue/collections trend, top
  customers + product mix, and receivables health/aging.

## Non-goals (YAGNI)

- In-app user management UI (creating/editing users). Accounts are seeded.
- Granular per-action permissions beyond menu/route gating.
- Real backend auth / password hashing (mock, in-memory, demo).

## Roles & access

`Role = 'CEO' | 'Manager' | 'Staff'` (in `src/types`).

Access map (`ROLE_ACCESS: Record<Role, RouteKey[]>`, where `RouteKey` ∈ keys of `ROUTES`
excluding landing/login/app):

| Role | Accessible routes (menu + guard) | Home |
|---|---|---|
| **CEO** | `executive`, `reports`, `settings` | `/app/executive` |
| **Manager** | `dashboard`, `customers`, `contracts`, `containers`, `invoices`, `payments`, `reports`, `settings` | `/app/dashboard` |
| **Staff** | `dashboard`, `customers`, `contracts`, `containers`, `invoices` | `/app/dashboard` |

- `ROLE_HOME: Record<Role, string>` gives each role's landing path.
- Detail routes inherit their parent key: `customers/:id`→`customers`, `contracts/:id`→`contracts`.
- `executive` is a **new** route/key (`/app/executive`), accessible to CEO only.

## Auth — seeded accounts

`src/config/roles.ts` exports `USERS: SeededUser[]`:

```ts
interface SeededUser {
  email: string;
  password: string;
  role: Role;
  name: string;
  avatarColor: string;
}
```

| Email | Password | Role | Name |
|---|---|---|---|
| `ceo@finora.app` | `Ceo@2026` | CEO | Khalid Al Mansoori |
| `amir@finora.app` | `demo1234` | Manager | Amir Karami |
| `staff@finora.app` | `Staff@2026` | Staff | Operations Desk |

`login(email, password)` behaviour (`useAuthStore`):
1. Match `USERS` by email (case-insensitive, trimmed).
2. If matched and `password` equals the seeded password → sign in with that user's role/name/avatar.
3. If matched but password wrong → **reject** (`throw new Error('invalid')`); the login form shows an error and stays.
4. If email not in `USERS` → **demo fallback**: sign in as a `Manager` (name derived from the email), any password — preserving the demo "any login works" behaviour.

`LoginPage`: pass `values.password` to `login`; wrap `onFinish` in try/catch and show
`message.error(t('auth.invalidCredentials'))` on rejection. The demo-hint area lists the
three role accounts (so each role can be tried).

**Persisted-session migration:** existing localStorage sessions hold `role: 'Finance Manager'`
(not a valid `Role`). A `normalizeRole(value): Role` helper coerces any unknown/legacy value to
`'Manager'`; it is applied wherever the role is read (sidebar, guards, header) so old sessions
keep working as Manager.

## Executive Dashboard — `/app/executive`

New page `src/pages/executive/ExecutiveDashboardPage.tsx`. Four blocks:

1. **Headline KPIs + growth** — cards for Invoiced (revenue), Collected, Outstanding,
   Overdue, Collection rate; each with a period-over-period delta (% + up/down arrow).
2. **Revenue & collections trend** — 12-month invoiced-vs-collected (reuse `CashflowChart`).
3. **Top customers + product mix** — top customers by value/outstanding (reuse `BarChart`) and
   product-mix by volume (reuse `DonutChart`).
4. **Receivables health & aging** — aging buckets + total overdue exposure (reuse the aging chart).

Data:
- New `api.getExecutiveSummary(): Promise<ExecutiveSummary>` computes the headline figures +
  growth from `computeAccounts()` (point-in-time totals: outstanding/overdue/invoiced/collected/
  collectionRate) and the 12-month cashflow series (month-over-month % for invoiced & collected,
  comparing the latest month to the previous). Shape:

  ```ts
  interface ExecutiveSummary {
    invoiced: number;
    collected: number;
    outstanding: number;
    overdue: number;
    collectionRate: number;     // %
    invoicedGrowthPct: number;  // latest vs previous month
    collectedGrowthPct: number; // latest vs previous month
    activeContracts: number;
    customers: number;
  }
  ```
- `queries.ts`: `useExecutiveSummary` (key `qk.executiveSummary`). Other blocks reuse existing
  `useCashflow`, `useAccounts`, `useProductVolumes`, `useAging`. `qk.executiveSummary` is added to
  `useInvalidateTrade` so contract/goods/container edits keep it fresh.

The page reuses `PageHeader`, `StatCard`/`Money`/`StatusTag`, and the chart components, styled
consistently with the existing dashboard (copper theme, light/dark, RTL-safe).

## Plumbing

- **`src/types/index.ts`** — add `export type Role = 'CEO' | 'Manager' | 'Staff'`.
- **`src/config/roles.ts`** (new) — `ROLE_ACCESS`, `ROLE_HOME`, `USERS`, `normalizeRole`, and a
  `NAV_ITEMS` config (route key → group / icon-name / i18n label key) used by the sidebar.
- **`src/config/constants.ts`** — add `ROUTES.executive = '/app/executive'`.
- **`src/store/useAuthStore.ts`** — `AuthUser.role: Role`; `login(email, password)` per above;
  apply `normalizeRole` on rehydrate.
- **`src/routes/index.tsx`** — add a `RoleRoute` guard (checks `ROLE_ACCESS[role]` for a route
  key; redirects to `ROLE_HOME[role]` if not allowed); wrap each protected route; make the index
  redirect role-aware; add the `executive` route (CEO only).
- **`src/components/layout/SidebarNav.tsx`** — build menu from `NAV_ITEMS` filtered by
  `ROLE_ACCESS[role]`; add the Executive item (Main group); hide empty groups.
- **`src/components/layout/AppHeader.tsx`** — show the role label via `t('roles.'+role)`.
- **`src/pages/executive/ExecutiveDashboardPage.tsx`** (new).
- **`src/services/api.ts`** — `getExecutiveSummary`; **`src/services/queries.ts`** —
  `useExecutiveSummary` + key + invalidation.
- **`src/i18n/locales/{en,ar,fa}.json`** — `executive.*`, `roles.*`, `nav.executive`, and the
  login account-hint / `auth.invalidCredentials` keys.

## Edge cases & decisions

- Wrong password for a **seeded** email fails the login (shows error); unknown emails still
  demo-login as Manager.
- Legacy persisted role (`'Finance Manager'`) is coerced to `Manager` via `normalizeRole`.
- A user hitting a disallowed route (e.g., CEO → `/app/customers`) is redirected to their home.
- Empty nav groups (e.g., a role with no Finance items) are not rendered.
- Mock/demo only — passwords are plain seed data; this is a non-production demo.

## Testing & verification

- `npm run typecheck`, `npm run lint`, `npm run build` clean.
- Live drive (preview): log in as each account →
  - **CEO** lands on `/app/executive`, sidebar shows only Executive/Reports/Settings; the four
    blocks render with figures; navigating to `/app/customers` redirects to `/app/executive`.
  - **Manager** sees the full menu + operational pages (unchanged).
  - **Staff** sees Dashboard/Customers/Contracts/Containers/Invoices; Payments/Reports/Settings
    hidden and route-guarded.
  - Wrong CEO password → error, stays on login.
- Check light/dark and one RTL locale (`fa`) on the executive page.

## Affected files (summary)

`types/index.ts` · `config/roles.ts` (new) · `config/constants.ts` · `store/useAuthStore.ts` ·
`pages/auth/LoginPage.tsx` · `routes/index.tsx` · `components/layout/SidebarNav.tsx` ·
`components/layout/AppHeader.tsx` · `pages/executive/ExecutiveDashboardPage.tsx` (new) ·
`services/api.ts` · `services/queries.ts` · `i18n/locales/{en,ar,fa}.json`
