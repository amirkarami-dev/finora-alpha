---
name: finora-ui
description: Build or change any UI in Finora — a page, table, form, modal, chart, KPI card, layout or styling tweak. Encodes this repo's AntD/i18n/RTL/token conventions and the verify loop (lint, typecheck, i18n parity, headless screenshots) that must run before the work is called done. Use whenever the task touches src/pages, src/components, src/theme, or any locale file.
---

# Finora UI implementation

## Non-negotiables

Every one of these is checkable. Do not report UI work as done until all pass.

1. **No hard-coded user-facing strings.** Add the key to **all three** locale files
   (`src/i18n/locales/{en,ar,fa}.json`) and render with `t('...')`. `ar`/`fa` must be
   real translations, not English copies. Verify: `npm run i18n:check`.
2. **No hard-coded colors.** Read them from `const { token } = theme.useToken()`.
   The only literals allowed are `BRAND` / `CHART_PALETTE` in `src/config/constants.ts`;
   charts pull from `src/components/charts/chartTheme.ts`.
3. **RTL-safe by construction.** Logical CSS only — `marginInlineStart`, `paddingInlineEnd`,
   `insetInlineStart`, `textAlign: 'start'`. Never `marginLeft`/`right`/`left`.
   Directional icons rotate: `<ArrowLeftOutlined rotate={isRtl ? 180 : 0} />`
   (see `src/components/common/PageHeader.tsx`).
4. **Reuse the primitives.** Money → `components/common/Money.tsx`. Statuses →
   `StatusTag.tsx`. Page titles/back button → `PageHeader.tsx`. KPIs → `StatCard.tsx`.
   Dates/numbers → `utils/format.ts`. Never reformat money or dates inline.
5. **Data only through hooks.** Components call hooks from `src/services/queries.ts`;
   those call `src/services/api.ts`. A component must never import `src/mock/data.ts`.
   New data need → add the selector in `api.ts`, the hook + query key in `queries.ts`
   (`qk` map), then consume it.
6. **Empty state is the default state.** The app boots with zero rows. Every new
   surface must look intentional with no data — pass a translated `Empty`/description,
   never render `NaN`, `0` where a dash belongs, or a broken chart axis.
7. **Both themes, three locales, two widths.** Light + dark, en/ar/fa, 1440px + 390px.

## Where things go

```
src/pages/<feature>/<Feature>Page.tsx   one folder per route
src/routes/index.tsx                    route entry (behind RequireAuth)
src/config/constants.ts                 ROUTES path + enums + brand palette
src/components/layout/SidebarNav.tsx    nav entry
src/services/queries.ts                 the hook you consume
src/i18n/locales/{en,ar,fa}.json        keys, all three, same shape
```

Adding a page = those six touch points, in that order. Missing the `ROUTES` entry or
the locale keys is the usual failure.

## Pattern to copy

`src/pages/customers/CustomersPage.tsx` is the reference implementation: `useTranslation`,
`theme.useToken()`, `App.useApp()` for messages, a `queries.ts` hook, `ColumnsType<T>` with
translated `title`s, `Money`/`StatusTag` in cells, a `FormModal` sibling for create/edit.
Read it before writing a new list page. For forms, copy its `CustomerFormModal`.

## Verify loop — run this, don't assume

```bash
npm run verify              # lint + typecheck + i18n parity, all three must pass
npm run build               # tsc -b && vite build
npm run preview &           # serves dist on :4173
npm run smoke               # Playwright: screenshots to /tmp/finora-shots + console-error gate
```

`npm run smoke` is the one that catches what type-checking cannot: it loads the app in
headless Chromium across light/dark, en/fa/ar, desktop/mobile, and **exits non-zero on any
console error, page error, or failed request**. Screenshots land in `/tmp/finora-shots`.

**Look at the screenshots.** Read them back with the Read tool — that is the closest thing
to "did this actually render correctly". Check: RTL mirroring, text overflow, truncated
table columns at 390px, contrast in dark mode, empty-state framing. If the change adds a
route not covered by `scripts/smoke.mjs`, add a `shot(...)` call for it in the right
context block.

## Reporting

State what you verified and what you did not. "lint/typecheck/i18n clean, smoke green,
reviewed the dark-mode and fa-RTL screenshots" is a real report. "Should work" is not.
If a check fails and you cannot fix it inside the task's scope, say so with the output.
