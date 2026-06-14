# CEO Executive Dashboard + Role-Based Access — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three roles (CEO / Manager / Staff), seeded role logins, role-aware menu + route guarding, and a CEO Executive Dashboard.

**Architecture:** A `Role` type + a `config/roles.ts` module (access map, seeded users, nav model) layered onto the existing Zustand auth store. Routes are wrapped in a role guard; the sidebar filters items by role; a new Executive Dashboard page composes existing data hooks plus one new `getExecutiveSummary` API.

**Tech Stack:** Vite 6 · React 18 · TypeScript (strict) · Ant Design 5 · TanStack Query 5 · Zustand · react-i18next.

**Testing note:** no component test framework (consistent with the rest of the app). Gate every task with `npm run typecheck && npm run lint && npm run build`; the final task is a live preview drive. Commit after each task. The preview dev server runs on **port 3031** (`.claude/launch.json`).

**Spec:** `docs/superpowers/specs/2026-06-14-ceo-executive-rbac-design.md`

---

## File Structure

- `src/types/index.ts` — `Role` type.
- `src/config/constants.ts` — `ROUTES.executive`.
- `src/config/roles.ts` — **new**: `RouteKey`, `ROLE_ACCESS`, `ROLE_HOME`, `USERS`, `normalizeRole`, `NAV_ITEMS`.
- `src/store/useAuthStore.ts` — `login(email, password)`, `role: Role`, persisted-role migration.
- `src/pages/auth/LoginPage.tsx` — pass password, handle failure, list accounts, role-aware landing.
- `src/services/api.ts` — `getExecutiveSummary`.
- `src/services/queries.ts` — `useExecutiveSummary` + key + invalidation.
- `src/pages/executive/ExecutiveDashboardPage.tsx` — **new** page.
- `src/routes/index.tsx` — `RoleRoute` guard, role-aware index, executive route.
- `src/components/layout/SidebarNav.tsx` — role-filtered menu.
- `src/components/layout/AppHeader.tsx` — role label.
- `src/i18n/locales/{en,ar,fa}.json` — `roles.*`, `executive.*`, `nav.executive`, `auth.*`.

---

## Task 1: Roles foundation (type, route, config module)

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/config/constants.ts`
- Create: `src/config/roles.ts`

- [ ] **Step 1: Add the `Role` type**

In `src/types/index.ts`, find `export type ThemeMode = 'light' | 'dark';` and add right after it:

```ts
export type Role = 'CEO' | 'Manager' | 'Staff';
```

- [ ] **Step 2: Add the executive route**

In `src/config/constants.ts`, in the `ROUTES` object, add the `executive` line right after `dashboard`:

```ts
  dashboard: '/app/dashboard',
  executive: '/app/executive',
```

- [ ] **Step 3: Create the roles config module**

Create `src/config/roles.ts` with exactly:

```ts
import type { Role } from '@/types';
import { ROUTES } from '@/config/constants';

/** Route keys that can be role-guarded / shown in the sidebar. */
export type RouteKey = Exclude<keyof typeof ROUTES, 'landing' | 'login' | 'app'>;

/** Which routes each role may access (and see in the menu). */
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
};

/** Landing route per role. */
export const ROLE_HOME: Record<Role, string> = {
  CEO: ROUTES.executive,
  Manager: ROUTES.dashboard,
  Staff: ROUTES.dashboard,
};

export interface SeededUser {
  email: string;
  password: string;
  role: Role;
  name: string;
  avatarColor: string;
}

/** Seeded demo accounts (mock, non-production). */
export const USERS: SeededUser[] = [
  { email: 'ceo@finora.app', password: 'Ceo@2026', role: 'CEO', name: 'Khalid Al Mansoori', avatarColor: '#b87333' },
  { email: 'amir@finora.app', password: 'demo1234', role: 'Manager', name: 'Amir Karami', avatarColor: '#b87333' },
  { email: 'staff@finora.app', password: 'Staff@2026', role: 'Staff', name: 'Operations Desk', avatarColor: '#3b82f6' },
];

/** Coerce any persisted/legacy role value to a valid Role (defaults to Manager). */
export function normalizeRole(value: unknown): Role {
  return value === 'CEO' || value === 'Manager' || value === 'Staff' ? value : 'Manager';
}

export type NavGroup = 'main' | 'operations' | 'finance' | 'system';

export interface NavItemDef {
  key: RouteKey;
  route: string;
  /** icon name resolved to a component in SidebarNav */
  icon: string;
  group: NavGroup;
}

export const NAV_ITEMS: NavItemDef[] = [
  { key: 'executive', route: ROUTES.executive, icon: 'crown', group: 'main' },
  { key: 'dashboard', route: ROUTES.dashboard, icon: 'appstore', group: 'main' },
  { key: 'customers', route: ROUTES.customers, icon: 'team', group: 'operations' },
  { key: 'contracts', route: ROUTES.contracts, icon: 'filetext', group: 'operations' },
  { key: 'containers', route: ROUTES.containers, icon: 'container', group: 'operations' },
  { key: 'invoices', route: ROUTES.invoices, icon: 'filedone', group: 'finance' },
  { key: 'payments', route: ROUTES.payments, icon: 'creditcard', group: 'finance' },
  { key: 'reports', route: ROUTES.reports, icon: 'barchart', group: 'finance' },
  { key: 'settings', route: ROUTES.settings, icon: 'setting', group: 'system' },
];
```

> SidebarNav (Task 7) maps each `icon` name to an actual `@ant-design/icons` component.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/config/constants.ts src/config/roles.ts
git commit -m "feat(roles): Role type, executive route, role-access config"
```

---

## Task 2: i18n keys (en / ar / fa)

**Files:**
- Modify: `src/i18n/locales/en.json`, `src/i18n/locales/ar.json`, `src/i18n/locales/fa.json`

Each file has a `nav` block, an `auth` block, and (near the end) an `errors` block. Make three edits per file.

- [ ] **Step 1: English** — `src/i18n/locales/en.json`

(a) In `nav`, add `executive` before `dashboard`:
```json
  "nav": {
    "dashboard": "Dashboard",
```
→
```json
  "nav": {
    "executive": "Executive",
    "dashboard": "Dashboard",
```

(b) In `auth`, add two keys after `"secured": "Secured workspace"`:
```json
    "secured": "Secured workspace"
  },
```
→
```json
    "secured": "Secured workspace",
    "invalidCredentials": "Incorrect email or password",
    "demoAccounts": "Demo accounts — click to view"
  },
```

(c) Add `roles` and `executive` blocks immediately before `"errors": {`:
```json
  "errors": {
```
→
```json
  "roles": {
    "CEO": "Chief Executive",
    "Manager": "Finance Manager",
    "Staff": "Operations"
  },
  "executive": {
    "subtitle": "Company performance at a glance",
    "welcome": "Welcome, {{name}}",
    "kpiInvoiced": "Revenue (invoiced)",
    "kpiCollected": "Cash collected",
    "kpiOutstanding": "Outstanding",
    "kpiCollectionRate": "Collection rate",
    "trendTitle": "Revenue vs. collections",
    "topCustomersTitle": "Top customers by revenue",
    "productMixTitle": "Product mix by volume",
    "receivablesTitle": "Receivables aging"
  },
  "errors": {
```

- [ ] **Step 2: Arabic** — `src/i18n/locales/ar.json`

(a) In `nav`, add before `"dashboard": "لوحة التحكم"`:
```json
    "executive": "الإدارة التنفيذية",
```
(b) After `"secured": "مساحة عمل مؤمّنة"` (add comma to that line):
```json
    "invalidCredentials": "البريد الإلكتروني أو كلمة المرور غير صحيحة",
    "demoAccounts": "حسابات تجريبية — اضغط للعرض"
```
(c) Before `"errors": {`:
```json
  "roles": {
    "CEO": "الرئيس التنفيذي",
    "Manager": "مدير مالي",
    "Staff": "العمليات"
  },
  "executive": {
    "subtitle": "أداء الشركة في لمحة",
    "welcome": "مرحباً، {{name}}",
    "kpiInvoiced": "الإيرادات (المفوترة)",
    "kpiCollected": "النقد المحصّل",
    "kpiOutstanding": "المستحق",
    "kpiCollectionRate": "نسبة التحصيل",
    "trendTitle": "الإيرادات مقابل التحصيل",
    "topCustomersTitle": "أعلى العملاء بالإيرادات",
    "productMixTitle": "توزيع المنتجات حسب الحجم",
    "receivablesTitle": "أعمار المستحقات"
  },
```

- [ ] **Step 3: Persian** — `src/i18n/locales/fa.json`

(a) In `nav`, add before `"dashboard": "داشبورد"`:
```json
    "executive": "مدیریت اجرایی",
```
(b) After `"secured": "فضای کاری امن"` (add comma to that line):
```json
    "invalidCredentials": "ایمیل یا رمز عبور نادرست است",
    "demoAccounts": "حساب‌های نمایشی — برای نمایش کلیک کنید"
```
(c) Before `"errors": {`:
```json
  "roles": {
    "CEO": "مدیرعامل",
    "Manager": "مدیر مالی",
    "Staff": "عملیات"
  },
  "executive": {
    "subtitle": "عملکرد شرکت در یک نگاه",
    "welcome": "خوش آمدید، {{name}}",
    "kpiInvoiced": "درآمد (فاکتورشده)",
    "kpiCollected": "وجه نقد وصول‌شده",
    "kpiOutstanding": "مانده",
    "kpiCollectionRate": "نرخ وصول",
    "trendTitle": "درآمد در برابر وصول",
    "topCustomersTitle": "مشتریان برتر بر اساس درآمد",
    "productMixTitle": "ترکیب محصول بر اساس حجم",
    "receivablesTitle": "سن مطالبات"
  },
```

- [ ] **Step 4: Verify** — `npm run build` (a JSON syntax error fails the Vite build). Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/locales/en.json src/i18n/locales/ar.json src/i18n/locales/fa.json
git commit -m "i18n: roles, executive dashboard, and auth account keys"
```

---

## Task 3: Auth store + Login page (password validation, role landing, accounts)

**Files:**
- Modify: `src/store/useAuthStore.ts`
- Modify: `src/pages/auth/LoginPage.tsx`

(These change together because `login`'s signature changes from `(email)` to `(email, password)`.)

- [ ] **Step 1: Rewrite the auth store**

Replace the entire contents of `src/store/useAuthStore.ts` with:

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Role } from '@/types';
import { USERS, normalizeRole } from '@/config/roles';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarColor: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
}

/**
 * Mock auth. Seeded accounts (see config/roles.ts) validate their password and carry a
 * real role; any other email logs in as a demo Manager (any password).
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: async (email: string, password: string) => {
        await new Promise((r) => setTimeout(r, 600));
        const target = email.trim().toLowerCase();
        const seeded = USERS.find((u) => u.email.toLowerCase() === target);
        if (seeded) {
          if (seeded.password !== password) throw new Error('invalid-credentials');
          const user: AuthUser = {
            id: `u-${seeded.role.toLowerCase()}`,
            name: seeded.name,
            email: seeded.email,
            role: seeded.role,
            avatarColor: seeded.avatarColor,
          };
          set({ user, token: 'demo-token', isAuthenticated: true });
          return user;
        }
        const name =
          email
            .split('@')[0]
            ?.replace(/[._-]+/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase()) || 'Trading Desk';
        const user: AuthUser = { id: 'u-001', name, email, role: 'Manager', avatarColor: '#b87333' };
        set({ user, token: 'demo-token', isAuthenticated: true });
        return user;
      },
      logout: () => set({ user: null, token: null, isAuthenticated: false }),
    }),
    {
      name: 'finora-auth',
      // Coerce any legacy/persisted role (e.g. 'Finance Manager') to a valid Role.
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<AuthState>) } as AuthState;
        if (merged.user) merged.user = { ...merged.user, role: normalizeRole(merged.user.role) };
        return merged;
      },
    },
  ),
);
```

- [ ] **Step 2: Update LoginPage imports**

In `src/pages/auth/LoginPage.tsx`:

Change the router import (drop `useLocation`):
```ts
import { useLocation, useNavigate } from 'react-router-dom';
```
→
```ts
import { useNavigate } from 'react-router-dom';
```

Add the roles import after the auth-store import:
```ts
import { useAuthStore } from '@/store/useAuthStore';
import { ROUTES } from '@/config/constants';
```
→
```ts
import { useAuthStore } from '@/store/useAuthStore';
import { ROUTES } from '@/config/constants';
import { ROLE_HOME, USERS } from '@/config/roles';
```

- [ ] **Step 3: Update the component body (remove `location`/`from`, role-aware submit)**

Replace (note this **removes** the `const location = useLocation();` line):
```ts
  const location = useLocation();
  const screens = useBreakpoint();
  const { message } = App.useApp();
  const login = useAuthStore((s) => s.login);
  const [loading, setLoading] = useState(false);

  const from = (location.state as { from?: Location })?.from?.pathname ?? ROUTES.dashboard;
  const isDesktop = screens.lg;

  const onFinish = async (values: LoginForm) => {
    setLoading(true);
    try {
      const user = await login(values.email);
      message.success(`${t('auth.loginSuccess')}, ${user.name}`);
      navigate(from, { replace: true });
    } finally {
      setLoading(false);
    }
  };
```
with:
```ts
  const screens = useBreakpoint();
  const { message } = App.useApp();
  const login = useAuthStore((s) => s.login);
  const [loading, setLoading] = useState(false);

  const isDesktop = screens.lg;

  const onFinish = async (values: LoginForm) => {
    setLoading(true);
    try {
      const user = await login(values.email, values.password);
      message.success(`${t('auth.loginSuccess')}, ${user.name}`);
      navigate(ROLE_HOME[user.role], { replace: true });
    } catch {
      message.error(t('auth.invalidCredentials'));
    } finally {
      setLoading(false);
    }
  };

  const fillAccount = (email: string, password: string) =>
    form.setFieldsValue({ email, password });
```

> `navigate` no longer needs `location`; `useNavigate` stays. Remove the now-unused `const navigate = useNavigate();`? No — it is still used. Only `useLocation`/`location`/`from` are removed.

- [ ] **Step 4: Add a Form instance + clickable account list**

The form currently has no `form` instance. Add one. Change:
```ts
export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
```
→
```ts
export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [form] = Form.useForm<LoginForm>();
```

Attach it to the `<Form>` — change:
```tsx
          <Form<LoginForm>
            layout="vertical"
            requiredMark={false}
            initialValues={{ email: 'amir@finora.app', password: 'demo1234', remember: true }}
```
→
```tsx
          <Form<LoginForm>
            form={form}
            layout="vertical"
            requiredMark={false}
            initialValues={{ email: 'amir@finora.app', password: 'demo1234', remember: true }}
```

Replace the demo-hint divider:
```tsx
          <Divider plain style={{ color: '#999', fontSize: 12 }}>
            {t('auth.demoHint')}
          </Divider>
```
with:
```tsx
          <Divider plain style={{ color: '#999', fontSize: 12 }}>
            {t('auth.demoAccounts')}
          </Divider>
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            {USERS.map((u) => (
              <button
                key={u.email}
                type="button"
                onClick={() => fillAccount(u.email, u.password)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  width: '100%',
                  gap: 12,
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: `1px solid ${'rgba(125,140,160,0.2)'}`,
                  background: 'transparent',
                  cursor: 'pointer',
                  font: 'inherit',
                }}
              >
                <Text strong style={{ fontSize: 12.5 }}>{t(`roles.${u.role}`)}</Text>
                <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>
                  {u.email} · {u.password}
                </Text>
              </button>
            ))}
          </Space>
```

- [ ] **Step 5: Verify** — `npm run typecheck && npm run lint && npm run build`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/store/useAuthStore.ts src/pages/auth/LoginPage.tsx
git commit -m "feat(auth): password validation, role-based landing, seeded accounts"
```

---

## Task 4: Executive summary data (API + query)

**Files:**
- Modify: `src/services/api.ts`
- Modify: `src/services/queries.ts`

- [ ] **Step 1: Append `getExecutiveSummary` to `api.ts`**

Add at the **end** of `src/services/api.ts`:

```ts
/* ----------------------------- Executive ---------------------------- */
export interface ExecutiveSummary {
  invoiced: number;
  collected: number;
  outstanding: number;
  overdue: number;
  collectionRate: number;
  invoicedGrowthPct: number;
  collectedGrowthPct: number;
  activeContracts: number;
  customers: number;
}

export async function getExecutiveSummary(): Promise<ExecutiveSummary> {
  await delay(180);
  const accounts = computeAccounts();
  const invoiced = round(sum(accounts, (a) => a.totalInvoiced));
  const collected = round(sum(accounts, (a) => a.totalPaid));
  const outstanding = round(sum(accounts, (a) => a.totalOutstanding));
  const overdue = round(sum(accounts, (a) => a.overdue));
  const collectionRate = invoiced > 0 ? round((collected / invoiced) * 100) : 0;

  const series = await getCashflowSeries();
  const growth = (sel: (p: TimeSeriesPoint) => number) => {
    if (series.length < 2) return 0;
    const last = sel(series[series.length - 1]);
    const prev = sel(series[series.length - 2]);
    return prev > 0 ? round(((last - prev) / prev) * 100) : 0;
  };

  return {
    invoiced,
    collected,
    outstanding,
    overdue,
    collectionRate,
    invoicedGrowthPct: growth((p) => p.invoiced),
    collectedGrowthPct: growth((p) => p.collected),
    activeContracts: db.contracts.filter((c) => c.status === 'ACTIVE').length,
    customers: db.customers.length,
  };
}
```

> `delay`, `round`, `sum`, `computeAccounts`, `getCashflowSeries`, `db`, and the `TimeSeriesPoint` type are all already defined/imported in `api.ts`.

- [ ] **Step 2: Add the query + key + invalidation in `queries.ts`**

(a) Add to the `qk` object after `aging`:
```ts
  aging: ['aging'] as const,
```
→
```ts
  aging: ['aging'] as const,
  executiveSummary: ['executiveSummary'] as const,
```

(b) Add the hook after `useAging`:
```ts
export const useAging = () => useQuery({ queryKey: qk.aging, queryFn: api.getAgingBuckets });
```
→
```ts
export const useAging = () => useQuery({ queryKey: qk.aging, queryFn: api.getAgingBuckets });
export const useExecutiveSummary = () =>
  useQuery({ queryKey: qk.executiveSummary, queryFn: api.getExecutiveSummary });
```

(c) In `useInvalidateTrade`, add after the `aging` invalidation:
```ts
    qc.invalidateQueries({ queryKey: qk.aging });
```
→
```ts
    qc.invalidateQueries({ queryKey: qk.aging });
    qc.invalidateQueries({ queryKey: qk.executiveSummary });
```

- [ ] **Step 3: Verify** — `npm run typecheck && npm run lint && npm run build`. Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/services/api.ts src/services/queries.ts
git commit -m "feat(api): executive summary (headline KPIs + growth)"
```

---

## Task 5: Executive Dashboard page

**Files:**
- Create: `src/pages/executive/ExecutiveDashboardPage.tsx`

- [ ] **Step 1: Create the page**

Create `src/pages/executive/ExecutiveDashboardPage.tsx` with exactly:

```tsx
import { useMemo, type ReactNode } from 'react';
import { Card, Col, Row, Skeleton, Typography, theme } from 'antd';
import {
  DollarOutlined,
  FileDoneOutlined,
  RiseOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { Money } from '@/components/common/Money';
import { CashflowChart } from '@/components/charts/CashflowChart';
import { BarChart } from '@/components/charts/BarChart';
import { DonutChart } from '@/components/charts/DonutChart';
import {
  useAccounts,
  useAging,
  useCashflow,
  useExecutiveSummary,
  useProductVolumes,
} from '@/services/queries';
import { useAuthStore } from '@/store/useAuthStore';
import { formatCompactCurrency, formatMt, formatPercent } from '@/utils/format';
import { BRAND, CHART_PALETTE } from '@/config/constants';

const { Text } = Typography;

function ChartCard({
  title,
  extra,
  loading,
  height = 300,
  children,
}: {
  title: string;
  extra?: ReactNode;
  loading?: boolean;
  height?: number;
  children: ReactNode;
}) {
  return (
    <Card
      title={title}
      extra={extra}
      variant="borderless"
      className="soft-card"
      styles={{ header: { borderBottom: 'none', fontWeight: 600 }, body: { paddingTop: 4 } }}
      style={{ height: '100%' }}
    >
      {loading ? <Skeleton active paragraph={{ rows: 5 }} style={{ height }} /> : children}
    </Card>
  );
}

export default function ExecutiveDashboardPage() {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const user = useAuthStore((s) => s.user);

  const summary = useExecutiveSummary();
  const cashflow = useCashflow();
  const accounts = useAccounts();
  const products = useProductVolumes();
  const aging = useAging();

  const s = summary.data;

  const topCustomers = useMemo(
    () => (accounts.data ?? []).slice(0, 7).map((a) => ({ name: a.name, value: a.totalInvoiced })),
    [accounts.data],
  );
  const productMix = useMemo(
    () => (products.data ?? []).slice(0, 6).map((p) => ({ name: p.product, value: p.volumeMt })),
    [products.data],
  );
  const agingData = useMemo(
    () => (aging.data ?? []).map((a) => ({ name: t(`reports.${a.bucket}`), value: a.value })),
    [aging.data, t],
  );

  return (
    <div className="fade-in">
      <PageHeader
        title={t('executive.welcome', { name: user?.name?.split(' ')[0] ?? 'there' })}
        subtitle={t('executive.subtitle')}
      />

      <Row gutter={[16, 16]} className="stagger">
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title={t('executive.kpiInvoiced')}
            value={<Money value={s?.invoiced ?? 0} compact />}
            icon={<FileDoneOutlined />}
            accent={BRAND.primary}
            trend={s?.invoicedGrowthPct}
            trendSuffix={t('common.vsLastMonth')}
            loading={summary.isLoading}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title={t('executive.kpiCollected')}
            value={<Money value={s?.collected ?? 0} compact />}
            icon={<DollarOutlined />}
            accent={BRAND.success}
            trend={s?.collectedGrowthPct}
            trendSuffix={t('common.vsLastMonth')}
            loading={summary.isLoading}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title={t('executive.kpiOutstanding')}
            value={<Money value={s?.outstanding ?? 0} compact />}
            icon={<WalletOutlined />}
            accent={BRAND.info}
            loading={summary.isLoading}
            footer={
              <Text style={{ color: token.colorTextTertiary, fontSize: 12 }}>
                {formatCompactCurrency(s?.overdue ?? 0)} {t('dashboard.overdue').toLowerCase()}
              </Text>
            }
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title={t('executive.kpiCollectionRate')}
            value={formatPercent(s?.collectionRate ?? 0)}
            icon={<RiseOutlined />}
            accent={BRAND.accent}
            loading={summary.isLoading}
            footer={
              <Text style={{ color: token.colorTextTertiary, fontSize: 12 }}>
                {s?.activeContracts ?? 0} {t('dashboard.kpiContracts').toLowerCase()}
              </Text>
            }
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <ChartCard
            title={t('executive.trendTitle')}
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('dashboard.cashflowSubtitle')}
              </Text>
            }
            loading={cashflow.isLoading}
          >
            <CashflowChart data={cashflow.data ?? []} />
          </ChartCard>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16, marginBottom: 8 }}>
        <Col xs={24} lg={8}>
          <ChartCard title={t('executive.topCustomersTitle')} loading={accounts.isLoading}>
            <BarChart
              data={topCustomers}
              layout="vertical"
              formatter={(v) => formatCompactCurrency(v)}
              color={BRAND.primary}
            />
          </ChartCard>
        </Col>
        <Col xs={24} lg={8}>
          <ChartCard title={t('executive.productMixTitle')} loading={products.isLoading}>
            <DonutChart data={productMix} colors={CHART_PALETTE} formatter={(v) => formatMt(v)} />
          </ChartCard>
        </Col>
        <Col xs={24} lg={8}>
          <ChartCard title={t('executive.receivablesTitle')} loading={aging.isLoading}>
            <BarChart data={agingData} multicolor formatter={(v) => formatCompactCurrency(v)} />
          </ChartCard>
        </Col>
      </Row>
    </div>
  );
}
```

> Mirrors `DashboardPage`'s `ChartCard` + chart usage (same `StatCard`, `CashflowChart`, `BarChart`, `DonutChart` props). The page is not yet routed; that happens in Task 6.

- [ ] **Step 2: Verify** — `npm run typecheck && npm run lint && npm run build`. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/executive/ExecutiveDashboardPage.tsx
git commit -m "feat(executive): CEO executive dashboard page"
```

---

## Task 6: Role-aware routing

**Files:**
- Modify: `src/routes/index.tsx`

- [ ] **Step 1: Replace the routes file**

Replace the entire contents of `src/routes/index.tsx` with:

```tsx
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { JSX } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { ROUTES } from '@/config/constants';
import { ROLE_ACCESS, ROLE_HOME, normalizeRole, type RouteKey } from '@/config/roles';
import { AppLayout } from '@/components/layout/AppLayout';
import LandingPage from '@/pages/landing/LandingPage';
import LoginPage from '@/pages/auth/LoginPage';
import ExecutiveDashboardPage from '@/pages/executive/ExecutiveDashboardPage';
import DashboardPage from '@/pages/dashboard/DashboardPage';
import CustomersPage from '@/pages/customers/CustomersPage';
import CustomerDetailPage from '@/pages/customers/CustomerDetailPage';
import ContractsPage from '@/pages/contracts/ContractsPage';
import ContractDetailPage from '@/pages/contracts/ContractDetailPage';
import ContainersPage from '@/pages/containers/ContainersPage';
import InvoicesPage from '@/pages/invoices/InvoicesPage';
import PaymentsPage from '@/pages/payments/PaymentsPage';
import ReportsPage from '@/pages/reports/ReportsPage';
import SettingsPage from '@/pages/settings/SettingsPage';
import NotFoundPage from '@/pages/NotFoundPage';

function RequireAuth({ children }: { children: JSX.Element }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to={ROUTES.login} replace state={{ from: location }} />;
  }
  return children;
}

/** Renders children if the current role may access `routeKey`, else redirects to the role's home. */
function RoleRoute({ routeKey, children }: { routeKey: RouteKey; children: JSX.Element }) {
  const role = normalizeRole(useAuthStore((s) => s.user?.role));
  if (!ROLE_ACCESS[role].includes(routeKey)) {
    return <Navigate to={ROLE_HOME[role]} replace />;
  }
  return children;
}

/** Redirects /app to the current role's home page. */
function RoleHome() {
  const role = normalizeRole(useAuthStore((s) => s.user?.role));
  return <Navigate to={ROLE_HOME[role]} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path={ROUTES.landing} element={<LandingPage />} />
      <Route path={ROUTES.login} element={<LoginPage />} />

      <Route
        path={ROUTES.app}
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<RoleHome />} />
        <Route path="executive" element={<RoleRoute routeKey="executive"><ExecutiveDashboardPage /></RoleRoute>} />
        <Route path="dashboard" element={<RoleRoute routeKey="dashboard"><DashboardPage /></RoleRoute>} />
        <Route path="customers" element={<RoleRoute routeKey="customers"><CustomersPage /></RoleRoute>} />
        <Route path="customers/:id" element={<RoleRoute routeKey="customers"><CustomerDetailPage /></RoleRoute>} />
        <Route path="contracts" element={<RoleRoute routeKey="contracts"><ContractsPage /></RoleRoute>} />
        <Route path="contracts/:id" element={<RoleRoute routeKey="contracts"><ContractDetailPage /></RoleRoute>} />
        <Route path="containers" element={<RoleRoute routeKey="containers"><ContainersPage /></RoleRoute>} />
        <Route path="invoices" element={<RoleRoute routeKey="invoices"><InvoicesPage /></RoleRoute>} />
        <Route path="payments" element={<RoleRoute routeKey="payments"><PaymentsPage /></RoleRoute>} />
        <Route path="reports" element={<RoleRoute routeKey="reports"><ReportsPage /></RoleRoute>} />
        <Route path="settings" element={<RoleRoute routeKey="settings"><SettingsPage /></RoleRoute>} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
```

- [ ] **Step 2: Verify** — `npm run typecheck && npm run lint && npm run build`. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/routes/index.tsx
git commit -m "feat(routes): role-guarded routes + role-aware home + executive route"
```

---

## Task 7: Role-filtered sidebar

**Files:**
- Modify: `src/components/layout/SidebarNav.tsx`

- [ ] **Step 1: Replace the sidebar**

Replace the entire contents of `src/components/layout/SidebarNav.tsx` with:

```tsx
import { type ReactNode } from 'react';
import { Menu, type MenuProps } from 'antd';
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
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Logo } from '@/components/common/Logo';
import { useUiStore } from '@/store/useUiStore';
import { useAuthStore } from '@/store/useAuthStore';
import { NAV_ITEMS, ROLE_ACCESS, normalizeRole, type NavGroup } from '@/config/roles';

interface Props {
  collapsed?: boolean;
  onNavigate?: () => void;
}

const ICONS: Record<string, ReactNode> = {
  crown: <CrownOutlined />,
  appstore: <AppstoreOutlined />,
  team: <TeamOutlined />,
  filetext: <FileTextOutlined />,
  container: <ContainerOutlined />,
  filedone: <FileDoneOutlined />,
  creditcard: <CreditCardOutlined />,
  barchart: <BarChartOutlined />,
  setting: <SettingOutlined />,
};

const GROUP_ORDER: NavGroup[] = ['main', 'operations', 'finance', 'system'];
const GROUP_LABEL: Record<NavGroup, string> = {
  main: 'nav.main',
  operations: 'nav.operations',
  finance: 'nav.finance',
  system: 'nav.system',
};

export function SidebarNav({ collapsed = false, onNavigate }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const themeMode = useUiStore((s) => s.theme);
  const isDark = themeMode === 'dark';
  const role = normalizeRole(useAuthStore((s) => s.user?.role));

  const allowed = ROLE_ACCESS[role];
  const visible = NAV_ITEMS.filter((i) => allowed.includes(i.key));

  const items: MenuProps['items'] = GROUP_ORDER.map((group) => {
    const children = visible
      .filter((i) => i.group === group)
      .map((i) => ({ key: i.route, icon: ICONS[i.icon], label: t(`nav.${i.key}`) }));
    if (children.length === 0) return null;
    return { key: `grp-${group}`, type: 'group' as const, label: t(GROUP_LABEL[group]), children };
  }).filter(Boolean) as MenuProps['items'];

  const navPaths = visible.map((i) => i.route);
  const selectedKey =
    navPaths
      .filter((p) => location.pathname.startsWith(p))
      .sort((a, b) => b.length - a.length)[0] ?? navPaths[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          paddingInline: collapsed ? 0 : 20,
          flexShrink: 0,
        }}
      >
        <Logo size={30} showText={!collapsed} color={isDark ? '#fff' : undefined} />
      </div>
      <Menu
        mode="inline"
        theme={isDark ? 'dark' : 'light'}
        items={items}
        selectedKeys={selectedKey ? [selectedKey] : []}
        style={{ border: 'none', background: 'transparent', flex: 1, paddingBottom: 16 }}
        onClick={({ key }) => {
          navigate(key);
          onNavigate?.();
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify** — `npm run typecheck && npm run lint && npm run build`. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/SidebarNav.tsx
git commit -m "feat(nav): role-filtered sidebar with Executive item"
```

---

## Task 8: Header role label

**Files:**
- Modify: `src/components/layout/AppHeader.tsx`

- [ ] **Step 1: Import `normalizeRole`**

Change:
```ts
import { useAuthStore } from '@/store/useAuthStore';
import { ROUTES } from '@/config/constants';
import { initials } from '@/utils/format';
```
→
```ts
import { useAuthStore } from '@/store/useAuthStore';
import { ROUTES } from '@/config/constants';
import { normalizeRole } from '@/config/roles';
import { initials } from '@/utils/format';
```

- [ ] **Step 2: Show the translated role label**

Change:
```tsx
              <div style={{ fontSize: 11, color: token.colorTextTertiary }}>{user?.role}</div>
```
→
```tsx
              <div style={{ fontSize: 11, color: token.colorTextTertiary }}>
                {user ? t(`roles.${normalizeRole(user.role)}`) : ''}
              </div>
```

- [ ] **Step 3: Verify** — `npm run typecheck && npm run lint && npm run build`. Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/AppHeader.tsx
git commit -m "feat(header): show translated role label"
```

---

## Task 9: Live verification

**Files:** none.

- [ ] **Step 1: Final static gate** — `npm run typecheck && npm run lint && npm run build`. Expected: all PASS.

- [ ] **Step 2: Drive each role in the preview** (dev server on port 3031)

- **CEO** — log in `ceo@finora.app / Ceo@2026`: lands on `/app/executive`; sidebar shows only **Executive · Reports · Settings**; the four blocks render (KPIs with growth arrows, cashflow trend, top customers + product mix, aging); header shows "Chief Executive"; visiting `/app/customers` redirects to `/app/executive`.
- **Manager** — `amir@finora.app / demo1234`: lands on `/app/dashboard`; full menu; operational pages work (unchanged).
- **Staff** — `staff@finora.app / Staff@2026`: lands on `/app/dashboard`; menu shows Dashboard/Customers/Contracts/Containers/Invoices only; visiting `/app/payments` or `/app/reports` redirects to `/app/dashboard`.
- **Wrong password** — `ceo@finora.app` + wrong password → error toast, stays on login.
- Check the executive page in **dark mode** and **fa (RTL)**.

Confirm via fiber/DOM where the headless preview's frozen rAF prevents screenshots.

- [ ] **Step 3: (Optional) Adversarial review** of the diff (role-guard correctness, persisted-role migration, i18n completeness, RTL), then fix findings.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git commit -m "fix(rbac): address verification findings"
```

---

## Self-review notes

- **Spec coverage:** roles+access (T1), seeded login+password+landing (T3), executive dashboard 4 blocks (T4+T5), role routes/redirect (T6), role menu (T7), header label (T8), i18n (T2), persisted-role migration (T3 `merge`+`normalizeRole`). All covered.
- **Type consistency:** `RouteKey`, `ROLE_ACCESS`, `ROLE_HOME`, `USERS`, `normalizeRole`, `NAV_ITEMS`, `NavGroup`, `ExecutiveSummary`, `useExecutiveSummary` used identically across tasks.
- **Order safety:** config/i18n/data exist before consumers; `ExecutiveDashboardPage` (T5) exists before routes import it (T6); `login(email,password)` (T3) updates the only caller (LoginPage) in the same task.
