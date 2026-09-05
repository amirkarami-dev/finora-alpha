"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { locales, type Locale } from "@/lib/locales";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: typeof locales.en;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function getInitialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const saved = window.localStorage.getItem("jjm-locale");
  if (saved === "en" || saved === "ku" || saved === "ar") return saved;
  const browserLocale = navigator.language.toLowerCase();
  if (browserLocale.startsWith("ku")) return "ku";
  if (browserLocale.startsWith("ar")) return "ar";
  return "en";
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem("jjm-locale", next);
  };

  useEffect(() => {
    const direction = locale === "en" ? "ltr" : "rtl";
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
    document.body.dataset.locale = locale;
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, t: locales[locale] }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used inside LocaleProvider");
  return context;
}