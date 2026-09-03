import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import 'dayjs/locale/ar';
import 'dayjs/locale/fa';
import '@/i18n/dayjs-ku';
import { useUiStore } from '@/store/useUiStore';
import { LOCALES } from '@/config/constants';

/** Keeps i18next, dayjs, <html dir/lang> and the store locale in sync. */
export function useLocaleEffect() {
  const locale = useUiStore((s) => s.locale);
  const { i18n } = useTranslation();

  useEffect(() => {
    const meta = LOCALES[locale];
    void i18n.changeLanguage(locale);
    dayjs.locale(meta.dayjsLocale);
    const html = document.documentElement;
    html.setAttribute('lang', locale);
    html.setAttribute('dir', meta.dir);
  }, [locale, i18n]);

  return locale;
}
