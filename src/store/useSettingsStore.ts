import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Currency } from '@/types';
import { APP_NAME, DEFAULT_FX_AED_PER_USD } from '@/config/constants';

interface SettingsState {
  baseCurrency: Currency;
  fxRate: number;
  companyName: string;
  setBaseCurrency: (c: Currency) => void;
  setFxRate: (n: number) => void;
  setCompanyName: (s: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      baseCurrency: 'USD',
      fxRate: DEFAULT_FX_AED_PER_USD,
      companyName: `${APP_NAME} Metals DMCC`,
      setBaseCurrency: (baseCurrency) => set({ baseCurrency }),
      setFxRate: (fxRate) => set({ fxRate }),
      setCompanyName: (companyName) => set({ companyName }),
    }),
    { name: 'finora-settings' },
  ),
);
