import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Empty } from 'antd';
import { useTranslation } from 'react-i18next';
import { CHART_PALETTE } from '@/config/constants';
import { useChartTheme } from './chartTheme';

export interface DonutDatum {
  name: string;
  value: number;
}

interface Props {
  data: DonutDatum[];
  height?: number;
  colors?: string[];
  formatter?: (value: number) => string;
  innerRadius?: number;
  centerLabel?: string;
  centerValue?: string;
}

export function DonutChart({
  data,
  height = 280,
  colors = CHART_PALETTE,
  formatter = (v) => String(v),
  innerRadius = 64,
  centerLabel,
  centerValue,
}: Props) {
  const c = useChartTheme();
  const { t } = useTranslation();

  // Empty when there's no data at all, OR every row is zero (spec §4) — without this, an
  // all-zero donut (e.g. the portal's paid-vs-outstanding with no invoicing history, or
  // dashboard's "Contracts by status" with no contracts) renders a floating center label with
  // no ring at all. A length-only guard would miss these fixed-length-but-all-zero series.
  if (data.length === 0 || data.every((d) => d.value === 0)) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('common.noData')} />
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={innerRadius}
            outerRadius={innerRadius + 30}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={c.tooltipContentStyle}
            itemStyle={c.tooltipItemStyle}
            formatter={(value: number) => formatter(value)}
          />
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: 12 }}
            formatter={(value) => <span style={{ color: c.text }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
      {centerValue && (
        <div
          style={{
            position: 'absolute',
            top: (height - 60) / 2 - 18,
            left: 0,
            right: 0,
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 700 }}>{centerValue}</div>
          {centerLabel && <div style={{ fontSize: 12, color: c.text }}>{centerLabel}</div>}
        </div>
      )}
    </div>
  );
}
