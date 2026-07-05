import { useMemo, useState } from 'react';
import { Button, Card, Col, Input, Row, Segmented, Statistic, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { PageHeader } from '@/components/common/PageHeader';
import { Money } from '@/components/common/Money';
import { StatusTag } from '@/components/common/StatusTag';
import { useShipmentInvoices } from '@/services/queries';
import { formatDate, formatMt } from '@/utils/format';
import { CONTAINER_STATUSES, ROUTES } from '@/config/constants';
import type { ContainerStatus, ShipmentInvoice } from '@/types';

const { Text } = Typography;

export default function InvoicesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading } = useShipmentInvoices();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ContainerStatus | 'ALL'>('ALL');

  const summary = useMemo(() => {
    const all = data ?? [];
    const invoiced = all.reduce((s, i) => s + i.amountUSD, 0);
    const paid = all.filter((i) => i.status === 'PAID').reduce((s, i) => s + i.amountUSD, 0);
    return { invoiced, paid, outstanding: invoiced - paid };
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((i) => {
      const matchesQ =
        !q ||
        i.containerReference.toLowerCase().includes(q) ||
        i.customerName.toLowerCase().includes(q) ||
        i.id.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'ALL' || i.status === statusFilter;
      return matchesQ && matchesStatus;
    });
  }, [data, search, statusFilter]);

  const columns: ColumnsType<ShipmentInvoice> = [
    { title: t('invoices.number'), dataIndex: 'id', fixed: 'left', width: 180, render: (v) => <Text strong style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</Text> },
    { title: t('invoices.customer'), dataIndex: 'customerName', width: 190, sorter: (a, b) => a.customerName.localeCompare(b.customerName) },
    { title: t('containers.product'), dataIndex: 'product', width: 190 },
    { title: t('containers.quantityMt'), dataIndex: 'quantityMt', width: 110, align: 'right', render: (v) => formatMt(v) },
    { title: t('invoices.amount'), dataIndex: 'amountUSD', width: 150, align: 'right', sorter: (a, b) => a.amountUSD - b.amountUSD, render: (v) => <Money value={v} strong /> },
    { title: t('invoices.issueDate'), dataIndex: 'issueDate', width: 130, sorter: (a, b) => dayjs(a.issueDate).valueOf() - dayjs(b.issueDate).valueOf(), render: (v) => formatDate(v) },
    { title: t('invoices.dueDate'), dataIndex: 'dueDate', width: 130, render: (v) => formatDate(v) },
    { title: t('invoices.status'), dataIndex: 'status', width: 120, align: 'center', render: (v) => <StatusTag status={v} /> },
  ];

  return (
    <div className="fade-in">
      <PageHeader
        title={t('invoices.title')}
        subtitle={t('invoices.subtitle')}
        extra={<Button icon={<DownloadOutlined />}>{t('common.export')}</Button>}
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }} className="stagger">
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="soft-card">
            <Statistic title={t('invoices.totalInvoiced')} value={summary.invoiced} prefix="$" precision={0} valueStyle={{ fontWeight: 700 }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="soft-card">
            <Statistic title={t('invoices.totalPaid')} value={summary.paid} prefix="$" precision={0} valueStyle={{ fontWeight: 700, color: '#30a46c' }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="soft-card">
            <Statistic title={t('invoices.totalOutstanding')} value={summary.outstanding} prefix="$" precision={0} valueStyle={{ fontWeight: 700, color: '#3b82f6' }} />
          </Card>
        </Col>
      </Row>

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
        <Table<ShipmentInvoice>
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={filtered}
          scroll={{ x: 1100 }}
          pagination={{ pageSize: 12, showSizeChanger: false, hideOnSinglePage: true }}
          onRow={(r) => ({ onClick: () => navigate(`${ROUTES.contracts}/${encodeURIComponent(r.contractId)}`), className: 'clickable-row' })}
        />
      </Card>
    </div>
  );
}
