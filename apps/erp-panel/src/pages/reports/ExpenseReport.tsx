import { useMemo, useState } from 'react';
import { Button, Card, Empty, Segmented, Skeleton, Space, Statistic, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { Money } from '@/components/common/Money';
import { useExpenseReport } from '@/services/queries';
import { formatDate } from '@/utils/format';
import { datedFileName, downloadXlsx } from '@/utils/exportXlsx';
import type { DateRange, ExpenseLineRow, ExpenseReport as ExpenseReportData } from '@/services/api';
import type { ChargeDirection } from '@/types';

const { Text } = Typography;

type SummaryRow = ExpenseReportData['byCategory'][number];

const dash = <Text type="secondary">—</Text>;

/** An empty string is as absent as `undefined` here: a saved-but-blank description is not data. */
const optional = (value?: string) => value || dash;

interface ExpenseReportProps {
  range: DateRange;
}

/** A master row: one category, its server-given total, and the lines behind it. */
interface CategoryRow extends SummaryRow {
  lines: ExpenseLineRow[];
}

/**
 * Report (c): expense movement and totals.
 *
 * The master list is by category — "what did we spend it on" is the question this report gets
 * opened for — and a row opens to the individual lines behind its total. Cost centres keep their
 * own summary below: the same spend, cut a second way.
 *
 * Category totals are the server's, never re-summed here; the lines are grouped in the view only
 * to hang them off the right master row.
 */
export function ExpenseReport({ range }: ExpenseReportProps) {
  const { t } = useTranslation();
  const [direction, setDirection] = useState<ChargeDirection>('EXPENSE');
  const { data, isLoading } = useExpenseReport(range, direction);

  const rows = useMemo(() => data?.rows ?? [], [data]);

  const categories = useMemo<CategoryRow[]>(() => {
    const byLabel = new Map<string, ExpenseLineRow[]>();
    for (const r of rows) {
      const list = byLabel.get(r.categoryName) ?? [];
      list.push(r);
      byLabel.set(r.categoryName, list);
    }
    return (data?.byCategory ?? []).map((c) => ({ ...c, lines: byLabel.get(c.label) ?? [] }));
  }, [data, rows]);

  const label = direction === 'EXPENSE' ? t('reports.directionExpense') : t('reports.directionRevenue');

  const exportAll = () => {
    downloadXlsx(datedFileName(label, new Date().toISOString()), [
      {
        name: t('reports.byCategory'),
        rows: categories.map((c) => ({
          [t('reports.category')]: c.label,
          [t('reports.amountUsd')]: c.totalUSD,
        })),
      },
      {
        name: t('reports.byCostCentre'),
        rows: (data?.byCostCentre ?? []).map((c) => ({
          [t('reports.costCentre')]: c.label,
          [t('reports.amountUsd')]: c.totalUSD,
        })),
      },
      {
        name: label,
        rows: rows.map((r) => ({
          [t('reports.date')]: formatDate(r.date),
          [t('reports.category')]: r.categoryName,
          [t('reports.costCentre')]: r.costCentreName ?? '',
          [t('reports.person')]: r.personName ?? '',
          [t('reports.invoice')]: r.invoiceNumber ?? '',
          [t('reports.description')]: r.description ?? '',
          [t('reports.amount')]: r.amount,
          [t('customers.currency')]: r.currency,
          [t('reports.amountUsd')]: r.amountUSD,
        })),
      },
    ]);
  };

  const categoryColumns: ColumnsType<CategoryRow> = [
    { title: t('reports.category'), dataIndex: 'label', render: (v: string) => <Text strong>{v}</Text> },
    {
      title: t('reports.movements'),
      key: 'count',
      width: 120,
      align: 'center',
      render: (_, r) => r.lines.length,
    },
    {
      title: t('reports.amountUsd'),
      dataIndex: 'totalUSD',
      width: 180,
      align: 'right',
      render: (v: number) => <Money value={v} fractionDigits={2} strong />,
    },
  ];

  return (
    <>
      <Space style={{ marginBottom: 16 }} wrap>
        <Segmented
          value={direction}
          onChange={(v) => setDirection(v as ChargeDirection)}
          options={[
            { label: t('reports.directionExpense'), value: 'EXPENSE' },
            { label: t('reports.directionRevenue'), value: 'REVENUE' },
          ]}
        />
        <Button icon={<DownloadOutlined />} onClick={exportAll} disabled={isLoading || rows.length === 0}>
          {t('common.export')}
        </Button>
      </Space>

      {isLoading ? (
        <Card variant="borderless" className="soft-card">
          <Skeleton active paragraph={{ rows: 5 }} />
        </Card>
      ) : (
        <>
          <Card variant="borderless" className="soft-card" style={{ marginBottom: 16 }}>
            <Statistic
              title={`${label} · ${t('reports.total')}`}
              valueRender={() => <Money value={data?.totalUSD ?? 0} fractionDigits={2} strong />}
            />
          </Card>

          <Card variant="borderless" styles={{ body: { padding: 12 } }} style={{ marginBottom: 16 }}>
            <Table<CategoryRow>
              rowKey="key"
              size="small"
              columns={categoryColumns}
              dataSource={categories}
              pagination={false}
              scroll={{ x: 620 }}
              expandable={{
                // The whole row is the target — the point of this screen is to open a category.
                expandRowByClick: true,
                rowExpandable: (c) => c.lines.length > 0,
                expandedRowRender: (c) => <ExpenseLines lines={c.lines} />,
              }}
              locale={{
                emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('reports.noRows')} />,
              }}
            />
          </Card>

          <Card variant="borderless" title={t('reports.byCostCentre')} styles={{ body: { padding: 12 } }}>
            <Table<SummaryRow>
              rowKey="key"
              size="small"
              dataSource={data?.byCostCentre ?? []}
              pagination={false}
              columns={[
                { title: t('reports.costCentre'), dataIndex: 'label' },
                {
                  title: t('reports.amountUsd'),
                  dataIndex: 'totalUSD',
                  width: 180,
                  align: 'right',
                  render: (v: number) => <Money value={v} fractionDigits={2} />,
                },
              ]}
              locale={{ emptyText: t('reports.noRows') }}
            />
          </Card>
        </>
      )}
    </>
  );
}

function ExpenseLines({ lines }: { lines: ExpenseLineRow[] }) {
  const { t } = useTranslation();

  const columns: ColumnsType<ExpenseLineRow> = [
    { title: t('reports.date'), dataIndex: 'date', width: 130, render: (v: string) => formatDate(v) },
    { title: t('reports.costCentre'), dataIndex: 'costCentreName', width: 150, render: (v?: string) => optional(v) },
    { title: t('reports.person'), dataIndex: 'personName', width: 180, render: (v?: string) => optional(v) },
    {
      title: t('reports.invoice'),
      dataIndex: 'invoiceNumber',
      width: 150,
      render: (v?: string) =>
        v ? (
          <span dir="ltr" style={{ fontFamily: 'monospace' }}>
            {v}
          </span>
        ) : (
          dash
        ),
    },
    { title: t('reports.description'), dataIndex: 'description', render: (v?: string) => optional(v) },
    {
      title: t('reports.amount'),
      dataIndex: 'amount',
      width: 150,
      align: 'right',
      render: (v: number, r) => <Money value={v} currency={r.currency} fractionDigits={2} />,
    },
    {
      title: t('reports.amountUsd'),
      dataIndex: 'amountUSD',
      width: 150,
      align: 'right',
      render: (v: number) => <Money value={v} fractionDigits={2} />,
    },
  ];

  return (
    <Table<ExpenseLineRow>
      rowKey="lineId"
      size="small"
      columns={columns}
      dataSource={lines}
      pagination={{ pageSize: 15, hideOnSinglePage: true, showSizeChanger: false }}
      scroll={{ x: 1100 }}
      locale={{ emptyText: t('reports.noRows') }}
    />
  );
}
