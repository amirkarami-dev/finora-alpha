import { Card, Col, Empty, Row, Space, Statistic, Table, Tag, Tooltip, Typography, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Money } from '@/components/common/Money';
import { useHasAccess } from '@/hooks/useHasAccess';
import { useInvoiceChargeSummary } from '@/services/queries';
import type { ChargeDocRow, InvoiceChargeGoodRow } from '@/services/api';
import { chargeDetailRoute } from '@/pages/charges/routes';
import { formatDate, formatMt } from '@/utils/format';
import type { ChargeDirection, Claim, ClaimType } from '@/types';
import { ltrTruncateStyle } from './containerOptions';

const { Text } = Typography;

// Same tag colors ClaimsPage uses for the two claim types (design spec §6) — quantity volcano,
// quality gold — so a claim reads identically here and on its own page.
const CLAIM_TYPE_COLOR: Record<ClaimType, string> = { QUANTITY: 'volcano', QUALITY: 'gold' };

interface InvoiceChargesCardProps {
  invoiceId: string;
}

/**
 * design spec §6 (Phase 7) — replaces the inline expenses block Phase 1 deleted from
 * `InvoiceDetailPage.tsx`: the expense documents, revenue documents and claims booked anywhere
 * on THIS invoice's chain (`getInvoiceChargeSummary`, spec §4), plus the per-good breakdown.
 * Read-only — creating/editing lives on the charges and claims modules themselves.
 *
 * CRITICAL RBAC rule, carried over from the deleted block and re-stated by spec §6: each section
 * is gated on its OWN `useHasAccess`, and the CARD ITSELF renders only when at least one section
 * is visible. An empty card would still tell a Staff user that expenses exist — that is the leak
 * this rule prevents. Hooks stay unconditional at the top (rules of hooks); only the RENDER is
 * skipped, never an early return before the hooks.
 */
export function InvoiceChargesCard({ invoiceId }: InvoiceChargesCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = theme.useToken();

  // Unconditional hooks — see the CRITICAL note above.
  const canSeeExpenses = useHasAccess('expenses');
  const canSeeRevenues = useHasAccess('revenues');
  const canSeeClaims = useHasAccess('claims');
  const canSeeAnySection = canSeeExpenses || canSeeRevenues || canSeeClaims;
  // The RBAC gate lives in the QUERY, not in a conditional hook call: without `enabled`, a Staff
  // user's client still pulls the whole charge summary into the React Query cache for a card that
  // renders nothing. Free against the mock db (localStorage already holds it all), but this
  // module's stated design is "replace `api.ts` internals to go real", where it would be a leak.
  const { data, isLoading } = useInvoiceChargeSummary(invoiceId, { enabled: canSeeAnySection });

  if (!canSeeAnySection) return null;

  const expenses = data?.expenses ?? [];
  const revenues = data?.revenues ?? [];
  const claims = data?.claims ?? [];
  const byGood = data?.byGood ?? [];

  const docColumns = (direction: ChargeDirection): ColumnsType<ChargeDocRow> => [
    { title: t('charges.date'), dataIndex: 'date', width: 120, render: (v: string) => formatDate(v) },
    {
      title: t('charges.docTitle'),
      dataIndex: 'title',
      ellipsis: true,
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      // The document a charge was BOOKED on is not necessarily the one being viewed — the summary
      // spans the whole chain (spec §4), so a charge booked on a provisional still shows here
      // after conversion. RTL: the LTR span needs its own block box (`ltrTruncateStyle`), a bare
      // `dir="ltr"` would let the RTL ellipsis box clip the leading token instead.
      title: t('invoiceCharges.bookedOn'),
      key: 'bookedOn',
      width: 160,
      render: (_: unknown, r: ChargeDocRow) => (
        <span dir="ltr" style={{ ...ltrTruncateStyle, fontFamily: 'monospace' }}>
          {r.invoiceNumber ?? r.invoiceId ?? '—'}
        </span>
      ),
    },
    { title: t('charges.linesCount'), key: 'lines', width: 80, align: 'center', render: (_: unknown, r: ChargeDocRow) => r.lineCount },
    {
      title: t('charges.totalUsd'),
      dataIndex: 'totalUSD',
      width: 140,
      align: 'right',
      // Never `colored` on a charge amount (spec §6) — it is not a debit/credit signal.
      render: (v: number) => <Money value={v} strong fractionDigits={2} />,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 90,
      align: 'right',
      render: (_: unknown, r: ChargeDocRow) => (
        <Typography.Link onClick={() => navigate(chargeDetailRoute(direction, r.id))}>
          {t('charges.open')}
        </Typography.Link>
      ),
    },
  ];

  // Claims have no detail page (spec §6) — read-only rows, no open affordance.
  const claimColumns: ColumnsType<Claim> = [
    { title: t('claims.date'), dataIndex: 'date', width: 120, render: (v: string) => formatDate(v) },
    {
      title: t('claims.claimTitle'),
      dataIndex: 'title',
      ellipsis: true,
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: t('claims.claimType'),
      dataIndex: 'claimType',
      width: 140,
      render: (v: ClaimType) => <Tag color={CLAIM_TYPE_COLOR[v]}>{t(`claimTypes.${v}`)}</Tag>,
    },
    { title: t('claims.itemsCount'), key: 'items', width: 80, align: 'center', render: (_: unknown, r: Claim) => r.items.length },
    {
      title: t('claims.amountUsd'),
      dataIndex: 'amountUSD',
      width: 140,
      align: 'right',
      render: (v: number) => <Money value={v} strong fractionDigits={2} />,
    },
  ];

  const goodColumns: ColumnsType<InvoiceChargeGoodRow> = [
    {
      title: t('items.product'),
      dataIndex: 'product',
      ellipsis: true,
      render: (v: string, r: InvoiceChargeGoodRow) => (
        <Space size={6}>
          <span>{v}</span>
          {r.orphan && (
            <Tooltip title={t('invoiceCharges.orphanHint')}>
              <Tag color="warning">{t('invoiceCharges.orphan')}</Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: t('items.quantityMt'),
      dataIndex: 'quantityMt',
      width: 140,
      align: 'right',
      render: (v: number) => formatMt(v),
    },
    ...(canSeeExpenses
      ? [
          {
            title: t('invoiceCharges.expenseUsd'),
            dataIndex: 'expenseUSD',
            width: 150,
            align: 'right' as const,
            render: (v: number) => <Money value={v} muteZero fractionDigits={2} />,
          },
        ]
      : []),
    ...(canSeeRevenues
      ? [
          {
            title: t('invoiceCharges.revenueUsd'),
            dataIndex: 'revenueUSD',
            width: 150,
            align: 'right' as const,
            render: (v: number) => <Money value={v} muteZero fractionDigits={2} />,
          },
        ]
      : []),
    ...(canSeeClaims
      ? [
          {
            title: t('invoiceCharges.claimUsd'),
            dataIndex: 'claimUSD',
            width: 150,
            align: 'right' as const,
            render: (v: number) => <Money value={v} muteZero fractionDigits={2} />,
          },
        ]
      : []),
  ];

  // Sections are separated by a token-derived rule rather than nested Cards — no hard-coded hex
  // (project convention), and `marginBlockStart`/`paddingBlockStart` keep it RTL-safe.
  const sectionStyle = {
    marginBlockStart: 20,
    paddingBlockStart: 16,
    borderBlockStart: `1px solid ${token.colorBorderSecondary}`,
  };

  // Empty-start sweep (spec §10.11): an empty section says both what is missing and where the
  // user would create it, since nothing on this read-only card can create one.
  const emptyText = (message: string, hint?: string) => ({
    emptyText: (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          hint ? (
            <Space direction="vertical" size={2}>
              <Text>{message}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {hint}
              </Text>
            </Space>
          ) : (
            message
          )
        }
      />
    ),
  });

  return (
    <Card
      variant="borderless"
      title={t('invoiceCharges.title')}
      style={{ marginTop: 16 }}
      styles={{ body: { padding: 12 } }}
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
        {t('invoiceCharges.chainHint')}
      </Text>

      <Row gutter={[16, 16]}>
        {canSeeExpenses && (
          <Col xs={24} sm={8}>
            <Statistic
              key={data?.expenseUSD}
              title={t('invoiceCharges.expensesTotal')}
              value={data?.expenseUSD ?? 0}
              prefix="$"
              precision={2}
              valueStyle={{ fontWeight: 700 }}
            />
          </Col>
        )}
        {canSeeRevenues && (
          <Col xs={24} sm={8}>
            <Statistic
              key={data?.revenueUSD}
              title={t('invoiceCharges.revenuesTotal')}
              value={data?.revenueUSD ?? 0}
              prefix="$"
              precision={2}
              valueStyle={{ fontWeight: 700 }}
            />
          </Col>
        )}
        {canSeeClaims && (
          <Col xs={24} sm={8}>
            <Statistic
              key={data?.claimUSD}
              title={t('invoiceCharges.claimsTotal')}
              value={data?.claimUSD ?? 0}
              prefix="$"
              precision={2}
              valueStyle={{ fontWeight: 700 }}
            />
          </Col>
        )}
      </Row>

      {canSeeExpenses && (
        <div style={sectionStyle}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            {`${t('expenses.title')} · ${expenses.length}`}
          </Text>
          <Table<ChargeDocRow>
            rowKey="id"
            size="small"
            loading={isLoading}
            pagination={false}
            columns={docColumns('EXPENSE')}
            dataSource={expenses}
            scroll={{ x: 800 }}
            locale={emptyText(t('invoiceCharges.noExpenses'), t('invoiceCharges.noExpensesHint'))}
          />
        </div>
      )}

      {canSeeRevenues && (
        <div style={sectionStyle}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            {`${t('revenues.title')} · ${revenues.length}`}
          </Text>
          <Table<ChargeDocRow>
            rowKey="id"
            size="small"
            loading={isLoading}
            pagination={false}
            columns={docColumns('REVENUE')}
            dataSource={revenues}
            scroll={{ x: 800 }}
            locale={emptyText(t('invoiceCharges.noRevenues'), t('invoiceCharges.noRevenuesHint'))}
          />
        </div>
      )}

      {canSeeClaims && (
        <div style={sectionStyle}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            {`${t('claims.title')} · ${claims.length}`}
          </Text>
          <Table<Claim>
            rowKey="id"
            size="small"
            loading={isLoading}
            pagination={false}
            columns={claimColumns}
            dataSource={claims}
            scroll={{ x: 700 }}
            locale={emptyText(t('invoiceCharges.noClaims'), t('invoiceCharges.noClaimsHint'))}
          />
        </div>
      )}

      <div style={sectionStyle}>
        <Text strong style={{ display: 'block' }}>
          {t('invoiceCharges.byGoodTitle')}
        </Text>
        <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
          {t('invoiceCharges.byGoodHint')}
        </Text>
        <Table<InvoiceChargeGoodRow>
          rowKey="referenceDocumentItemId"
          size="small"
          loading={isLoading}
          pagination={false}
          columns={goodColumns}
          dataSource={byGood}
          scroll={{ x: 700 }}
          locale={emptyText(t('invoiceCharges.noGoods'))}
        />
      </div>
    </Card>
  );
}
