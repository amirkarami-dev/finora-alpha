import { useState } from 'react';
import { App, Button, Card, Empty, Popconfirm, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';
import { Money } from '@/components/common/Money';
import { useDeleteExchangeGainLoss, useExchangeGainLosses, useGainLossTotals } from '@/services/queries';
import { formatDate } from '@/utils/format';
import type { ExchangeGainLoss } from '@/types';
import { GainLossFormModal } from './GainLossFormModal';

const { Text } = Typography;

/**
 * A list of gains and losses on foreign currency, entered by hand.
 *
 * This replaced an account-revaluation module (book rates, previews, proportional allocation
 * back to transfers and invoices, a status workflow and five report groupings). The desk wanted
 * to record what the currency cost or earned; everything else was machinery around a question
 * nobody asked.
 */
export default function ExchangeGainLossPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { data, isLoading } = useExchangeGainLosses();
  const { data: totals } = useGainLossTotals();
  const deleteMut = useDeleteExchangeGainLoss();
  const [formState, setFormState] = useState<{ open: boolean; record?: ExchangeGainLoss }>({ open: false });

  const remove = async (id: string) => {
    try {
      await deleteMut.mutateAsync(id);
      message.success(t('exchange.deleted'));
    } catch {
      message.error(t('common.saveFailed'));
    }
  };

  const columns: ColumnsType<ExchangeGainLoss> = [
    {
      title: t('exchange.number'),
      dataIndex: 'number',
      width: 130,
      render: (v: string) => (
        <span dir="ltr" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
          {v}
        </span>
      ),
    },
    {
      title: t('exchange.date'),
      dataIndex: 'date',
      width: 140,
      defaultSortOrder: 'descend',
      sorter: (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      render: (v: string) => formatDate(v),
    },
    {
      title: t('exchange.statusLabel'),
      dataIndex: 'type',
      width: 120,
      align: 'center',
      render: (v: ExchangeGainLoss['type']) => (
        <Tag color={v === 'GAIN' ? 'success' : 'error'}>{t(`exchange.${v === 'GAIN' ? 'gain' : 'loss'}`)}</Tag>
      ),
    },
    {
      title: t('exchange.amountLabel'),
      dataIndex: 'amount',
      width: 170,
      align: 'right',
      sorter: (a, b) => a.amount - b.amount,
      // `fractionDigits={2}`: Money rounds to whole units by default, and the cents ARE the
      // result on a currency movement.
      render: (v: number) => <Money value={v} fractionDigits={2} signed strong />,
    },
    {
      title: t('exchange.notes'),
      dataIndex: 'notes',
      render: (v?: string) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 190,
      align: 'right',
      render: (_, r) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => setFormState({ open: true, record: r })}>
            {t('common.edit')}
          </Button>
          <Popconfirm
            title={t('exchange.deleteConfirm')}
            okText={t('common.yes')}
            cancelText={t('common.no')}
            onConfirm={() => remove(r.id)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              {t('common.delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="fade-in">
      <PageHeader
        title={t('exchange.title')}
        subtitle={t('exchange.subtitle')}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormState({ open: true, record: undefined })}>
            {t('exchange.newRecord')}
          </Button>
        }
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
          marginBottom: 16,
        }}
      >
        <Card variant="borderless" className="soft-card">
          <Statistic title={t('exchange.gain')} valueRender={() => <Money value={totals?.gain ?? 0} fractionDigits={2} />} />
        </Card>
        <Card variant="borderless" className="soft-card">
          <Statistic title={t('exchange.loss')} valueRender={() => <Money value={totals?.loss ?? 0} fractionDigits={2} />} />
        </Card>
        <Card variant="borderless" className="soft-card">
          <Statistic
            title={t('exchange.net')}
            valueRender={() => <Money value={totals?.net ?? 0} fractionDigits={2} signed strong />}
          />
        </Card>
      </div>

      <Card variant="borderless" styles={{ body: { padding: 12 } }}>
        <Table<ExchangeGainLoss>
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={data ?? []}
          scroll={{ x: 900 }}
          pagination={{ pageSize: 12, hideOnSinglePage: true, showSizeChanger: false }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <Space direction="vertical" size={2}>
                    <Text>{t('exchange.emptyTitle')}</Text>
                    <Text type="secondary">{t('exchange.emptyHint')}</Text>
                  </Space>
                }
              >
                <Button type="primary" onClick={() => setFormState({ open: true, record: undefined })}>
                  {t('exchange.newRecord')}
                </Button>
              </Empty>
            ),
          }}
        />
      </Card>

      <GainLossFormModal
        open={formState.open}
        onClose={() => setFormState((s) => ({ ...s, open: false }))}
        record={formState.record}
      />
    </div>
  );
}
