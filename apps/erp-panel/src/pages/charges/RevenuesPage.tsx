import { ChargeListPage } from './ChargeListPage';

/** design spec §9 Phase 5 — the `PurchasePage`/`SalePage` precedent's twin: a three-line wrapper
 *  parameterising the shared `ChargeListPage` by direction. Its existence as an equally thin
 *  wrapper (no shared-component changes needed) is the proof that Phase 4's direction-
 *  parameterisation was done correctly — see the gate note on `ExpensesPage.tsx`. */
export default function RevenuesPage() {
  return <ChargeListPage direction="REVENUE" />;
}
