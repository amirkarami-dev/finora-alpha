import { useMemo, useState } from 'react';
import { Button, Card, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';
import { Money } from '@/components/common/Money';
import { InvoiceStatusTag } from './statusColors';
import { useTradeInvoices } from '@/services/queries';
import type { TradeInvoiceRow } from '@/services/api';
import { formatDate } from '@/utils/format';
import { useTabParam } from '@/hooks/useTabParam';
import type { InvoiceSide, InvoiceType } from '@/types';
import { CreateInvoiceModal } from './CreateInvoiceModal';

const { Text } = Typography;

const TAB_KEYS = ['order', 'provisional', 'invoice'] as const;
type TabKey = (typeof TAB_KEYS)[number];

const TAB_TYPE_BY_SIDE: Record<InvoiceSide, Record<TabKey, InvoiceType>> = {
  PURCHASE: {
    order: 'PURCHASE_ORDER',
    provisional: 'PURCHASE_PROVISIONAL',
    invoice: 'PURCHASE_INVOICE',
  },
  SALE: {
    order: 'SALE_ORDER',
    provisional: 'SALE_PROVISIONAL',
    invoice: 'SALE_INVOICE',
  },
};

const NEW_LABEL_KEY: Record<TabKey, string> = {
  order: 'tradeInvoices.newOrder',
  provisional: 'tradeInvoices.newProvisional',
  invoice: 'tradeInvoices.newInvoice',
};

const TAB_LABEL_KEY: Record<TabKey, string> = {
  order: 'tradeInvoices.tabOrder',
  provisional: 'tradeInvoices.tabProvisional',
  invoice: 'tradeInvoices.tabInvoice',
};

interface InvoiceListTabsProps {
  side: InvoiceSide;
  title: string;
  subtitle: string;
}

export function InvoiceListTabs({ side, title, subtitle }: InvoiceListTabsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useTabParam(TAB_KEYS, 'order');
  const { data, isLoading } = useTradeInvoices(side);
  const [createOpen, setCreateOpen] = useState(false);

  const typeByTab = TAB_TYPE_BY_SIDE[side];
  const activeType = typeByTab[tab];

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { order: 0, provisional: 0, invoice: 0 };
    for (const row of data ?? []) {
      for (const key of TAB_KEYS) {
        if (row.invoiceType === typeByTab[key]) c[key] += 1;
      }
    }
    return c;
  }, [data, typeByTab]);

  const filtered = useMemo(
    () => (data ?? []).filter((row) => row.invoiceType === activeType),
    [data, activeType],
  );

  const columns: ColumnsType<TradeInvoiceRow> = [
    {
      title: t('tradeInvoices.number'),
      dataIndex: 'invoiceNumber',
      width: 160,
      render: (v) => (
        <Text strong style={{ fontFamily: 'monospace', fontSize: 13 }}>
          {v}
        </Text>
      ),
    },
    {
      title: t('tradeInvoices.date'),
      dataIndex: 'invoiceDate',
      width: 130,
      render: (v) => formatDate(v),
    },
    {
      title: t('tradeInvoices.contract'),
      dataIndex: 'contractId',
      width: 170,
      render: (v) => (
        <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 12 }}>
          {v}
        </Text>
      ),
    },
    {
      title: t('tradeInvoices.customer'),
      dataIndex: 'customerName',
      width: 200,
    },
    {
      title: t('tradeInvoices.itemCount'),
      dataIndex: 'itemCount',
      width: 90,
      align: 'center',
    },
    {
      title: t('tradeInvoices.totalAmount'),
      dataIndex: 'totalAmount',
      width: 150,
      align: 'right',
      render: (v) => <Money value={v} strong muteZero />,
    },
    {
      title: t('tradeInvoices.status.label'),
      dataIndex: 'status',
      width: 130,
      align: 'center',
      render: (v) => <InvoiceStatusTag status={v} />,
    },
    {
      title: t('tradeInvoices.sent'),
      dataIndex: 'sentAt',
      width: 100,
      align: 'center',
      render: (v) => (v ? <Tag bordered={false}>{t('tradeInvoices.sent')}</Tag> : null),
    },
  ];

  return (
    <div className="fade-in">
      <PageHeader
        title={title}
        subtitle={subtitle}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            {t(NEW_LABEL_KEY[tab])}
          </Button>
        }
      />

      <Card
        variant="borderless"
        styles={{ body: { padding: 16 } }}
        tabList={TAB_KEYS.map((key) => ({
          key,
          label: `${t(TAB_LABEL_KEY[key])} (${counts[key]})`,
        }))}
        activeTabKey={tab}
        onTabChange={(key) => setTab(key as TabKey)}
      >
        <Table<TradeInvoiceRow>
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={filtered}
          scroll={{ x: 1100 }}
          pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }}
          onRow={(r) => ({
            onClick: () => navigate(`/app/invoices/${encodeURIComponent(r.id)}`),
            className: 'clickable-row',
          })}
        />
      </Card>

      <CreateInvoiceModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        invoiceType={activeType}
      />
    </div>
  );
}
