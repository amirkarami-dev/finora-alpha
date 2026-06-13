import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import type { TimeSeriesPoint } from '@/types';
import { formatCompactCurrency } from '@/utils/format';
import { BRAND } from '@/config/constants';
import { useChartTheme } from './chartTheme';

export function CashflowChart({ data, height = 300 }: { data: TimeSeriesPoint[]; height?: number }) {
  const c = useChartTheme();
  const { t } = useTranslation();

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="collectedFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BRAND.primary} stopOpacity={0.35} />
            <stop offset="100%" stopColor={BRAND.primary} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
        <XAxis dataKey="month" stroke={c.axis} tickLine={false} axisLine={false} fontSize={12} />
        <YAxis
          stroke={c.axis}
          tickLine={false}
          axisLine={false}
          fontSize={12}
          width={52}
          tickFormatter={(v) => formatCompactCurrency(Number(v))}
        />
        <Tooltip
          contentStyle={c.tooltipContentStyle}
          itemStyle={c.tooltipItemStyle}
          labelStyle={c.tooltipLabelStyle}
          formatter={(value: number) => formatCompactCurrency(value)}
          cursor={{ fill: 'rgba(125,140,160,0.08)' }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
        <Bar
          dataKey="invoiced"
          name={t('dashboard.invoiced')}
          fill={BRAND.info}
          radius={[6, 6, 0, 0]}
          maxBarSize={26}
        />
        <Area
          type="monotone"
          dataKey="collected"
          name={t('dashboard.collected')}
          stroke={BRAND.primary}
          strokeWidth={2.5}
          fill="url(#collectedFill)"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
