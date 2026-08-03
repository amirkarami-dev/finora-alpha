import { useState } from 'react';
import { App, Button, Card, Descriptions, Empty, Popconfirm, Result, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckOutlined, EditOutlined, PlusOutlined, UndoOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';
import { Money } from '@/components/common/Money';
import { PaymentMethodTag } from '@/components/common/StatusTag';
import { usePayment, useRemovePaymentItem, useSetPaymentStatus } from '@/services/queries';
import { formatDate, formatNumber } from '@/utils/format';
import type { PaymentItemRow } from '@/services/api';
import { PaymentFormModal } from './PaymentFormModal';
import { PaymentItemFormModal } from './PaymentItemFormModal';

const { Text } = Typography;

type ActiveModal = 'editHeader' | 'addItem' | 'editItem' | null;

export default function PaymentDetailPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const { data, isLoading } = usePayment(id);
  const removeMut = useRemovePaymentItem();
  const statusMut = useSetPaymentStatus();
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [editingItem, setEditingItem] = useState<PaymentItemRow | undefined>(undefined);

  if (!isLoading && !data) {
    return <Result status="404" title={t('errors.notFoundTitle')} subTitle={t('errors.notFoundDesc')} />;
  }
  if (!data) return null;

  const { payment, customerName, type, status, items, unallocated } = data;
  const isDraft = status === 'DRAFT';

  const changeStatus = async (next: 'DRAFT' | 'CONFIRMED') => {
    try {
      await statusMut.mutateAsync({ id: payment.id, status: next });
      message.success(next === 'CONFIRMED' ? t('payments.confirmed') : t('payments.reopened'));
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      if (code === 'no-payment-items') message.error(t('payments.errors.no-payment-items'));
      else message.error(t('common.saveFailed'));
    }
  };

  const columns: ColumnsType<PaymentItemRow> = [
    {
      title: t('payments.invoiceColumn'),
      dataIndex: 'invoiceNumber',
      width: 150,
      render: (v: string | undefined, r) => (
        <Button
          type="link"
          size="small"
          style={{ padding: 0, height: 'auto', fontFamily: 'monospace' }}
          onClick={() => navigate(`/app/invoices/${encodeURIComponent(r.invoiceId)}`)}
        >
          {v ?? r.invoiceId}
        </Button>
      ),
    },
    { title: t('payments.date'), dataIndex: 'date', width: 120, render: (v) => formatDate(v) },
    {
      title: t('payments.amount'),
      dataIndex: 'amount',
      width: 140,
      align: 'right',
      render: (v, r) => <Money value={v} currency={r.currency} />,
    },
    {
      title: t('payments.fxRate'),
      dataIndex: 'fxRate',
      width: 100,
      align: 'right',
      render: (v: number) => (v === 1 ? <Text type="secondary">—</Text> : formatNumber(v, 4)),
    },
    { title: t('payments.amountUsd'), dataIndex: 'amountUSD', width: 140, align: 'right', render: (v) => <Money value={v} strong /> },
    { title: t('payments.method'), dataIndex: 'method', width: 120, align: 'center', render: (v) => <PaymentMethodTag method={v} /> },
    {
      title: t('payments.settledVia'),
      key: 'via',
      width: 200,
      render: (_, r) =>
        r.bankAccountName ? (
          r.bankAccountName
        ) : r.chequeNumber ? (
          <Space size={4}>
            <span dir="ltr" style={{ fontFamily: 'monospace' }}>
              {r.chequeNumber}
            </span>
            {r.chequeStatus && <Tag>{t(`cheques.status.${r.chequeStatus}`)}</Tag>}
          </Space>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    { title: t('payments.itemsCount'), key: 'allocs', width: 90, align: 'center', render: (_, r) => r.allocations.length },
    ...(isDraft
      ? ([
          {
            title: t('common.actions'),
            key: 'actions',
            width: 170,
            align: 'right',
            render: (_, r) => (
              <Space>
                <Button
                  type="link"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => {
                    setEditingItem(r);
                    setActiveModal('editItem');
                  }}
                >
                  {t('common.edit')}
                </Button>
                <Popconfirm
                  title={t('payments.removeItemConfirm')}
                  okText={t('common.yes')}
                  cancelText={t('common.no')}
                  onConfirm={async () => {
                    try {
                      await removeMut.mutateAsync({ paymentId: payment.id, itemId: r.id });
                      message.success(t('payments.itemRemoved'));
                    } catch {
                      message.error(t('common.saveFailed'));
                    }
                  }}
                >
                  <Button type="link" size="small" danger>
                    {t('common.delete')}
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ] as ColumnsType<PaymentItemRow>)
      : []),
  ];

  return (
    <div className="fade-in">
      <PageHeader
        onBack
        title={
          <Space wrap>
            <span style={{ fontFamily: 'monospace' }}>{payment.id}</span>
            <Tag color={isDraft ? 'default' : 'success'}>{t(`payments.status.${status}`)}</Tag>
            <Tag bordered={false}>{t(`payments.type.${type}`)}</Tag>
          </Space>
        }
        subtitle={customerName}
        extra={
          <Space wrap>
            {isDraft && (
              <Button icon={<EditOutlined />} onClick={() => setActiveModal('editHeader')}>
                {t('payments.editPayment')}
              </Button>
            )}
            {isDraft && type === 'INVOICE' && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setActiveModal('addItem')}>
                {t('payments.addItem')}
              </Button>
            )}
            {isDraft ? (
              <Popconfirm
                title={t('payments.confirmConfirm')}
                okText={t('common.yes')}
                cancelText={t('common.no')}
                onConfirm={() => changeStatus('CONFIRMED')}
              >
                <Button type="primary" icon={<CheckOutlined />}>
                  {t('payments.confirm')}
                </Button>
              </Popconfirm>
            ) : (
              // Reopening is deliberate, not an accident — it pulls real money back out of every
              // balance until the payment is confirmed again.
              <Popconfirm
                title={t('payments.reopenConfirm')}
                okText={t('common.yes')}
                cancelText={t('common.no')}
                onConfirm={() => changeStatus('DRAFT')}
              >
                <Button icon={<UndoOutlined />}>{t('payments.reopen')}</Button>
              </Popconfirm>
            )}
          </Space>
        }
      />

      <Card variant="borderless" style={{ marginBottom: 16 }}>
        <Descriptions
          column={{ xs: 1, sm: 2, md: 3 }}
          size="small"
          items={[
            { key: 'person', label: t('payments.person'), children: customerName },
            { key: 'date', label: t('payments.date'), children: formatDate(payment.date) },
            {
              key: 'declared',
              label: t('payments.declaredTotal'),
              children: <Money value={payment.amount} currency={payment.currency} />,
            },
            { key: 'usd', label: t('payments.amountUsd'), children: <Money value={payment.amountUSD} strong /> },
            {
              key: 'unallocated',
              label: t('payments.unallocated'),
              children:
                unallocated > 0 ? (
                  <Text type="warning">
                    <Money value={unallocated} currency={payment.currency} />
                  </Text>
                ) : (
                  <Text type="success">{t('payments.fullyAllocated')}</Text>
                ),
            },
            { key: 'notes', label: t('payments.notes'), children: payment.notes || <Text type="secondary">{t('common.none')}</Text> },
          ]}
        />
      </Card>

      {type === 'INVOICE' ? (
        <Card variant="borderless" title={`${t('payments.items')} · ${items.length}`} styles={{ body: { padding: 12 } }}>
          <Table<PaymentItemRow>
            rowKey="id"
            columns={columns}
            dataSource={items}
            scroll={{ x: 1150 }}
            pagination={false}
            expandable={{
              expandedRowRender: (r) => (
                <Table
                  size="small"
                  rowKey="id"
                  pagination={false}
                  dataSource={r.allocations}
                  columns={[
                    { title: t('items.product'), dataIndex: 'product' },
                    {
                      title: t('payments.allocated'),
                      dataIndex: 'amount',
                      align: 'right',
                      render: (v: number) => <Money value={v} currency={r.currency} />,
                    },
                    {
                      title: t('payments.amountUsd'),
                      dataIndex: 'amountUSD',
                      align: 'right',
                      render: (v: number) => <Money value={v} />,
                    },
                  ]}
                />
              ),
            }}
            locale={{
              emptyText: (
                <Empty description={t('payments.noItemsYet')}>
                  {isDraft && (
                    <Button type="primary" onClick={() => setActiveModal('addItem')}>
                      {t('payments.addItem')}
                    </Button>
                  )}
                </Empty>
              ),
            }}
          />
        </Card>
      ) : (
        <Card variant="borderless">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('payments.generalNoItems')} />
        </Card>
      )}

      {activeModal === 'editHeader' && (
        <PaymentFormModal open onClose={() => setActiveModal(null)} type={type} payment={payment} />
      )}
      {(activeModal === 'addItem' || activeModal === 'editItem') && (
        <PaymentItemFormModal
          open
          onClose={() => {
            setActiveModal(null);
            setEditingItem(undefined);
          }}
          paymentId={payment.id}
          defaultCurrency={payment.currency}
          unallocated={unallocated}
          item={activeModal === 'editItem' ? editingItem : undefined}
        />
      )}
    </div>
  );
}
