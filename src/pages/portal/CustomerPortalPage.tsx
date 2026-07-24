import { type ReactNode } from 'react';
import {
  Card,
  Col,
  Progress,
  Result,
  Row,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
  theme,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ClockCircleOutlined,
  DollarOutlined,
  SafetyCertificateOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { Money } from '@/components/common/Money';
import { StatusTag, PaymentMethodTag } from '@/components/common/StatusTag';
import { BarChart } from '@/components/charts/BarChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { CashflowChart } from '@/components/charts/CashflowChart';
import { useCustomerPortal, usePortalCustomer } from '@/services/queries';
import type { ContractRow, PaymentRow, ReceivableInvoiceRow } from '@/services/api';
import { formatCompactCurrency, formatDate, formatMt, formatPercent } from '@/utils/format';
import { BRAND } from '@/config/constants';

const { Text } = Typography;

function ChartCard({
  title,
  loading,
  height = 280,
  children,
}: {
  title: string;
  loading?: boolean;
  height?: number;
  children: ReactNode;
}) {
  return (
    <Card
      title={title}
      variant="borderless"
      className="soft-card"
      styles={{ header: { borderBottom: 'none', fontWeight: 600 }, body: { paddingTop: 4 } }}
      style={{ height: '100%' }}
    >
      {loading ? <Skeleton active paragraph={{ rows: 5 }} style={{ height }} /> : children}
    </Card>
  );
}

export default function CustomerPortalPage() {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  // Resolution is a query, not a synchronous read off the auth user (spec §3) — the portal
  // scope now lives on the customer record (`portalAccount`), which can change (or vanish)
  // without a re-login.
  const { data: portalCustomer, isLoading: isResolving } = usePortalCustomer();
  const resolvedId = portalCustomer?.id;
  const { data, isLoading: isLoadingSummary } = useCustomerPortal(resolvedId ?? '');
  const isLoading = isResolving || isLoadingSummary;

  // Never the 404: no link at all, or a dangling one (flagged customer no longer resolves to
  // a summary — e.g. deactivated between resolution and this render), both render the same
  // translated 403.
  const noAccess = (!isResolving && !resolvedId) || (!!resolvedId && !isLoadingSummary && !data);
  if (noAccess) {
    return <Result status="403" title={t('portal.noAccessTitle')} subTitle={t('portal.noAccess')} />;
  }

  // No invoicing history at all (spec §4) → the standing badge and on-time stat must render
  // neutrally rather than a green "Good standing"/100% that reads as an earned clean record.
  const hasHistory = (data?.totalInvoiced ?? 0) > 0;
  const standingGood = hasHistory && (data?.overdue ?? 0) <= 0;
  const onTimeSharePct = data?.onTimeSharePct;
  const utilization = Math.round(data?.creditUtilizationPct ?? 0);
  const utilColor =
    utilization > 90 ? token.colorError : utilization > 75 ? BRAND.warning : token.colorPrimary;

  const agingData = (data?.aging ?? []).map((a) => ({
    name: t(`reports.${a.bucket}`),
    value: a.value,
  }));
  const paidVsOutstanding = [
    { name: t('invoices.totalPaid'), value: data?.totalPaid ?? 0 },
    { name: t('portal.outstanding'), value: data?.outstanding ?? 0 },
  ];

  const invoiceColumns: ColumnsType<ReceivableInvoiceRow> = [
    {
      title: t('tradeInvoices.number'),
      dataIndex: 'invoiceNumber',
      render: (v) => <Text style={{ fontFamily: 'monospace' }}>{v}</Text>,
    },
    {
      title: t('common.summary'),
      dataIndex: 'summary',
      render: (v) => <Tag bordered={false}>{v}</Tag>,
    },
    {
      title: t('invoices.amount'),
      dataIndex: 'totalAmount',
      align: 'right',
      render: (v) => <Money value={v} strong />,
    },
    { title: t('portal.dueDate'), dataIndex: 'dueDate', render: (v) => formatDate(v) },
    {
      title: t('portal.daysOverdue'),
      dataIndex: 'overdueDays',
      key: 'overdue',
      align: 'right',
      render: (days: number) => (days > 0 ? <Text type="danger">{days}</Text> : <Text type="secondary">—</Text>),
    },
    {
      title: t('invoices.status'),
      dataIndex: 'displayStatus',
      align: 'center',
      render: (v) => <StatusTag status={v} />,
    },
  ];

  const paymentColumns: ColumnsType<PaymentRow> = [
    {
      title: t('payments.paymentId'),
      dataIndex: 'id',
      render: (v) => <Text style={{ fontFamily: 'monospace' }}>{v}</Text>,
    },
    { title: t('payments.date'), dataIndex: 'date', render: (v) => formatDate(v) },
    {
      title: t('payments.amount'),
      dataIndex: 'amount',
      align: 'right',
      render: (v, r) => <Money value={v} currency={r.currency} />,
    },
    {
      title: t('payments.amountUsd'),
      dataIndex: 'amountUSD',
      align: 'right',
      render: (v) => <Money value={v} strong />,
    },
    {
      title: t('payments.method'),
      dataIndex: 'method',
      align: 'center',
      render: (v) => <PaymentMethodTag method={v} />,
    },
    {
      title: t('payments.reference'),
      dataIndex: 'reference',
      render: (v) => (
        <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 12 }}>
          {v}
        </Text>
      ),
    },
  ];

  const contractColumns: ColumnsType<ContractRow> = [
    {
      title: t('contracts.contractId'),
      dataIndex: 'id',
      render: (v) => <Text style={{ fontFamily: 'monospace' }}>{v}</Text>,
    },
    { title: t('contracts.date'), dataIndex: 'date', render: (v) => formatDate(v) },
    {
      title: t('contracts.destination'),
      dataIndex: 'destination',
      render: (v) => <Tag bordered={false}>{v}</Tag>,
    },
    {
      title: t('contracts.quantity'),
      dataIndex: 'quantityMt',
      align: 'right',
      render: (v) => formatMt(v),
    },
    {
      title: t('contracts.value'),
      dataIndex: 'value',
      align: 'right',
      render: (v) => <Money value={v} strong />,
    },
    {
      title: t('contracts.status'),
      dataIndex: 'status',
      align: 'center',
      render: (v) => <StatusTag status={v} />,
    },
  ];

  return (
    <div className="fade-in">
      <PageHeader
        title={data?.name ?? t('common.loading')}
        subtitle={t('portal.subtitle')}
        extra={
          !isLoading && data ? (
            <Tag
              color={!hasHistory ? 'default' : standingGood ? 'success' : 'error'}
              style={{ borderRadius: 6, fontWeight: 600, padding: '4px 12px' }}
            >
              {!hasHistory
                ? t('portal.standingNone')
                : standingGood
                  ? t('portal.standingGood')
                  : t('portal.standingAttention')}
            </Tag>
          ) : undefined
        }
      />

      <Row gutter={[16, 16]} className="stagger">
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title={t('portal.outstanding')}
            value={<Money value={data?.outstanding ?? 0} compact />}
            icon={<WalletOutlined />}
            accent={BRAND.info}
            loading={isLoading}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title={t('portal.overdue')}
            value={<Money value={data?.overdue ?? 0} compact />}
            icon={<ClockCircleOutlined />}
            accent={BRAND.danger}
            loading={isLoading}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title={t('portal.availableCredit')}
            value={<Money value={data?.availableCredit ?? 0} compact />}
            icon={<SafetyCertificateOutlined />}
            accent={BRAND.success}
            loading={isLoading}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title={t('portal.settlementRate')}
            value={formatPercent(data?.settlementRatePct ?? 0)}
            icon={<DollarOutlined />}
            accent={BRAND.accent}
            loading={isLoading}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={8}>
          <Card variant="borderless" className="soft-card" style={{ height: '100%' }} loading={isLoading}>
            <Statistic
              title={t('portal.dso')}
              value={data?.dsoDays ?? 0}
              suffix={t('common.days')}
              valueStyle={{ fontWeight: 700 }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('portal.termsDays', { count: data?.paymentTermsDays ?? 0 })}
            </Text>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card variant="borderless" className="soft-card" style={{ height: '100%' }} loading={isLoading}>
            <Text style={{ color: token.colorTextSecondary, fontSize: 13, fontWeight: 500 }}>
              {t('portal.creditUtilization')}
            </Text>
            <Progress percent={utilization} strokeColor={utilColor} style={{ marginTop: 6, marginBottom: 4 }} />
            <Space split="·" wrap>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('portal.creditLimitLabel')}: {formatCompactCurrency(data?.creditLimit ?? 0)}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('portal.availableCredit')}: {formatCompactCurrency(data?.availableCredit ?? 0)}
              </Text>
            </Space>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card variant="borderless" className="soft-card" style={{ height: '100%' }} loading={isLoading}>
            <Statistic
              title={t('portal.onTimeShare')}
              value={onTimeSharePct ?? '—'}
              precision={onTimeSharePct !== undefined ? 0 : undefined}
              suffix={onTimeSharePct !== undefined ? '%' : undefined}
              valueStyle={{
                fontWeight: 700,
                color: onTimeSharePct !== undefined ? token.colorSuccess : token.colorTextTertiary,
              }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {formatCompactCurrency(data?.totalPaid ?? 0)} {t('invoices.totalPaid').toLowerCase()}
            </Text>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <ChartCard title={t('portal.agingTitle')} loading={isLoading}>
            <BarChart data={agingData} multicolor formatter={(v) => formatCompactCurrency(v)} />
          </ChartCard>
        </Col>
        <Col xs={24} lg={12}>
          <ChartCard title={t('portal.paidVsOutstanding')} loading={isLoading}>
            <DonutChart
              data={paidVsOutstanding}
              colors={[BRAND.success, BRAND.info]}
              formatter={(v) => formatCompactCurrency(v)}
              centerValue={formatCompactCurrency(data?.outstanding ?? 0)}
              centerLabel={t('portal.outstanding')}
            />
          </ChartCard>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <ChartCard title={t('portal.invoicedVsCollected')} loading={isLoading} height={300}>
            <CashflowChart data={data?.series ?? []} />
          </ChartCard>
        </Col>
      </Row>

      <Card variant="borderless" style={{ marginTop: 16 }} styles={{ body: { paddingTop: 8 } }}>
        <Tabs
          items={[
            {
              key: 'invoices',
              label: `${t('portal.openInvoices')} (${data?.openInvoices.length ?? 0})`,
              children: (
                <Table<ReceivableInvoiceRow>
                  rowKey="id"
                  loading={isLoading}
                  columns={invoiceColumns}
                  dataSource={data?.openInvoices ?? []}
                  scroll={{ x: 760 }}
                  pagination={{ pageSize: 8, hideOnSinglePage: true }}
                  locale={{ emptyText: t('portal.noOpenInvoices') }}
                />
              ),
            },
            {
              key: 'payments',
              label: `${t('portal.payments')} (${data?.recentPayments.length ?? 0})`,
              children: (
                <Table<PaymentRow>
                  rowKey="id"
                  loading={isLoading}
                  columns={paymentColumns}
                  dataSource={data?.recentPayments ?? []}
                  scroll={{ x: 760 }}
                  pagination={{ pageSize: 8, hideOnSinglePage: true }}
                />
              ),
            },
            {
              key: 'contracts',
              label: `${t('portal.contracts')} (${data?.contracts.length ?? 0})`,
              children: (
                <Table<ContractRow>
                  rowKey="id"
                  loading={isLoading}
                  columns={contractColumns}
                  dataSource={data?.contracts ?? []}
                  scroll={{ x: 760 }}
                  pagination={{ pageSize: 5, hideOnSinglePage: true }}
                />
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
