import { useMemo, useState } from 'react';
import { App, Avatar, Button, Card, Input, Popconfirm, Segmented, Space, Table, Tag, Tooltip, Typography, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';
import { Money } from '@/components/common/Money';
import { useAccounts, useSetCustomerActive } from '@/services/queries';
import { initials } from '@/utils/format';
import { CURRENCIES, ROUTES } from '@/config/constants';
import type { CustomerAccount, CustomerType } from '@/types';
import { CustomerFormModal } from './CustomerFormModal';
import { PersonLedgerModal } from './PersonLedgerModal';

const { Text } = Typography;

/** Every person type, in display order — one list drives both the column filter and the tag
 *  colours, so adding a type cannot leave the two out of step. */
const PERSON_TYPES: CustomerType[] = ['BUYER', 'SUPPLIER', 'BOTH', 'EMPLOYEE', 'OTHER'];

const TYPE_COLOR: Record<CustomerType, string> = {
  BUYER: 'green',
  SUPPLIER: 'gold',
  BOTH: 'purple',
  EMPLOYEE: 'blue',
  OTHER: 'default',
};

export default function CustomersPage() {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { data, isLoading } = useAccounts();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [formState, setFormState] = useState<{ open: boolean; customer?: CustomerAccount }>({ open: false });
  const [ledgerFor, setLedgerFor] = useState<{ id: string; name: string } | null>(null);
  const setActive = useSetCustomerActive();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((c) => {
      const matchesStatus =
        statusFilter === 'all' ? true : statusFilter === 'active' ? c.active : !c.active;
      const matchesQ = !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
      return matchesStatus && matchesQ;
    });
  }, [data, search, statusFilter]);

  const columns: ColumnsType<CustomerAccount> = [
    {
      title: t('customers.name'),
      dataIndex: 'name',
      fixed: 'left',
      width: 240,
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (_, r) => (
        <Space>
          <Avatar style={{ background: `${token.colorPrimary}22`, color: token.colorPrimary, fontWeight: 700 }}>
            {initials(r.name)}
          </Avatar>
          <div style={{ lineHeight: 1.3 }}>
            <div style={{ fontWeight: 600 }}>
              {r.name}
              {!r.active && (
                <Tag style={{ marginInlineStart: 8 }}>{t('common.inactive')}</Tag>
              )}
              {r.portalAccount && (
                <Tag color="blue" style={{ marginInlineStart: 8 }}>{t('customers.portalBadge')}</Tag>
              )}
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {r.code} · {r.country}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: t('customers.currency'),
      dataIndex: 'defaultCurrency',
      width: 100,
      align: 'center',
      // From CURRENCIES, not a hand-written pair: a hardcoded list silently made any person in
      // a newly-added currency unfilterable.
      filters: CURRENCIES.map((c) => ({ text: c, value: c })),
      onFilter: (v, r) => r.defaultCurrency === v,
      render: (v) => <Tag>{v}</Tag>,
    },
    {
      title: t('customers.type'),
      dataIndex: 'customerType',
      width: 150,
      align: 'center',
      filters: PERSON_TYPES.map((v) => ({ text: t(`customerTypes.${v}`), value: v })),
      onFilter: (v, r) => r.customerType === v,
      render: (v: CustomerType) => <Tag color={TYPE_COLOR[v]}>{t(`customerTypes.${v}`)}</Tag>,
    },
    {
      title: t('customers.terms'),
      dataIndex: 'paymentTermsDays',
      width: 110,
      align: 'center',
      sorter: (a, b) => a.paymentTermsDays - b.paymentTermsDays,
      render: (v) => t('customers.termsDays', { count: v }),
    },
    {
      // The two-sided position, not the sale-only receivable. Click it for the movements behind
      // it — that is the whole point of the figure, so it is a button, not static text.
      title: t('customers.balance'),
      dataIndex: 'netBalance',
      width: 170,
      align: 'right',
      sorter: (a, b) => a.netBalance - b.netBalance,
      defaultSortOrder: 'descend',
      render: (v: number, r) => (
        <Tooltip title={t('customers.balanceHint')}>
          <Button
            type="link"
            size="small"
            style={{ padding: 0, height: 'auto' }}
            onClick={(e) => {
              e.stopPropagation();
              setLedgerFor({ id: r.id, name: r.name });
            }}
          >
            <Money value={v} strong muteZero signed />
          </Button>
        </Tooltip>
      ),
    },
    {
      title: t('customers.overdue'),
      dataIndex: 'overdue',
      width: 140,
      align: 'right',
      sorter: (a, b) => a.overdue - b.overdue,
      render: (v) => <Money value={v} muteZero colored />,
    },
    {
      title: t('customers.paid'),
      dataIndex: 'totalPaid',
      width: 150,
      align: 'right',
      sorter: (a, b) => a.totalPaid - b.totalPaid,
      render: (v) => <Money value={v} muteZero />,
    },
    {
      title: t('customers.contracts'),
      dataIndex: 'contractCount',
      width: 110,
      align: 'center',
      sorter: (a, b) => a.contractCount - b.contractCount,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      fixed: 'right',
      width: 180,
      align: 'right',
      onCell: () => ({ onClick: (e) => e.stopPropagation() }),
      render: (_, r) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              setFormState({ open: true, customer: r });
            }}
          >
            {t('common.edit')}
          </Button>
          <Popconfirm
            title={r.active ? t('common.deactivateConfirm') : t('common.activateConfirm')}
            okText={t('common.yes')}
            cancelText={t('common.no')}
            onConfirm={async () => {
              try {
                // Capture the INTENDED next state before awaiting: the mock API mutates the
                // record in place, so a post-await `r.active` already reads the flipped value
                // and the toast would announce the opposite of what just happened.
                const next = !r.active;
                await setActive.mutateAsync({ id: r.id, active: next });
                message.success(next ? t('customers.activated') : t('customers.deactivated'));
              } catch {
                message.error(t('common.saveFailed'));
              }
            }}
          >
            <Button type="link" size="small" danger={r.active}>
              {r.active ? t('common.deactivate') : t('common.activate')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="fade-in">
      <PageHeader
        title={t('customers.title')}
        subtitle={t('customers.subtitle')}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormState({ open: true, customer: undefined })}>
            {t('customers.newCustomer')}
          </Button>
        }
      />

      <Card variant="borderless" styles={{ body: { padding: 16 } }}>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 300 }}
          />
          <Space wrap>
            <Segmented
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as 'active' | 'inactive' | 'all')}
              options={[
                { label: t('common.active'), value: 'active' },
                { label: t('common.inactive'), value: 'inactive' },
                { label: t('common.all'), value: 'all' },
              ]}
            />
            <Text type="secondary">{t('customers.totalCustomers', { count: filtered.length })}</Text>
          </Space>
        </div>
        <Table<CustomerAccount>
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={filtered}
          scroll={{ x: 1330 }}
          pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }}
          onRow={(r) => ({ onClick: () => navigate(`${ROUTES.customers}/${r.id}`), className: 'clickable-row' })}
        />
      </Card>
      <CustomerFormModal
        open={formState.open}
        onClose={() => setFormState((s) => ({ ...s, open: false }))}
        customer={formState.customer}
      />
      {ledgerFor && (
        <PersonLedgerModal
          open
          onClose={() => setLedgerFor(null)}
          personId={ledgerFor.id}
          personName={ledgerFor.name}
        />
      )}
    </div>
  );
}
