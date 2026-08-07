import { useMemo, useState, type MouseEvent } from 'react';
import { App, Button, Card, Col, Empty, Input, Popconfirm, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { Money } from '@/components/common/Money';
import { useCancelClaim, useClaims } from '@/services/queries';
import type { ClaimRow } from '@/services/api';
import { formatDate, formatMt } from '@/utils/format';
import { useTabParam } from '@/hooks/useTabParam';
import type { ClaimItem, ClaimSide, ClaimType } from '@/types';
import { ClaimFormModal } from './ClaimFormModal';

const { Text } = Typography;

// Sale first — a claim is named after the document it is filed against, and the sale side is
// the one users work in daily. The tab key IS the side; no lookup table can drift out of step.
const TAB_KEYS = ['sale', 'purchase'] as const;
type TabKey = (typeof TAB_KEYS)[number];
const TAB_SIDE: Record<TabKey, ClaimSide> = { sale: 'SALE', purchase: 'PURCHASE' };

// Volcano for quantity, gold for quality — arbitrary but consistent tag colors distinguishing the
// two claim types at a glance (design spec §6).
const CLAIM_TYPE_COLOR: Record<ClaimType, string> = { QUANTITY: 'volcano', QUALITY: 'gold' };

type ListModal = 'form' | null;

/**
 * design spec §6/§9 Phase 6 — one page, tabbed sale/purchase via `useTabParam` (the
 * `ChargeListPage` precedent), expandable rows render claim items READ-ONLY — no detail page
 * needed. The modal (`ClaimFormModal`) reuses the shared `InvoicePickerModal` from the charges
 * module.
 */
export default function ClaimsPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useTabParam(TAB_KEYS, 'sale');
  const side = TAB_SIDE[tab];

  const { data, isLoading } = useClaims(side);
  const cancelMut = useCancelClaim();
  const [search, setSearch] = useState('');

  const [activeModal, setActiveModal] = useState<ListModal>(null);
  const [selectedClaim, setSelectedClaim] = useState<ClaimRow | undefined>(undefined);

  const rows = useMemo(() => data ?? [], [data]);
  // Deliberately NOT memoized on `rows` (ChargeListPage.tsx precedent, same reason): cancelling a
  // claim mutates the SAME row object `rows` already holds, synchronously, before the invalidated
  // query's refetch resolves into a new array reference — summing on every render keeps this tile
  // in lockstep with the table, which reads `r.status` straight off the row objects.
  const totalUSD = rows.filter((r) => r.status !== 'CANCELLED').reduce((s, r) => s + r.amountUSD, 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.invoiceNumber ?? '').toLowerCase().includes(q) ||
        (r.partyName ?? '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  const cancelClaimRow = async (id: string) => {
    try {
      await cancelMut.mutateAsync(id);
      message.success(t('claims.cancelled'));
    } catch {
      message.error(t('common.saveFailed'));
    }
  };

  const openNew = () => {
    setSelectedClaim(undefined);
    setActiveModal('form');
  };

  const openEdit = (row: ClaimRow) => {
    setSelectedClaim(row);
    setActiveModal('form');
  };

  const columns: ColumnsType<ClaimRow> = [
    {
      title: t('claims.date'),
      dataIndex: 'date',
      width: 120,
      sorter: (a, b) => a.date.localeCompare(b.date),
      defaultSortOrder: 'descend',
      render: (v) => formatDate(v),
    },
    {
      title: t('claims.claimTitle'),
      dataIndex: 'title',
      width: 220,
      ellipsis: true,
      render: (v, r) => (
        <Text strong delete={r.status === 'CANCELLED'} type={r.status === 'CANCELLED' ? 'secondary' : undefined}>
          {v}
        </Text>
      ),
    },
    {
      title: t('claims.claimType'),
      dataIndex: 'claimType',
      width: 150,
      render: (v: ClaimType) => <Tag color={CLAIM_TYPE_COLOR[v]}>{t(`claimTypes.${v}`)}</Tag>,
    },
    {
      title: t('claims.invoice'),
      key: 'invoice',
      width: 160,
      onCell: () => ({ onClick: (e: MouseEvent) => e.stopPropagation() }),
      render: (_, r) => (
        <Button
          type="link"
          size="small"
          style={{ padding: 0, height: 'auto', fontFamily: 'monospace' }}
          onClick={() => navigate(`/app/invoices/${encodeURIComponent(r.invoiceId)}`)}
        >
          {r.invoiceNumber ?? r.invoiceId}
        </Button>
      ),
    },
    {
      title: t('claims.party'),
      dataIndex: 'partyName',
      width: 180,
      render: (v?: string) => v || <Text type="secondary">—</Text>,
    },
    {
      title: t('claims.amount'),
      key: 'amount',
      width: 130,
      align: 'right',
      render: (_, r) => <Money value={r.amount} currency={r.currency} fractionDigits={2} />,
    },
    {
      title: t('claims.amountUsd'),
      dataIndex: 'amountUSD',
      width: 130,
      align: 'right',
      sorter: (a, b) => a.amountUSD - b.amountUSD,
      // Never `colored` (design spec §6) — a claim isn't a debit/credit signal like a charge line.
      render: (v) => <Money value={v} strong fractionDigits={2} />,
    },
    { title: t('claims.itemsCount'), key: 'items', width: 80, align: 'center', render: (_, r) => r.itemCount },
    {
      title: t('claims.status'),
      key: 'status',
      width: 110,
      align: 'center',
      render: (_, r) =>
        r.status === 'CANCELLED' ? <Tag>{t('claims.statusCancelled')}</Tag> : <Tag color="success">{t('claims.statusActive')}</Tag>,
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
            <Button type="link" size="small" onClick={() => openEdit(r)}>
              {t('common.edit')}
            </Button>
            <Popconfirm
              title={t('claims.cancelConfirm')}
              okText={t('common.yes')}
              cancelText={t('common.no')}
              onConfirm={() => cancelClaimRow(r.id)}
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
        title={t('claims.title')}
        subtitle={t('claims.subtitle')}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>
            {t('claims.newClaim')}
          </Button>
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={8}>
          <Card variant="borderless" className="soft-card">
            <Statistic
              key={totalUSD}
              title={t('claims.amountUsd')}
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
          { key: 'sale', label: t('claims.tabSale') },
          { key: 'purchase', label: t('claims.tabPurchase') },
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
        <Table<ClaimRow>
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={filtered}
          scroll={{ x: 1500 }}
          pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }}
          locale={{
            // Nothing filed yet (offer the create action) vs. a search that filtered everything
            // out (the fix is to clear the box) — the `ChargeListPage` precedent, spec §10.11.
            emptyText:
              rows.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <Space direction="vertical" size={2}>
                      <Text>{t('claims.emptyTab')}</Text>
                      <Text type="secondary">
                        {tab === 'sale' ? t('claims.emptySaleHint') : t('claims.emptyPurchaseHint')}
                      </Text>
                    </Space>
                  }
                >
                  <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>
                    {t('claims.newClaim')}
                  </Button>
                </Empty>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={<Text type="secondary">{t('common.noSearchResults')}</Text>}
                />
              ),
          }}
          expandable={{
            rowExpandable: (r) => r.items.length > 0,
            expandedRowRender: (r) => (
              <Table<ClaimItem>
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={r.items}
                columns={[
                  { title: t('items.product'), dataIndex: 'product' },
                  { title: t('items.quantityMt'), dataIndex: 'quantityMt', align: 'right', render: (v: number) => formatMt(v) },
                  {
                    title: t('claims.amount'),
                    key: 'amount',
                    align: 'right',
                    render: (_: unknown, it: ClaimItem) => <Money value={it.amount} currency={r.currency} fractionDigits={2} />,
                  },
                  {
                    title: t('claims.amountUsd'),
                    key: 'amountUsd',
                    align: 'right',
                    render: (_: unknown, it: ClaimItem) => <Money value={it.amountUSD} fractionDigits={2} />,
                  },
                  {
                    title: t('claims.description'),
                    dataIndex: 'description',
                    render: (v?: string) => v || <Text type="secondary">—</Text>,
                  },
                ]}
              />
            ),
          }}
        />
      </Card>

      {activeModal === 'form' && (
        <ClaimFormModal
          open
          side={side}
          claim={selectedClaim}
          onClose={() => {
            setActiveModal(null);
            setSelectedClaim(undefined);
          }}
        />
      )}
    </div>
  );
}
