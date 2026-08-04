import { Alert, Card, Empty, Skeleton, Space, Statistic, Table, Tag, Typography, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import { Money } from '@/components/common/Money';
import { useAccountMovementReport } from '@/services/queries';
import { formatDate } from '@/utils/format';
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
 * Every figure on screen is served by `getAccountMovementReport` — opening, money in, money out
 * and closing are printed as received, never re-added here. The server guarantees
 * `opening + totalIn − totalOut === closing`; recomputing any of them in the view would create a
 * second, silently disagreeing source of truth.
 */
export function AccountMovementReport({ range }: AccountMovementReportProps) {
  const { t } = useTranslation();
  const { data, isLoading } = useAccountMovementReport(range);

  if (isLoading) {
    return (
      <Card variant="borderless" className="soft-card">
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
    );
  }

  const blocks = data ?? [];

  if (blocks.length === 0) {
    return (
      <Card variant="borderless" className="soft-card">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('reports.noMovements')} />
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {blocks.map((block) => (
        <AccountBlockCard key={block.accountId} block={block} />
      ))}
    </div>
  );
}

function AccountBlockCard({ block }: { block: AccountMovementBlock }) {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const isBank = block.accountType === 'BANK';

  const columns: ColumnsType<AccountMovementRow> = [
    {
      title: t('reports.date'),
      dataIndex: 'date',
      width: 130,
      render: (v: string) => formatDate(v),
    },
    {
      title: t('reports.reference'),
      dataIndex: 'reference',
      width: 190,
      render: (v: string) => (
        <span dir="ltr" style={{ fontFamily: 'monospace' }}>
          {v}
        </span>
      ),
    },
    {
      title: t('reports.source'),
      dataIndex: 'source',
      width: 130,
      render: (v: AccountMovementRow['source']) => <Tag color={SOURCE_COLOR[v]}>{t(`reports.sources.${v}`)}</Tag>,
    },
    {
      title: t('reports.amount'),
      dataIndex: 'amount',
      width: 160,
      align: 'right',
      // The account's own currency, and the sign IS the direction — money out renders in brackets.
      render: (v: number) => <Money value={v} currency={block.currency} fractionDigits={2} signed />,
    },
    {
      title: t('reports.amountUsd'),
      dataIndex: 'baseUSD',
      width: 160,
      align: 'right',
      render: (v: number) => <Money value={v} fractionDigits={2} signed />,
    },
    {
      title: t('reports.running'),
      dataIndex: 'running',
      width: 170,
      align: 'right',
      render: (v: number) => <Money value={v} currency={block.currency} fractionDigits={2} signed strong />,
    },
  ];

  return (
    <Card
      variant="borderless"
      className="soft-card"
      styles={{ header: { borderBottom: 'none', fontWeight: 600 } }}
      title={
        <Space size={8} wrap>
          <span>{block.accountName}</span>
          <Tag color={isBank ? 'blue' : 'gold'}>{isBank ? t('banks.title') : t('cashSafes.title')}</Tag>
        </Space>
      }
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Statistic
          title={t('reports.opening')}
          valueRender={() => <Money value={block.opening} currency={block.currency} fractionDigits={2} signed />}
        />
        <Statistic
          title={t('reports.moneyIn')}
          // `totalIn`/`totalOut` arrive as magnitudes; the colour carries the direction rather
          // than a sign, so the two never read as a subtraction the user has to perform.
          valueRender={() => (
            <span style={{ color: token.colorSuccess }}>
              <Money value={block.totalIn} currency={block.currency} fractionDigits={2} />
            </span>
          )}
        />
        <Statistic
          title={t('reports.moneyOut')}
          valueRender={() => (
            <span style={{ color: token.colorError }}>
              <Money value={block.totalOut} currency={block.currency} fractionDigits={2} />
            </span>
          )}
        />
        <Statistic
          title={t('reports.closing')}
          valueRender={() => (
            <Money value={block.closing} currency={block.currency} fractionDigits={2} signed strong />
          )}
        />
      </div>

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
        scroll={{ x: 940 }}
        pagination={{ pageSize: 15, hideOnSinglePage: true, showSizeChanger: false }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary">{t('reports.noMovements')}</Text>} /> }}
      />
    </Card>
  );
}
