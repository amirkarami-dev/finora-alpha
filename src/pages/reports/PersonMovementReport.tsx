import { useMemo, useState } from 'react';
import { Empty, Select, Space, Statistic, Table, Tag, Typography, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { Money } from '@/components/common/Money';
import { useAccounts, usePersonLedger } from '@/services/queries';
import { formatDate } from '@/utils/format';
import type { DateRange, LedgerKind, PersonLedgerEntry } from '@/services/api';

const { Text } = Typography;

/** Mirrors PersonLedgerModal's palette so one kind looks the same wherever it is shown. */
const KIND_COLOR: Record<LedgerKind, string> = {
  SALE_INVOICE: 'blue',
  SALE_CLAIM: 'geekblue',
  SALE_PAYMENT: 'cyan',
  PURCHASE_INVOICE: 'orange',
  PURCHASE_CLAIM: 'gold',
  PURCHASE_PAYMENT: 'volcano',
  TRANSFER: 'default',
};

interface PersonMovementReportProps {
  range: DateRange;
}

/**
 * Report (b): one person's balance and movement over a date window.
 *
 * The balance maths is NOT redone here. `usePersonLedger` returns the person's whole history with
 * `running` already computed over all of it; this component only chooses which of those rows the
 * window shows and reads the opening off the last row before it. That is why opening + Σ changes
 * === closing can never drift: all three figures come from the same running column.
 */
export function PersonMovementReport({ range }: PersonMovementReportProps) {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const [personId, setPersonId] = useState<string>();
  const accounts = useAccounts();
  const { data: ledger, isLoading } = usePersonLedger(personId ?? '', { enabled: !!personId });

  const people = useMemo(
    () => (accounts.data ?? []).map((a) => ({ value: a.id, label: a.name })),
    [accounts.data],
  );

  const { opening, rows, closing } = useMemo(() => {
    const entries = ledger?.entries ?? [];
    const from = range.from ? dayjs(range.from) : undefined;
    const to = range.to ? dayjs(range.to) : undefined;

    let openingBalance = 0;
    const shown: PersonLedgerEntry[] = [];
    for (const e of entries) {
      const d = dayjs(e.date);
      if (from && d.isBefore(from, 'day')) {
        // Entries arrive oldest-first, so the last row to land here is the last one before the
        // window — and its `running` IS the sum of every effect up to it. Taking it instead of
        // re-adding the effects means the opening cannot disagree with the ledger.
        openingBalance = e.running;
        continue;
      }
      if (to && d.isAfter(to, 'day')) continue;
      shown.push(e);
    }

    return {
      opening: openingBalance,
      rows: shown,
      // No movement in the window means the balance simply stayed where it opened.
      closing: shown.length ? shown[shown.length - 1].running : openingBalance,
    };
  }, [ledger, range.from, range.to]);

  // Both ends are 2dp-rounded already; subtracting them can still leave float dust behind.
  const netChange = Math.round((closing - opening) * 100) / 100;

  const columns: ColumnsType<PersonLedgerEntry> = [
    {
      title: t('reports.date'),
      dataIndex: 'date',
      width: 120,
      render: (v: string) => formatDate(v),
    },
    {
      title: t('ledger.kind'),
      dataIndex: 'kind',
      width: 190,
      render: (v: LedgerKind) => <Tag color={KIND_COLOR[v]}>{t(`ledger.kinds.${v}`)}</Tag>,
    },
    {
      title: t('reports.reference'),
      dataIndex: 'reference',
      render: (v: string, r) => (
        <Space size={4} wrap>
          <span dir="ltr" style={{ fontFamily: 'monospace' }}>
            {v}
          </span>
          {r.pending && <Tag color="warning">{t('ledger.pending')}</Tag>}
          {r.informational && <Tag>{t('ledger.informational')}</Tag>}
        </Space>
      ),
    },
    {
      title: t('reports.amount'),
      dataIndex: 'amount',
      width: 150,
      align: 'right',
      // As entered, in its own currency — the USD figure the balance moves by is the next column.
      render: (v: number, r) => <Money value={v} currency={r.currency} fractionDigits={2} />,
    },
    {
      title: t('ledger.effect'),
      dataIndex: 'effect',
      width: 150,
      align: 'right',
      render: (v: number) =>
        v === 0 ? (
          <span style={{ color: token.colorTextQuaternary }}>—</span>
        ) : (
          <Money value={v} fractionDigits={2} signed />
        ),
    },
    {
      title: t('ledger.running'),
      dataIndex: 'running',
      width: 160,
      align: 'right',
      render: (v: number) => <Money value={v} fractionDigits={2} signed strong />,
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space direction="vertical" size={4}>
        <Text type="secondary">{t('reports.person')}</Text>
        <Select
          showSearch
          allowClear
          optionFilterProp="label"
          style={{ minWidth: 280 }}
          placeholder={t('reports.pickPerson')}
          loading={accounts.isLoading}
          value={personId}
          onChange={setPersonId}
          options={people}
        />
      </Space>

      {!personId ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('reports.pickPerson')} />
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            <Statistic
              title={t('reports.opening')}
              valueRender={() => <Money value={opening} fractionDigits={2} signed />}
            />
            <Statistic
              title={t('reports.netChange')}
              valueRender={() => <Money value={netChange} fractionDigits={2} signed />}
            />
            <Statistic
              title={t('reports.closing')}
              valueRender={() => <Money value={closing} fractionDigits={2} signed strong />}
            />
          </div>

          <Table<PersonLedgerEntry>
            rowKey="id"
            size="small"
            loading={isLoading}
            columns={columns}
            dataSource={rows}
            scroll={{ x: 900 }}
            pagination={{ pageSize: 15, hideOnSinglePage: true, showSizeChanger: false }}
            locale={{ emptyText: t('reports.noMovements') }}
            // Rows that carry no weight in the balance — an unpaid cheque or a transfer shown only
            // for traceability — are dimmed so the eye skips them while scanning the running column.
            onRow={(r) => ({ style: r.pending || r.informational ? { opacity: 0.65 } : undefined })}
          />
        </>
      )}
    </Space>
  );
}
