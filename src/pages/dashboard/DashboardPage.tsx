import { useMemo } from 'react';
import {
  Avatar,
  Button,
  Card,
  Col,
  List,
  Row,
  Segmented,
  Skeleton,
  Statistic,
  Tag,
  Typography,
  theme,
} from 'antd';
import {
  ContainerOutlined,
  DollarOutlined,
  DownloadOutlined,
  FallOutlined,
  FileTextOutlined,
  RiseOutlined,
  TeamOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { Money } from '@/components/common/Money';
import { StatusTag } from '@/components/common/StatusTag';
import { CashflowChart } from '@/components/charts/CashflowChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { BarChart } from '@/components/charts/BarChart';
import {
  useAccounts,
  useAging,
  useCashflow,
  useInvoices,
  useKpis,
  useProductVolumes,
  useStatusBreakdown,
} from '@/services/queries';
import { useAuthStore } from '@/store/useAuthStore';
import { formatCompactCurrency, formatMt, formatPercent, initials, relativeDays } from '@/utils/format';
import { BRAND, CHART_PALETTE, ROUTES } from '@/config/constants';

const { Text } = Typography;

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: BRAND.success,
  CLOSED: '#8a94a6',
  'ON HOLD': BRAND.warning,
  CANCELLED: BRAND.danger,
};

function ChartCard({
  title,
  extra,
  loading,
  height = 300,
  children,
}: {
  title: string;
  extra?: React.ReactNode;
  loading?: boolean;
  height?: number;
  children: React.ReactNode;
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

export default function DashboardPage() {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const kpis = useKpis();
  const cashflow = useCashflow();
  const status = useStatusBreakdown();
  const products = useProductVolumes();
  const accounts = useAccounts();
  const aging = useAging();
  const invoices = useInvoices();

  const collectedTrend = useMemo(() => {
    const d = cashflow.data;
    if (!d || d.length < 2) return undefined;
    const last = d[d.length - 1].collected;
    const prev = d[d.length - 2].collected || 1;
    return Math.round(((last - prev) / prev) * 100);
  }, [cashflow.data]);

  const topCustomers = useMemo(
    () =>
      (accounts.data ?? [])
        .filter((a) => a.totalOutstanding > 0)
        .slice(0, 7)
        .map((a) => ({ name: a.name, value: a.totalOutstanding })),
    [accounts.data],
  );

  const productMix = useMemo(
    () => (products.data ?? []).slice(0, 6).map((p) => ({ name: p.product, value: p.volumeMt })),
    [products.data],
  );

  const statusMix = useMemo(
    () => (status.data ?? []).map((s) => ({ name: t(`status.${s.status}`, s.status), value: s.count })),
    [status.data, t],
  );
  const statusColors = useMemo(
    () => (status.data ?? []).map((s) => STATUS_COLORS[s.status] ?? '#8a94a6'),
    [status.data],
  );

  const agingData = useMemo(
    () => (aging.data ?? []).map((a) => ({ name: t(`reports.${a.bucket}`), value: a.value })),
    [aging.data, t],
  );

  const recentInvoices = useMemo(() => (invoices.data ?? []).slice(0, 6), [invoices.data]);
  const upcoming = useMemo(
    () =>
      (invoices.data ?? [])
        .filter((i) => i.status !== 'PAID')
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
        .slice(0, 6),
    [invoices.data],
  );

  const k = kpis.data;

  return (
    <div className="fade-in">
      <PageHeader
        title={t('dashboard.welcome', { name: user?.name?.split(' ')[0] ?? 'there' })}
        subtitle={t('dashboard.subtitle')}
        extra={
          <>
            <Segmented
              options={[
                { label: t('common.last30Days'), value: '30' },
                { label: t('common.last12Months'), value: '365' },
              ]}
              defaultValue="365"
              className="hide-mobile"
            />
            <Button icon={<DownloadOutlined />}>{t('common.export')}</Button>
          </>
        }
      />

      {/* Primary KPIs */}
      <Row gutter={[16, 16]} className="stagger">
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title={t('dashboard.kpiOutstanding')}
            value={<Money value={k?.totalOutstanding ?? 0} compact />}
            icon={<WalletOutlined />}
            accent={BRAND.info}
            loading={kpis.isLoading}
            footer={
              <Text style={{ color: token.colorTextTertiary, fontSize: 12 }}>
                {formatCompactCurrency(k?.overdue ?? 0)} {t('dashboard.overdue').toLowerCase()}
              </Text>
            }
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title={t('dashboard.kpiOverdue')}
            value={<Money value={k?.overdue ?? 0} compact />}
            icon={<FallOutlined />}
            accent={BRAND.danger}
            loading={kpis.isLoading}
            footer={
              <Text style={{ color: token.colorTextTertiary, fontSize: 12 }}>
                {formatPercent(k && k.totalOutstanding ? (k.overdue / k.totalOutstanding) * 100 : 0)}{' '}
                {t('dashboard.kpiOutstanding').toLowerCase()}
              </Text>
            }
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title={t('dashboard.kpiCollected')}
            value={<Money value={k?.totalPaid ?? 0} compact />}
            icon={<DollarOutlined />}
            accent={BRAND.success}
            trend={collectedTrend}
            trendSuffix={t('common.vsLastMonth')}
            loading={kpis.isLoading}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title={t('dashboard.kpiCollectionRate')}
            value={formatPercent(k?.collectionRate ?? 0)}
            icon={<RiseOutlined />}
            accent={BRAND.accent}
            loading={kpis.isLoading}
            footer={
              <Text style={{ color: token.colorTextTertiary, fontSize: 12 }}>
                {formatCompactCurrency(k?.totalInvoiced ?? 0)} {t('invoices.totalInvoiced').toLowerCase()}
              </Text>
            }
          />
        </Col>
      </Row>

      {/* Secondary stat strip */}
      <Card variant="borderless" className="soft-card" style={{ marginTop: 16 }} styles={{ body: { padding: 18 } }}>
        <Row gutter={[16, 16]}>
          {[
            { icon: <FileTextOutlined />, label: t('dashboard.kpiContracts'), value: k?.activeContracts, color: BRAND.primary },
            { icon: <ContainerOutlined />, label: t('dashboard.kpiContainers'), value: k?.openContainers, color: BRAND.info },
            { icon: <TeamOutlined />, label: t('dashboard.kpiCustomers'), value: k?.customers, color: BRAND.accent },
            { icon: <DollarOutlined />, label: t('dashboard.kpiVolume'), value: k ? formatMt(k.totalVolumeMt) : '—', color: BRAND.success },
          ].map((s, i) => (
            <Col xs={12} lg={6} key={i}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 18,
                    color: s.color,
                    background: `${s.color}1f`,
                  }}
                >
                  {s.icon}
                </span>
                <Statistic
                  value={typeof s.value === 'number' ? s.value : undefined}
                  title={s.label}
                  formatter={typeof s.value === 'string' ? () => s.value as string : undefined}
                  loading={kpis.isLoading}
                  valueStyle={{ fontSize: 20, fontWeight: 700 }}
                />
              </div>
            </Col>
          ))}
        </Row>
      </Card>

      {/* Cashflow + status */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={16}>
          <ChartCard
            title={t('dashboard.cashflowTitle')}
            extra={<Text type="secondary" style={{ fontSize: 12 }}>{t('dashboard.cashflowSubtitle')}</Text>}
            loading={cashflow.isLoading}
          >
            <CashflowChart data={cashflow.data ?? []} />
          </ChartCard>
        </Col>
        <Col xs={24} lg={8}>
          <ChartCard title={t('dashboard.statusTitle')} loading={status.isLoading}>
            <DonutChart
              data={statusMix}
              colors={statusColors}
              formatter={(v) => `${v}`}
              centerValue={String((status.data ?? []).reduce((s, x) => s + x.count, 0))}
              centerLabel={t('nav.contracts')}
            />
          </ChartCard>
        </Col>
      </Row>

      {/* Top customers + product mix + aging */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={8}>
          <ChartCard title={t('dashboard.topCustomersTitle')} loading={accounts.isLoading}>
            <BarChart
              data={topCustomers}
              layout="vertical"
              formatter={(v) => formatCompactCurrency(v)}
              color={BRAND.info}
            />
          </ChartCard>
        </Col>
        <Col xs={24} lg={8}>
          <ChartCard title={t('dashboard.productMixTitle')} loading={products.isLoading}>
            <DonutChart
              data={productMix}
              colors={CHART_PALETTE}
              formatter={(v) => formatMt(v)}
            />
          </ChartCard>
        </Col>
        <Col xs={24} lg={8}>
          <ChartCard title={t('dashboard.agingTitle')} loading={aging.isLoading}>
            <BarChart data={agingData} multicolor formatter={(v) => formatCompactCurrency(v)} />
          </ChartCard>
        </Col>
      </Row>

      {/* Recent invoices + upcoming */}
      <Row gutter={[16, 16]} style={{ marginTop: 16, marginBottom: 8 }}>
        <Col xs={24} lg={14}>
          <ChartCard
            title={t('dashboard.recentInvoicesTitle')}
            loading={invoices.isLoading}
            extra={
              <Button type="link" onClick={() => navigate(ROUTES.invoices)} style={{ padding: 0 }}>
                {t('common.viewAll')}
              </Button>
            }
          >
            <List
              dataSource={recentInvoices}
              renderItem={(inv) => (
                <List.Item
                  style={{ paddingInline: 0 }}
                  actions={[<Money key="amt" value={inv.amountUSD} strong />, <StatusTag key="st" status={inv.status} />]}
                >
                  <List.Item.Meta
                    avatar={
                      <Avatar style={{ background: token.colorFillSecondary, color: token.colorText }}>
                        {initials(inv.customerName)}
                      </Avatar>
                    }
                    title={<span style={{ fontWeight: 600 }}>{inv.customerName}</span>}
                    description={
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {inv.containerReference} · {inv.product}
                      </Text>
                    }
                  />
                </List.Item>
              )}
            />
          </ChartCard>
        </Col>
        <Col xs={24} lg={10}>
          <ChartCard title={t('dashboard.upcomingDueTitle')} loading={invoices.isLoading}>
            {upcoming.length === 0 ? (
              <Text type="secondary">{t('dashboard.noUpcoming')}</Text>
            ) : (
              <List
                dataSource={upcoming}
                renderItem={(inv) => {
                  const days = relativeDays(inv.dueDate) ?? 0;
                  const overdue = days < 0;
                  return (
                    <List.Item style={{ paddingInline: 0 }} actions={[<Money key="amt" value={inv.amountUSD} strong />]}>
                      <List.Item.Meta
                        title={<span style={{ fontWeight: 600 }}>{inv.customerName}</span>}
                        description={
                          <Tag color={overdue ? 'error' : days <= 7 ? 'warning' : 'default'} style={{ marginInlineStart: 0 }}>
                            {overdue
                              ? t('containers.overdueBy', { count: Math.abs(days) })
                              : t('containers.dueIn', { count: days })}
                          </Tag>
                        }
                      />
                    </List.Item>
                  );
                }}
              />
            )}
          </ChartCard>
        </Col>
      </Row>
    </div>
  );
}
