import type { ReactNode } from 'react';
import { Card, Skeleton, Typography, theme } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface StatCardProps {
  title: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  accent?: string;
  trend?: number;
  trendSuffix?: ReactNode;
  footer?: ReactNode;
  loading?: boolean;
}

export function StatCard({
  title,
  value,
  icon,
  accent = '#10a37f',
  trend,
  trendSuffix,
  footer,
  loading,
}: StatCardProps) {
  const { token } = theme.useToken();
  const trendUp = (trend ?? 0) >= 0;

  return (
    <Card className="kpi-card" styles={{ body: { padding: 18 } }} variant="borderless">
      <span className="kpi-glow" style={{ background: accent }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: token.colorTextSecondary, fontSize: 13, fontWeight: 500 }}>
          {title}
        </Text>
        {icon && (
          <span
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              display: 'grid',
              placeItems: 'center',
              fontSize: 18,
              color: accent,
              background: `${accent}1f`,
            }}
          >
            {icon}
          </span>
        )}
      </div>

      {loading ? (
        <Skeleton.Button active block style={{ height: 34, marginTop: 12, width: '70%' }} />
      ) : (
        <div
          style={{
            fontSize: 26,
            fontWeight: 700,
            marginTop: 10,
            letterSpacing: -0.5,
            fontVariantNumeric: 'tabular-nums',
            color: token.colorText,
          }}
        >
          {value}
        </div>
      )}

      <div style={{ marginTop: 8, minHeight: 22 }}>
        {trend !== undefined && !loading && (
          <span
            style={{
              color: trendUp ? token.colorSuccess : token.colorError,
              fontSize: 13,
              fontWeight: 600,
              marginInlineEnd: 6,
            }}
          >
            {trendUp ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {Math.abs(trend)}%
          </span>
        )}
        {trendSuffix && !loading && (
          <Text style={{ color: token.colorTextTertiary, fontSize: 12 }}>{trendSuffix}</Text>
        )}
        {footer && !loading && footer}
      </div>
    </Card>
  );
}
