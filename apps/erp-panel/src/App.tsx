import { useEffect, useMemo } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, App as AntdApp } from 'antd';
import enUS from 'antd/locale/en_US';
import arEG from 'antd/locale/ar_EG';
import faIR from 'antd/locale/fa_IR';
import kuIQ from '@/i18n/antd-ku';
import type { Locale as AntdLocale } from 'antd/es/locale';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppRoutes } from '@/routes';
import { getThemeConfig } from '@/theme/tokens';
import { useUiStore } from '@/store/useUiStore';
import { useAuthStore } from '@/store/useAuthStore';
import { hydrateFromServer, setServerBacked } from '@/services/snapshot';
import { queryClient } from '@/services/queryClient';
import { useLocaleEffect } from '@/hooks/useLocaleEffect';
import { LOCALES } from '@/config/constants';

const ANTD_LOCALES: Record<string, AntdLocale> = {
  en: enUS,
  ar: arEG,
  fa: faIR,
  ku: kuIQ,
};

function ThemedApp() {
  const themeMode = useUiStore((s) => s.theme);
  const locale = useLocaleEffect();
  const restore = useAuthStore((s) => s.restore);

  const themeConfig = useMemo(() => getThemeConfig(themeMode), [themeMode]);
  const direction = LOCALES[locale].dir;

  // Two things the app cannot know without asking: whether there is a session (the cookie is
  // HttpOnly) and what the data is (it lives on the server now). Both run once on load, in
  // parallel; RequireAuth holds the route until the session answer arrives, and the store is
  // filled before any page reads it.
  useEffect(() => {
    void (async () => {
      const [, hydrated] = await Promise.all([restore(), hydrateFromServer()]);
      // Only push local edits to a backend that actually answered. Without this the app would
      // try to sync to an API that is not there and log a failure on every keystroke.
      setServerBacked(hydrated);
    })();
  }, [restore]);

  useEffect(() => {
    const bg = themeMode === 'dark' ? '#0b1220' : '#f4f6fb';
    document.body.style.backgroundColor = bg;
    document.documentElement.style.colorScheme = themeMode;
  }, [themeMode]);

  return (
    <ConfigProvider
      theme={themeConfig}
      direction={direction}
      locale={ANTD_LOCALES[locale]}
      componentSize="middle"
    >
      <AntdApp
        notification={{ placement: direction === 'rtl' ? 'topLeft' : 'topRight' }}
        message={{ maxCount: 3 }}
      >
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemedApp />
    </QueryClientProvider>
  );
}
