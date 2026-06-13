import { theme as antdTheme, type ThemeConfig } from 'antd';
import { BRAND } from '@/config/constants';
import type { ThemeMode } from '@/types';

const sharedToken: ThemeConfig['token'] = {
  colorPrimary: BRAND.primary,
  colorInfo: BRAND.info,
  colorSuccess: BRAND.success,
  colorWarning: BRAND.warning,
  colorError: BRAND.danger,
  borderRadius: 10,
  fontFamily:
    "'Inter Variable', 'Inter', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Vazirmatn Variable', 'Vazirmatn', 'Noto Sans Arabic', sans-serif",
  fontSize: 14,
  wireframe: false,
};

export function getThemeConfig(mode: ThemeMode): ThemeConfig {
  const isDark = mode === 'dark';
  return {
    algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      ...sharedToken,
      colorBgLayout: isDark ? '#0b1220' : '#f4f6fb',
      colorBgContainer: isDark ? '#111a2b' : '#ffffff',
      colorBgElevated: isDark ? '#16223a' : '#ffffff',
      colorBorderSecondary: isDark ? '#1f2c45' : '#eef1f6',
    },
    components: {
      Layout: {
        headerBg: isDark ? '#0d1626' : '#ffffff',
        siderBg: isDark ? '#0d1626' : '#ffffff',
        bodyBg: isDark ? '#0b1220' : '#f4f6fb',
        headerHeight: 64,
        headerPadding: '0 20px',
      },
      Menu: {
        // Dark sidebar (dark mode): the rail stays dark navy.
        darkItemBg: '#0d1626',
        darkSubMenuItemBg: 'transparent',
        darkItemSelectedBg: BRAND.primary,
        darkItemHoverBg: 'rgba(16,163,127,0.16)',
        // Light sidebar (light mode): white rail, dark text, green selected pill.
        itemBg: 'transparent',
        subMenuItemBg: 'transparent',
        itemSelectedBg: BRAND.primary,
        itemSelectedColor: '#ffffff',
        itemHoverBg: 'rgba(16,163,127,0.10)',
        itemBorderRadius: 8,
        itemMarginInline: 8,
      },
      Card: {
        borderRadiusLG: 14,
        paddingLG: 20,
      },
      Table: {
        borderRadiusLG: 12,
        headerBg: isDark ? '#16223a' : '#f7f9fc',
        headerColor: isDark ? '#9fb3c8' : '#5b6b7f',
        // Opaque hover (the green tint flattened onto the container color). Sticky
        // fixed columns reuse this as their background, so a translucent value would
        // let the scrolling columns bleed through them on hover.
        rowHoverBg: isDark ? '#112532' : '#f3faf9',
      },
      Statistic: {
        contentFontSize: 26,
      },
      Button: {
        controlHeight: 38,
        fontWeight: 500,
      },
      Segmented: {
        borderRadius: 8,
      },
    },
  };
}
