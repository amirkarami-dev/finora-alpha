import {
  Avatar,
  Card,
  Col,
  Descriptions,
  Result,
  Row,
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
  ContainerOutlined,
  DollarOutlined,
  FallOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';
import { Money } from '@/components/common/Money';
import { StatusTag, PaymentMethodTag } from '@/components/common/StatusTag';
import {
  useAccount,
  useContractsByCustomer,
  usePaymentsByCustomer,
} from '@/services/queries';
import type { ContractRow, PaymentRow } from '@/services/api';
import { formatDate, formatMt, initials } from '@/utils/format';
import { BRAND, ROUTES } from '@/config/constants';

const { Text } = Typography;

export default function CustomerDetailPage() {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const { data: account, isLoading } = useAccount(id);
  const { data: contracts, isLoading: loadingContracts } = useContractsByCustomer(id);
  const { data: payments, isLoading: loadingPayments } = usePaymentsByCustomer(id);

  if (!isLoading && !account) {
    return <Result status="404" title={t('errors.notFoundTitle')} subTitle={t('errors.notFoundDesc')} />;
  }

  const contractColumns: ColumnsType<ContractRow> = [
    { title: t('contracts.contractId'), dataIndex: 'id', render: (v) => <Text style={{ fontFamily: 'monospace' }}>{v}</Text> },
    { title: t('contracts.date'), dataIndex: 'date', render: (v) => formatDate(v) },
    { title: t('contracts.destination'), dataIndex: 'destination', render: (v) => <Tag bordered={false}>{v}</Tag> },
    { title: t('contracts.quantity'), dataIndex: 'quantityMt', align: 'right', render: (v) => formatMt(v) },
    { title: t('contracts.value'), dataIndex: 'value', align: 'right', render: (v) => <Money value={v} strong /> },
    { title: t('contracts.status'), dataIndex: 'status', align: 'center', render: (v) => <StatusTag status={v} /> },
  ];

  const paymentColumns: ColumnsType<PaymentRow> = [
    { title: t('payments.paymentId'), dataIndex: 'id', render: (v) => <Text style={{ fontFamily: 'monospace' }}>{v}</Text> },
    { title: t('payments.date'), dataIndex: 'date', render: (v) => formatDate(v) },
    {
      title: t('payments.amount'),
      dataIndex: 'amount',
      align: 'right',
      render: (v, r) => <Money value={v} currency={r.currency} />,
    },
    { title: t('payments.amountUsd'), dataIndex: 'amountUSD', align: 'right', render: (v) => <Money value={v} strong /> },
    { title: t('payments.method'), dataIndex: 'method', align: 'center', render: (v) => <PaymentMethodTag method={v} /> },
    { title: t('payments.reference'), dataIndex: 'reference', render: (v) => <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</Text> },
  ];

  const stats = [
    { label: t('customers.outstanding'), value: account?.totalOutstanding, icon: <WalletOutlined />, color: BRAND.info },
    { label: t('customers.overdue'), value: account?.overdue, icon: <FallOutlined />, color: BRAND.danger },
    { label: t('customers.paid'), value: account?.totalPaid, icon: <DollarOutlined />, color: BRAND.success },
  ];

  return (
    <div className="fade-in">
      <PageHeader onBack title={account?.name ?? t('common.loading')} subtitle={t('customers.detailTitle')} />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card variant="borderless" loading={isLoading} style={{ height: '100%' }}>
            <Space align="center" size={16} style={{ marginBottom: 20 }}>
              <Avatar size={56} style={{ background: `${token.colorPrimary}22`, color: token.colorPrimary, fontWeight: 700, fontSize: 22 }}>
                {account ? initials(account.name) : ''}
              </Avatar>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{account?.name}</div>
                <Text type="secondary">{account?.code} · {account?.country}</Text>
              </div>
            </Space>
            <Descriptions column={1} size="small" items={[
              { key: 'contact', label: t('customers.contact'), children: account?.contactName },
              { key: 'email', label: t('auth.email'), children: account?.email },
              { key: 'phone', label: 'Phone', children: account?.phone },
              { key: 'cur', label: t('customers.currency'), children: <Tag>{account?.defaultCurrency}</Tag> },
              { key: 'terms', label: t('customers.terms'), children: account ? t('customers.termsDays', { count: account.paymentTermsDays }) : '—' },
              { key: 'containers', label: t('customers.openContainers'), children: <Tag color="processing">{account?.openContainers ?? 0}</Tag> },
            ]} />
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          <Row gutter={[16, 16]}>
            {stats.map((s) => (
              <Col xs={24} sm={8} key={s.label}>
                <Card variant="borderless" loading={isLoading} className="soft-card">
                  <Space align="center" size={12}>
                    <span style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', fontSize: 20, color: s.color, background: `${s.color}1f` }}>
                      {s.icon}
                    </span>
                    <Statistic
                      title={s.label}
                      value={s.value ?? 0}
                      precision={0}
                      prefix="$"
                      valueStyle={{ fontSize: 20, fontWeight: 700 }}
                    />
                  </Space>
                </Card>
              </Col>
            ))}
            <Col xs={24}>
              <Card variant="borderless" style={{ height: '100%' }}>
                <Space size={32} wrap>
                  <Statistic title={t('customers.contracts')} value={account?.contractCount ?? 0} prefix={<ContainerOutlined />} />
                  <Statistic title={t('customers.invoiced')} value={account?.totalInvoiced ?? 0} prefix="$" precision={0} />
                </Space>
              </Card>
            </Col>
          </Row>
        </Col>
      </Row>

      <Card variant="borderless" style={{ marginTop: 16 }} styles={{ body: { paddingTop: 8 } }}>
        <Tabs
          items={[
            {
              key: 'contracts',
              label: `${t('customers.contracts')} (${contracts?.length ?? 0})`,
              children: (
                <Table<ContractRow>
                  rowKey="id"
                  loading={loadingContracts}
                  columns={contractColumns}
                  dataSource={contracts ?? []}
                  scroll={{ x: 760 }}
                  pagination={{ pageSize: 5, hideOnSinglePage: true }}
                  onRow={(r) => ({ onClick: () => navigate(`${ROUTES.contracts}/${encodeURIComponent(r.id)}`), className: 'clickable-row' })}
                />
              ),
            },
            {
              key: 'payments',
              label: `${t('payments.title')} (${payments?.length ?? 0})`,
              children: (
                <Table<PaymentRow>
                  rowKey="id"
                  loading={loadingPayments}
                  columns={paymentColumns}
                  dataSource={payments ?? []}
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
