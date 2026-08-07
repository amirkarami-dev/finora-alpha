import { useMemo, useState, type CSSProperties } from 'react';
import { DatePicker, Empty, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { Money } from '@/components/common/Money';
import { useChargeSourceInvoices, useClaimSourceInvoices } from '@/services/queries';
import type { ChargeSourceInvoiceRow } from '@/services/api';
import { formatDate, formatMt } from '@/utils/format';
import type { ClaimSide, InvoiceType } from '@/types';

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
  /**
   * Discriminates the invoice universe (spec §4). Present → CLAIM mode: the side rule from spec
   * §1's binding table applies (expense-claim → PURCHASE invoices, revenue-claim → SALE) and is
   * resolved SERVER-side by `getClaimSourceInvoices`. Absent → CHARGE-DOC mode: **both** sides.
   *
   * Charge documents are side-agnostic, and only claims are side-restricted. The previous prop
   * here asserted the opposite (an expense had to be booked on a purchase invoice) as though the
   * spec said so — it does not, and neither does the server: `createChargeDoc` derives the side
   * FROM the invoice and has no side guard. The user's requirements doc defines an Invoice
   * Expense as a cost related to "a purchase OR sale invoice" and lists freight / shipping /
   * loading & unloading / insurance / packaging, which are routinely sell-side; it restricts
   * sides for Supplier Claim / Customer Claim only. The sample dataset even seeds an EXPENSE doc
   * on a SALE invoice, which no user could previously reproduce. Narrow with the document-type
   * filter, not with a hard-coded rule.
   */
  claimSide?: ClaimSide;
  /**
   * Optional "N already exist" hint per invoice id, rendered as a tag under the number. Supplied
   * BY THE CALLER (spec §4's "Docs per invoice: many allowed; picker hints how many already
   * exist") rather than derived here: this modal has no direction and, in claim mode, no charge
   * direction at all — deriving one to fetch a count would show a claim's picker a tally of
   * expense documents and fire an unrelated query from the claims flow.
   */
  existingCountByInvoiceId?: Map<string, number>;
  onCancel: () => void;
  onPick: (invoice: ChargeSourceInvoiceRow) => void;
}

/** design spec §6 — the user's explicitly-requested "button to pick the invoice with filters",
 *  shared by expenses, revenues and claims. Only party/type/date/search filters + radio
 *  selection are needed; the type filter is what narrows to one document family. */
export function InvoicePickerModal({
  open,
  claimSide,
  existingCountByInvoiceId,
  onCancel,
  onPick,
}: InvoicePickerModalProps) {
  const { t } = useTranslation();
  // BOTH hooks are called unconditionally (rules of hooks) and gated with TanStack's `enabled`,
  // then the active result is selected — never a conditional hook call.
  const chargeSource = useChargeSourceInvoices(undefined, { enabled: open && !claimSide });
  // The placeholder side is inert — the hook is disabled whenever `claimSide` is absent, so this
  // value only has to satisfy the type, never fetch.
  const claimSource = useClaimSourceInvoices(claimSide ?? 'SALE', { enabled: open && !!claimSide });
  const { data: invoices, isLoading } = claimSide ? claimSource : chargeSource;

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

  // "N existing charge(s)" vs "N existing claim(s)" — the two flows count different things, so
  // one shared label would be wrong in whichever flow it wasn't written for.
  const existingCountKey = claimSide ? 'charges.pickerExistingClaimCount' : 'charges.pickerExistingCount';

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
          {(existingCountByInvoiceId?.get(r.id) ?? 0) > 0 && (
            <Tag style={{ marginInlineStart: 0 }}>
              {t(existingCountKey, { count: existingCountByInvoiceId?.get(r.id) })}
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: t('charges.pickerType'),
      dataIndex: 'invoiceType',
      width: 150,
      // Colored per ROW, not per picker: charge-doc mode lists both sides in one table. Same
      // side derivation as `api.ts`'s `invoiceSide` (`type.startsWith('PURCHASE')`).
      render: (v: InvoiceType) => <Tag color={v.startsWith('PURCHASE') ? 'blue' : 'green'}>{t(`tradeInvoices.type.${v}`)}</Tag>,
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
        locale={{
          // "No invoices" here reads as a bug unless the eligibility rule is spelled out
          // (spec §10.11) — but only when the SOURCE set is genuinely empty. When the user's own
          // filters emptied the table, the eligibility rule is the wrong explanation entirely.
          emptyText:
            (invoices ?? []).length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <Space direction="vertical" size={2}>
                    <Text>{t('charges.pickerEmptyTitle')}</Text>
                    <Text type="secondary">{t('charges.pickerEmptyHint')}</Text>
                  </Space>
                }
              />
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={<Text type="secondary">{t('common.noFilterResults')}</Text>}
              />
            ),
        }}
      />
    </Modal>
  );
}
