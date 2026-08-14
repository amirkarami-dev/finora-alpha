import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Currency } from '@/types';
import { APP_NAME, DEFAULT_FX_AED_PER_USD, DEFAULT_FX_IQD_PER_USD, defaultFxFor } from '@/config/constants';

interface SettingsState {
  baseCurrency: Currency;
  /** AED per 1 USD. */
  fxRate: number;
  /** IQD per 1 USD. A separate field rather than a map: two rates do not justify reshaping a
   *  persisted store, and a rename would drop every user's saved AED rate. */
  fxRateIqd: number;
  companyName: string;
  setBaseCurrency: (c: Currency) => void;
  setFxRate: (n: number) => void;
  setFxRateIqd: (n: number) => void;
  setCompanyName: (s: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      baseCurrency: 'USD',
      fxRate: DEFAULT_FX_AED_PER_USD,
      fxRateIqd: DEFAULT_FX_IQD_PER_USD,
      companyName: `${APP_NAME} Metals DMCC`,
      setBaseCurrency: (baseCurrency) => set({ baseCurrency }),
      setFxRate: (fxRate) => set({ fxRate }),
      setFxRateIqd: (fxRateIqd) => set({ fxRateIqd }),
      setCompanyName: (companyName) => set({ companyName }),
    }),
    {
      name: 'finora-settings',
      // No `version` bump / `migrate`: zustand's persist merges the saved partial over the
      // initializer, so a store saved before `fxRateIqd` existed simply picks up its default.
      // Bumping would have reset everyone's company name and AED rate for no reason.
    },
  ),
);

/**
 * Returns the rate a form should prefill when its currency changes.
 *
 * A hook so call sites stay a one-liner and cannot forget IQD — see `defaultFxFor`'s comment
 * for the bug this shape prevents.
 */
export function useDefaultFxRate(): (currency: Currency) => number {
  const aed = useSettingsStore((s) => s.fxRate);
  const iqd = useSettingsStore((s) => s.fxRateIqd);
  return (currency) => defaultFxFor(currency, { aed, iqd });
}
