import { useMemo, useState, type MouseEvent } from 'react';
import { Button, Card, Input, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { PageHeader } from '@/components/common/PageHeader';
import { Money } from '@/components/common/Money';
import { PaymentMethodTag } from '@/components/common/StatusTag';
import { usePayments } from '@/services/queries';
import { useTabParam } from '@/hooks/useTabParam';
import type { PaymentRow } from '@/services/api';
import { formatDate } from '@/utils/format';
import type { PaymentType } from '@/types';
import { ChequesTab } from './ChequesTab';
import { PaymentFormModal } from './PaymentFormModal';

const { Text } = Typography;

const TAB_KEYS = ['invoice', 'general', 'cheques'] as const;
type TabKey = (typeof TAB_KEYS)[number];

const TAB_TYPE: Record<'invoice' | 'general', PaymentType> = {
  invoice: 'INVOICE',
  general: 'GENERAL',
};

/** Payment list, split by type, plus the cheque register (spec item 6's "cheque on payments
 *  menu as tab"). Payment rows carry `resolvedStatus`/`resolvedType`, already defaulted
 *  server-side, so this page never has to guess what a legacy row meant. */
export default function PaymentsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useTabParam(TAB_KEYS, 'invoice');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const isPaymentTab = tab === 'invoice' || tab === 'general';
  const type = isPaymentTab ? TAB_TYPE[tab] : undefined;
  const { data, isLoading } = usePayments(type);

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
    {
      title: t('payments.paymentId'),
      dataIndex: 'id',
      width: 130,
      render: (v) => (
        <Text strong style={{ fontFamily: 'monospace' }}>
          {v}
        </Text>
      ),
    },
    {
      title: t('payments.statusLabel'),
      dataIndex: 'resolvedStatus',
      width: 120,
      align: 'center',
      render: (v: PaymentRow['resolvedStatus']) =>
        v === 'DRAFT' ? <Tag>{t('payments.status.DRAFT')}</Tag> : <Tag color="success">{t('payments.status.CONFIRMED')}</Tag>,
    },
    { title: t('payments.person'), dataIndex: 'customerName', width: 200 },
    {
      title: t('payments.date'),
      dataIndex: 'date',
      width: 130,
      sorter: (a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf(),
      defaultSortOrder: 'descend',
      render: (v) => formatDate(v),
    },
    {
      title: t('payments.amount'),
      dataIndex: 'amount',
      width: 150,
      align: 'right',
      render: (v, r) => <Money value={v} currency={r.currency} />,
    },
    {
      title: t('payments.amountUsd'),
      dataIndex: 'amountUSD',
      width: 150,
      align: 'right',
      sorter: (a, b) => a.amountUSD - b.amountUSD,
      render: (v) => <Money value={v} strong />,
    },
    ...(tab === 'invoice'
      ? ([{ title: t('payments.items'), dataIndex: 'itemCount', width: 90, align: 'center' }] as ColumnsType<PaymentRow>)
      : []),
    { title: t('payments.method'), dataIndex: 'method', width: 130, align: 'center', render: (v) => <PaymentMethodTag method={v} /> },
    {
      title: t('payments.invoiceColumn'),
      key: 'invoice',
      width: 150,
      onCell: () => ({ onClick: (e: MouseEvent) => e.stopPropagation() }),
      render: (_, r) =>
        r.invoiceId ? (
          <Button
            type="link"
            size="small"
            style={{ padding: 0, height: 'auto', fontFamily: 'monospace' }}
            onClick={() => navigate(`/app/invoices/${encodeURIComponent(r.invoiceId!)}`)}
          >
            {r.invoiceNumber ?? r.invoiceId}
          </Button>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
  ];

  return (
    <div className="fade-in">
      <PageHeader
        title={t('payments.title')}
        subtitle={t('payments.subtitle')}
        extra={
          isPaymentTab && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
              {t(`payments.new${tab === 'invoice' ? 'Invoice' : 'General'}Payment`)}
            </Button>
          )
        }
      />

      <Card
        variant="borderless"
        styles={{ body: { padding: 16 } }}
        tabList={[
          { key: 'invoice', label: t('payments.tabInvoice') },
          { key: 'general', label: t('payments.tabGeneral') },
          { key: 'cheques', label: t('payments.tabCheques') },
        ]}
        activeTabKey={tab}
        onTabChange={(key) => setTab(key as TabKey)}
      >
        {tab === 'cheques' ? (
          <ChequesTab />
        ) : (
          <>
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
              scroll={{ x: 1200 }}
              pagination={{ pageSize: 12, showSizeChanger: false, hideOnSinglePage: true }}
              onRow={(r) => ({
                onClick: () => navigate(`/app/payments/${encodeURIComponent(r.id)}`),
                className: 'clickable-row',
              })}
              locale={{
                emptyText: (
                  <Space direction="vertical" size={2} style={{ padding: 24 }}>
                    <Text>{t(`payments.empty${tab === 'invoice' ? 'Invoice' : 'General'}Title`)}</Text>
                    <Text type="secondary">{t(`payments.empty${tab === 'invoice' ? 'Invoice' : 'General'}Hint`)}</Text>
                  </Space>
                ),
              }}
            />
          </>
        )}
      </Card>

      {formOpen && isPaymentTab && (
        <PaymentFormModal open onClose={() => setFormOpen(false)} type={TAB_TYPE[tab]} />
      )}
    </div>
  );
}
