import { useMemo, useState } from 'react';
import { Button, Card, Input, Segmented, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { PageHeader } from '@/components/common/PageHeader';
import { Money } from '@/components/common/Money';
import { StatusTag } from '@/components/common/StatusTag';
import { useContainers } from '@/services/queries';
import type { ContainerRow } from '@/services/api';
import { formatDate, formatMt, relativeDays } from '@/utils/format';
import { CONTAINER_STATUSES } from '@/config/constants';
import type { ContainerStatus } from '@/types';
import { ContainerFormModal } from '@/pages/contracts/ContainerFormModal';

const { Text } = Typography;

export default function ContainersPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useContainers();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ContainerStatus | 'ALL'>('ALL');
  const [form, setForm] = useState<{ open: boolean; container?: ContainerRow }>({ open: false });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((c) => {
      const matchesQ =
        !q ||
        c.reference.toLowerCase().includes(q) ||
        c.customerName.toLowerCase().includes(q) ||
        c.product.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
      return matchesQ && matchesStatus;
    });
  }, [data, search, statusFilter]);

  const columns: ColumnsType<ContainerRow> = [
    {
      title: t('containers.reference'),
      dataIndex: 'reference',
      fixed: 'left',
      width: 160,
      render: (v) => <Text strong style={{ fontFamily: 'monospace', fontSize: 13 }}>{v}</Text>,
    },
    { title: t('containers.contract'), dataIndex: 'contractId', width: 170, render: (v) => <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</Text> },
    { title: t('containers.product'), dataIndex: 'product', width: 200 },
    {
      title: t('containers.quantityMt'),
      dataIndex: 'quantityMt',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.quantityMt - b.quantityMt,
      render: (v) => formatMt(v),
    },
    { title: t('containers.lmePrice'), dataIndex: 'lmePrice', width: 130, align: 'right', render: (v) => <Money value={v} /> },
    { title: t('containers.shipmentDate'), dataIndex: 'shipmentDate', width: 130, sorter: (a, b) => dayjs(a.shipmentDate).valueOf() - dayjs(b.shipmentDate).valueOf(), render: (v) => formatDate(v) },
    {
      title: t('containers.dueDate'),
      dataIndex: 'dueDate',
      width: 160,
      sorter: (a, b) => dayjs(a.dueDate).valueOf() - dayjs(b.dueDate).valueOf(),
      render: (v, r) => {
        const days = relativeDays(v) ?? 0;
        return (
          <Space direction="vertical" size={0}>
            <Text style={{ fontSize: 13 }}>{formatDate(v)}</Text>
            {r.status !== 'PAID' && (
              <Tag color={days < 0 ? 'error' : days <= 7 ? 'warning' : 'default'} style={{ marginInlineStart: 0, fontSize: 11 }} bordered={false}>
                {days < 0 ? t('containers.overdueBy', { count: Math.abs(days) }) : t('containers.dueIn', { count: days })}
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: t('containers.invoice'),
      dataIndex: 'invoiceUSD',
      width: 150,
      align: 'right',
      sorter: (a, b) => a.invoiceUSD - b.invoiceUSD,
      render: (v) => <Money value={v} strong />,
    },
    { title: t('containers.status'), dataIndex: 'status', width: 120, align: 'center', render: (v) => <StatusTag status={v} /> },
    {
      title: t('common.actions'),
      key: 'actions',
      fixed: 'right',
      width: 90,
      align: 'center',
      render: (_, r) => (
        <Button
          type="link"
          size="small"
          icon={<EditOutlined />}
          onClick={() => setForm({ open: true, container: r })}
        >
          {t('common.edit')}
        </Button>
      ),
    },
  ];

  return (
    <div className="fade-in">
      <PageHeader
        title={t('containers.title')}
        subtitle={t('containers.subtitle')}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setForm({ open: true })}>
            {t('containers.newContainer')}
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
          <Segmented
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as ContainerStatus | 'ALL')}
            options={[
              { label: t('common.all'), value: 'ALL' },
              ...CONTAINER_STATUSES.map((s) => ({ label: t(`status.${s}`), value: s })),
            ]}
          />
        </div>
        <Table<ContainerRow>
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={filtered}
          scroll={{ x: 1390 }}
          pagination={{ pageSize: 12, showSizeChanger: false, hideOnSinglePage: true }}
          expandable={{
            rowExpandable: () => true,
            expandedRowRender: (r) => (
              <Space size="large" wrap>
                <span>
                  <Text type="secondary">{t('containers.blNumber')}: </Text>
                  {r.blNumber || t('common.none')}
                </span>
                <span>
                  <Text type="secondary">{t('containers.bookingNumber')}: </Text>
                  {r.bookingNumber || t('common.none')}
                </span>
                <span>
                  <Text type="secondary">{t('containers.sealNumber')}: </Text>
                  {r.sealNumber || t('common.none')}
                </span>
              </Space>
            ),
          }}
        />
      </Card>
      <ContainerFormModal
        open={form.open}
        onClose={() => setForm((s) => ({ ...s, open: false }))}
        container={form.container}
      />
    </div>
  );
}
