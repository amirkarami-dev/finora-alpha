import { theme } from 'antd';

/** Shared Recharts styling derived from the active AntD theme. */
export function useChartTheme() {
  const { token } = theme.useToken();
  return {
    grid: token.colorBorderSecondary,
    axis: token.colorTextTertiary,
    text: token.colorTextSecondary,
    tooltipContentStyle: {
      background: token.colorBgElevated,
      border: `1px solid ${token.colorBorderSecondary}`,
      borderRadius: 10,
      boxShadow: token.boxShadowSecondary,
      color: token.colorText,
      fontSize: 12,
    } as React.CSSProperties,
    tooltipItemStyle: { color: token.colorText } as React.CSSProperties,
    tooltipLabelStyle: { color: token.colorTextSecondary, fontWeight: 600 } as React.CSSProperties,
  };
}
