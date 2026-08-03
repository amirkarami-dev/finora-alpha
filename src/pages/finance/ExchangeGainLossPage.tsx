import { useState } from 'react';
import { App, Button, Card, Empty, Popconfirm, Segmented, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckOutlined, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';
import { Money } from '@/components/common/Money';
import { useGainLossReport, useRevaluations, useSetRevaluationStatus } from '@/services/queries';
import { useTabParam } from '@/hooks/useTabParam';
import { formatDate, formatNumber } from '@/utils/format';
import type { GainLossGroup, GainLossGrouping, RevaluationRow } from '@/services/api';
import type { TransferStatus } from '@/types';
import { RevaluationFormModal } from './RevaluationFormModal';

const { Text } = Typography;

const TAB_KEYS = ['revaluations', 'history', 'reports'] as const;
type TabKey = (typeof TAB_KEYS)[number];

const STATUS_COLOR: Record<TransferStatus, string> = {
  DRAFT: 'default',
  CONFIRMED: 'success',
  CANCELLED: 'error',
};

const GROUPINGS: GainLossGrouping[] = ['person', 'contract', 'invoice', 'currency', 'account'];

export default function ExchangeGainLossPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [tab, setTab] = useTabParam(TAB_KEYS, 'revaluations');
  const [formOpen, setFormOpen] = useState(false);
  const [grouping, setGrouping] = useState<GainLossGrouping>('account');

  const { data: revaluations, isLoading } = useRevaluations();
  const { data: report, isLoading: reportLoading } = useGainLossReport(grouping);
  const setStatus = useSetRevaluationStatus();

  // Revaluations tab shows what is still open; History is the confirmed record.
  const rows = (revaluations ?? []).filter((r) =>
    tab === 'history' ? r.status !== 'DRAFT' : r.status === 'DRAFT',
  );

  const move = async (row: RevaluationRow, next: TransferStatus) => {
    try {
      await setStatus.mutateAsync({ id: row.id, status: next });
      message.success(t('exchange.statusChanged'));
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      // Undoing a revaluation a later one measured from would leave that one starting from a
      // book value that never existed.
      if (code === 'revaluation-superseded') message.error(t('exchange.errors.revaluation-superseded'));
      else message.error(t('common.saveFailed'));
    }
  };

  const revalColumns: ColumnsType<RevaluationRow> = [
    {
      title: t('exchange.number'),
      dataIndex: 'number',
      width: 120,
      render: (v: string) => (
        <Text strong style={{ fontFamily: 'monospace' }}>
          {v}
        </Text>
      ),
    },
    { title: t('exchange.date'), dataIndex: 'date', width: 130, render: (v) => formatDate(v) },
    { title: t('exchange.account'), dataIndex: 'accountName', width: 190 },
    { title: t('exchange.currency'), dataIndex: 'currency', width: 90, align: 'center', render: (v) => <Tag>{v}</Tag> },
    {
      title: t('exchange.balance'),
      dataIndex: 'balance',
      width: 140,
      align: 'right',
      render: (v: number, r) => `${formatNumber(v, 2)} ${r.currency}`,
    },
    {
      title: t('exchange.previousRate'),
      dataIndex: 'oldExchangeRate',
      width: 120,
      align: 'right',
      render: (v: number) => formatNumber(v, 4),
    },
    { title: t('exchange.newRate'), dataIndex: 'newExchangeRate', width: 110, align: 'right', render: (v: number) => formatNumber(v, 4) },
    { title: t('exchange.previousBase'), dataIndex: 'oldBaseAmount', width: 140, align: 'right', render: (v) => <Money value={v} fractionDigits={2} /> },
    { title: t('exchange.newBase'), dataIndex: 'newBaseAmount', width: 140, align: 'right', render: (v) => <Money value={v} fractionDigits={2} /> },
    {
      title: t('exchange.gainLoss'),
      dataIndex: 'gainLossAmount',
      width: 150,
      align: 'right',
      render: (v: number) => (
        <Tag color={v >= 0 ? 'success' : 'error'}>
          <Money value={Math.abs(v)} fractionDigits={2} />
        </Tag>
      ),
    },
    {
      title: t('exchange.realization'),
      dataIndex: 'realization',
      width: 120,
      align: 'center',
      render: (v: RevaluationRow['realization']) => <Tag bordered={false}>{t(`exchange.realizationTypes.${v}`)}</Tag>,
    },
    {
      title: t('exchange.statusLabel'),
      dataIndex: 'status',
      width: 120,
      align: 'center',
      render: (v: TransferStatus) => <Tag color={STATUS_COLOR[v]}>{t(`exchange.status.${v}`)}</Tag>,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 200,
      align: 'right',
      render: (_, r) => (
        <Space wrap>
          {r.status === 'DRAFT' && (
            <Popconfirm
              title={t('exchange.confirmConfirm')}
              okText={t('common.yes')}
              cancelText={t('common.no')}
              onConfirm={() => move(r, 'CONFIRMED')}
            >
              <Button type="link" size="small" icon={<CheckOutlined />}>
                {t('exchange.confirm')}
              </Button>
            </Popconfirm>
          )}
          {r.status !== 'CANCELLED' && (
            <Popconfirm
              title={t('exchange.cancelConfirm')}
              okText={t('common.yes')}
              cancelText={t('common.no')}
              onConfirm={() => move(r, 'CANCELLED')}
            >
              <Button type="link" size="small" danger>
                {t('common.cancel')}
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const reportColumns: ColumnsType<GainLossGroup> = [
    { title: t(`exchange.groupings.${grouping}`), dataIndex: 'label', render: (v) => <Text strong>{v}</Text> },
    { title: t('exchange.gain'), dataIndex: 'gain', align: 'right', render: (v: number) => <Money value={v} fractionDigits={2} /> },
    { title: t('exchange.loss'), dataIndex: 'loss', align: 'right', render: (v: number) => <Money value={v} fractionDigits={2} /> },
    {
      title: t('exchange.net'),
      dataIndex: 'net',
      align: 'right',
      render: (v: number) => (
        <Tag color={v >= 0 ? 'success' : 'error'}>
          <Money value={Math.abs(v)} fractionDigits={2} />
        </Tag>
      ),
    },
  ];

  return (
    <div className="fade-in">
      <PageHeader
        title={t('exchange.title')}
        subtitle={t('exchange.subtitle')}
        extra={
          tab !== 'reports' && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
              {t('exchange.newRevaluation')}
            </Button>
          )
        }
      />

      <Card
        variant="borderless"
        styles={{ body: { padding: 16 } }}
        tabList={[
          { key: 'revaluations', label: t('exchange.tabRevaluations') },
          { key: 'history', label: t('exchange.tabHistory') },
          { key: 'reports', label: t('exchange.tabReports') },
        ]}
        activeTabKey={tab}
        onTabChange={(key) => setTab(key as TabKey)}
      >
        {tab === 'reports' ? (
          <>
            <div style={{ marginBottom: 16 }}>
              <Segmented
                value={grouping}
                onChange={(v) => setGrouping(v as GainLossGrouping)}
                options={GROUPINGS.map((g) => ({ label: t(`exchange.groupings.${g}`), value: g }))}
              />
            </div>
            <Table<GainLossGroup>
              rowKey="key"
              loading={reportLoading}
              columns={reportColumns}
              dataSource={report ?? []}
              pagination={false}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      <Space direction="vertical" size={2}>
                        <Text type="secondary">{t('exchange.noReportRows')}</Text>
                        {/* Not a bug: a standalone cash-safe gain has no person or invoice, so
                            those groupings legitimately come back empty. */}
                        <Text type="secondary">{t('exchange.noReportHint')}</Text>
                      </Space>
                    }
                  />
                ),
              }}
            />
          </>
        ) : (
          <Table<RevaluationRow>
            rowKey="id"
            loading={isLoading}
            columns={revalColumns}
            dataSource={rows}
            scroll={{ x: 1800 }}
            pagination={{ pageSize: 12, hideOnSinglePage: true, showSizeChanger: false }}
            expandable={{
              rowExpandable: (r) => r.allocations.length > 0,
              expandedRowRender: (r) => (
                <Table
                  size="small"
                  rowKey="id"
                  pagination={false}
                  dataSource={r.allocations}
                  columns={[
                    { title: t('exchange.sourceTransfer'), dataIndex: 'moneyTransferId', render: (v?: string) => v ?? '—' },
                    { title: t('exchange.sourceInvoice'), dataIndex: 'invoiceId', render: (v?: string) => v ?? '—' },
                    {
                      title: t('exchange.previousBase'),
                      dataIndex: 'originalBaseAmount',
                      align: 'right',
                      render: (v: number) => <Money value={v} fractionDigits={2} />,
                    },
                    {
                      title: t('exchange.newBase'),
                      dataIndex: 'revaluedBaseAmount',
                      align: 'right',
                      render: (v: number) => <Money value={v} fractionDigits={2} />,
                    },
                    {
                      title: t('exchange.gainLoss'),
                      dataIndex: 'gainLossAmount',
                      align: 'right',
                      render: (v: number) => <Money value={v} fractionDigits={2} />,
                    },
                  ]}
                />
              ),
            }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <Space direction="vertical" size={2}>
                      <Text>{t(tab === 'history' ? 'exchange.emptyHistoryTitle' : 'exchange.emptyTitle')}</Text>
                      <Text type="secondary">{t(tab === 'history' ? 'exchange.emptyHistoryHint' : 'exchange.emptyHint')}</Text>
                    </Space>
                  }
                >
                  {tab === 'revaluations' && (
                    <Button type="primary" onClick={() => setFormOpen(true)}>
                      {t('exchange.newRevaluation')}
                    </Button>
                  )}
                </Empty>
              ),
            }}
          />
        )}
      </Card>

      {formOpen && <RevaluationFormModal open onClose={() => setFormOpen(false)} />}
    </div>
  );
}
