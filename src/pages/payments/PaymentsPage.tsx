import { useMemo, useState } from 'react';
import { App, Button, Card, Col, Input, Row, Statistic, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { PageHeader } from '@/components/common/PageHeader';
import { Money } from '@/components/common/Money';
import { PaymentMethodTag } from '@/components/common/StatusTag';
import { usePayments } from '@/services/queries';
import type { PaymentRow } from '@/services/api';
import { formatDate, formatNumber } from '@/utils/format';

const { Text } = Typography;

export default function PaymentsPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { data, isLoading } = usePayments();
  const [search, setSearch] = useState('');

  const totalReceived = useMemo(() => (data ?? []).reduce((s, p) => s + p.amountUSD, 0), [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter(
      (p) =>
        p.id.toLowerCase().includes(q) ||
        p.customerName.toLowerCase().includes(q) ||
        (p.reference ?? '').toLowerCase().includes(q),
    );
  }, [data, search]);

  const columns: ColumnsType<PaymentRow> = [
    { title: t('payments.paymentId'), dataIndex: 'id', fixed: 'left', width: 130, render: (v) => <Text strong style={{ fontFamily: 'monospace' }}>{v}</Text> },
    { title: t('payments.customer'), dataIndex: 'customerName', width: 200, sorter: (a, b) => a.customerName.localeCompare(b.customerName) },
    { title: t('payments.date'), dataIndex: 'date', width: 130, sorter: (a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf(), defaultSortOrder: 'descend', render: (v) => formatDate(v) },
    { title: t('payments.amount'), dataIndex: 'amount', width: 150, align: 'right', render: (v, r) => <Money value={v} currency={r.currency} /> },
    { title: t('payments.fxRate'), dataIndex: 'fxRate', width: 110, align: 'right', render: (v: number) => (v === 1 ? <Text type="secondary">—</Text> : formatNumber(v, 4)) },
    { title: t('payments.amountUsd'), dataIndex: 'amountUSD', width: 150, align: 'right', sorter: (a, b) => a.amountUSD - b.amountUSD, render: (v) => <Money value={v} strong /> },
    { title: t('payments.method'), dataIndex: 'method', width: 130, align: 'center', filters: [
        { text: 'TT', value: 'TT' },
        { text: 'Cash', value: 'Cash' },
        { text: 'Cheque', value: 'Cheque' },
        { text: 'Offset', value: 'Offset' },
        { text: 'Credit Note', value: 'Credit Note' },
      ], onFilter: (val, r) => r.method === val, render: (v) => <PaymentMethodTag method={v} /> },
    { title: t('payments.reference'), dataIndex: 'reference', width: 160, render: (v) => <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 12 }}>{v || '—'}</Text> },
  ];

  return (
    <div className="fade-in">
      <PageHeader
        title={t('payments.title')}
        subtitle={t('payments.subtitle')}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => message.info(t('common.comingSoon'))}>
            {t('payments.newPayment')}
          </Button>
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={8}>
          <Card variant="borderless" className="soft-card">
            <Statistic title={t('payments.totalReceived')} value={totalReceived} prefix="$" precision={0} valueStyle={{ fontWeight: 700, color: '#30a46c' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card variant="borderless" className="soft-card">
            <Statistic title={t('common.results')} value={data?.length ?? 0} valueStyle={{ fontWeight: 700 }} />
          </Card>
        </Col>
      </Row>

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
        <Table<PaymentRow>
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={filtered}
          scroll={{ x: 1160 }}
          pagination={{ pageSize: 12, showSizeChanger: false, hideOnSinglePage: true }}
        />
      </Card>
    </div>
  );
}
