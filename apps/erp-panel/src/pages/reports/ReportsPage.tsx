import { useMemo, useState } from 'react';
import { Card, Col, DatePicker, Row, Skeleton, Space, Tooltip, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';
import { useTabParam } from '@/hooks/useTabParam';
import type { DateRange } from '@/services/api';
import { AccountMovementReport } from './AccountMovementReport';
import { PersonMovementReport } from './PersonMovementReport';
import { ExpenseReport } from './ExpenseReport';
import { TradeDetailReport } from './TradeDetailReport';
import { CashflowChart } from '@/components/charts/CashflowChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { BarChart } from '@/components/charts/BarChart';
import {
  useAccounts,
  useAging,
  useCashflow,
  useContracts,
  useProductVolumes,
  useStatusBreakdown,
} from '@/services/queries';
import { formatCompactCurrency, formatMt } from '@/utils/format';
import { BRAND, CHART_PALETTE } from '@/config/constants';

function ChartCard({
  title,
  loading,
  children,
}: {
  title: string;
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card
      title={title}
      variant="borderless"
      className="soft-card"
      styles={{ header: { borderBottom: 'none', fontWeight: 600 } }}
      style={{ height: '100%' }}
    >
      {loading ? <Skeleton active paragraph={{ rows: 5 }} /> : children}
    </Card>
  );
}

const TAB_KEYS = ['overview', 'accounts', 'persons', 'expenses', 'trade'] as const;
type TabKey = (typeof TAB_KEYS)[number];

const { RangePicker } = DatePicker;
const { Text } = Typography;

export default function ReportsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useTabParam(TAB_KEYS, 'overview');
  // Last 12 months by default — the same window the dashboard's cashflow chart uses, so the
  // two agree on "recent" without the user having to set anything.
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>([
    dayjs().subtract(12, 'month').startOf('day'),
    dayjs().endOf('day'),
  ]);
  const products = useProductVolumes();
  const accounts = useAccounts();
  const cashflow = useCashflow();
  const status = useStatusBreakdown();
  const aging = useAging();
  const contracts = useContracts();

  const volumeByProduct = useMemo(
    () => (products.data ?? []).map((p) => ({ name: p.product, value: p.volumeMt })),
    [products.data],
  );

  const valueByCustomer = useMemo(
    () =>
      (accounts.data ?? [])
        .slice()
        .sort((a, b) => b.totalInvoiced - a.totalInvoiced)
        .slice(0, 8)
        .map((a) => ({ name: a.name, value: a.totalInvoiced })),
    [accounts.data],
  );

  const statusMix = useMemo(
    () => (status.data ?? []).map((s) => ({ name: t(`status.${s.status}`, s.status), value: s.count })),
    [status.data, t],
  );

  const agingData = useMemo(
    () => (aging.data ?? []).map((a) => ({ name: t(`reports.${a.bucket}`), value: a.value })),
    [aging.data, t],
  );

  const incotermMix = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of contracts.data ?? []) {
      for (const it of c.items) {
        map.set(it.incoterm, (map.get(it.incoterm) ?? 0) + it.quantityMt);
      }
    }
    return [...map.entries()].map(([name, value]) => ({ name, value: Math.round(value) }));
  }, [contracts.data]);

  const overview = (
    <Row gutter={[16, 16]}>
        <Col xs={24}>
          <ChartCard title={t('reports.monthlyCashflow')} loading={cashflow.isLoading}>
            <CashflowChart data={cashflow.data ?? []} height={320} />
          </ChartCard>
        </Col>

        <Col xs={24} lg={12}>
          <ChartCard title={t('reports.volumeByProduct')} loading={products.isLoading}>
            <BarChart data={volumeByProduct} layout="vertical" height={340} multicolor formatter={(v) => formatMt(v)} />
          </ChartCard>
        </Col>
        <Col xs={24} lg={12}>
          <ChartCard title={t('reports.valueByCustomer')} loading={accounts.isLoading}>
            <BarChart data={valueByCustomer} layout="vertical" height={340} color={BRAND.info} formatter={(v) => formatCompactCurrency(v)} />
          </ChartCard>
        </Col>

        <Col xs={24} lg={8}>
          <ChartCard title={t('reports.statusDistribution')} loading={status.isLoading}>
            <DonutChart data={statusMix} formatter={(v) => `${v}`} />
          </ChartCard>
        </Col>
        <Col xs={24} lg={8}>
          <ChartCard title={t('reports.incotermMix')} loading={contracts.isLoading}>
            <DonutChart data={incotermMix} colors={CHART_PALETTE} formatter={(v) => formatMt(v)} />
          </ChartCard>
        </Col>
      <Col xs={24} lg={8}>
        <ChartCard title={t('reports.agingBuckets')} loading={aging.isLoading}>
          <BarChart data={agingData} multicolor formatter={(v) => formatCompactCurrency(v)} />
        </ChartCard>
      </Col>
    </Row>
  );

  // The range belongs to the page, not to each report: switching tabs should keep the window
  // you are looking at. Default is the last 12 months, matching the dashboard's charts.
  const range: DateRange = {
    from: dateRange?.[0]?.startOf('day').toISOString(),
    to: dateRange?.[1]?.endOf('day').toISOString(),
  };

  const TAB_CONTENT: Record<TabKey, React.ReactNode> = {
    overview,
    accounts: <AccountMovementReport range={range} />,
    persons: <PersonMovementReport range={range} />,
    expenses: <ExpenseReport range={range} />,
    trade: <TradeDetailReport range={range} />,
  };

  return (
    <div className="fade-in">
      {/* No page-level export: each report exports its own summary and detail sheets, and a
          single button here could not know which tab it was meant to write. */}
      <PageHeader title={t('reports.title')} subtitle={t('reports.subtitle')} />

      <Card
        variant="borderless"
        styles={{ body: { paddingTop: 12 } }}
        tabList={TAB_KEYS.map((key) => ({ key, label: t(`reports.tab${key[0].toUpperCase()}${key.slice(1)}`) }))}
        activeTabKey={tab}
        onTabChange={(key) => setTab(key as TabKey)}
        tabBarExtraContent={
          // The Overview charts are fixed windows of their own (rolling 12 months, all-time
          // aging), so a range picker there would be a control that changes nothing.
          tab === 'overview' ? null : (
            <Space wrap>
              <Tooltip title={t('reports.rangeHint')}>
                <Text type="secondary">{t('reports.range')}</Text>
              </Tooltip>
              <RangePicker
                value={dateRange}
                onChange={(v) => setDateRange(v as [Dayjs | null, Dayjs | null] | null)}
                placeholder={[t('reports.from'), t('reports.to')]}
                allowEmpty={[true, true]}
              />
            </Space>
          )
        }
      >
        {TAB_CONTENT[tab]}
      </Card>
    </div>
  );
}
