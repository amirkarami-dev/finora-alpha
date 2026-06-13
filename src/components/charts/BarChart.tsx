import {
  Bar,
  BarChart as ReBarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_PALETTE } from '@/config/constants';
import { useChartTheme } from './chartTheme';

export interface BarDatum {
  name: string;
  value: number;
}

interface Props {
  data: BarDatum[];
  height?: number;
  layout?: 'horizontal' | 'vertical';
  color?: string;
  multicolor?: boolean;
  formatter?: (value: number) => string;
}

export function BarChart({
  data,
  height = 280,
  layout = 'horizontal',
  color = CHART_PALETTE[0],
  multicolor = false,
  formatter = (v) => String(v),
}: Props) {
  const c = useChartTheme();
  const isVertical = layout === 'vertical';

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ReBarChart
        data={data}
        layout={layout}
        margin={{ top: 8, right: 16, left: isVertical ? 8 : 0, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} horizontal={!isVertical} vertical={isVertical} />
        {isVertical ? (
          <>
            <XAxis
              type="number"
              stroke={c.axis}
              tickLine={false}
              axisLine={false}
              fontSize={12}
              tickFormatter={(v) => formatter(Number(v))}
            />
            <YAxis
              type="category"
              dataKey="name"
              stroke={c.axis}
              tickLine={false}
              axisLine={false}
              fontSize={12}
              width={140}
            />
          </>
        ) : (
          <>
            <XAxis dataKey="name" stroke={c.axis} tickLine={false} axisLine={false} fontSize={12} />
            <YAxis
              stroke={c.axis}
              tickLine={false}
              axisLine={false}
              fontSize={12}
              width={52}
              tickFormatter={(v) => formatter(Number(v))}
            />
          </>
        )}
        <Tooltip
          contentStyle={c.tooltipContentStyle}
          itemStyle={c.tooltipItemStyle}
          labelStyle={c.tooltipLabelStyle}
          formatter={(value: number) => formatter(value)}
          cursor={{ fill: 'rgba(125,140,160,0.08)' }}
        />
        <Bar dataKey="value" radius={isVertical ? [0, 6, 6, 0] : [6, 6, 0, 0]} maxBarSize={34}>
          {data.map((_, i) => (
            <Cell key={i} fill={multicolor ? CHART_PALETTE[i % CHART_PALETTE.length] : color} />
          ))}
        </Bar>
      </ReBarChart>
    </ResponsiveContainer>
  );
}
