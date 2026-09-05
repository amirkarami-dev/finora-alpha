"use client";

import { useEffect, useRef, useState } from "react";
import { localeLabels, locales, type Locale } from "@/lib/locales";
import { useLocale } from "./LocaleProvider";

export default function LanguageSwitcher({ mobile = false }: { mobile?: boolean }) {
  const { locale, setLocale } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const chooseLocale = (next: Locale) => {
    setLocale(next);
    setOpen(false);
  };

  const languageLabel = locale === "en" ? "Language" : locale === "ar" ? "اللغة" : "زمان";

  return (
    <div ref={rootRef} className={`locale-switcher${mobile ? " locale-switcher-mobile" : ""}`}>
      <span className="locale-switcher-label">{languageLabel}</span>
      <button
        type="button"
        className="locale-trigger"
        aria-label={languageLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{localeLabels[locale]}</span>
        <svg className="locale-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className={`locale-menu${open ? " is-open" : ""}`} role="menu" aria-label={languageLabel}>
        {(Object.keys(localeLabels) as Locale[]).map((code) => (
          <button
            key={code}
            type="button"
            role="menuitemradio"
            aria-checked={locale === code}
            className={`locale-option${locale === code ? " is-active" : ""}`}
            onClick={() => chooseLocale(code)}
          >
            <span className="locale-code">{localeLabels[code]}</span>
            <span className="locale-name">{locales[code].language}</span>
            <span className="locale-check" aria-hidden="true">✓</span>
          </button>
        ))}
      </div>
    </div>
  );
}
