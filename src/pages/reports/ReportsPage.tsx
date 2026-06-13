import { useMemo } from 'react';
import { Button, Card, Col, Row, Skeleton } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';
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

export default function ReportsPage() {
  const { t } = useTranslation();
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

  return (
    <div className="fade-in">
      <PageHeader
        title={t('reports.title')}
        subtitle={t('reports.subtitle')}
        extra={<Button icon={<DownloadOutlined />}>{t('common.export')}</Button>}
      />

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
    </div>
  );
}
