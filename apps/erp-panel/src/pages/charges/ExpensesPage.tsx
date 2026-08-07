import { ChargeListPage } from './ChargeListPage';

/** `PurchasePage`/`SalePage` precedent (design spec §6/§9 Phase 5's gate): a three-line wrapper
 *  parameterising the shared `ChargeListPage` by direction. Do NOT add a `RevenuesPage` here —
 *  that is Phase 5, and its existence as an equally thin wrapper is the proof the
 *  direction-parameterisation in `ChargeListPage`/`ChargeDocFormModal`/`ChargeDocDetailPage`/
 *  `ChargeLineFormModal` was done correctly in this phase. */
export default function ExpensesPage() {
  return <ChargeListPage direction="EXPENSE" />;
}
