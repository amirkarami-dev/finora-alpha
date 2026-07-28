import { useEffect, useState, type MouseEvent } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Popconfirm,
  Result,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CloseOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';
import { Money } from '@/components/common/Money';
import { useCancelChargeDoc, useChargeCategories, useChargeDoc, useCostCentres, useRemoveChargeLine } from '@/services/queries';
import { formatDate, formatMt, formatNumber } from '@/utils/format';
import type { ChargeAllocation, ChargeLine } from '@/types';
import { chargeListRoute } from './routes';
import { ChargeDocFormModal, type ChargeDocInvoiceInfo } from './ChargeDocFormModal';
import { ChargeLineFormModal } from './ChargeLineFormModal';

const { Text } = Typography;

type ActiveModal = 'editHeader' | 'addLine' | 'editLine' | null;

/**
 * design spec §6 — ONE component registered at both `/app/expenses/:id` and (Phase 5)
 * `/app/revenues/:id`; direction comes from the loaded document, never the route, so no wrapper
 * is needed. Copies `InvoiceDetailPage.tsx`'s template: `PageHeader onBack`, a `Descriptions`
 * header card, a single `activeModal` state machine with row-scoped modals conditionally
 * mounted, `Result status="404"` when the id misses.
 */
export default function ChargeDocDetailPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const { id = '' } = useParams();
  const docId = decodeURIComponent(id);

  const { data, isLoading } = useChargeDoc(docId);
  const cancelMut = useCancelChargeDoc();
  const removeLineMut = useRemoveChargeLine();

  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [selectedLine, setSelectedLine] = useState<ChargeLine | undefined>(undefined);
  const [autoOpened, setAutoOpened] = useState(false);

  const { data: categories } = useChargeCategories(data?.doc.direction);
  const { data: costCentres } = useCostCentres();

  // Auto-opens the add-line modal exactly once, right after `ChargeDocFormModal` creates this
  // document (spec §6: "a header with no lines is the flow's main confusion point") — gated on
  // router state set by that navigate() call so revisiting an already-emptied document later
  // never re-triggers it.
  useEffect(() => {
    if (!data || autoOpened) return;
    const state = location.state as { autoOpenAddLine?: boolean } | null;
    if (state?.autoOpenAddLine && data.doc.status === 'ACTIVE' && data.doc.lines.length === 0) {
      setActiveModal('addLine');
      setAutoOpened(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [data, autoOpened, location.state, location.pathname, navigate]);

  if (!isLoading && !data) {
    return <Result status="404" title={t('errors.notFoundTitle')} subTitle={t('errors.notFoundDesc')} />;
  }
  if (!data) {
    return (
      <div className="fade-in">
        <PageHeader title={t('common.loading')} onBack />
      </div>
    );
  }

  const { doc, invoice, invoiceItems, customerName } = data;
  const isActive = doc.status === 'ACTIVE';
  const categoryById = new Map((categories ?? []).map((c) => [c.id, c]));
  const costCentreById = new Map((costCentres ?? []).map((c) => [c.id, c]));

  const invoiceInfo: ChargeDocInvoiceInfo | undefined =
    doc.kind === 'INVOICE' && doc.invoiceId
      ? { id: doc.invoiceId, invoiceNumber: invoice?.invoiceNumber ?? doc.invoiceId, customerName }
      : undefined;

  const cancelDoc = async () => {
    try {
      await cancelMut.mutateAsync(doc.id);
      message.success(t('charges.cancelled'));
    } catch {
      message.error(t('common.saveFailed'));
    }
  };

  const removeLine = async (lineId: string) => {
    try {
      await removeLineMut.mutateAsync({ docId: doc.id, lineId });
      message.success(t('charges.lineRemoved'));
    } catch {
      message.error(t('common.saveFailed'));
    }
  };

  const lineColumns: ColumnsType<ChargeLine> = [
    {
      title: t('charges.category'),
      key: 'category',
      width: 200,
      render: (_, r) => {
        const cat = categoryById.get(r.categoryId);
        return (
          <Text strong>
            {cat?.name ?? r.categoryId}
            {cat && !cat.active && <Text type="secondary"> ({t('common.inactive')})</Text>}
          </Text>
        );
      },
    },
    { title: t('charges.date'), dataIndex: 'date', width: 120, render: (v) => formatDate(v) },
    {
      title: t('charges.amount'),
      key: 'amount',
      width: 130,
      align: 'right',
      render: (_, r) => <Money value={r.amount} currency={r.currency} fractionDigits={2} />,
    },
    {
      title: t('charges.fx'),
      dataIndex: 'fxRate',
      width: 90,
      align: 'right',
      render: (v: number) => (v === 1 ? <Text type="secondary">—</Text> : formatNumber(v, 4)),
    },
    {
      title: t('charges.amountUsd'),
      dataIndex: 'amountUSD',
      width: 130,
      align: 'right',
      render: (v: number) => <Money value={v} strong fractionDigits={2} />,
    },
    {
      title: t('charges.unitPriceUsd'),
      dataIndex: 'unitPriceUSD',
      width: 140,
      align: 'right',
      render: (v?: number) => (v === undefined ? <Text type="secondary">—</Text> : <Money value={v} fractionDigits={2} />),
    },
    {
      title: t('charges.costCentre'),
      key: 'costCentre',
      width: 150,
      render: (_, r) => (r.costCentreId ? (costCentreById.get(r.costCentreId)?.name ?? '—') : <Text type="secondary">—</Text>),
    },
    {
      title: t('charges.description'),
      dataIndex: 'description',
      width: 200,
      ellipsis: true,
      render: (v?: string) => v || <Text type="secondary">—</Text>,
    },
    {
      title: t('charges.goodsCount'),
      key: 'goods',
      width: 80,
      align: 'center',
      render: (_, r) => r.allocations.length,
    },
    ...(isActive
      ? [
          {
            title: t('common.actions'),
            key: 'actions',
            fixed: 'right' as const,
            width: 160,
            onCell: () => ({ onClick: (e: MouseEvent) => e.stopPropagation() }),
            render: (_: unknown, r: ChargeLine) => (
              <Space size={4}>
                <Button
                  type="link"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => {
                    setSelectedLine(r);
                    setActiveModal('editLine');
                  }}
                >
                  {t('common.edit')}
                </Button>
                <Popconfirm
                  title={t('charges.removeLineConfirm')}
                  okText={t('common.yes')}
                  cancelText={t('common.no')}
                  onConfirm={() => removeLine(r.id)}
                >
                  <Button type="link" size="small" danger>
                    {t('common.delete')}
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="fade-in">
      <PageHeader
        onBack={() => navigate(chargeListRoute(doc.direction))}
        title={
          <Space wrap size={8}>
            <span>{doc.title}</span>
            <Tag color={doc.direction === 'EXPENSE' ? 'volcano' : 'green'}>{t(`chargeDirections.${doc.direction}`)}</Tag>
            <Tag color={doc.kind === 'INVOICE' ? 'blue' : 'default'}>{t(`chargeScopes.${doc.kind}`)}</Tag>
            {!isActive && <Tag>{t('charges.statusCancelled')}</Tag>}
          </Space>
        }
        subtitle={doc.kind === 'INVOICE' ? customerName : undefined}
        extra={
          isActive && (
            <Space wrap>
              <Button icon={<EditOutlined />} onClick={() => setActiveModal('editHeader')}>
                {t('charges.editHeader')}
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setActiveModal('addLine')}>
                {t('charges.addLine')}
              </Button>
              <Popconfirm
                title={t('charges.cancelConfirm')}
                okText={t('common.yes')}
                cancelText={t('common.no')}
                onConfirm={cancelDoc}
              >
                <Button danger icon={<CloseOutlined />}>
                  {t('common.cancel')}
                </Button>
              </Popconfirm>
            </Space>
          )
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={8}>
          <Card variant="borderless" className="soft-card">
            <Statistic
              key={doc.totalUSD}
              title={t('charges.totalUsd')}
              value={doc.totalUSD}
              precision={2}
              prefix="$"
              valueStyle={{ fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card variant="borderless" className="soft-card">
            <Statistic title={t('charges.linesCount')} value={doc.lines.length} valueStyle={{ fontWeight: 700 }} />
          </Card>
        </Col>
      </Row>

      <Card variant="borderless" title={t('charges.detailTitle')}>
        <Descriptions
          column={{ xs: 1, sm: 2, lg: 3 }}
          items={[
            ...(doc.kind === 'INVOICE'
              ? [
                  {
                    key: 'invoice',
                    label: t('charges.invoice'),
                    children: doc.invoiceId ? (
                      <Button
                        type="link"
                        style={{ padding: 0, height: 'auto', fontFamily: 'monospace' }}
                        onClick={() => navigate(`/app/invoices/${encodeURIComponent(doc.invoiceId!)}`)}
                      >
                        {invoice?.invoiceNumber ?? doc.invoiceId}
                      </Button>
                    ) : (
                      '—'
                    ),
                  },
                  { key: 'customer', label: t('charges.customer'), children: customerName ?? '—' },
                ]
              : []),
            { key: 'date', label: t('charges.date'), children: formatDate(doc.date) },
            {
              key: 'description',
              label: t('charges.description'),
              children: doc.description || <Text type="secondary">{t('common.none')}</Text>,
            },
            {
              key: 'status',
              label: t('charges.status'),
              children: isActive ? (
                <Tag color="success">{t('charges.statusActive')}</Tag>
              ) : (
                <Tag>{t('charges.statusCancelled')}</Tag>
              ),
            },
          ]}
        />
      </Card>

      {doc.lines.length === 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 16 }}
          message={t('charges.noLinesWarningTitle')}
          description={t('charges.noLinesWarningDesc')}
        />
      )}

      <Card
        variant="borderless"
        title={`${t('charges.linesTitle')} · ${doc.lines.length}`}
        style={{ marginTop: 16 }}
        styles={{ body: { padding: 12 } }}
      >
        <Table<ChargeLine>
          rowKey="id"
          columns={lineColumns}
          dataSource={doc.lines}
          pagination={false}
          scroll={{ x: 1400 }}
          locale={{
            emptyText: (
              <Empty description={t('charges.noLinesEmpty')}>
                {isActive && (
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setActiveModal('addLine')}>
                    {t('charges.addLine')}
                  </Button>
                )}
              </Empty>
            ),
          }}
          expandable={{
            rowExpandable: (r) => r.allocations.length > 0,
            expandedRowRender: (r) => (
              <Table<ChargeAllocation>
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={r.allocations}
                columns={[
                  { title: t('items.product'), dataIndex: 'product' },
                  { title: t('items.quantityMt'), dataIndex: 'quantityMt', align: 'right', render: (v: number) => formatMt(v) },
                  {
                    title: t('charges.allocShare'),
                    key: 'share',
                    align: 'right',
                    render: (_: unknown, a: ChargeAllocation) => <Money value={a.amount} currency={r.currency} fractionDigits={2} />,
                  },
                  {
                    title: t('charges.allocShareUsd'),
                    key: 'shareUsd',
                    align: 'right',
                    render: (_: unknown, a: ChargeAllocation) => <Money value={a.amountUSD} fractionDigits={2} />,
                  },
                ]}
              />
            ),
          }}
        />
      </Card>

      {activeModal === 'editHeader' && (
        <ChargeDocFormModal
          open
          onClose={() => setActiveModal(null)}
          direction={doc.direction}
          kind={doc.kind}
          doc={doc}
          invoiceInfo={invoiceInfo}
        />
      )}

      {(activeModal === 'addLine' || activeModal === 'editLine') && (
        <ChargeLineFormModal
          open
          onClose={() => {
            setActiveModal(null);
            setSelectedLine(undefined);
          }}
          doc={doc}
          invoiceItems={invoiceItems}
          line={activeModal === 'editLine' ? selectedLine : undefined}
        />
      )}
    </div>
  );
}
