# Finora

> A modern web platform for **metals & commodities trading receivables** — contracts, LME-priced goods, container shipments, invoices and customer balances.

Finora replaces a spreadsheet-based workflow ("Customers Accounts" workbook) with a real application: a marketing landing page, authentication, and a full operations panel with a finance dashboard.

Built with **React + TypeScript + Ant Design 5**, fully **responsive**, **dark/light** themed, and **multilingual** (English, Arabic, Persian) with complete **RTL** support. Runs entirely on realistic **mock data** — no backend required.

---

## ✨ Features

- **Landing page** — hero, product preview, features, CTA.
- **Login** — split-screen demo auth (any credentials work).
- **Dashboard** — KPIs (outstanding, overdue, collected, collection rate), cashflow chart, contract-status donut, top customers, product mix, receivables aging, recent invoices and an upcoming/overdue feed.
- **Customers** — searchable/sortable account table; detail view with profile, balances, contracts and payment ledger.
- **Contracts → Goods → Containers** — each contract holds **many goods (items)**, each with `Quantity (MT)`, `LME %`, `LME Fixed`, `Fixed LME Price`, `Premium (USD/MT)`, `Incoterm`, `Status`, `Notes` and live `Remaining MT`. Drill into containers/shipments per contract.
- **Containers** — shipment register with due-date and overdue tracking.
- **Invoices** — one invoice per container with paid/outstanding summary.
- **Payments** — multi-currency cash receipts (USD/AED) with FX conversion.
- **Reports** — six analytics charts (cashflow, volume by product, value by customer, status, incoterm mix, aging).
- **Settings** — theme, language, base currency, FX rate, company profile.
- **i18n + RTL** — `en` / `ar` / `fa`, direction-aware layout, AntD + dayjs locale sync.
- **Theming** — light/dark via AntD `ConfigProvider` design tokens, persisted.

## 🧮 Domain model & pricing

Derived from the original trading workbook:

```
Customer 1─* Contract 1─* Item (goods) 1─* Container (shipment)
Customer 1─* Payment
```

Pricing (validated against real workbook figures):

```
unitPrice (USD/MT) = fixedLmePrice × (lmePercent / 100) + premium
invoice    (USD)   = unitPrice × quantityMt
AED → USD          = amountAED / fxRate          (fxRate ≈ 3.6725 AED per USD)
```

> Example: `11,685 × 94.76% + 0 ≈ 11,072 USD/MT` → matches the Alco Metal contract `AM-P-251101156`, which is seeded verbatim as a reference record.

## 🛠 Tech stack

| Concern | Choice |
|---|---|
| Build | Vite 6 + TypeScript (strict) |
| UI | Ant Design 5, `@ant-design/icons` |
| Routing | React Router 6 |
| Data layer | TanStack Query over an async mock-service layer |
| State | Zustand (persisted UI / auth / settings) |
| i18n | i18next + react-i18next + language detector |
| Charts | Recharts (theme-aware) |
| Dates | dayjs |

## 🚀 Getting started

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm run build      # type-check + production build → dist/
npm run preview    # serve the production build on :4173
npm run lint       # ESLint (flat config)
npm run typecheck  # tsc project build
npm run smoke      # Playwright screenshots + console-error check (needs preview running)
```

**Demo login:** any email + password. The form is pre-filled.

## 📁 Project structure

```
src/
├── components/
│   ├── charts/        # Recharts wrappers (cashflow, donut, bar) + chart theme
│   ├── common/        # Logo, StatCard, StatusTag, Money, PageHeader, switchers
│   └── layout/        # AppLayout, SidebarNav, AppHeader
├── config/            # constants, enums, route map, brand palette
├── hooks/             # useLocaleEffect (i18n/dir/dayjs sync)
├── i18n/              # i18next setup + en/ar/fa locale JSON
├── mock/              # deterministic seeded dataset
├── pages/             # landing, auth, dashboard, customers, contracts,
│                      # containers, invoices, payments, reports, settings
├── routes/            # router + protected routes
├── services/          # mock async API + React Query hooks
├── store/             # zustand stores (ui, auth, settings)
├── theme/             # AntD light/dark design tokens
├── types/             # domain types
└── utils/             # formatting + pricing calculations
```

## 📝 Notes

- All data is **mock and deterministic** (seeded), so figures are stable across reloads. Swapping in a real API means replacing `src/services/api.ts`.
- Numbers render in Latin digits across all locales for finance clarity, while labels and layout localize fully.
