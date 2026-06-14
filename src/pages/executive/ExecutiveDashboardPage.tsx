import { useMemo, type ReactNode } from 'react';
import { Card, Col, Row, Skeleton, Typography, theme } from 'antd';
import {
  DollarOutlined,
  FileDoneOutlined,
  RiseOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { Money } from '@/components/common/Money';
import { CashflowChart } from '@/components/charts/CashflowChart';
import { BarChart } from '@/components/charts/BarChart';
import { DonutChart } from '@/components/charts/DonutChart';
import {
  useAccounts,
  useAging,
  useCashflow,
  useExecutiveSummary,
  useProductVolumes,
} from '@/services/queries';
import { useAuthStore } from '@/store/useAuthStore';
import { formatCompactCurrency, formatMt, formatPercent } from '@/utils/format';
import { BRAND, CHART_PALETTE } from '@/config/constants';

const { Text } = Typography;

function ChartCard({
  title,
  extra,
  loading,
  height = 300,
  children,
}: {
  title: string;
  extra?: ReactNode;
  loading?: boolean;
  height?: number;
  children: ReactNode;
}) {
  return (
    <Card
      title={title}
      extra={extra}
      variant="borderless"
      className="soft-card"
      styles={{ header: { borderBottom: 'none', fontWeight: 600 }, body: { paddingTop: 4 } }}
      style={{ height: '100%' }}
    >
      {loading ? <Skeleton active paragraph={{ rows: 5 }} style={{ height }} /> : children}
    </Card>
  );
}

export default function ExecutiveDashboardPage() {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const user = useAuthStore((s) => s.user);

  const summary = useExecutiveSummary();
  const cashflow = useCashflow();
  const accounts = useAccounts();
  const products = useProductVolumes();
  const aging = useAging();

  const s = summary.data;

  const topCustomers = useMemo(
    () => (accounts.data ?? []).slice(0, 7).map((a) => ({ name: a.name, value: a.totalInvoiced })),
    [accounts.data],
  );
  const productMix = useMemo(
    () => (products.data ?? []).slice(0, 6).map((p) => ({ name: p.product, value: p.volumeMt })),
    [products.data],
  );
  const agingData = useMemo(
    () => (aging.data ?? []).map((a) => ({ name: t(`reports.${a.bucket}`), value: a.value })),
    [aging.data, t],
  );

  return (
    <div className="fade-in">
      <PageHeader
        title={t('executive.welcome', { name: user?.name?.split(' ')[0] ?? 'there' })}
        subtitle={t('executive.subtitle')}
      />

      <Row gutter={[16, 16]} className="stagger">
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title={t('executive.kpiInvoiced')}
            value={<Money value={s?.invoiced ?? 0} compact />}
            icon={<FileDoneOutlined />}
            accent={BRAND.primary}
            trend={s?.invoicedGrowthPct}
            trendSuffix={t('common.vsLastMonth')}
            loading={summary.isLoading}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title={t('executive.kpiCollected')}
            value={<Money value={s?.collected ?? 0} compact />}
            icon={<DollarOutlined />}
            accent={BRAND.success}
            trend={s?.collectedGrowthPct}
            trendSuffix={t('common.vsLastMonth')}
            loading={summary.isLoading}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title={t('executive.kpiOutstanding')}
            value={<Money value={s?.outstanding ?? 0} compact />}
            icon={<WalletOutlined />}
            accent={BRAND.info}
            loading={summary.isLoading}
            footer={
              <Text style={{ color: token.colorTextTertiary, fontSize: 12 }}>
                {formatCompactCurrency(s?.overdue ?? 0)} {t('dashboard.overdue').toLowerCase()}
              </Text>
            }
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title={t('executive.kpiCollectionRate')}
            value={formatPercent(s?.collectionRate ?? 0)}
            icon={<RiseOutlined />}
            accent={BRAND.accent}
            loading={summary.isLoading}
            footer={
              <Text style={{ color: token.colorTextTertiary, fontSize: 12 }}>
                {s?.activeContracts ?? 0} {t('dashboard.kpiContracts').toLowerCase()}
              </Text>
            }
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <ChartCard
            title={t('executive.trendTitle')}
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('dashboard.cashflowSubtitle')}
              </Text>
            }
            loading={cashflow.isLoading}
          >
            <CashflowChart data={cashflow.data ?? []} />
          </ChartCard>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16, marginBottom: 8 }}>
        <Col xs={24} lg={8}>
          <ChartCard title={t('executive.topCustomersTitle')} loading={accounts.isLoading}>
            <BarChart
              data={topCustomers}
              layout="vertical"
              formatter={(v) => formatCompactCurrency(v)}
              color={BRAND.primary}
            />
          </ChartCard>
        </Col>
        <Col xs={24} lg={8}>
          <ChartCard title={t('executive.productMixTitle')} loading={products.isLoading}>
            <DonutChart data={productMix} colors={CHART_PALETTE} formatter={(v) => formatMt(v)} />
          </ChartCard>
        </Col>
        <Col xs={24} lg={8}>
          <ChartCard title={t('executive.receivablesTitle')} loading={aging.isLoading}>
            <BarChart data={agingData} multicolor formatter={(v) => formatCompactCurrency(v)} />
          </ChartCard>
        </Col>
      </Row>
    </div>
  );
}
