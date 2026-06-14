# Customer Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Customer` role with a single scoped "My Account" dashboard (receivables/credit KPIs) and a seeded sample customer login, reusing the existing RBAC + dashboard machinery.

**Architecture:** Extend the existing role system (`config/roles.ts`, auth store, `RoleRoute`, `SidebarNav`). A `Customer` user carries a `customerId`; one new API function returns everything the page needs, filtered by that id. A new `creditLimit` field (deterministic seed) unlocks credit-utilization KPIs. The page mirrors `ExecutiveDashboardPage` (StatCard + chart components + a local `ChartCard`).

**Tech Stack:** React 18 · TypeScript (strict) · Ant Design 5.29 · React Router 6 · TanStack Query 5 · Zustand · react-i18next (en/ar/fa) · Recharts · dayjs.

**Spec:** `docs/superpowers/specs/2026-06-15-customer-portal-design.md`

**No component test framework exists.** Gate every task with:
```
npm run typecheck && npm run lint && npm run build
```
All three must exit 0 before committing. Use `git add <specific files>` (never `git add -A`); do not stage `.claude/launch.json`.

---

## File map

| Action | File | Responsibility |
|---|---|---|
| Modify | `src/types/index.ts` | `Role += 'Customer'`; `Customer.creditLimit` |
| Modify | `src/config/constants.ts` | `ROUTES.portal` |
| Modify | `src/config/roles.ts` | access/home/nav/normalize/seed-user |
| Modify | `src/store/useAuthStore.ts` | `customerId` on `AuthUser` + login copy |
| Modify | `src/mock/data.ts` | `creditLimit: 0` in literal + deterministic post-pass |
| Modify | `src/services/api.ts` | `CustomerPortalSummary` + `getCustomerPortalSummary` |
| Modify | `src/services/queries.ts` | `qk.customerPortal` + `useCustomerPortal` |
| Modify | `src/i18n/locales/en.json` | `common.days`, `roles.Customer`, `nav.portal`, `portal.*` |
| Modify | `src/i18n/locales/ar.json` | same keys (Arabic) |
| Modify | `src/i18n/locales/fa.json` | same keys (Persian) |
| Create | `src/pages/portal/CustomerPortalPage.tsx` | the My Account page |
| Modify | `src/routes/index.tsx` | guarded `portal` route |
| Modify | `src/components/layout/SidebarNav.tsx` | `wallet` icon |

---

## Task 1: RBAC foundation (types, route, roles, auth, credit-limit seed)

These changes are grouped because adding `'Customer'` to the `Role` union makes
`Record<Role, …>` in `roles.ts` and the `Customer` object literal in `data.ts` fail to
typecheck until their new fields exist. Doing them together keeps the commit green.

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/config/constants.ts`
- Modify: `src/config/roles.ts`
- Modify: `src/store/useAuthStore.ts`
- Modify: `src/mock/data.ts`

- [ ] **Step 1: Add the role + creditLimit to types**

In `src/types/index.ts`, change the last line:
```ts
export type Role = 'CEO' | 'Manager' | 'Staff';
```
to:
```ts
export type Role = 'CEO' | 'Manager' | 'Staff' | 'Customer';
```

And in the `Customer` interface, add `creditLimit` after `paymentTermsDays`:
```ts
export interface Customer {
  id: string;
  name: string;
  /** Short code used in contract ids, e.g. "AM" for Alco Metal. */
  code: string;
  defaultCurrency: Currency;
  contactName?: string;
  email?: string;
  phone?: string;
  country?: string;
  /** Day-of-net credit terms. */
  paymentTermsDays: number;
  /** Approved trading credit line in USD (deterministic mock figure). */
  creditLimit: number;
  createdAt: string;
}
```

- [ ] **Step 2: Add the portal route key**

In `src/config/constants.ts`, add `portal` to `ROUTES` (after `settings`):
```ts
export const ROUTES = {
  landing: '/',
  login: '/login',
  app: '/app',
  dashboard: '/app/dashboard',
  executive: '/app/executive',
  customers: '/app/customers',
  contracts: '/app/contracts',
  containers: '/app/containers',
  invoices: '/app/invoices',
  payments: '/app/payments',
  reports: '/app/reports',
  settings: '/app/settings',
  portal: '/app/portal',
} as const;
```

- [ ] **Step 3: Wire the Customer role into roles.ts**

In `src/config/roles.ts`:

Add to `ROLE_ACCESS` (after the `Staff` entry — note the Customer gets ONLY `portal`):
```ts
export const ROLE_ACCESS: Record<Role, RouteKey[]> = {
  CEO: ['executive', 'reports', 'settings'],
  Manager: [
    'dashboard',
    'customers',
    'contracts',
    'containers',
    'invoices',
    'payments',
    'reports',
    'settings',
  ],
  Staff: ['dashboard', 'customers', 'contracts', 'containers', 'invoices'],
  Customer: ['portal'],
};
```

Add to `ROLE_HOME`:
```ts
export const ROLE_HOME: Record<Role, string> = {
  CEO: ROUTES.executive,
  Manager: ROUTES.dashboard,
  Staff: ROUTES.dashboard,
  Customer: ROUTES.portal,
};
```

Add `customerId` to `SeededUser`:
```ts
export interface SeededUser {
  email: string;
  password: string;
  role: Role;
  name: string;
  avatarColor: string;
  /** For Customer-role users: the customer record they may view. */
  customerId?: string;
}
```

Append the sample Customer to `USERS`:
```ts
export const USERS: SeededUser[] = [
  { email: 'ceo@finora.app', password: 'Ceo@2026', role: 'CEO', name: 'Khalid Al Mansoori', avatarColor: '#b87333' },
  { email: 'amir@finora.app', password: 'demo1234', role: 'Manager', name: 'Amir Karami', avatarColor: '#b87333' },
  { email: 'staff@finora.app', password: 'Staff@2026', role: 'Staff', name: 'Operations Desk', avatarColor: '#3b82f6' },
  { email: 'portal@alcometal.ae', password: 'Alco@2026', role: 'Customer', name: 'Alco Metal Trading', avatarColor: '#b87333', customerId: 'cust-am' },
];
```

Update `normalizeRole` to accept `'Customer'`:
```ts
export function normalizeRole(value: unknown): Role {
  return value === 'CEO' || value === 'Manager' || value === 'Staff' || value === 'Customer'
    ? value
    : 'Manager';
}
```

Append the portal nav item to `NAV_ITEMS` (group `main`):
```ts
export const NAV_ITEMS: NavItemDef[] = [
  { key: 'executive', route: ROUTES.executive, icon: 'crown', group: 'main' },
  { key: 'dashboard', route: ROUTES.dashboard, icon: 'appstore', group: 'main' },
  { key: 'portal', route: ROUTES.portal, icon: 'wallet', group: 'main' },
  { key: 'customers', route: ROUTES.customers, icon: 'team', group: 'operations' },
  { key: 'contracts', route: ROUTES.contracts, icon: 'filetext', group: 'operations' },
  { key: 'containers', route: ROUTES.containers, icon: 'container', group: 'operations' },
  { key: 'invoices', route: ROUTES.invoices, icon: 'filedone', group: 'finance' },
  { key: 'payments', route: ROUTES.payments, icon: 'creditcard', group: 'finance' },
  { key: 'reports', route: ROUTES.reports, icon: 'barchart', group: 'finance' },
  { key: 'settings', route: ROUTES.settings, icon: 'setting', group: 'system' },
];
```

- [ ] **Step 4: Carry customerId on the auth user**

In `src/store/useAuthStore.ts`, add `customerId` to `AuthUser`:
```ts
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarColor: string;
  /** Set only for Customer-role logins — scopes the portal to one customer. */
  customerId?: string;
}
```

In the seeded-user branch of `login`, copy `customerId` onto the user:
```ts
        if (seeded) {
          if (seeded.password !== password) throw new Error('invalid-credentials');
          const user: AuthUser = {
            id: `u-${seeded.role.toLowerCase()}`,
            name: seeded.name,
            email: seeded.email,
            role: seeded.role,
            avatarColor: seeded.avatarColor,
            customerId: seeded.customerId,
          };
          set({ user, token: 'demo-token', isAuthenticated: true });
          return user;
        }
```
(The persist `merge` already spreads `...merged.user`, so `customerId` survives rehydration — no change needed there.)

- [ ] **Step 5: Seed deterministic credit limits**

In `src/mock/data.ts`, add `creditLimit: 0` to the customer object literal (inside the
`CUSTOMER_SEEDS.forEach` loop), right after `paymentTermsDays`:
```ts
    paymentTermsDays: seed.terms,
    creditLimit: 0,
    createdAt: TODAY.subtract(intBetween(120, 900), 'day').toISOString(),
```

Then add a deterministic post-pass **between** the closing `})();` of the Alco anchor
IIFE and the `export const db = {` line:
```ts
/* ------------------------------------------------------------------ *
 * Credit limits — deterministic, derived from each customer's exposure.
 * Runs after every container exists; the extra PRNG draws are appended
 * to the end of the sequence, so earlier seeded values are unchanged.
 * ------------------------------------------------------------------ */
const ceilTo = (n: number, step: number) => Math.ceil(n / step) * step;
customers.forEach((customer) => {
  const myContractIds = new Set(
    contracts.filter((c) => c.customerId === customer.id).map((c) => c.id),
  );
  const myContainers = containers.filter((c) => myContractIds.has(c.contractId));
  const invoiced = myContainers.reduce((s, c) => s + c.invoiceUSD, 0);
  const outstanding = myContainers
    .filter((c) => c.status !== 'PAID')
    .reduce((s, c) => s + c.invoiceUSD, 0);
  const base = Math.max(outstanding, invoiced * 0.4, 100_000);
  const util = 0.5 + rnd() * 0.35; // target utilization 0.50–0.85
  customer.creditLimit = ceilTo(base / util, 250_000);
});

export const db = {
```

- [ ] **Step 6: Run the gate**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all three pass (exit 0). `computeAccounts` spreads `...customer`, so
`CustomerAccount`/`getAccount` now carry `creditLimit` automatically — no other file
needs changes to compile.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/config/constants.ts src/config/roles.ts src/store/useAuthStore.ts src/mock/data.ts
git commit -m "feat(portal): add Customer role, portal route + deterministic credit limits"
```

---

## Task 2: Scoped API + query hook

**Files:**
- Modify: `src/services/api.ts`
- Modify: `src/services/queries.ts`

- [ ] **Step 1: Add the summary type + function**

In `src/services/api.ts`, append a new section at the end of the file (after the
container mutations). `Customer`, `Invoice`, `TimeSeriesPoint` are already imported;
`AgingBucket`, `ContractRow`, `PaymentRow` are already defined above in this file.
```ts
/* ----------------------------- Customer Portal ---------------------- */
export interface CustomerPortalSummary {
  customerId: string;
  name: string;
  code: string;
  country: string;
  defaultCurrency: Customer['defaultCurrency'];
  paymentTermsDays: number;
  totalInvoiced: number;
  totalPaid: number;
  outstanding: number;
  overdue: number;
  /** paid / invoiced * 100 */
  settlementRatePct: number;
  /** (outstanding / invoiced) * 365 */
  dsoDays: number;
  /** current-bucket / outstanding * 100 */
  onTimeSharePct: number;
  creditLimit: number;
  /** outstanding / creditLimit * 100 */
  creditUtilizationPct: number;
  availableCredit: number;
  aging: AgingBucket[];
  series: TimeSeriesPoint[];
  openInvoices: Invoice[];
  recentPayments: PaymentRow[];
  contracts: ContractRow[];
}

export async function getCustomerPortalSummary(
  customerId: string,
): Promise<CustomerPortalSummary | undefined> {
  await delay(200);
  const account = computeAccounts().find((a) => a.id === customerId);
  if (!account) return undefined;

  const today = dayjs('2026-06-13');

  const myContracts = buildContractRows().filter((c) => c.customerId === customerId);
  const contractIds = new Set(myContracts.map((c) => c.id));

  const myInvoices = buildInvoices().filter((inv) => inv.customerId === customerId);
  const openInvoices = myInvoices
    .filter((inv) => inv.status !== 'PAID')
    .sort((a, b) => dayjs(a.dueDate).valueOf() - dayjs(b.dueDate).valueOf());

  const recentPayments: PaymentRow[] = db.payments
    .filter((p) => p.customerId === customerId)
    .map((p) => ({ ...p, customerName: account.name }))
    .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());

  // Aging buckets over this customer's unpaid invoices.
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 };
  for (const inv of openInvoices) {
    const overdueDays = today.startOf('day').diff(dayjs(inv.dueDate).startOf('day'), 'day');
    if (overdueDays <= 0) buckets.current += inv.amountUSD;
    else if (overdueDays <= 30) buckets.d30 += inv.amountUSD;
    else if (overdueDays <= 60) buckets.d60 += inv.amountUSD;
    else if (overdueDays <= 90) buckets.d90 += inv.amountUSD;
    else buckets.d90p += inv.amountUSD;
  }
  const aging: AgingBucket[] = [
    { bucket: 'current', value: round(buckets.current) },
    { bucket: 'days30', value: round(buckets.d30) },
    { bucket: 'days60', value: round(buckets.d60) },
    { bucket: 'days90', value: round(buckets.d90) },
    { bucket: 'days90plus', value: round(buckets.d90p) },
  ];

  // 12-month invoiced-vs-collected series, scoped to this customer.
  const myContainerIds = new Set(
    db.containers.filter((c) => contractIds.has(c.contractId)).map((c) => c.id),
  );
  const series: TimeSeriesPoint[] = [];
  const start = today.subtract(11, 'month').startOf('month');
  for (let i = 0; i < 12; i++) {
    const m = start.add(i, 'month');
    const key = m.format('YYYY-MM');
    const invoiced = db.containers
      .filter((c) => myContainerIds.has(c.id) && dayjs(c.shipmentDate).format('YYYY-MM') === key)
      .reduce((s, c) => s + c.invoiceUSD, 0);
    const collected = db.payments
      .filter((p) => p.customerId === customerId && dayjs(p.date).format('YYYY-MM') === key)
      .reduce((s, p) => s + p.amountUSD, 0);
    series.push({ month: m.format('MMM'), invoiced: round(invoiced), collected: round(collected) });
  }

  const totalInvoiced = account.totalInvoiced;
  const totalPaid = account.totalPaid;
  const outstanding = account.totalOutstanding;
  const overdue = account.overdue;
  const creditLimit = account.creditLimit;

  return {
    customerId: account.id,
    name: account.name,
    code: account.code,
    country: account.country ?? '',
    defaultCurrency: account.defaultCurrency,
    paymentTermsDays: account.paymentTermsDays,
    totalInvoiced,
    totalPaid,
    outstanding,
    overdue,
    settlementRatePct: totalInvoiced > 0 ? round((totalPaid / totalInvoiced) * 100) : 0,
    dsoDays: totalInvoiced > 0 ? Math.round((outstanding / totalInvoiced) * 365) : 0,
    onTimeSharePct: outstanding > 0 ? round((buckets.current / outstanding) * 100) : 100,
    creditLimit,
    creditUtilizationPct: creditLimit > 0 ? round((outstanding / creditLimit) * 100) : 0,
    availableCredit: round(Math.max(creditLimit - outstanding, 0)),
    aging,
    series,
    openInvoices,
    recentPayments,
    contracts: myContracts,
  };
}
```

- [ ] **Step 2: Add the query key + hook**

In `src/services/queries.ts`, add to the `qk` object (after `executiveSummary`):
```ts
  executiveSummary: ['executiveSummary'] as const,
  customerPortal: (id: string) => ['customerPortal', id] as const,
};
```

And add the hook near the other read hooks (e.g. after `useExecutiveSummary`):
```ts
export const useCustomerPortal = (id: string) =>
  useQuery({
    queryKey: qk.customerPortal(id),
    queryFn: () => api.getCustomerPortalSummary(id),
    enabled: !!id,
  });
```

- [ ] **Step 3: Run the gate**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass (exit 0).

- [ ] **Step 4: Commit**

```bash
git add src/services/api.ts src/services/queries.ts
git commit -m "feat(portal): scoped getCustomerPortalSummary API + useCustomerPortal hook"
```

---

## Task 3: i18n (en / ar / fa)

**Files:**
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/ar.json`
- Modify: `src/i18n/locales/fa.json`

- [ ] **Step 1: English keys**

In `src/i18n/locales/en.json`:

Add `"days"` to the `common` block (e.g. after `"saveFailed"` — add a comma):
```json
    "saveFailed": "Couldn't save changes",
    "days": "days"
```

Add `"portal"` to the `nav` block (after `"settings"` — add a comma):
```json
    "settings": "Settings",
    "portal": "My Account",
```

Add `"Customer"` to the `roles` block (after `"Staff"` — add a comma):
```json
  "roles": {
    "CEO": "Chief Executive",
    "Manager": "Finance Manager",
    "Staff": "Operations",
    "Customer": "Customer"
  },
```

Add a new top-level `"portal"` block (place it right after the `"executive"` block, before `"errors"`):
```json
  "portal": {
    "subtitle": "Your account summary and balances",
    "standingGood": "In good standing",
    "standingAttention": "Action needed",
    "outstanding": "Outstanding balance",
    "overdue": "Overdue",
    "availableCredit": "Available credit",
    "settlementRate": "Settlement rate",
    "dso": "Avg. days to settle",
    "termsDays": "Your terms: {{count}} days",
    "creditUtilization": "Credit utilization",
    "creditLimitLabel": "Credit limit",
    "onTimeShare": "Within terms",
    "agingTitle": "Receivables aging",
    "paidVsOutstanding": "Paid vs. outstanding",
    "invoicedVsCollected": "Invoiced vs. collected",
    "openInvoices": "Open invoices",
    "payments": "Payments",
    "contracts": "Contracts",
    "daysOverdue": "Days overdue",
    "dueDate": "Due",
    "noOpenInvoices": "No open invoices — you're all settled.",
    "noAccessTitle": "Account unavailable",
    "noAccess": "No customer account is linked to this login."
  },
```

- [ ] **Step 2: Arabic keys**

In `src/i18n/locales/ar.json`, mirror the same structure with Arabic values:

`common` → add `"days": "يوم"`.
`nav` → add `"portal": "حسابي"`.
`roles` → add `"Customer": "عميل"`.
New top-level `portal` block:
```json
  "portal": {
    "subtitle": "ملخص حسابك وأرصدتك",
    "standingGood": "بحالة جيدة",
    "standingAttention": "يتطلب إجراءً",
    "outstanding": "الرصيد المستحق",
    "overdue": "متأخر",
    "availableCredit": "الائتمان المتاح",
    "settlementRate": "نسبة السداد",
    "dso": "متوسط أيام السداد",
    "termsDays": "مدة السداد: {{count}} يوم",
    "creditUtilization": "استخدام الائتمان",
    "creditLimitLabel": "حد الائتمان",
    "onTimeShare": "ضمن المدة",
    "agingTitle": "أعمار الذمم المدينة",
    "paidVsOutstanding": "المدفوع مقابل المستحق",
    "invoicedVsCollected": "المُفوتر مقابل المُحصّل",
    "openInvoices": "الفواتير المفتوحة",
    "payments": "المدفوعات",
    "contracts": "العقود",
    "daysOverdue": "أيام التأخير",
    "dueDate": "الاستحقاق",
    "noOpenInvoices": "لا توجد فواتير مفتوحة — تم السداد بالكامل.",
    "noAccessTitle": "الحساب غير متاح",
    "noAccess": "لا يوجد حساب عميل مرتبط بتسجيل الدخول هذا."
  },
```

- [ ] **Step 3: Persian keys**

In `src/i18n/locales/fa.json`, mirror with Persian values:

`common` → add `"days": "روز"`.
`nav` → add `"portal": "حساب من"`.
`roles` → add `"Customer": "مشتری"`.
New top-level `portal` block:
```json
  "portal": {
    "subtitle": "خلاصه حساب و مانده‌های شما",
    "standingGood": "وضعیت مطلوب",
    "standingAttention": "نیازمند اقدام",
    "outstanding": "مانده بدهی",
    "overdue": "معوق",
    "availableCredit": "اعتبار در دسترس",
    "settlementRate": "نرخ تسویه",
    "dso": "میانگین روزهای تسویه",
    "termsDays": "مهلت شما: {{count}} روز",
    "creditUtilization": "استفاده از اعتبار",
    "creditLimitLabel": "سقف اعتبار",
    "onTimeShare": "در محدوده مهلت",
    "agingTitle": "سن‌بندی مطالبات",
    "paidVsOutstanding": "پرداخت‌شده در برابر مانده",
    "invoicedVsCollected": "صورت‌حساب در برابر وصولی",
    "openInvoices": "فاکتورهای باز",
    "payments": "پرداخت‌ها",
    "contracts": "قراردادها",
    "daysOverdue": "روزهای تأخیر",
    "dueDate": "سررسید",
    "noOpenInvoices": "فاکتور بازی وجود ندارد — همه تسویه شده است.",
    "noAccessTitle": "حساب در دسترس نیست",
    "noAccess": "هیچ حساب مشتری به این ورود متصل نیست."
  },
```

- [ ] **Step 4: Run the gate**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass. (The Vite build imports the JSON, so a trailing-comma/syntax error
fails the build here.)

- [ ] **Step 5: Commit**

```bash
git add src/i18n/locales/en.json src/i18n/locales/ar.json src/i18n/locales/fa.json
git commit -m "feat(portal): i18n keys for Customer role + My Account (en/ar/fa)"
```

---

## Task 4: My Account page + route + sidebar icon

**Files:**
- Create: `src/pages/portal/CustomerPortalPage.tsx`
- Modify: `src/routes/index.tsx`
- Modify: `src/components/layout/SidebarNav.tsx`

- [ ] **Step 1: Create the page**

Create `src/pages/portal/CustomerPortalPage.tsx` with exactly this content:
```tsx
import { type ReactNode } from 'react';
import {
  Card,
  Col,
  Progress,
  Result,
  Row,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
  theme,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ClockCircleOutlined,
  DollarOutlined,
  SafetyCertificateOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { Money } from '@/components/common/Money';
import { StatusTag, PaymentMethodTag } from '@/components/common/StatusTag';
import { BarChart } from '@/components/charts/BarChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { CashflowChart } from '@/components/charts/CashflowChart';
import { useCustomerPortal } from '@/services/queries';
import { useAuthStore } from '@/store/useAuthStore';
import type { Invoice } from '@/types';
import type { ContractRow, PaymentRow } from '@/services/api';
import { formatCompactCurrency, formatDate, formatMt, formatPercent } from '@/utils/format';
import { BRAND } from '@/config/constants';

const { Text } = Typography;
const PINNED_TODAY = dayjs('2026-06-13');

function ChartCard({
  title,
  loading,
  height = 280,
  children,
}: {
  title: string;
  loading?: boolean;
  height?: number;
  children: ReactNode;
}) {
  return (
    <Card
      title={title}
      variant="borderless"
      className="soft-card"
      styles={{ header: { borderBottom: 'none', fontWeight: 600 }, body: { paddingTop: 4 } }}
      style={{ height: '100%' }}
    >
      {loading ? <Skeleton active paragraph={{ rows: 5 }} style={{ height }} /> : children}
    </Card>
  );
}

export default function CustomerPortalPage() {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const customerId = useAuthStore((s) => s.user?.customerId) ?? '';
  const { data, isLoading } = useCustomerPortal(customerId);

  if (!customerId) {
    return <Result status="403" title={t('portal.noAccessTitle')} subTitle={t('portal.noAccess')} />;
  }
  if (!isLoading && !data) {
    return (
      <Result status="404" title={t('errors.notFoundTitle')} subTitle={t('errors.notFoundDesc')} />
    );
  }

  const standingGood = (data?.overdue ?? 0) <= 0;
  const utilization = Math.round(data?.creditUtilizationPct ?? 0);
  const utilColor =
    utilization > 90 ? token.colorError : utilization > 75 ? BRAND.warning : token.colorPrimary;

  const agingData = (data?.aging ?? []).map((a) => ({
    name: t(`reports.${a.bucket}`),
    value: a.value,
  }));
  const paidVsOutstanding = [
    { name: t('invoices.totalPaid'), value: data?.totalPaid ?? 0 },
    { name: t('portal.outstanding'), value: data?.outstanding ?? 0 },
  ];

  const invoiceColumns: ColumnsType<Invoice> = [
    {
      title: t('containers.reference'),
      dataIndex: 'containerReference',
      render: (v) => <Text style={{ fontFamily: 'monospace' }}>{v}</Text>,
    },
    {
      title: t('items.product'),
      dataIndex: 'product',
      render: (v) => <Tag bordered={false}>{v}</Tag>,
    },
    {
      title: t('invoices.amount'),
      dataIndex: 'amountUSD',
      align: 'right',
      render: (v) => <Money value={v} strong />,
    },
    { title: t('portal.dueDate'), dataIndex: 'dueDate', render: (v) => formatDate(v) },
    {
      title: t('portal.daysOverdue'),
      dataIndex: 'dueDate',
      key: 'overdue',
      align: 'right',
      render: (v: string) => {
        const days = PINNED_TODAY.startOf('day').diff(dayjs(v).startOf('day'), 'day');
        return days > 0 ? <Text type="danger">{days}</Text> : <Text type="secondary">—</Text>;
      },
    },
    {
      title: t('invoices.status'),
      dataIndex: 'status',
      align: 'center',
      render: (v) => <StatusTag status={v} />,
    },
  ];

  const paymentColumns: ColumnsType<PaymentRow> = [
    {
      title: t('payments.paymentId'),
      dataIndex: 'id',
      render: (v) => <Text style={{ fontFamily: 'monospace' }}>{v}</Text>,
    },
    { title: t('payments.date'), dataIndex: 'date', render: (v) => formatDate(v) },
    {
      title: t('payments.amount'),
      dataIndex: 'amount',
      align: 'right',
      render: (v, r) => <Money value={v} currency={r.currency} />,
    },
    {
      title: t('payments.amountUsd'),
      dataIndex: 'amountUSD',
      align: 'right',
      render: (v) => <Money value={v} strong />,
    },
    {
      title: t('payments.method'),
      dataIndex: 'method',
      align: 'center',
      render: (v) => <PaymentMethodTag method={v} />,
    },
    {
      title: t('payments.reference'),
      dataIndex: 'reference',
      render: (v) => (
        <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 12 }}>
          {v}
        </Text>
      ),
    },
  ];

  const contractColumns: ColumnsType<ContractRow> = [
    {
      title: t('contracts.contractId'),
      dataIndex: 'id',
      render: (v) => <Text style={{ fontFamily: 'monospace' }}>{v}</Text>,
    },
    { title: t('contracts.date'), dataIndex: 'date', render: (v) => formatDate(v) },
    {
      title: t('contracts.destination'),
      dataIndex: 'destination',
      render: (v) => <Tag bordered={false}>{v}</Tag>,
    },
    {
      title: t('contracts.quantity'),
      dataIndex: 'quantityMt',
      align: 'right',
      render: (v) => formatMt(v),
    },
    {
      title: t('contracts.value'),
      dataIndex: 'value',
      align: 'right',
      render: (v) => <Money value={v} strong />,
    },
    {
      title: t('contracts.status'),
      dataIndex: 'status',
      align: 'center',
      render: (v) => <StatusTag status={v} />,
    },
  ];

  return (
    <div className="fade-in">
      <PageHeader
        title={data?.name ?? t('common.loading')}
        subtitle={t('portal.subtitle')}
        extra={
          !isLoading && data ? (
            <Tag
              color={standingGood ? 'success' : 'error'}
              style={{ borderRadius: 6, fontWeight: 600, padding: '4px 12px' }}
            >
              {standingGood ? t('portal.standingGood') : t('portal.standingAttention')}
            </Tag>
          ) : undefined
        }
      />

      <Row gutter={[16, 16]} className="stagger">
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title={t('portal.outstanding')}
            value={<Money value={data?.outstanding ?? 0} compact />}
            icon={<WalletOutlined />}
            accent={BRAND.info}
            loading={isLoading}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title={t('portal.overdue')}
            value={<Money value={data?.overdue ?? 0} compact />}
            icon={<ClockCircleOutlined />}
            accent={BRAND.danger}
            loading={isLoading}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title={t('portal.availableCredit')}
            value={<Money value={data?.availableCredit ?? 0} compact />}
            icon={<SafetyCertificateOutlined />}
            accent={BRAND.success}
            loading={isLoading}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title={t('portal.settlementRate')}
            value={formatPercent(data?.settlementRatePct ?? 0)}
            icon={<DollarOutlined />}
            accent={BRAND.accent}
            loading={isLoading}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={8}>
          <Card variant="borderless" className="soft-card" style={{ height: '100%' }} loading={isLoading}>
            <Statistic
              title={t('portal.dso')}
              value={data?.dsoDays ?? 0}
              suffix={t('common.days')}
              valueStyle={{ fontWeight: 700 }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('portal.termsDays', { count: data?.paymentTermsDays ?? 0 })}
            </Text>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card variant="borderless" className="soft-card" style={{ height: '100%' }} loading={isLoading}>
            <Text style={{ color: token.colorTextSecondary, fontSize: 13, fontWeight: 500 }}>
              {t('portal.creditUtilization')}
            </Text>
            <Progress percent={utilization} strokeColor={utilColor} style={{ marginTop: 6, marginBottom: 4 }} />
            <Space split="·" wrap>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('portal.creditLimitLabel')}: {formatCompactCurrency(data?.creditLimit ?? 0)}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('portal.availableCredit')}: {formatCompactCurrency(data?.availableCredit ?? 0)}
              </Text>
            </Space>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card variant="borderless" className="soft-card" style={{ height: '100%' }} loading={isLoading}>
            <Statistic
              title={t('portal.onTimeShare')}
              value={data?.onTimeSharePct ?? 0}
              precision={0}
              suffix="%"
              valueStyle={{ fontWeight: 700, color: token.colorSuccess }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {formatCompactCurrency(data?.totalPaid ?? 0)} {t('invoices.totalPaid').toLowerCase()}
            </Text>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <ChartCard title={t('portal.agingTitle')} loading={isLoading}>
            <BarChart data={agingData} multicolor formatter={(v) => formatCompactCurrency(v)} />
          </ChartCard>
        </Col>
        <Col xs={24} lg={12}>
          <ChartCard title={t('portal.paidVsOutstanding')} loading={isLoading}>
            <DonutChart
              data={paidVsOutstanding}
              colors={[BRAND.success, BRAND.info]}
              formatter={(v) => formatCompactCurrency(v)}
              centerValue={formatCompactCurrency(data?.outstanding ?? 0)}
              centerLabel={t('portal.outstanding')}
            />
          </ChartCard>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <ChartCard title={t('portal.invoicedVsCollected')} loading={isLoading} height={300}>
            <CashflowChart data={data?.series ?? []} />
          </ChartCard>
        </Col>
      </Row>

      <Card variant="borderless" style={{ marginTop: 16 }} styles={{ body: { paddingTop: 8 } }}>
        <Tabs
          items={[
            {
              key: 'invoices',
              label: `${t('portal.openInvoices')} (${data?.openInvoices.length ?? 0})`,
              children: (
                <Table<Invoice>
                  rowKey="id"
                  loading={isLoading}
                  columns={invoiceColumns}
                  dataSource={data?.openInvoices ?? []}
                  scroll={{ x: 760 }}
                  pagination={{ pageSize: 8, hideOnSinglePage: true }}
                  locale={{ emptyText: t('portal.noOpenInvoices') }}
                />
              ),
            },
            {
              key: 'payments',
              label: `${t('portal.payments')} (${data?.recentPayments.length ?? 0})`,
              children: (
                <Table<PaymentRow>
                  rowKey="id"
                  loading={isLoading}
                  columns={paymentColumns}
                  dataSource={data?.recentPayments ?? []}
                  scroll={{ x: 760 }}
                  pagination={{ pageSize: 8, hideOnSinglePage: true }}
                />
              ),
            },
            {
              key: 'contracts',
              label: `${t('portal.contracts')} (${data?.contracts.length ?? 0})`,
              children: (
                <Table<ContractRow>
                  rowKey="id"
                  loading={isLoading}
                  columns={contractColumns}
                  dataSource={data?.contracts ?? []}
                  scroll={{ x: 760 }}
                  pagination={{ pageSize: 5, hideOnSinglePage: true }}
                />
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Register the route**

In `src/routes/index.tsx`, add the import after the other page imports (e.g. after the
`ExecutiveDashboardPage` import):
```ts
import CustomerPortalPage from '@/pages/portal/CustomerPortalPage';
```
And add the guarded route inside the `<Route path={ROUTES.app}>` block (e.g. after the
`executive` route):
```tsx
        <Route path="portal" element={<RoleRoute routeKey="portal"><CustomerPortalPage /></RoleRoute>} />
```

- [ ] **Step 3: Add the wallet icon to the sidebar**

In `src/components/layout/SidebarNav.tsx`, add `WalletOutlined` to the icon imports:
```ts
import {
  AppstoreOutlined,
  BarChartOutlined,
  ContainerOutlined,
  CreditCardOutlined,
  CrownOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  SettingOutlined,
  TeamOutlined,
  WalletOutlined,
} from '@ant-design/icons';
```
And add it to the `ICONS` map:
```ts
const ICONS: Record<string, ReactNode> = {
  crown: <CrownOutlined />,
  appstore: <AppstoreOutlined />,
  wallet: <WalletOutlined />,
  team: <TeamOutlined />,
  filetext: <FileTextOutlined />,
  container: <ContainerOutlined />,
  filedone: <FileDoneOutlined />,
  creditcard: <CreditCardOutlined />,
  barchart: <BarChartOutlined />,
  setting: <SettingOutlined />,
};
```

- [ ] **Step 4: Run the gate**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass (exit 0).

- [ ] **Step 5: Commit**

```bash
git add src/pages/portal/CustomerPortalPage.tsx src/routes/index.tsx src/components/layout/SidebarNav.tsx
git commit -m "feat(portal): My Account dashboard page, guarded route + sidebar entry"
```

---

## Task 5: Verification & final review

**No code changes** — this verifies the assembled feature.

- [ ] **Step 1: Confirm the gate is clean** (`npm run typecheck && npm run lint && npm run build`).

- [ ] **Step 2: Live preview** (dev server on port 3031). Verify:
  - Login as `portal@alcometal.ae` / `Alco@2026` → lands on `/app/portal`.
  - Sidebar shows **exactly one** item: "My Account" (no other groups/items).
  - Header role label reads "Customer".
  - KPIs render: Outstanding / Overdue / Available credit / Settlement rate; health strip
    DSO (with terms), credit-utilization Progress, Within-terms %; aging bar, paid-vs-out
    donut, 12-mo trend; tabs Open invoices / Payments / Contracts populated.
  - Cross-check Outstanding & Overdue against the admin Customer-detail view for `cust-am`
    (log in as `amir@finora.app` / `demo1234`, open Customers → Alco Metal Trading) — the
    figures must match.
  - Manually visit `/app/customers` while logged in as the Customer → redirected to
    `/app/portal`.
  - Toggle dark/light and ar + fa (RTL) — layout holds, no clipping, no missing strings.

- [ ] **Step 3: Wrong-password check** — `portal@alcometal.ae` with a wrong password is
  rejected (`auth.invalidCredentials`); other roles (CEO/Manager/Staff) still log in and
  see their own menus unchanged.

---

## Self-review (against the spec)

**Spec coverage:**
- New `Customer` role + `ROLE_ACCESS=['portal']` + `ROLE_HOME` + `normalizeRole` → Task 1.
- `AuthUser.customerId` + login copy + persist preservation → Task 1.
- `Customer.creditLimit` + deterministic seed → Task 1.
- `ROUTES.portal` + nav item + sidebar icon → Task 1 (config) / Task 4 (icon + route).
- `getCustomerPortalSummary` + `CustomerPortalSummary` + `useCustomerPortal` → Task 2.
- Financial KPIs (settlement, DSO, on-time, utilization, available credit, aging, series)
  → Task 2 (compute) + Task 4 (render).
- Single "My Account" page (KPIs, health strip, charts, tabs) → Task 4.
- i18n en/ar/fa, RTL-safe, reusing `reports.*`/`payments.*`/`contracts.*`/`invoices.*` →
  Task 3.
- Seeded sample login (Alco / portal@alcometal.ae) → Task 1.
- Verification (gate + live + scoping redirect) → Task 5.

**Refinement vs spec §5.2:** the summary exposes `contracts: ContractRow[]` (the page
derives the count) instead of separate `contractsTotal/Active/Value` fields — leaner, same
information. No behavioral difference.

**Type consistency:** `CustomerPortalSummary` field names used in Task 2 match the page's
reads in Task 4 (`outstanding`, `overdue`, `availableCredit`, `settlementRatePct`,
`dsoDays`, `onTimeSharePct`, `creditUtilizationPct`, `creditLimit`, `aging`, `series`,
`openInvoices`, `recentPayments`, `contracts`). `creditLimit` is added to `Customer`
(Task 1) before it is read via `account.creditLimit` (Task 2). `qk.customerPortal` /
`useCustomerPortal` names match between Task 2 and Task 4.

**Placeholder scan:** none — every step carries complete code or an exact command.
