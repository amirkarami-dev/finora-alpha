import { useMemo, useState } from 'react';
import { Button, Card, Segmented, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { Money } from '@/components/common/Money';
import { useTradeDetailReport } from '@/services/queries';
import { formatDate, formatNumber, formatQty } from '@/utils/format';
import { datedFileName, downloadXlsx } from '@/utils/exportXlsx';
import type { DateRange, TradeDetailRow } from '@/services/api';

const { Text } = Typography;

type SideFilter = 'ALL' | 'SALE' | 'PURCHASE';

/** Latin identifiers (invoice numbers, container references) stay LTR and monospace even in an
 *  Arabic or Farsi UI — a reference read right-to-left is a different reference. */
const IDENTIFIER_STYLE = { fontFamily: 'monospace' } as const;

/** A master row: one invoice and the item rows that belong to it. */
interface InvoiceRow {
  invoiceId: string;
  invoiceNumber: string;
  side: TradeDetailRow['side'];
  date: string;
  personName: string;
  currency: TradeDetailRow['currency'];
  quantityMt: number;
  amountUSD: number;
  items: TradeDetailRow[];
}

function sideTag(side: TradeDetailRow['side'], label: string) {
  // Preset tags rather than raw colours: they follow the active light/dark theme, and the
  // green/orange pairing is the same one the ledger uses for sale versus purchase.
  return <Tag color={side === 'SALE' ? 'success' : 'warning'}>{label}</Tag>;
}

interface TradeDetailReportProps {
  range: DateRange;
}

/**
 * Report (d): purchases and sales in full detail.
 *
 * The API returns one row per invoice ITEM. They are folded into one row per invoice here so the
 * report opens as a readable list of documents; click an invoice for the items behind it. The
 * per-invoice tonnage and USD are sums of its own items, so they cannot disagree with what the
 * expanded table shows.
 */
export function TradeDetailReport({ range }: TradeDetailReportProps) {
  const { t } = useTranslation();
  const { data, isLoading } = useTradeDetailReport(range);
  const [side, setSide] = useState<SideFilter>('ALL');

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    return side === 'ALL' ? all : all.filter((r) => r.side === side);
  }, [data?.rows, side]);

  const invoices = useMemo<InvoiceRow[]>(() => {
    const byInvoice = new Map<string, InvoiceRow>();
    for (const r of rows) {
      const existing = byInvoice.get(r.invoiceId);
      if (existing) {
        existing.items.push(r);
        existing.quantityMt = Math.round((existing.quantityMt + r.quantityMt) * 1000) / 1000;
        existing.amountUSD = Math.round((existing.amountUSD + r.amountUSD) * 100) / 100;
        continue;
      }
      byInvoice.set(r.invoiceId, {
        invoiceId: r.invoiceId,
        invoiceNumber: r.invoiceNumber,
        side: r.side,
        date: r.date,
        personName: r.personName,
        currency: r.currency,
        quantityMt: r.quantityMt,
        amountUSD: r.amountUSD,
        items: [r],
      });
    }
    return [...byInvoice.values()];
  }, [rows]);

  const exportAll = () => {
    downloadXlsx(datedFileName(t('reports.tabTrade'), new Date().toISOString()), [
      {
        name: t('reports.tabTrade'),
        rows: invoices.map((inv) => ({
          [t('reports.date')]: formatDate(inv.date),
          [t('reports.side')]: t(inv.side === 'SALE' ? 'reports.sideSale' : 'reports.sidePurchase'),
          [t('reports.invoice')]: inv.invoiceNumber,
          [t('reports.person')]: inv.personName,
          [t('reports.quantity')]: inv.quantityMt,
          [t('reports.amountUsd')]: inv.amountUSD,
        })),
      },
      {
        name: t('reports.items'),
        rows: rows.map((r) => ({
          [t('reports.date')]: formatDate(r.date),
          [t('reports.side')]: t(r.side === 'SALE' ? 'reports.sideSale' : 'reports.sidePurchase'),
          [t('reports.invoice')]: r.invoiceNumber,
          [t('reports.person')]: r.personName,
          [t('reports.product')]: r.product,
          [t('reports.quantity')]: r.quantityMt,
          [t('reports.unitPrice')]: r.unitPrice,
          [t('reports.amount')]: r.amount,
          [t('customers.currency')]: r.currency,
          [t('reports.amountUsd')]: r.amountUSD,
          [t('reports.container')]: r.containerReference ?? '',
        })),
      },
    ]);
  };

  const invoiceColumns: ColumnsType<InvoiceRow> = [
    { title: t('reports.date'), dataIndex: 'date', width: 120, render: (v: string) => formatDate(v) },
    {
      title: t('reports.side'),
      dataIndex: 'side',
      width: 110,
      render: (v: InvoiceRow['side']) => sideTag(v, t(v === 'SALE' ? 'reports.sideSale' : 'reports.sidePurchase')),
    },
    {
      title: t('reports.invoice'),
      dataIndex: 'invoiceNumber',
      width: 170,
      render: (v: string) => (
        <Text strong dir="ltr" style={IDENTIFIER_STYLE}>
          {v}
        </Text>
      ),
    },
    { title: t('reports.person'), dataIndex: 'personName', ellipsis: true },
    {
      title: t('reports.items'),
      key: 'count',
      width: 100,
      align: 'center',
      render: (_, r) => r.items.length,
    },
    {
      title: t('reports.quantity'),
      dataIndex: 'quantityMt',
      width: 130,
      align: 'right',
      render: (v: number) => formatNumber(v, 3),
    },
    {
      title: t('reports.amountUsd'),
      dataIndex: 'amountUSD',
      width: 170,
      align: 'right',
      render: (v: number) => <Money value={v} fractionDigits={2} signed strong />,
    },
  ];

  return (
    <div>
      {/* Totals come from the API and cover the WHOLE date range — the side filter below narrows
          the table only, so these four figures do not move when it changes. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
          marginBottom: 16,
        }}
      >
        <Card variant="borderless" className="soft-card">
          <Statistic
            title={t('reports.saleValue')}
            valueRender={() => <Money value={data?.saleUSD ?? 0} fractionDigits={2} signed strong />}
          />
        </Card>
        <Card variant="borderless" className="soft-card">
          <Statistic title={t('reports.saleTonnage')} valueRender={() => <>{formatNumber(data?.saleMt ?? 0, 3)}</>} />
        </Card>
        <Card variant="borderless" className="soft-card">
          <Statistic
            title={t('reports.purchaseValue')}
            valueRender={() => <Money value={data?.purchaseUSD ?? 0} fractionDigits={2} signed strong />}
          />
        </Card>
        <Card variant="borderless" className="soft-card">
          <Statistic
            title={t('reports.purchaseTonnage')}
            valueRender={() => <>{formatNumber(data?.purchaseMt ?? 0, 3)}</>}
          />
        </Card>
      </div>

      <Card variant="borderless" styles={{ body: { padding: 12 } }}>
        <Space style={{ marginBottom: 12 }} wrap>
          <Segmented
            value={side}
            onChange={(v) => setSide(v as SideFilter)}
            options={[
              { label: t('reports.sideAll'), value: 'ALL' },
              { label: t('reports.sideSale'), value: 'SALE' },
              { label: t('reports.sidePurchase'), value: 'PURCHASE' },
            ]}
          />
          <Button icon={<DownloadOutlined />} onClick={exportAll} disabled={isLoading || rows.length === 0}>
            {t('common.export')}
          </Button>
        </Space>

        <Table<InvoiceRow>
          rowKey="invoiceId"
          size="small"
          loading={isLoading}
          columns={invoiceColumns}
          dataSource={invoices}
          scroll={{ x: 1000 }}
          pagination={{ pageSize: 15, hideOnSinglePage: true, showSizeChanger: false }}
          locale={{ emptyText: t('reports.noRows') }}
          expandable={{
            // The whole row is the target — opening an invoice is what this screen is for.
            expandRowByClick: true,
            expandedRowRender: (inv) => <TradeItems items={inv.items} />,
          }}
        />
      </Card>
    </div>
  );
}

function TradeItems({ items }: { items: TradeDetailRow[] }) {
  const { t } = useTranslation();

  const columns: ColumnsType<TradeDetailRow> = [
    { title: t('reports.product'), dataIndex: 'product', width: 180, ellipsis: true },
    {
      title: t('reports.quantity'),
      dataIndex: 'quantityMt',
      width: 120,
      align: 'right',
      // Only the decimals the figure has, up to the six that are stored (one gram).
      render: (v: number) => formatQty(v),
    },
    {
      title: t('reports.unitPrice'),
      dataIndex: 'unitPrice',
      width: 140,
      align: 'right',
      render: (v: number, r) => <Money value={v} currency={r.currency} fractionDigits={2} signed />,
    },
    {
      title: t('reports.amount'),
      dataIndex: 'amount',
      width: 160,
      align: 'right',
      // Shown in the invoice's OWN currency; the USD column beside it is the converted figure.
      render: (v: number, r) => <Money value={v} currency={r.currency} fractionDigits={2} signed />,
    },
    {
      title: t('reports.amountUsd'),
      dataIndex: 'amountUSD',
      width: 160,
      align: 'right',
      render: (v: number) => <Money value={v} fractionDigits={2} signed strong />,
    },
    {
      title: t('reports.container'),
      dataIndex: 'containerReference',
      width: 160,
      render: (v?: string) =>
        v ? (
          <span dir="ltr" style={IDENTIFIER_STYLE}>
            {v}
          </span>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
  ];

  return (
    <Table<TradeDetailRow>
      rowKey="itemId"
      size="small"
      columns={columns}
      dataSource={items}
      pagination={false}
      scroll={{ x: 920 }}
      locale={{ emptyText: t('reports.noRows') }}
    />
  );
}
