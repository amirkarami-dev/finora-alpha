import { useMemo, useState, type MouseEvent } from 'react';
import { App, Button, Card, Col, Popconfirm, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';
import { Money } from '@/components/common/Money';
import { useTabParam } from '@/hooks/useTabParam';
import {
  useCancelExpense,
  useCostCentres,
  useCustomers,
  useExpenses,
  useInvoiceOptions,
} from '@/services/queries';
import { formatDate } from '@/utils/format';
import type { Expense, ExpenseType } from '@/types';
import { ExpenseFormModal } from './ExpenseFormModal';

const { Text } = Typography;

const TAB_KEYS = ['invoice', 'general', 'claim'] as const;
type TabKey = (typeof TAB_KEYS)[number];
const TAB_TYPE: Record<TabKey, ExpenseType> = { invoice: 'INVOICE', general: 'GENERAL', claim: 'CLAIM' };
const NEW_LABEL_KEY: Record<TabKey, string> = {
  invoice: 'expenses.newInvoiceExpense',
  general: 'expenses.newGeneralExpense',
  claim: 'expenses.newClaim',
};

export default function ExpensesPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useTabParam(TAB_KEYS, 'invoice');

  const { data, isLoading } = useExpenses(TAB_TYPE[tab]);
  const { data: costCentres } = useCostCentres();
  const { data: customers } = useCustomers();
  const { data: invoiceOptions } = useInvoiceOptions();
  const cancelMut = useCancelExpense();

  const [formState, setFormState] = useState<{ open: boolean; expense?: Expense }>({ open: false });

  const costCentreById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of costCentres ?? []) map.set(c.id, c.name);
    return map;
  }, [costCentres]);

  const customerById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of customers ?? []) map.set(c.id, c.name);
    return map;
  }, [customers]);

  const invoiceNumberById = useMemo(() => {
    const map = new Map<string, string>();
    for (const inv of invoiceOptions ?? []) map.set(inv.id, inv.invoiceNumber);
    return map;
  }, [invoiceOptions]);

  const rows = useMemo(() => data ?? [], [data]);
  // Deliberately NOT memoized on `rows`: `cancelExpense` (and other expense mutations) flip
  // `status`/`amountUSD` on the SAME expense object `rows` already holds, synchronously —
  // before the invalidated query's refetch resolves into a new array reference. A
  // `useMemo(..., [rows])` here recomputed only once that new reference landed, so the tile sat
  // one render behind the table (which reads `r.status` straight off the row objects and so
  // always shows the current value). Summing on every render keeps the two in lockstep; the
  // list is small enough that this costs nothing.
  const totalUSD = rows.filter((e) => e.status !== 'CANCELLED').reduce((s, e) => s + e.amountUSD, 0);

  const cancelExpense = async (id: string) => {
    try {
      await cancelMut.mutateAsync(id);
      message.success(t('expenses.cancelled'));
    } catch {
      message.error(t('common.saveFailed'));
    }
  };

  const columns: ColumnsType<Expense> = [
    { title: t('expenses.date'), dataIndex: 'date', width: 130, sorter: (a, b) => a.date.localeCompare(b.date), defaultSortOrder: 'descend', render: (v) => formatDate(v) },
    { title: t('expenses.expenseTitle'), dataIndex: 'title', width: 260, ellipsis: true, render: (v, r) => (
        <Text strong delete={r.status === 'CANCELLED'} type={r.status === 'CANCELLED' ? 'secondary' : undefined}>
          {v}
        </Text>
      ) },
    {
      title: t('expenses.typeCategory'),
      key: 'typeCategory',
      width: 170,
      render: (_, r) =>
        r.expenseType === 'CLAIM' ? (
          <Tag color="volcano">{r.claimType ? t(`claimTypes.${r.claimType}`) : '—'}</Tag>
        ) : r.category ? (
          <Tag>{t(`expenseCategories.${r.category}`)}</Tag>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: t('expenses.partyOrInvoice'),
      key: 'partyOrInvoice',
      width: 220,
      onCell: () => ({ onClick: (e: MouseEvent) => e.stopPropagation() }),
      render: (_, r) => {
        const invNumber = r.invoiceId ? invoiceNumberById.get(r.invoiceId) : undefined;
        if (r.expenseType === 'CLAIM') {
          const partyName = r.partyId ? customerById.get(r.partyId) ?? '—' : '—';
          return (
            <Space direction="vertical" size={0}>
              <Text>{partyName}</Text>
              {invNumber && (
                <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                  {invNumber}
                </Text>
              )}
            </Space>
          );
        }
        if (r.expenseType === 'INVOICE') {
          return r.invoiceId ? (
            <Button
              type="link"
              size="small"
              style={{ padding: 0, height: 'auto', fontFamily: 'monospace' }}
              onClick={() => navigate(`/app/invoices/${encodeURIComponent(r.invoiceId!)}`)}
            >
              {invNumber ?? r.invoiceId}
            </Button>
          ) : (
            <Text type="secondary">—</Text>
          );
        }
        return <Text type="secondary">—</Text>;
      },
    },
    {
      title: t('costCentres.title'),
      key: 'costCentre',
      width: 160,
      render: (_, r) => (r.costCentreId ? costCentreById.get(r.costCentreId) ?? '—' : <Text type="secondary">—</Text>),
    },
    {
      title: t('expenses.amount'),
      key: 'amount',
      width: 140,
      align: 'right',
      render: (_, r) => <Money value={r.amount} currency={r.currency} />,
    },
    {
      title: t('expenses.amountUsd'),
      dataIndex: 'amountUSD',
      width: 140,
      align: 'right',
      sorter: (a, b) => a.amountUSD - b.amountUSD,
      render: (v) => <Money value={v} strong />,
    },
    {
      title: t('customers.status'),
      key: 'status',
      width: 110,
      align: 'center',
      render: (_, r) =>
        r.status === 'CANCELLED' ? <Tag>{t('expenses.statusCancelled')}</Tag> : <Tag color="success">{t('expenses.statusActive')}</Tag>,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 170,
      align: 'right',
      onCell: () => ({ onClick: (e: MouseEvent) => e.stopPropagation() }),
      render: (_, r) =>
        r.status === 'CANCELLED' ? (
          <Text type="secondary">—</Text>
        ) : (
          <Space>
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => setFormState({ open: true, expense: r })}>
              {t('common.edit')}
            </Button>
            <Popconfirm
              title={t('expenses.cancelConfirm')}
              okText={t('common.yes')}
              cancelText={t('common.no')}
              onConfirm={() => cancelExpense(r.id)}
            >
              <Button type="link" size="small" danger>
                {t('common.cancel')}
              </Button>
            </Popconfirm>
          </Space>
        ),
    },
  ];

  return (
    <div className="fade-in">
      <PageHeader
        title={t('expenses.title')}
        subtitle={t('expenses.subtitle')}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormState({ open: true, expense: undefined })}>
            {t(NEW_LABEL_KEY[tab])}
          </Button>
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={8}>
          <Card variant="borderless" className="soft-card">
            <Statistic
              key={totalUSD}
              title={t('expenses.totalUsd')}
              value={totalUSD}
              prefix="$"
              precision={0}
              valueStyle={{ fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card variant="borderless" className="soft-card">
            <Statistic title={t('common.results')} value={rows.length} valueStyle={{ fontWeight: 700 }} />
          </Card>
        </Col>
      </Row>

      <Card
        variant="borderless"
        styles={{ body: { padding: 16 } }}
        tabList={[
          { key: 'invoice', label: t('expenses.tabInvoice') },
          { key: 'general', label: t('expenses.tabGeneral') },
          { key: 'claim', label: t('expenses.tabClaim') },
        ]}
        activeTabKey={tab}
        onTabChange={(key) => setTab(key as TabKey)}
      >
        <Table<Expense>
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={rows}
          scroll={{ x: 1500 }}
          pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }}
        />
      </Card>

      <ExpenseFormModal
        open={formState.open}
        onClose={() => setFormState((s) => ({ ...s, open: false }))}
        expense={formState.expense}
        defaultExpenseType={TAB_TYPE[tab]}
      />
    </div>
  );
}
