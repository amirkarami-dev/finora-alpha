import { useMemo, useState } from 'react';
import { Button, Card, Input, Progress, Segmented, Table, Tabs, Tag, Typography, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { PageHeader } from '@/components/common/PageHeader';
import { Money } from '@/components/common/Money';
import { StatusTag } from '@/components/common/StatusTag';
import { useContracts } from '@/services/queries';
import type { ContractRow } from '@/services/api';
import { formatDate, formatMt } from '@/utils/format';
import { CONTRACT_STATUSES, ROUTES } from '@/config/constants';
import type { ContractStatus, ContractType } from '@/types';
import { ContractFormModal } from './ContractFormModal';

const { Text } = Typography;

export default function ContractsPage() {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const { data, isLoading } = useContracts();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ContractStatus | 'ALL'>('ALL');
  const [formOpen, setFormOpen] = useState(false);
  const [tab, setTab] = useState<ContractType>('SELL');

  const sellCount = (data ?? []).filter((c) => c.contractType === 'SELL').length;
  const purchaseCount = (data ?? []).filter((c) => c.contractType === 'PURCHASE').length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((c) => {
      const matchesQ =
        !q ||
        c.id.toLowerCase().includes(q) ||
        c.customerName.toLowerCase().includes(q) ||
        c.destination.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
      return matchesQ && matchesStatus && c.contractType === tab;
    });
  }, [data, search, statusFilter, tab]);

  const columns: ColumnsType<ContractRow> = [
    {
      title: t('contracts.contractId'),
      dataIndex: 'id',
      fixed: 'left',
      width: 180,
      render: (v) => <Text strong style={{ fontFamily: 'monospace', fontSize: 13 }}>{v}</Text>,
    },
    {
      title: t('contracts.customer'),
      dataIndex: 'customerName',
      width: 200,
      sorter: (a, b) => a.customerName.localeCompare(b.customerName),
    },
    {
      title: t('contracts.date'),
      dataIndex: 'date',
      width: 130,
      sorter: (a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf(),
      render: (v) => formatDate(v),
    },
    {
      title: t('contracts.destination'),
      dataIndex: 'destination',
      width: 130,
      render: (v) => <Tag bordered={false}>{v}</Tag>,
    },
    {
      title: t('contracts.items'),
      dataIndex: 'items',
      width: 100,
      align: 'center',
      render: (_, r) => <Tag color="blue">{r.items.length}</Tag>,
    },
    {
      title: t('contracts.quantity'),
      dataIndex: 'quantityMt',
      width: 130,
      align: 'right',
      sorter: (a, b) => a.quantityMt - b.quantityMt,
      render: (v) => formatMt(v),
    },
    {
      title: t('contracts.value'),
      dataIndex: 'value',
      width: 150,
      align: 'right',
      sorter: (a, b) => a.value - b.value,
      render: (v) => <Money value={v} strong />,
    },
    {
      title: t('contracts.progress'),
      dataIndex: 'shippedPct',
      width: 150,
      render: (v: number) => (
        <Progress
          percent={Math.round(v)}
          size="small"
          strokeColor={token.colorPrimary}
          format={(p) => `${p}%`}
        />
      ),
    },
    {
      title: t('contracts.status'),
      dataIndex: 'status',
      width: 120,
      align: 'center',
      render: (v) => <StatusTag status={v} />,
    },
  ];

  return (
    <div className="fade-in">
      <PageHeader
        title={t('contracts.title')}
        subtitle={t('contracts.subtitle')}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
            {t('contracts.newContract')}
          </Button>
        }
      />

      <Card variant="borderless" styles={{ body: { padding: 16 } }}>
        <Tabs
          activeKey={tab}
          onChange={(k) => setTab(k as ContractType)}
          items={[
            { key: 'SELL', label: `${t('contracts.sellTab')} (${sellCount})` },
            { key: 'PURCHASE', label: `${t('contracts.purchaseTab')} (${purchaseCount})` },
          ]}
        />
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 300 }}
          />
          <Segmented
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as ContractStatus | 'ALL')}
            options={[
              { label: t('common.all'), value: 'ALL' },
              ...CONTRACT_STATUSES.map((s) => ({ label: t(`status.${s}`), value: s })),
            ]}
          />
        </div>
        <Table<ContractRow>
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={filtered}
          scroll={{ x: 1180 }}
          pagination={{ pageSize: 10, showSizeChanger: false, hideOnSinglePage: true }}
          onRow={(r) => ({
            onClick: () => navigate(`${ROUTES.contracts}/${encodeURIComponent(r.id)}`),
            className: 'clickable-row',
          })}
        />
      </Card>

      <ContractFormModal open={formOpen} onClose={() => setFormOpen(false)} contractType={tab} />
    </div>
  );
}
