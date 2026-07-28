import { useMemo, useState, type CSSProperties } from 'react';
import { DatePicker, Empty, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { Money } from '@/components/common/Money';
import { useChargeDocs, useChargeSourceInvoices } from '@/services/queries';
import type { ChargeSourceInvoiceRow } from '@/services/api';
import { formatDate, formatMt } from '@/utils/format';
import type { ChargeDirection, InvoiceSide, InvoiceType } from '@/types';

const { Text } = Typography;
const { RangePicker } = DatePicker;

// RTL fix (InventoryDocFormModal.tsx idiom): a bare `dir="ltr"` span does not change which side
// an ancestor's own `direction:rtl` + ellipsis box clips from — it still right-anchors and clips
// the LEADING token. Giving the LTR span its own block box + overflow/ellipsis makes IT the
// truncating box, clipping the TRAILING token instead (verified empirically).
const ltrTruncateStyle: CSSProperties = {
  display: 'block',
  direction: 'ltr',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

interface InvoicePickerModalProps {
  open: boolean;
  /** Which invoice universe to offer (design spec §4's `getChargeSourceInvoices(side)`). Mirrors
   *  the claim-side mapping in spec §1's binding-decision table (expense → PURCHASE, revenue →
   *  SALE) — the caller (`ChargeListPage`) derives this from `direction` so an expense document
   *  is always booked against a cost-side invoice and a revenue document against a sale-side one. */
  side: InvoiceSide;
  onCancel: () => void;
  onPick: (invoice: ChargeSourceInvoiceRow) => void;
}

/** design spec §6 — the user's explicitly-requested "button to pick the invoice with filters",
 *  shared (eventually) by expenses, revenues and claims. Only party/type/date/search filters +
 *  radio selection are needed by Phase 4b; claims reuse in Phase 6 is expected to need nothing
 *  more than this same component. */
export function InvoicePickerModal({ open, side, onCancel, onPick }: InvoicePickerModalProps) {
  const { t } = useTranslation();
  const { data: invoices, isLoading } = useChargeSourceInvoices(side);
  // `side` maps 1:1 to a charge direction (see the prop doc above) purely to compute the
  // "already has N charge docs" hint below — this modal otherwise has no opinion on direction.
  const direction: ChargeDirection = side === 'PURCHASE' ? 'EXPENSE' : 'REVENUE';
  const { data: existingDocs } = useChargeDocs(direction, 'INVOICE');

  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [partyFilter, setPartyFilter] = useState<string | undefined>(undefined);
  const [typeFilter, setTypeFilter] = useState<InvoiceType | undefined>(undefined);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [search, setSearch] = useState('');

  // Party options are derived FROM THE INVOICE ROWS THEMSELVES (distinct customerId over
  // `useChargeSourceInvoices`), NOT from `customerType` — carried over from the pre-rework
  // `ExpenseFormModal.tsx:121-124` reasoning: nothing in the app validates customerType against
  // contract direction, so a type-based filter would hide parties whose invoices genuinely exist.
  const partyOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const inv of invoices ?? []) if (!seen.has(inv.customerId)) seen.set(inv.customerId, inv.customerName);
    return Array.from(seen, ([value, label]) => ({ value, label }));
  }, [invoices]);

  const typeOptions = useMemo(() => {
    const seen = new Set<InvoiceType>();
    for (const inv of invoices ?? []) seen.add(inv.invoiceType);
    return Array.from(seen, (type) => ({ value: type, label: t(`tradeInvoices.type.${type}`) }));
  }, [invoices, t]);

  // Existing-charge-count hint, keyed by invoiceId — many charge docs per invoice are allowed
  // (spec §4 "Docs per invoice"), so this surfaces the count rather than blocking selection.
  const existingCountByInvoiceId = useMemo(() => {
    const map = new Map<string, number>();
    for (const doc of existingDocs ?? []) {
      if (doc.status !== 'ACTIVE' || !doc.invoiceId) continue;
      map.set(doc.invoiceId, (map.get(doc.invoiceId) ?? 0) + 1);
    }
    return map;
  }, [existingDocs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const [from, to] = dateRange ?? [null, null];
    return (invoices ?? []).filter((inv) => {
      if (partyFilter && inv.customerId !== partyFilter) return false;
      if (typeFilter && inv.invoiceType !== typeFilter) return false;
      if (from && dayjs(inv.invoiceDate).isBefore(from, 'day')) return false;
      if (to && dayjs(inv.invoiceDate).isAfter(to, 'day')) return false;
      if (q && !inv.invoiceNumber.toLowerCase().includes(q) && !inv.customerName.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [invoices, partyFilter, typeFilter, dateRange, search]);

  const columns: ColumnsType<ChargeSourceInvoiceRow> = [
    {
      title: t('charges.pickerNumber'),
      dataIndex: 'invoiceNumber',
      width: 170,
      render: (v: string, r) => (
        <Space direction="vertical" size={0} style={{ maxWidth: '100%' }}>
          <span dir="ltr" style={{ ...ltrTruncateStyle, fontFamily: 'monospace', fontWeight: 600 }}>
            {v}
          </span>
          {(existingCountByInvoiceId.get(r.id) ?? 0) > 0 && (
            <Tag style={{ marginInlineStart: 0 }}>
              {t('charges.pickerExistingCount', { count: existingCountByInvoiceId.get(r.id) })}
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: t('charges.pickerType'),
      dataIndex: 'invoiceType',
      width: 150,
      render: (v: InvoiceType) => <Tag color={side === 'PURCHASE' ? 'blue' : 'green'}>{t(`tradeInvoices.type.${v}`)}</Tag>,
    },
    { title: t('charges.date'), dataIndex: 'invoiceDate', width: 120, render: (v) => formatDate(v) },
    { title: t('charges.customer'), dataIndex: 'customerName', width: 200 },
    { title: t('charges.pickerItems'), dataIndex: 'itemCount', width: 80, align: 'center' },
    { title: t('charges.pickerWeight'), dataIndex: 'totalWeightMt', width: 130, align: 'right', render: (v) => formatMt(v) },
    {
      title: t('charges.pickerTotal'),
      key: 'total',
      width: 140,
      align: 'right',
      render: (_, r) => <Money value={r.totalAmount} currency={r.currency} />,
    },
  ];

  const resetFilters = () => {
    setSelectedId(undefined);
    setPartyFilter(undefined);
    setTypeFilter(undefined);
    setDateRange(null);
    setSearch('');
  };

  const handleClose = () => {
    resetFilters();
    onCancel();
  };

  const handleOk = () => {
    const row = (invoices ?? []).find((inv) => inv.id === selectedId);
    if (!row) return;
    onPick(row);
    // The component stays mounted (only `open` toggles, per `ChargeListPage`), so filters must
    // be cleared here too, not just on Cancel — otherwise a re-open shows the last pick's filters.
    resetFilters();
  };

  return (
    <Modal
      open={open}
      width={920}
      title={t('charges.pickerTitle')}
      okText={t('charges.pickerOk')}
      cancelText={t('common.cancel')}
      onOk={handleOk}
      onCancel={handleClose}
      okButtonProps={{ disabled: !selectedId }}
      destroyOnHidden
      maskClosable={false}
    >
      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ width: 200 }}
          placeholder={t('charges.party')}
          options={partyOptions}
          value={partyFilter}
          onChange={setPartyFilter}
        />
        <Select
          allowClear
          style={{ width: 190 }}
          placeholder={t('charges.pickerType')}
          options={typeOptions}
          value={typeFilter}
          onChange={setTypeFilter}
        />
        <RangePicker value={dateRange} onChange={(v) => setDateRange(v as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null)} format="DD MMM YYYY" />
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder={t('charges.pickerSearchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 240 }}
        />
      </Space>

      <Table<ChargeSourceInvoiceRow>
        rowKey="id"
        size="small"
        loading={isLoading}
        columns={columns}
        dataSource={filtered}
        scroll={{ x: 990, y: 360 }}
        pagination={{ pageSize: 8, hideOnSinglePage: true, showSizeChanger: false }}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selectedId ? [selectedId] : [],
          onChange: (keys) => setSelectedId(keys[0] as string | undefined),
        }}
        onRow={(r) => ({ onClick: () => setSelectedId(r.id), style: { cursor: 'pointer' } })}
        locale={{ emptyText: <Empty description={<Text type="secondary">{t('charges.pickerEmptyHint')}</Text>} /> }}
      />
    </Modal>
  );
}
