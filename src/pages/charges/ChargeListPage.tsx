import { useMemo, useState, type MouseEvent } from 'react';
import { App, Button, Card, Col, Empty, Input, Popconfirm, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { Money } from '@/components/common/Money';
import { useCancelChargeDoc, useChargeDocs } from '@/services/queries';
import type { ChargeDocRow, ChargeSourceInvoiceRow } from '@/services/api';
import { formatDate } from '@/utils/format';
import { useTabParam } from '@/hooks/useTabParam';
import type { ChargeDirection, ChargeScope, InvoiceSide } from '@/types';
import { chargeDetailRoute } from './routes';
import { ChargeDocFormModal, type ChargeDocInvoiceInfo } from './ChargeDocFormModal';
import { InvoicePickerModal } from './InvoicePickerModal';

const { Text } = Typography;

const TAB_KEYS = ['invoice', 'general'] as const;
type TabKey = (typeof TAB_KEYS)[number];
const TAB_KIND: Record<TabKey, ChargeScope> = { invoice: 'INVOICE', general: 'GENERAL' };

// Mirrors the claim-side mapping in design spec §1's binding-decision table (expense-claim →
// PURCHASE invoices, revenue-claim → SALE) — an expense document books against a cost-side
// invoice, a revenue document against a sale-side one. Same rationale documented from the
// picker's point of view on `InvoicePickerModal`'s `side` prop.
const DIRECTION_SIDE: Record<ChargeDirection, InvoiceSide> = { EXPENSE: 'PURCHASE', REVENUE: 'SALE' };

// Direction-keyed i18n lookups (not hardcoded to `expenses.*`) are what let `ExpensesPage`/
// `RevenuesPage` stay three-line wrappers (spec §9 Phase 5's gate): Phase 5 only has to add a
// parallel `revenues.*` namespace + `ROUTES.revenues` — this component needs no further change.
const TITLE_KEY: Record<ChargeDirection, string> = { EXPENSE: 'expenses.title', REVENUE: 'revenues.title' };
const SUBTITLE_KEY: Record<ChargeDirection, string> = { EXPENSE: 'expenses.subtitle', REVENUE: 'revenues.subtitle' };
const TAB_LABEL_KEY: Record<TabKey, Record<ChargeDirection, string>> = {
  invoice: { EXPENSE: 'expenses.tabInvoice', REVENUE: 'revenues.tabInvoice' },
  general: { EXPENSE: 'expenses.tabGeneral', REVENUE: 'revenues.tabGeneral' },
};
// Empty-start hints (spec §10.11): with zero data every new page must say what the tab is FOR
// and how to fill it, not just render a bare table.
const EMPTY_HINT_KEY: Record<TabKey, Record<ChargeDirection, string>> = {
  invoice: { EXPENSE: 'expenses.emptyInvoiceHint', REVENUE: 'revenues.emptyInvoiceHint' },
  general: { EXPENSE: 'expenses.emptyGeneralHint', REVENUE: 'revenues.emptyGeneralHint' },
};

type ListModal = 'picker' | 'docForm' | null;

interface ChargeListPageProps {
  direction: ChargeDirection;
}

/**
 * design spec §6 — shared list shell for Expenses and Revenues: copies the deleted
 * `ExpensesPage.tsx`'s tab shell + stat tiles (recovered pre-rework via
 * `git show 29f2d29~1:src/pages/expenses/ExpensesPage.tsx`) plus the search-box idiom from
 * `PaymentsPage.tsx:26-35,117-124`. `ExpensesPage`/`RevenuesPage` become three-line wrappers
 * parameterising this by `direction` — the `PurchasePage`/`SalePage` precedent.
 */
export function ChargeListPage({ direction }: ChargeListPageProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useTabParam(TAB_KEYS, 'invoice');
  const kind = TAB_KIND[tab];

  const { data, isLoading } = useChargeDocs(direction, kind);
  const cancelMut = useCancelChargeDoc();
  const [search, setSearch] = useState('');

  const [activeModal, setActiveModal] = useState<ListModal>(null);
  const [pickedInvoice, setPickedInvoice] = useState<ChargeSourceInvoiceRow | undefined>(undefined);

  const rows = useMemo(() => data ?? [], [data]);
  // Deliberately NOT memoized on `rows` (ExpensesPage.tsx precedent, recovered above): cancelling
  // a document mutates the SAME row object `rows` already holds, synchronously, before the
  // invalidated query's refetch resolves into a new array reference — a `useMemo(..., [rows])`
  // here would then sit one render behind the table, which reads `r.status` straight off the row
  // objects and so always shows the current value. Summing on every render keeps the two in
  // lockstep; the list is small enough that this costs nothing.
  const totalUSD = rows.filter((r) => r.status !== 'CANCELLED').reduce((s, r) => s + r.totalUSD, 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.invoiceNumber ?? '').toLowerCase().includes(q) ||
        (r.customerName ?? '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  const cancelDoc = async (id: string) => {
    try {
      await cancelMut.mutateAsync(id);
      message.success(t('charges.cancelled'));
    } catch {
      message.error(t('common.saveFailed'));
    }
  };

  const openNew = () => {
    if (tab === 'invoice') {
      setActiveModal('picker');
    } else {
      setPickedInvoice(undefined);
      setActiveModal('docForm');
    }
  };

  const invoiceInfo: ChargeDocInvoiceInfo | undefined = pickedInvoice
    ? { id: pickedInvoice.id, invoiceNumber: pickedInvoice.invoiceNumber, customerName: pickedInvoice.customerName }
    : undefined;

  const columns: ColumnsType<ChargeDocRow> = [
    {
      title: t('charges.date'),
      dataIndex: 'date',
      width: 120,
      sorter: (a, b) => a.date.localeCompare(b.date),
      defaultSortOrder: 'descend',
      render: (v) => formatDate(v),
    },
    {
      title: t('charges.docTitle'),
      dataIndex: 'title',
      width: 240,
      ellipsis: true,
      render: (v, r) => (
        <Text strong delete={r.status === 'CANCELLED'} type={r.status === 'CANCELLED' ? 'secondary' : undefined}>
          {v}
        </Text>
      ),
    },
    { title: t('charges.linesCount'), key: 'lines', width: 90, align: 'center', render: (_, r) => r.lineCount },
    ...(kind === 'INVOICE'
      ? [
          {
            title: t('charges.invoice'),
            key: 'invoice',
            width: 160,
            onCell: () => ({ onClick: (e: MouseEvent) => e.stopPropagation() }),
            render: (_: unknown, r: ChargeDocRow) =>
              r.invoiceId ? (
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0, height: 'auto', fontFamily: 'monospace' }}
                  onClick={() => navigate(`/app/invoices/${encodeURIComponent(r.invoiceId!)}`)}
                >
                  {r.invoiceNumber ?? r.invoiceId}
                </Button>
              ) : (
                <Text type="secondary">—</Text>
              ),
          },
          {
            title: t('charges.customer'),
            dataIndex: 'customerName',
            width: 200,
            render: (v?: string) => v || <Text type="secondary">—</Text>,
          },
        ]
      : []),
    {
      title: t('charges.totalUsd'),
      dataIndex: 'totalUSD',
      width: 140,
      align: 'right',
      sorter: (a, b) => a.totalUSD - b.totalUSD,
      render: (v) => <Money value={v} strong fractionDigits={2} />,
    },
    {
      title: t('charges.status'),
      key: 'status',
      width: 110,
      align: 'center',
      render: (_, r) =>
        r.status === 'CANCELLED' ? <Tag>{t('charges.statusCancelled')}</Tag> : <Tag color="success">{t('charges.statusActive')}</Tag>,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 170,
      align: 'right',
      onCell: () => ({ onClick: (e: MouseEvent) => e.stopPropagation() }),
      render: (_, r) =>
        r.status === 'CANCELLED' ? (
          <Text type="secondary">—</Text>
        ) : (
          <Space>
            <Button type="link" size="small" onClick={() => navigate(chargeDetailRoute(direction, r.id))}>
              {t('charges.open')}
            </Button>
            <Popconfirm
              title={t('charges.cancelConfirm')}
              okText={t('common.yes')}
              cancelText={t('common.no')}
              onConfirm={() => cancelDoc(r.id)}
            >
              <Button type="link" size="small" danger>
                {t('common.cancel')}
              </Button>
            </Popconfirm>
          </Space>
        ),
    },
  ];

  return (
    <div className="fade-in">
      <PageHeader
        title={t(TITLE_KEY[direction])}
        subtitle={t(SUBTITLE_KEY[direction])}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>
            {tab === 'invoice' ? t('charges.newInvoiceDoc') : t('charges.newGeneralDoc')}
          </Button>
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={8}>
          <Card variant="borderless" className="soft-card">
            <Statistic
              key={totalUSD}
              title={t('charges.totalUsd')}
              value={totalUSD}
              prefix="$"
              precision={2}
              valueStyle={{ fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card variant="borderless" className="soft-card">
            <Statistic title={t('common.results')} value={rows.length} valueStyle={{ fontWeight: 700 }} />
          </Card>
        </Col>
      </Row>

      <Card
        variant="borderless"
        styles={{ body: { padding: 16 } }}
        tabList={[
          { key: 'invoice', label: t(TAB_LABEL_KEY.invoice[direction]) },
          { key: 'general', label: t(TAB_LABEL_KEY.general[direction]) },
        ]}
        activeTabKey={tab}
        onTabChange={(key) => setTab(key as TabKey)}
      >
        <div style={{ marginBottom: 16 }}>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 320 }}
          />
        </div>
        <Table<ChargeDocRow>
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={filtered}
          scroll={{ x: kind === 'INVOICE' ? 1300 : 900 }}
          pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }}
          locale={{
            // Two distinct empties: nothing booked at all (offer the create action), versus a
            // search that filtered everything out (offer nothing — the fix is to clear the box).
            emptyText:
              rows.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <Space direction="vertical" size={2}>
                      <Text>{t('charges.emptyTab')}</Text>
                      <Text type="secondary">{t(EMPTY_HINT_KEY[tab][direction])}</Text>
                    </Space>
                  }
                >
                  <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>
                    {tab === 'invoice' ? t('charges.newInvoiceDoc') : t('charges.newGeneralDoc')}
                  </Button>
                </Empty>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={<Text type="secondary">{t('common.noSearchResults')}</Text>}
                />
              ),
          }}
          onRow={(r) => ({ onClick: () => navigate(chargeDetailRoute(direction, r.id)), className: 'clickable-row' })}
        />
      </Card>

      <InvoicePickerModal
        open={activeModal === 'picker'}
        side={DIRECTION_SIDE[direction]}
        onCancel={() => setActiveModal(null)}
        onPick={(invoice) => {
          setPickedInvoice(invoice);
          setActiveModal('docForm');
        }}
      />

      {activeModal === 'docForm' && (
        <ChargeDocFormModal
          open
          onClose={() => {
            setActiveModal(null);
            setPickedInvoice(undefined);
          }}
          direction={direction}
          kind={kind}
          invoiceInfo={invoiceInfo}
        />
      )}
    </div>
  );
}
