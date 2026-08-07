import { useMemo, useState } from 'react';
import {
  App, Alert, Button, Checkbox, DatePicker, Empty, Input, InputNumber, Modal, Segmented, Select,
  Space, Table, Tag, Tooltip, Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { EditOutlined, SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { Money } from '@/components/common/Money';
import { useCheques, useFinancialAccounts, useSetChequeStatus } from '@/services/queries';
import { formatDate } from '@/utils/format';
import { CURRENCIES } from '@/config/constants';
import { CHEQUE_STATUSES, type ChequeRow } from '@/services/api';
import type { ChequeStatus, ChequeType, Currency } from '@/types';
import { ChequeFormModal } from './ChequeFormModal';

const { RangePicker } = DatePicker;

const { Text } = Typography;

const STATUS_COLOR: Record<ChequeStatus, string> = {
  PENDING: 'processing',
  PAID: 'success',
  RETURNED: 'error',
  EXPIRED: 'warning',
  CHANGED: 'default',
};

/** Every status except the one it already has. Derived from the API's own list rather than
 *  hand-copied, so the buttons cannot drift away from what the server accepts. */
const nextStatuses = (current: ChequeStatus): ChequeStatus[] =>
  CHEQUE_STATUSES.filter((s) => s !== current);

interface Filters {
  text: string;
  status: ChequeStatus | 'all';
  type: ChequeType | 'all';
  currency: Currency | 'all';
  due: [Dayjs | null, Dayjs | null] | null;
  minAmount?: number;
  maxAmount?: number;
  dueOnly: boolean;
}

const EMPTY_FILTERS: Filters = {
  text: '',
  status: 'all',
  type: 'all',
  currency: 'all',
  due: null,
  minAmount: undefined,
  maxAmount: undefined,
  dueOnly: false,
};

/**
 * The cheque register. Cheques are BORN on a payment line — this tab lists, filters, edits and
 * moves them, but never creates one. That keeps a single origin story for every cheque: it
 * exists because someone was paid with it.
 */
export function ChequesTab() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const { data, isLoading } = useCheques();
  const { data: banks } = useFinancialAccounts('BANK');
  const setStatus = useSetChequeStatus();
  const [formState, setFormState] = useState<{ open: boolean; cheque?: ChequeRow }>({ open: false });
  const [payState, setPayState] = useState<{ open: boolean; cheque?: ChequeRow; bankId?: string }>({ open: false });

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const rows = useMemo(() => {
    const q = filters.text.trim().toLowerCase();
    const [from, to] = filters.due ?? [null, null];
    return (data ?? []).filter((c) => {
      if (q && !`${c.number} ${c.ownerName} ${c.bankName}`.toLowerCase().includes(q)) return false;
      if (filters.status !== 'all' && c.status !== filters.status) return false;
      if (filters.type !== 'all' && c.type !== filters.type) return false;
      if (filters.currency !== 'all' && c.currency !== filters.currency) return false;
      if (filters.dueOnly && !c.dueForAction) return false;
      if (filters.minAmount !== undefined && c.amount < filters.minAmount) return false;
      if (filters.maxAmount !== undefined && c.amount > filters.maxAmount) return false;
      // Inclusive on both ends — a user picking 1–31 March means the whole of March.
      if (from && dayjs(c.dueDate).isBefore(from, 'day')) return false;
      if (to && dayjs(c.dueDate).isAfter(to, 'day')) return false;
      return true;
    });
  }, [data, filters]);

  const dueCount = (data ?? []).filter((c) => c.dueForAction).length;
  const filtersActive = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

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
          {/* Editable only while PENDING, matching the server. Shown disabled rather than
              hidden on other statuses, with the two-step route spelled out — a missing button
              reads as "not supported", which is the wrong lesson. */}
          <Tooltip title={r.status === 'PENDING' ? undefined : t('cheques.errors.cheque-not-pending')}>
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              disabled={r.status !== 'PENDING'}
              onClick={() => setFormState({ open: true, cheque: r })}
            >
              {t('common.edit')}
            </Button>
          </Tooltip>
          {nextStatuses(r.status).map((next) => (
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
      <Space style={{ marginBottom: 12 }} wrap>
        <Segmented
          value={filters.status}
          onChange={(v) => set('status', v as ChequeStatus | 'all')}
          options={[
            { label: t('common.all'), value: 'all' },
            ...CHEQUE_STATUSES.map((s) => ({ label: t(`cheques.status.${s}`), value: s })),
          ]}
        />
      </Space>
      <Space style={{ marginBottom: 16 }} wrap size={8}>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder={t('cheques.searchPlaceholder')}
          style={{ width: 260 }}
          value={filters.text}
          onChange={(e) => set('text', e.target.value)}
        />
        <Select
          allowClear
          style={{ width: 150 }}
          placeholder={t('cheques.type')}
          value={filters.type === 'all' ? undefined : filters.type}
          onChange={(v) => set('type', (v as ChequeType) ?? 'all')}
          options={(['NORMAL', 'SECURITY'] as ChequeType[]).map((v) => ({
            value: v,
            label: t(`cheques.types.${v}`),
          }))}
        />
        <Select
          allowClear
          style={{ width: 120 }}
          placeholder={t('cheques.currency')}
          value={filters.currency === 'all' ? undefined : filters.currency}
          onChange={(v) => set('currency', (v as Currency) ?? 'all')}
          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
        />
        <RangePicker
          value={filters.due ?? undefined}
          onChange={(v) => set('due', v as [Dayjs | null, Dayjs | null] | null)}
          placeholder={[t('cheques.dueFrom'), t('cheques.dueTo')]}
        />
        <InputNumber
          style={{ width: 130 }}
          min={0}
          placeholder={t('cheques.minAmount')}
          value={filters.minAmount}
          onChange={(v) => set('minAmount', v ?? undefined)}
        />
        <InputNumber
          style={{ width: 130 }}
          min={0}
          placeholder={t('cheques.maxAmount')}
          value={filters.maxAmount}
          onChange={(v) => set('maxAmount', v ?? undefined)}
        />
        <Checkbox checked={filters.dueOnly} onChange={(e) => set('dueOnly', e.target.checked)}>
          {t('cheques.dueOnly')}
        </Checkbox>
        {filtersActive && (
          <Button type="link" size="small" onClick={() => setFilters(EMPTY_FILTERS)}>
            {t('common.clearFilters')}
          </Button>
        )}
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
              />
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
          {/* A cheque we WROTE clears out of one of our accounts; one we were GIVEN clears into
              one. Same question, opposite money — asking "which account received this" about a
              cheque being paid out reads as the wrong question. Falls back to the neutral
              wording when the cheque is used nowhere, or on lines that disagree. */}
          <Text type="secondary">
            {payState.cheque?.direction === 'OUT'
              ? t('cheques.markPaidHintOut')
              : payState.cheque?.direction === 'IN'
                ? t('cheques.markPaidHintIn')
                : t('cheques.markPaidHint')}
          </Text>
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
