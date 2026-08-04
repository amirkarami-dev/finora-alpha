import { useState } from 'react';
import { Card, Segmented, Statistic, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import { Money } from '@/components/common/Money';
import { useExpenseReport } from '@/services/queries';
import { formatDate } from '@/utils/format';
import type { DateRange, ExpenseLineRow, ExpenseReport as ExpenseReportData } from '@/services/api';
import type { ChargeDirection } from '@/types';

const { Text } = Typography;

type SummaryRow = ExpenseReportData['byCategory'][number];

/** `getExpenseReport` groups lines with no cost centre under this literal label, so an unassigned
 *  bucket arrives as a label rather than as a missing value — mute it like any other blank. */
const UNASSIGNED = '—';

const dash = <Text type="secondary">—</Text>;

/** An empty string is as absent as `undefined` here: a saved-but-blank description is not data. */
const optional = (value?: string) => value || dash;

/**
 * Both summary tables are the same table with a different noun in the first header, so the shape
 * is written once — they cannot drift apart into two slightly different summaries.
 */
function summaryColumns(labelHeader: string, amountHeader: string): ColumnsType<SummaryRow> {
  return [
    {
      title: labelHeader,
      dataIndex: 'label',
      render: (v: string) => (v === UNASSIGNED ? dash : v),
    },
    {
      title: amountHeader,
      dataIndex: 'totalUSD',
      width: 150,
      align: 'right',
      // `signed`: a period can net negative once credits/reversals land in it, and brackets say so
      // without turning a refund into apparent good news.
      render: (v: number) => <Money value={v} fractionDigits={2} signed />,
    },
  ];
}

interface ExpenseReportProps {
  range: DateRange;
}

/**
 * Report (c): expense movement and total expenses.
 *
 * One row per charge LINE — the line, not the document, is what carries a category, a cost centre
 * and a person, so it is the only grain at which the two summaries below can be honest.
 *
 * Revenue shares this report rather than getting its own: the desk records both directions as
 * charge documents with identical fields, and a switch keeps the two readings comparable.
 */
export function ExpenseReport({ range }: ExpenseReportProps) {
  const { t } = useTranslation();
  const [direction, setDirection] = useState<ChargeDirection>('EXPENSE');
  const { data, isLoading } = useExpenseReport(range, direction);

  const columns: ColumnsType<ExpenseLineRow> = [
    {
      title: t('reports.date'),
      dataIndex: 'date',
      width: 120,
      render: (v: string) => formatDate(v),
    },
    {
      title: t('reports.category'),
      dataIndex: 'categoryName',
      width: 170,
    },
    {
      title: t('reports.costCentre'),
      dataIndex: 'costCentreName',
      width: 170,
      render: (v?: string) => optional(v),
    },
    {
      title: t('reports.person'),
      dataIndex: 'personName',
      width: 180,
      render: (v?: string) => optional(v),
    },
    {
      title: t('reports.invoice'),
      dataIndex: 'invoiceNumber',
      width: 160,
      render: (v?: string) =>
        v ? (
          <span dir="ltr" style={{ fontFamily: 'monospace' }}>
            {v}
          </span>
        ) : (
          dash
        ),
    },
    {
      title: t('reports.description'),
      dataIndex: 'description',
      width: 240,
      render: (v?: string) => optional(v),
    },
    {
      title: t('reports.amount'),
      dataIndex: 'amount',
      width: 160,
      align: 'right',
      // Shown in the currency it was entered in; the USD column beside it is the converted view,
      // and keeping both means a rate change can never make the original unreadable.
      render: (v: number, r) => <Money value={v} currency={r.currency} fractionDigits={2} signed />,
    },
    {
      title: t('reports.amountUsd'),
      dataIndex: 'amountUSD',
      width: 160,
      align: 'right',
      render: (v: number) => <Money value={v} fractionDigits={2} signed strong />,
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Segmented
          value={direction}
          onChange={(v) => setDirection(v as ChargeDirection)}
          options={[
            { label: t('reports.directionExpense'), value: 'EXPENSE' },
            { label: t('reports.directionRevenue'), value: 'REVENUE' },
          ]}
        />
      </div>

      <Card variant="borderless" className="soft-card" style={{ marginBottom: 16 }}>
        <Statistic
          title={t('reports.total')}
          valueRender={() => <Money value={data?.totalUSD ?? 0} fractionDigits={2} signed strong />}
        />
      </Card>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 16,
          marginBottom: 16,
        }}
      >
        <Card variant="borderless" title={t('reports.byCategory')} styles={{ body: { padding: 12 } }}>
          <Table<SummaryRow>
            rowKey="key"
            size="small"
            loading={isLoading}
            columns={summaryColumns(t('reports.category'), t('reports.amountUsd'))}
            dataSource={data?.byCategory ?? []}
            scroll={{ x: 360 }}
            pagination={{ pageSize: 15, hideOnSinglePage: true, showSizeChanger: false }}
            locale={{ emptyText: t('reports.noRows') }}
          />
        </Card>
        <Card variant="borderless" title={t('reports.byCostCentre')} styles={{ body: { padding: 12 } }}>
          <Table<SummaryRow>
            rowKey="key"
            size="small"
            loading={isLoading}
            columns={summaryColumns(t('reports.costCentre'), t('reports.amountUsd'))}
            dataSource={data?.byCostCentre ?? []}
            scroll={{ x: 360 }}
            pagination={{ pageSize: 15, hideOnSinglePage: true, showSizeChanger: false }}
            locale={{ emptyText: t('reports.noRows') }}
          />
        </Card>
      </div>

      <Card variant="borderless" styles={{ body: { padding: 12 } }}>
        <Table<ExpenseLineRow>
          rowKey="lineId"
          size="small"
          loading={isLoading}
          columns={columns}
          dataSource={data?.rows ?? []}
          scroll={{ x: 1360 }}
          pagination={{ pageSize: 15, hideOnSinglePage: true, showSizeChanger: false }}
          locale={{ emptyText: t('reports.noRows') }}
        />
      </Card>
    </div>
  );
}
