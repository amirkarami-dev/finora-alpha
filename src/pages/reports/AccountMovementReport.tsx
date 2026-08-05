import { Alert, Button, Card, Empty, Skeleton, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { Money } from '@/components/common/Money';
import { useAccountMovementReport } from '@/services/queries';
import { formatDate, formatNumber } from '@/utils/format';
import { datedFileName, downloadXlsx } from '@/utils/exportXlsx';
import type { AccountMovementBlock, AccountMovementRow, DateRange } from '@/services/api';

const { Text } = Typography;

/** Money that arrived and money that left come from two different feeds; the colour tells them
 *  apart before the reference is read. */
const SOURCE_COLOR: Record<AccountMovementRow['source'], string> = {
  TRANSFER: 'geekblue',
  PAYMENT: 'cyan',
};

interface AccountMovementReportProps {
  range: DateRange;
}

/**
 * Report (a): balance and movement of banks and cash safes.
 *
 * One row per account with its four figures; open a row for the movements behind them. Stacking
 * every account's full movement list on one screen buried the summary that most visits actually
 * want.
 *
 * Every figure is served by `getAccountMovementReport` — opening, in, out and closing are
 * printed as received, never re-added here. The server guarantees
 * `opening + totalIn − totalOut === closing`; recomputing any of them in the view would create a
 * second, silently disagreeing source of truth.
 */
export function AccountMovementReport({ range }: AccountMovementReportProps) {
  const { t } = useTranslation();
  const { data, isLoading } = useAccountMovementReport(range);

  const blocks = data ?? [];

  const exportAll = () => {
    downloadXlsx(datedFileName(t('reports.tabAccounts'), new Date().toISOString()), [
      {
        name: t('reports.tabAccounts'),
        rows: blocks.map((b) => ({
          [t('reports.reference')]: b.accountName,
          [t('customers.currency')]: b.currency,
          [t('reports.opening')]: b.opening,
          [t('reports.moneyIn')]: b.totalIn,
          [t('reports.moneyOut')]: b.totalOut,
          [t('reports.closing')]: b.closing,
        })),
      },
      // One sheet per account, so a movement list can be read without hunting through a
      // single merged tab for the account it belongs to.
      ...blocks.map((b) => ({
        name: b.accountName,
        rows: b.rows.map((r) => ({
          [t('reports.date')]: formatDate(r.date),
          [t('reports.reference')]: r.reference,
          [t('reports.source')]: t(`reports.sources.${r.source}`),
          [`${t('reports.amount')} (${b.currency})`]: r.amount,
          [t('reports.amountUsd')]: r.baseUSD,
          [t('reports.running')]: r.running,
        })),
      })),
    ]);
  };

  if (isLoading) {
    return (
      <Card variant="borderless" className="soft-card">
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
    );
  }

  if (blocks.length === 0) {
    return (
      <Card variant="borderless" className="soft-card">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('reports.noMovements')} />
      </Card>
    );
  }

  const columns: ColumnsType<AccountMovementBlock> = [
    {
      title: t('reports.reference'),
      dataIndex: 'accountName',
      render: (v: string, r) => (
        <Space size={6} wrap>
          <Text strong>{v}</Text>
          <Tag>{r.accountType === 'BANK' ? t('banks.title') : t('cashSafes.title')}</Tag>
          <Tag>{r.currency}</Tag>
        </Space>
      ),
    },
    {
      title: t('reports.opening'),
      dataIndex: 'opening',
      width: 150,
      align: 'right',
      render: (v: number, r) => <Money value={v} currency={r.currency} fractionDigits={2} signed />,
    },
    {
      title: t('reports.moneyIn'),
      dataIndex: 'totalIn',
      width: 150,
      align: 'right',
      render: (v: number, r) => <Money value={v} currency={r.currency} fractionDigits={2} muteZero />,
    },
    {
      title: t('reports.moneyOut'),
      dataIndex: 'totalOut',
      width: 150,
      align: 'right',
      render: (v: number, r) => <Money value={v} currency={r.currency} fractionDigits={2} muteZero />,
    },
    {
      title: t('reports.closing'),
      dataIndex: 'closing',
      width: 160,
      align: 'right',
      render: (v: number, r) => <Money value={v} currency={r.currency} fractionDigits={2} signed strong />,
    },
    {
      title: t('reports.movements'),
      dataIndex: 'rows',
      width: 110,
      align: 'center',
      render: (rows: AccountMovementRow[]) => formatNumber(rows.length, 0),
    },
  ];

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<DownloadOutlined />} onClick={exportAll}>
          {t('common.export')}
        </Button>
      </Space>
      <Table<AccountMovementBlock>
        rowKey="accountId"
        size="small"
        columns={columns}
        dataSource={blocks}
        pagination={false}
        scroll={{ x: 900 }}
        expandable={{
          // The whole row is the target: "click the account to see its movements" is the one
          // thing this screen does, and hunting for a caret is a poor way to be told that.
          expandRowByClick: true,
          rowExpandable: (b) => b.rows.length > 0 || b.skippedCurrency > 0,
          expandedRowRender: (b) => <AccountMovements block={b} />,
        }}
      />
    </>
  );
}

function AccountMovements({ block }: { block: AccountMovementBlock }) {
  const { t } = useTranslation();

  const columns: ColumnsType<AccountMovementRow> = [
    { title: t('reports.date'), dataIndex: 'date', width: 130, render: (v: string) => formatDate(v) },
    {
      title: t('reports.reference'),
      dataIndex: 'reference',
      render: (v: string) => (
        <span dir="ltr" style={{ fontFamily: 'monospace' }}>
          {v}
        </span>
      ),
    },
    {
      title: t('reports.source'),
      dataIndex: 'source',
      width: 120,
      align: 'center',
      render: (v: AccountMovementRow['source']) => (
        <Tag color={SOURCE_COLOR[v]}>{t(`reports.sources.${v}`)}</Tag>
      ),
    },
    {
      title: t('reports.amount'),
      dataIndex: 'amount',
      width: 160,
      align: 'right',
      render: (v: number) => <Money value={v} currency={block.currency} fractionDigits={2} signed />,
    },
    {
      title: t('reports.amountUsd'),
      dataIndex: 'baseUSD',
      width: 150,
      align: 'right',
      render: (v: number) => <Money value={v} fractionDigits={2} signed />,
    },
    {
      title: t('reports.running'),
      dataIndex: 'running',
      width: 160,
      align: 'right',
      render: (v: number) => <Money value={v} currency={block.currency} fractionDigits={2} signed strong />,
    },
  ];

  return (
    <>
      {block.skippedCurrency > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={t('reports.skippedCurrency', { n: block.skippedCurrency })}
        />
      )}
      <Table<AccountMovementRow>
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={block.rows}
        pagination={{ pageSize: 15, hideOnSinglePage: true, showSizeChanger: false }}
        scroll={{ x: 860 }}
        locale={{ emptyText: t('reports.noMovements') }}
      />
    </>
  );
}
