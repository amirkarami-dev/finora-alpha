import { useEffect, useMemo } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, App as AntdApp } from 'antd';
import enUS from 'antd/locale/en_US';
import arEG from 'antd/locale/ar_EG';
import faIR from 'antd/locale/fa_IR';
import type { Locale as AntdLocale } from 'antd/es/locale';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRoutes } from '@/routes';
import { getThemeConfig } from '@/theme/tokens';
import { useUiStore } from '@/store/useUiStore';
import { useLocaleEffect } from '@/hooks/useLocaleEffect';
import { LOCALES } from '@/config/constants';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const ANTD_LOCALES: Record<string, AntdLocale> = {
  en: enUS,
  ar: arEG,
  fa: faIR,
};

function ThemedApp() {
  const themeMode = useUiStore((s) => s.theme);
  const locale = useLocaleEffect();

  const themeConfig = useMemo(() => getThemeConfig(themeMode), [themeMode]);
  const direction = LOCALES[locale].dir;

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
