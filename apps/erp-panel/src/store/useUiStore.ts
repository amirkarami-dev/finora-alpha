import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Locale, ThemeMode } from '@/types';
import { LOCALES } from '@/config/constants';

interface UiState {
  theme: ThemeMode;
  locale: Locale;
  sidebarCollapsed: boolean;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setLocale: (locale: Locale) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
}

function prefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: prefersDark() ? 'dark' : 'light',
      locale: 'en',
      sidebarCollapsed: false,
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setLocale: (locale) => set({ locale }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    {
      name: 'finora-ui',
      partialize: (s) => ({
        theme: s.theme,
        locale: s.locale,
        sidebarCollapsed: s.sidebarCollapsed,
      }),
    },
  ),
);

export const isRtl = (locale: Locale) => LOCALES[locale].dir === 'rtl';
