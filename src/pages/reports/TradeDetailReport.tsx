import { useMemo, useState } from 'react';
import { Card, Segmented, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import { Money } from '@/components/common/Money';
import { useTradeDetailReport } from '@/services/queries';
import { formatDate, formatNumber } from '@/utils/format';
import type { DateRange, TradeDetailRow } from '@/services/api';

const { Text } = Typography;

type SideFilter = 'ALL' | 'SALE' | 'PURCHASE';

/** Latin identifiers (invoice numbers, container references) stay LTR and monospace even in an
 *  Arabic or Farsi UI — a reference read right-to-left is a different reference. */
const IDENTIFIER_STYLE = { fontFamily: 'monospace' } as const;

interface TradeDetailReportProps {
  range: DateRange;
}

/**
 * Report (d): purchases and sales in full detail — one row per invoice ITEM, not per invoice,
 * so a two-product invoice is two rows and the tonnage column can be read straight down.
 */
export function TradeDetailReport({ range }: TradeDetailReportProps) {
  const { t } = useTranslation();
  const { data, isLoading } = useTradeDetailReport(range);
  const [side, setSide] = useState<SideFilter>('ALL');

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    return side === 'ALL' ? all : all.filter((r) => r.side === side);
  }, [data?.rows, side]);

  const columns: ColumnsType<TradeDetailRow> = [
    {
      title: t('reports.date'),
      dataIndex: 'date',
      width: 120,
      render: (v: string) => formatDate(v),
    },
    {
      title: t('reports.side'),
      dataIndex: 'side',
      width: 110,
      // Preset tags rather than raw colours: they follow the active light/dark theme, and the
      // green/orange pairing is the same one the ledger uses for sale versus purchase.
      render: (v: TradeDetailRow['side']) => (
        <Tag color={v === 'SALE' ? 'success' : 'warning'}>
          {t(v === 'SALE' ? 'reports.sideSale' : 'reports.sidePurchase')}
        </Tag>
      ),
    },
    {
      title: t('reports.invoice'),
      dataIndex: 'invoiceNumber',
      width: 160,
      render: (v: string) => (
        <span dir="ltr" style={IDENTIFIER_STYLE}>
          {v}
        </span>
      ),
    },
    {
      title: t('reports.person'),
      dataIndex: 'personName',
      width: 200,
      ellipsis: true,
    },
    {
      title: t('reports.product'),
      dataIndex: 'product',
      width: 160,
      ellipsis: true,
    },
    {
      title: t('reports.quantity'),
      dataIndex: 'quantityMt',
      width: 120,
      align: 'right',
      // Three decimals: containers ship fractional tonnes and that is the precision stored.
      render: (v: number) => formatNumber(v, 3),
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
        </Space>

        <Table<TradeDetailRow>
          rowKey="itemId"
          size="small"
          loading={isLoading}
          columns={columns}
          dataSource={rows}
          scroll={{ x: 1440 }}
          pagination={{ pageSize: 15, hideOnSinglePage: true, showSizeChanger: false }}
          locale={{ emptyText: t('reports.noRows') }}
        />
      </Card>
    </div>
  );
}
