import { useState } from 'react';
import { App, Button, Card, Empty, Popconfirm, Segmented, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';
import { Money } from '@/components/common/Money';
import { useMoneyTransfers, useSetTransferStatus } from '@/services/queries';
import { formatDate, formatNumber } from '@/utils/format';
import type { MoneyTransferRow } from '@/services/api';
import type { TransferStatus } from '@/types';
import { TransferFormModal } from './TransferFormModal';

const { Text } = Typography;

const STATUS_COLOR: Record<TransferStatus, string> = {
  DRAFT: 'default',
  CONFIRMED: 'success',
  CANCELLED: 'error',
};

export default function TransfersPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [statusFilter, setStatusFilter] = useState<TransferStatus | 'all'>('all');
  const { data, isLoading } = useMoneyTransfers();
  const setStatus = useSetTransferStatus();
  const [formState, setFormState] = useState<{ open: boolean; transfer?: MoneyTransferRow }>({ open: false });

  const rows = (data ?? []).filter((r) => (statusFilter === 'all' ? true : r.status === statusFilter));

  const move = async (row: MoneyTransferRow, next: TransferStatus) => {
    try {
      await setStatus.mutateAsync({ id: row.id, status: next });
      message.success(t('transfers.statusChanged'));
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      // Cancelling a transfer an account has already been revalued from would rewrite the
      // balance those gains were measured against — worth naming, not a generic failure.
      if (code === 'transfer-revalued') message.error(t('transfers.errors.transfer-revalued'));
      else message.error(t('common.saveFailed'));
    }
  };

  const columns: ColumnsType<MoneyTransferRow> = [
    {
      title: t('transfers.number'),
      dataIndex: 'number',
      width: 120,
      render: (v: string) => (
        <Text strong style={{ fontFamily: 'monospace' }}>
          {v}
        </Text>
      ),
    },
    { title: t('transfers.date'), dataIndex: 'date', width: 130, render: (v) => formatDate(v) },
    { title: t('transfers.fromAccount'), dataIndex: 'fromAccountName', width: 190 },
    {
      title: t('transfers.fromAmount'),
      dataIndex: 'fromAmount',
      width: 150,
      align: 'right',
      render: (v, r) => <Money value={v} currency={r.fromCurrency} />,
    },
    { title: t('transfers.toAccount'), dataIndex: 'toAccountName', width: 190 },
    {
      title: t('transfers.toAmount'),
      dataIndex: 'toAmount',
      width: 150,
      align: 'right',
      render: (v, r) => <Money value={v} currency={r.toCurrency} />,
    },
    {
      title: t('transfers.exchangeRate'),
      dataIndex: 'exchangeRate',
      width: 110,
      align: 'right',
      render: (v: number) => (v === 1 ? <Text type="secondary">—</Text> : formatNumber(v, 4)),
    },
    {
      title: t('transfers.baseAmount'),
      dataIndex: 'baseAmount',
      width: 140,
      align: 'right',
      render: (v) => <Money value={v} strong fractionDigits={2} />,
    },
    {
      title: t('transfers.allocation'),
      key: 'alloc',
      width: 150,
      align: 'right',
      // Partial and zero allocation are both legitimate (spec §12), so this reports rather than
      // warns.
      render: (_, r) =>
        r.allocatedAmount > 0 ? (
          <Text type="secondary">
            {r.allocatedAmount} / {r.fromAmount}
          </Text>
        ) : (
          <Text type="secondary">{t('transfers.unallocated')}</Text>
        ),
    },
    {
      title: t('transfers.statusLabel'),
      dataIndex: 'status',
      width: 120,
      align: 'center',
      render: (v: TransferStatus) => <Tag color={STATUS_COLOR[v]}>{t(`transfers.status.${v}`)}</Tag>,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 230,
      align: 'right',
      render: (_, r) => (
        <Space wrap>
          {r.status === 'DRAFT' && (
            <>
              <Button type="link" size="small" icon={<EditOutlined />} onClick={() => setFormState({ open: true, transfer: r })}>
                {t('common.edit')}
              </Button>
              <Popconfirm
                title={t('transfers.confirmConfirm')}
                okText={t('common.yes')}
                cancelText={t('common.no')}
                onConfirm={() => move(r, 'CONFIRMED')}
              >
                <Button type="link" size="small" icon={<CheckOutlined />}>
                  {t('transfers.confirm')}
                </Button>
              </Popconfirm>
            </>
          )}
          {r.status !== 'CANCELLED' && (
            <Popconfirm
              title={t('transfers.cancelConfirm')}
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

  return (
    <div className="fade-in">
      <PageHeader
        title={t('transfers.title')}
        subtitle={t('transfers.subtitle')}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormState({ open: true, transfer: undefined })}>
            {t('transfers.newTransfer')}
          </Button>
        }
      />

      <Card variant="borderless" styles={{ body: { padding: 16 } }}>
        <div style={{ marginBottom: 16 }}>
          <Segmented
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as TransferStatus | 'all')}
            options={[
              { label: t('common.all'), value: 'all' },
              ...(['DRAFT', 'CONFIRMED', 'CANCELLED'] as TransferStatus[]).map((s) => ({
                label: t(`transfers.status.${s}`),
                value: s,
              })),
            ]}
          />
        </div>
        <Table<MoneyTransferRow>
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={rows}
          scroll={{ x: 1700 }}
          pagination={{ pageSize: 12, hideOnSinglePage: true, showSizeChanger: false }}
          locale={{
            emptyText:
              (data ?? []).length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <Space direction="vertical" size={2}>
                      <Text>{t('transfers.emptyTitle')}</Text>
                      <Text type="secondary">{t('transfers.emptyHint')}</Text>
                    </Space>
                  }
                >
                  <Button type="primary" onClick={() => setFormState({ open: true, transfer: undefined })}>
                    {t('transfers.newTransfer')}
                  </Button>
                </Empty>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary">{t('common.noFilterResults')}</Text>} />
              ),
          }}
        />
      </Card>

      <TransferFormModal
        open={formState.open}
        onClose={() => setFormState((s) => ({ ...s, open: false }))}
        transfer={formState.transfer}
      />
    </div>
  );
}
