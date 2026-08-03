import { useState } from 'react';
import { App, Alert, Button, Empty, Modal, Segmented, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { Money } from '@/components/common/Money';
import { useCheques, useFinancialAccounts, useSetChequeStatus } from '@/services/queries';
import { formatDate } from '@/utils/format';
import type { ChequeRow } from '@/services/api';
import type { ChequeStatus } from '@/types';
import { ChequeFormModal } from './ChequeFormModal';

const { Text } = Typography;

const STATUS_COLOR: Record<ChequeStatus, string> = {
  PENDING: 'processing',
  PAID: 'success',
  RETURNED: 'error',
  EXPIRED: 'warning',
  CHANGED: 'default',
};

/** Mirrors CHEQUE_TRANSITIONS in api.ts. Kept here only to decide which buttons to show — the
 *  API rejects an illegal move regardless, so a drift here cannot corrupt anything. */
const NEXT_STATUSES: Record<ChequeStatus, ChequeStatus[]> = {
  PENDING: ['PAID', 'RETURNED', 'EXPIRED', 'CHANGED'],
  RETURNED: ['CHANGED', 'PENDING'],
  EXPIRED: ['PAID', 'RETURNED', 'CHANGED'],
  CHANGED: [],
  PAID: [],
};

export function ChequesTab() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [statusFilter, setStatusFilter] = useState<ChequeStatus | 'all'>('all');
  const { data, isLoading } = useCheques();
  const { data: banks } = useFinancialAccounts('BANK');
  const setStatus = useSetChequeStatus();
  const [formState, setFormState] = useState<{ open: boolean; cheque?: ChequeRow }>({ open: false });
  const [payState, setPayState] = useState<{ open: boolean; cheque?: ChequeRow; bankId?: string }>({ open: false });

  const rows = (data ?? []).filter((c) => (statusFilter === 'all' ? true : c.status === statusFilter));
  const dueCount = (data ?? []).filter((c) => c.dueForAction).length;

  const move = async (cheque: ChequeRow, next: ChequeStatus) => {
    // PAID is the one transition that needs more information — which company account received
    // the money. Everything else is a one-click move.
    if (next === 'PAID') {
      setPayState({ open: true, cheque, bankId: undefined });
      return;
    }
    try {
      await setStatus.mutateAsync({ id: cheque.id, status: next });
      message.success(t('cheques.statusChanged'));
    } catch {
      message.error(t('common.saveFailed'));
    }
  };

  const confirmPaid = async () => {
    if (!payState.cheque) return;
    if (!payState.bankId) {
      message.error(t('cheques.errors.bank-account-required'));
      return;
    }
    try {
      await setStatus.mutateAsync({ id: payState.cheque.id, status: 'PAID', bankAccountId: payState.bankId });
      message.success(t('cheques.statusChanged'));
      setPayState({ open: false });
    } catch {
      message.error(t('common.saveFailed'));
    }
  };

  const columns: ColumnsType<ChequeRow> = [
    {
      title: t('cheques.number'),
      dataIndex: 'number',
      width: 140,
      render: (v: string, r) => (
        <Space size={4}>
          <span dir="ltr" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
            {v}
          </span>
          {r.dueForAction && (
            <Tooltip title={t('cheques.dueHint')}>
              <Tag color="warning">{t('cheques.due')}</Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    { title: t('cheques.bankName'), dataIndex: 'bankName', width: 170 },
    { title: t('cheques.ownerName'), dataIndex: 'ownerName', width: 160 },
    { title: t('cheques.type'), dataIndex: 'type', width: 110, align: 'center', render: (v) => <Tag>{t(`cheques.types.${v}`)}</Tag> },
    { title: t('cheques.dueDate'), dataIndex: 'dueDate', width: 130, render: (v) => formatDate(v) },
    {
      title: t('cheques.amount'),
      dataIndex: 'amount',
      width: 140,
      align: 'right',
      render: (v, r) => <Money value={v} currency={r.currency} />,
    },
    {
      title: t('cheques.statusLabel'),
      dataIndex: 'status',
      width: 120,
      align: 'center',
      render: (v: ChequeStatus) => <Tag color={STATUS_COLOR[v]}>{t(`cheques.status.${v}`)}</Tag>,
    },
    {
      title: t('cheques.bankedInto'),
      dataIndex: 'bankAccountName',
      width: 170,
      render: (v?: string) => v ?? <Text type="secondary">—</Text>,
    },
    { title: t('cheques.usage'), dataIndex: 'usageCount', width: 90, align: 'center' },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 300,
      align: 'right',
      render: (_, r) => (
        <Space wrap>
          {r.status !== 'PAID' && (
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => setFormState({ open: true, cheque: r })}>
              {t('common.edit')}
            </Button>
          )}
          {NEXT_STATUSES[r.status].map((next) => (
            <Button
              key={next}
              type="link"
              size="small"
              danger={next === 'RETURNED'}
              onClick={() => move(r, next)}
            >
              {t(`cheques.action.${next}`)}
            </Button>
          ))}
        </Space>
      ),
    },
  ];

  return (
    <>
      {dueCount > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('cheques.dueBanner', { count: dueCount })}
        />
      )}
      <Space style={{ marginBottom: 16 }} wrap>
        <Segmented
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as ChequeStatus | 'all')}
          options={[
            { label: t('common.all'), value: 'all' },
            ...(['PENDING', 'PAID', 'RETURNED', 'EXPIRED', 'CHANGED'] as ChequeStatus[]).map((s) => ({
              label: t(`cheques.status.${s}`),
              value: s,
            })),
          ]}
        />
        <Button type="primary" onClick={() => setFormState({ open: true, cheque: undefined })}>
          {t('cheques.newCheque')}
        </Button>
      </Space>

      <Table<ChequeRow>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 1500 }}
        pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }}
        locale={{
          emptyText:
            (data ?? []).length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <Space direction="vertical" size={2}>
                    <Text>{t('cheques.emptyTitle')}</Text>
                    <Text type="secondary">{t('cheques.emptyHint')}</Text>
                  </Space>
                }
              >
                <Button type="primary" onClick={() => setFormState({ open: true, cheque: undefined })}>
                  {t('cheques.newCheque')}
                </Button>
              </Empty>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary">{t('common.noFilterResults')}</Text>} />
            ),
        }}
      />

      <ChequeFormModal
        open={formState.open}
        onClose={() => setFormState((s) => ({ ...s, open: false }))}
        cheque={formState.cheque}
      />

      <Modal
        open={payState.open}
        title={t('cheques.markPaidTitle')}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        onOk={confirmPaid}
        onCancel={() => setPayState({ open: false })}
        confirmLoading={setStatus.isPending}
        destroyOnHidden
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text type="secondary">{t('cheques.markPaidHint')}</Text>
          <Select
            style={{ width: '100%' }}
            showSearch
            optionFilterProp="label"
            placeholder={t('payments.pickBank')}
            value={payState.bankId}
            onChange={(v) => setPayState((s) => ({ ...s, bankId: v }))}
            options={(banks ?? []).filter((b) => b.active).map((b) => ({ value: b.id, label: `${b.name} (${b.currency})` }))}
          />
        </Space>
      </Modal>
    </>
  );
}
