import { useMemo, useState } from 'react';
import { Button, Card, Input, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { PageHeader } from '@/components/common/PageHeader';
import { useContainers } from '@/services/queries';
import type { ContainerRow } from '@/services/api';
import { formatDate, formatMt } from '@/utils/format';
import { ContainerFormModal } from '@/pages/containers/ContainerFormModal';

const { Text } = Typography;

export default function ContainersPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useContainers();
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<{ open: boolean; container?: ContainerRow }>({ open: false });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((c) => {
      return !q || c.reference.toLowerCase().includes(q) || c.goodsSummary.toLowerCase().includes(q);
    });
  }, [data, search]);

  const columns: ColumnsType<ContainerRow> = [
    {
      title: t('containers.reference'),
      dataIndex: 'reference',
      fixed: 'left',
      width: 160,
      render: (v) => <Text strong style={{ fontFamily: 'monospace', fontSize: 13 }}>{v}</Text>,
    },
    { title: t('containers.goods'), dataIndex: 'goodsSummary', width: 220 },
    {
      title: t('containers.totalQty'),
      dataIndex: 'totalQtyMt',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.totalQtyMt - b.totalQtyMt,
      render: (v) => formatMt(v),
    },
    {
      title: t('containers.grossWeight'),
      dataIndex: 'grossWeightKg',
      width: 140,
      align: 'right',
      render: (v?: number) => (v != null ? v.toLocaleString() : <Text type="secondary">—</Text>),
    },
    {
      title: t('containers.netWeight'),
      dataIndex: 'netWeightKg',
      width: 140,
      align: 'right',
      render: (v?: number) => (v != null ? v.toLocaleString() : <Text type="secondary">—</Text>),
    },
    {
      title: t('containers.shipmentDate'),
      dataIndex: 'shipmentDate',
      width: 130,
      sorter: (a, b) => dayjs(a.shipmentDate).valueOf() - dayjs(b.shipmentDate).valueOf(),
      render: (v) => formatDate(v),
    },
    {
      title: t('containers.arrivalDate'),
      dataIndex: 'arrivalDate',
      width: 130,
      render: (v?: string) => (v ? formatDate(v) : <Text type="secondary">—</Text>),
    },
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
        <div style={{ marginBottom: 16 }}>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 300 }}
          />
        </div>
        <Table<ContainerRow>
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={filtered}
          scroll={{ x: 1150 }}
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
