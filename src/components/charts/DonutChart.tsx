import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
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
