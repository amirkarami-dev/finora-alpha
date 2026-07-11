import { useState, type MouseEvent } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Dropdown,
  Empty,
  InputNumber,
  Popconfirm,
  Progress,
  Result,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  theme,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import {
  ArrowRightOutlined,
  CheckOutlined,
  CloseOutlined,
  DollarOutlined,
  EditOutlined,
  LinkOutlined,
  PlusOutlined,
  PrinterOutlined,
  SendOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { PageHeader } from '@/components/common/PageHeader';
import { Money } from '@/components/common/Money';
import { PaymentMethodTag } from '@/components/common/StatusTag';
import { InvoiceStatusTag } from './statusColors';
import {
  useApplyLmePrice,
  useCancelInvoice,
  useContainerOptions,
  useContractRemaining,
  useMarkInvoiceSent,
  useRemoveInvoiceItem,
  useStockLevels,
  useTradeInvoice,
} from '@/services/queries';
import { invoiceItemUnitPrice } from '@/utils/calc';
import { formatCurrency, formatDate, formatMt } from '@/utils/format';
import { ROUTES } from '@/config/constants';
import type { InvoiceItem, InvoiceSide, InvoiceType, Payment } from '@/types';
import { CreateInvoiceModal } from './CreateInvoiceModal';
import { AddItemsModal } from './AddItemsModal';
import { ConfirmInvoiceModal } from './ConfirmInvoiceModal';
import { ConvertContainerModal } from './ConvertContainerModal';
import { EditLineModal } from './EditLineModal';
import { RecordPaymentModal } from './RecordPaymentModal';

const { Text } = Typography;

function invoiceSide(type: InvoiceType): InvoiceSide {
  return type.startsWith('PURCHASE') ? 'PURCHASE' : 'SALE';
}

function isPricedType(type: InvoiceType): boolean {
  return type !== 'PURCHASE_ORDER' && type !== 'SALE_ORDER';
}

const CONVERT_TARGETS: Record<InvoiceType, InvoiceType[]> = {
  PURCHASE_ORDER: ['PURCHASE_PROVISIONAL', 'PURCHASE_INVOICE'],
  PURCHASE_PROVISIONAL: ['PURCHASE_INVOICE'],
  PURCHASE_INVOICE: [],
  SALE_ORDER: ['SALE_PROVISIONAL', 'SALE_INVOICE'],
  SALE_PROVISIONAL: ['SALE_INVOICE'],
  SALE_INVOICE: [],
};

type ActiveModal = 'editHeader' | 'addItems' | 'editLine' | 'confirm' | 'payment' | 'convertContainer' | null;

export default function InvoiceDetailPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const invoiceId = decodeURIComponent(id);

  const { data, isLoading } = useTradeInvoice(invoiceId);
  const { data: stockLevels } = useStockLevels();
  const { data: containerOptions } = useContainerOptions();
  const removeItemMut = useRemoveInvoiceItem();
  const applyLmeMut = useApplyLmePrice();
  const cancelMut = useCancelInvoice();
  const sentMut = useMarkInvoiceSent();

  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [editLineItem, setEditLineItem] = useState<InvoiceItem | undefined>(undefined);
  const [showUninvoicedAlert, setShowUninvoicedAlert] = useState(false);
  const [pendingConvertTarget, setPendingConvertTarget] = useState<InvoiceType | undefined>(undefined);

  const containerById = new Map((containerOptions ?? []).map((c) => [c.id, c]));

  const [lmeDate, setLmeDate] = useState<dayjs.Dayjs | null>(dayjs());
  const [lmePrice, setLmePrice] = useState<number | null>(null);
  const [applyDiscount, setApplyDiscount] = useState<number | null>(null);

  const { data: contractRemaining } = useContractRemaining(
    data?.invoice.contractId ?? '',
    data ? invoiceSide(data.invoice.invoiceType) : 'SALE',
  );

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

  const { invoice, contract, customerName, refInvoice, successor, chain, payments, paidUSD, remainingUSD } = data;
  const side = invoiceSide(invoice.invoiceType);
  const isDraft = invoice.status === 'DRAFT';
  const isConfirmed = invoice.status === 'CONFIRMED';
  const isSaleFinal = invoice.invoiceType === 'SALE_INVOICE';
  const priced = isPricedType(invoice.invoiceType);
  const canSend = invoice.invoiceType !== 'PURCHASE_ORDER' && invoice.invoiceType !== 'SALE_ORDER';
  // Payments apply to provisional/final documents only (spec §7) — orders are unpriced.
  const canRecordPayment = priced;
  const invoiceNumberById = new Map(chain.map((c) => [c.id, c.invoiceNumber]));
  const isOverpaid = paidUSD > invoice.totalAmount;
  const progressPercent =
    invoice.totalAmount > 0 ? Math.min((paidUSD / invoice.totalAmount) * 100, 100) : 0;

  const stockByProduct = new Map<string, number>();
  if (stockLevels) {
    for (const row of stockLevels) {
      stockByProduct.set(row.productKey, (stockByProduct.get(row.productKey) ?? 0) + row.mt);
    }
  }

  const convertTargets = CONVERT_TARGETS[invoice.invoiceType];
  const canConvert = isConfirmed && !successor && convertTargets.length > 0;

  const removeItem = async (itemId: string) => {
    try {
      await removeItemMut.mutateAsync({ invoiceId: invoice.id, itemId });
      message.success(t('tradeInvoices.itemRemoved'));
    } catch {
      message.error(t('common.saveFailed'));
    }
  };

  const applyLme = async () => {
    if (!lmeDate || lmePrice === null) {
      message.error(t('common.required'));
      return;
    }
    try {
      await applyLmeMut.mutateAsync({
        invoiceId: invoice.id,
        input: {
          lmeDate: lmeDate.toISOString(),
          lmePrice,
          discountPercent: applyDiscount ?? undefined,
        },
      });
      message.success(t('tradeInvoices.priceApplied'));
    } catch {
      message.error(t('common.saveFailed'));
    }
  };

  const cancelInvoiceHandler = async () => {
    try {
      await cancelMut.mutateAsync(invoice.id);
      message.success(t('tradeInvoices.cancelled'));
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'cancel-blocked-successor') message.error(t('tradeInvoices.cancelBlockedSuccessor'));
      else if (code === 'cancel-blocked-stock') message.error(t('tradeInvoices.cancelBlockedStock'));
      else message.error(t('common.saveFailed'));
    }
  };

  const sendInvoice = async () => {
    try {
      await sentMut.mutateAsync(invoice.id);
      message.success(t('tradeInvoices.sentSuccess'));
    } catch {
      message.error(t('common.saveFailed'));
    }
  };

  const convertMenuItems: MenuProps['items'] = convertTargets.map((target) => ({
    key: target,
    label: t(`tradeInvoices.convertTo.${target}`),
  }));

  const showAedEquivalent = invoice.currency === 'AED' && invoice.exchangeRate !== 1;

  const itemColumns: ColumnsType<InvoiceItem> = [
    {
      title: t('items.product'),
      dataIndex: 'product',
      width: 180,
      render: (v) => <Text strong>{v}</Text>,
    },
    {
      title: t('items.quantityMt'),
      dataIndex: 'quantityMt',
      width: 110,
      align: 'right',
      render: (v) => formatMt(v),
    },
    ...(isSaleFinal && isDraft
      ? [
          {
            title: t('warehouse.availableMt'),
            key: 'available',
            width: 130,
            align: 'right' as const,
            render: (_: unknown, r: InvoiceItem) => {
              const available = stockByProduct.get(r.product.trim().toLowerCase()) ?? 0;
              const short = r.quantityMt > available + 1e-9;
              return (
                <Text style={{ color: short ? token.colorWarning : undefined, fontWeight: short ? 600 : undefined }}>
                  {formatMt(available)}
                </Text>
              );
            },
          },
        ]
      : []),
    {
      title: t('items.lmePercent'),
      dataIndex: 'lmePercent',
      width: 90,
      align: 'right',
      render: (v) => `${v}%`,
    },
    {
      title: t('items.lmeFixed'),
      dataIndex: 'lmeFixed',
      width: 90,
      align: 'center',
      render: (v: boolean) => <Tag bordered={false}>{v ? t('common.yes') : t('common.no')}</Tag>,
    },
    {
      title: t('tradeInvoices.priceBasis'),
      key: 'priceBasis',
      width: 170,
      render: (_, r) => {
        if (r.lmeFixed) return <Money value={r.fixedPrice} />;
        if (r.lmePrice !== undefined) {
          return (
            <span>
              <Money value={r.lmePrice} /> @ {formatDate(r.lmeDate)}
            </span>
          );
        }
        return <Text type="secondary">—</Text>;
      },
    },
    {
      title: t('items.unitPrice'),
      key: 'unitPrice',
      width: 120,
      align: 'right',
      render: (_, r) => {
        const unit = invoiceItemUnitPrice(r);
        return unit === null ? <Text type="secondary">—</Text> : <Money value={unit} />;
      },
    },
    {
      title: t('tradeInvoices.discountPercent'),
      dataIndex: 'discountPercent',
      width: 100,
      align: 'right',
      render: (v?: number) => (v ? `${v}%` : <Text type="secondary">—</Text>),
    },
    {
      title: t('tradeInvoices.totalAmount'),
      dataIndex: 'amount',
      width: 140,
      align: 'right',
      render: (v, r) =>
        invoiceItemUnitPrice(r) === null ? (
          <Text type="secondary">—</Text>
        ) : (
          <Money value={v} strong muteZero />
        ),
    },
    {
      title: t('tradeInvoices.containerNo'),
      key: 'containerNo',
      width: 150,
      render: (_, r) => {
        const container = r.containerId ? containerById.get(r.containerId) : undefined;
        return container ? (
          <span style={{ fontFamily: 'monospace' }}>{container.reference}</span>
        ) : (
          <Text type="secondary">—</Text>
        );
      },
    },
    {
      title: t('tradeInvoices.blNo'),
      key: 'blNo',
      width: 150,
      render: (_, r) => {
        const container = r.containerId ? containerById.get(r.containerId) : undefined;
        return container?.blNumber ? (
          <span style={{ fontFamily: 'monospace' }}>{container.blNumber}</span>
        ) : (
          <Text type="secondary">—</Text>
        );
      },
    },
    {
      title: t('tradeInvoices.description'),
      dataIndex: 'description',
      width: 160,
      render: (v?: string) => v ?? <Text type="secondary">—</Text>,
    },
    ...(isDraft
      ? [
          {
            title: t('common.actions'),
            key: 'actions',
            fixed: 'right' as const,
            width: 190,
            onCell: () => ({ onClick: (e: MouseEvent) => e.stopPropagation() }),
            render: (_: unknown, r: InvoiceItem) => (
              <Space size={4}>
                {priced && !r.containerId && (
                  <Button
                    type="link"
                    size="small"
                    icon={<LinkOutlined />}
                    onClick={() => {
                      setEditLineItem(r);
                      setActiveModal('editLine');
                    }}
                  >
                    {t('tradeInvoices.assignContainer')}
                  </Button>
                )}
                <Button
                  type="link"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => {
                    setEditLineItem(r);
                    setActiveModal('editLine');
                  }}
                >
                  {t('common.edit')}
                </Button>
                <Popconfirm
                  title={t('tradeInvoices.removeLineConfirm')}
                  okText={t('common.yes')}
                  cancelText={t('common.no')}
                  onConfirm={() => removeItem(r.id)}
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

  const uninvoicedRows = (contractRemaining ?? []).filter((r) => r.uninvoicedMt > 1e-9);

  return (
    <div className="fade-in">
      <PageHeader
        onBack
        title={
          <Space wrap size={8}>
            <span style={{ fontFamily: 'monospace' }}>{invoice.invoiceNumber}</span>
            <Tag color={side === 'PURCHASE' ? 'blue' : 'green'}>
              {t(`tradeInvoices.type.${invoice.invoiceType}`)}
            </Tag>
            <InvoiceStatusTag status={invoice.status} />
            {invoice.sentAt && <Tag bordered={false}>{t('tradeInvoices.sent')}</Tag>}
          </Space>
        }
        subtitle={
          <Space size={12} wrap>
            <span>{customerName}</span>
            {refInvoice && (
              <Button
                type="link"
                size="small"
                icon={<LinkOutlined />}
                style={{ padding: 0, height: 'auto' }}
                onClick={() => navigate(`/app/invoices/${encodeURIComponent(refInvoice.id)}`)}
              >
                {t('tradeInvoices.referenceLink', { number: refInvoice.invoiceNumber })}
              </Button>
            )}
            {successor && (
              <Button
                type="link"
                size="small"
                icon={<ArrowRightOutlined />}
                style={{ padding: 0, height: 'auto' }}
                onClick={() => navigate(`/app/invoices/${encodeURIComponent(successor.id)}`)}
              >
                {t('tradeInvoices.convertedToLink', { number: successor.invoiceNumber })}
              </Button>
            )}
          </Space>
        }
        extra={
          <Space wrap>
            {isDraft && (
              <>
                <Button icon={<EditOutlined />} onClick={() => setActiveModal('editHeader')}>
                  {t('tradeInvoices.editHeader')}
                </Button>
                <Button icon={<PlusOutlined />} onClick={() => setActiveModal('addItems')}>
                  {t('tradeInvoices.addItems')}
                </Button>
                <Button type="primary" icon={<CheckOutlined />} onClick={() => setActiveModal('confirm')}>
                  {t('tradeInvoices.confirmAction')}
                </Button>
                <Popconfirm
                  title={t('tradeInvoices.cancelConfirm')}
                  okText={t('common.yes')}
                  cancelText={t('common.no')}
                  onConfirm={cancelInvoiceHandler}
                >
                  <Button danger icon={<CloseOutlined />}>
                    {t('common.cancel')}
                  </Button>
                </Popconfirm>
              </>
            )}
            {isConfirmed && (
              <>
                {canConvert && (
                  <Dropdown
                    menu={{
                      items: convertMenuItems,
                      onClick: ({ key }) => {
                        setPendingConvertTarget(key as InvoiceType);
                        setActiveModal('convertContainer');
                      },
                    }}
                  >
                    <Button icon={<SwapOutlined />}>{t('tradeInvoices.convert')}</Button>
                  </Dropdown>
                )}
                {canSend && (
                  <Popconfirm
                    title={t('tradeInvoices.sendConfirm')}
                    okText={t('common.yes')}
                    cancelText={t('common.no')}
                    onConfirm={sendInvoice}
                  >
                    <Button icon={<SendOutlined />}>{t('tradeInvoices.send')}</Button>
                  </Popconfirm>
                )}
                {canRecordPayment && (
                  <Button
                    type="primary"
                    ghost
                    icon={<DollarOutlined />}
                    onClick={() => setActiveModal('payment')}
                  >
                    {t('tradeInvoices.recordPayment')}
                  </Button>
                )}
                <Button
                  icon={<PrinterOutlined />}
                  onClick={() => navigate(`/app/invoices/${encodeURIComponent(invoice.id)}/print`)}
                >
                  {t('tradeInvoices.print')}
                </Button>
                <Popconfirm
                  title={t('tradeInvoices.cancelConfirm')}
                  okText={t('common.yes')}
                  cancelText={t('common.no')}
                  onConfirm={cancelInvoiceHandler}
                >
                  <Button danger icon={<CloseOutlined />}>
                    {t('common.cancel')}
                  </Button>
                </Popconfirm>
              </>
            )}
          </Space>
        }
      />

      {showUninvoicedAlert && uninvoicedRows.length > 0 && (
        <Alert
          type="info"
          showIcon
          closable
          onClose={() => setShowUninvoicedAlert(false)}
          style={{ marginBottom: 16 }}
          message={t('tradeInvoices.uninvoicedAlertTitle')}
          description={
            <ul style={{ margin: 0, paddingInlineStart: 20 }}>
              {uninvoicedRows.map((r) => (
                <li key={r.itemId}>
                  {t('tradeInvoices.uninvoicedMt', { product: r.product, remaining: formatMt(r.uninvoicedMt) })}
                </li>
              ))}
            </ul>
          }
        />
      )}

      <Card variant="borderless" title={t('tradeInvoices.detailTitle')}>
        <Descriptions
          column={{ xs: 1, sm: 2, lg: 3 }}
          items={[
            { key: 'date', label: t('tradeInvoices.date'), children: formatDate(invoice.invoiceDate) },
            {
              key: 'contract',
              label: t('tradeInvoices.contract'),
              children: contract ? (
                <Button
                  type="link"
                  style={{ padding: 0, height: 'auto', fontFamily: 'monospace' }}
                  onClick={() => navigate(`${ROUTES.contracts}/${encodeURIComponent(contract.id)}`)}
                >
                  {contract.id}
                </Button>
              ) : (
                '—'
              ),
            },
            { key: 'customer', label: t('tradeInvoices.customer'), children: customerName },
            {
              key: 'currency',
              label: t('tradeInvoices.currency'),
              children:
                invoice.currency === 'AED'
                  ? `AED (${t('tradeInvoices.exchangeRate')}: ${invoice.exchangeRate})`
                  : 'USD',
            },
            ...(showAedEquivalent
              ? [
                  {
                    key: 'aedEq',
                    label: t('tradeInvoices.aedEquivalent'),
                    children: <Money value={invoice.totalAmount * invoice.exchangeRate} currency="AED" />,
                  },
                ]
              : []),
            {
              key: 'description',
              label: t('tradeInvoices.description'),
              children: invoice.description || <Text type="secondary">{t('common.none')}</Text>,
            },
            {
              key: 'total',
              label: t('tradeInvoices.totalAmount'),
              children: <Money value={invoice.totalAmount} strong />,
            },
            {
              key: 'discount',
              label: t('tradeInvoices.totalDiscount'),
              children: <Money value={invoice.totalDiscount} muteZero />,
            },
            {
              key: 'weight',
              label: t('tradeInvoices.totalWeight'),
              children: formatMt(invoice.totalWeightMt),
            },
          ]}
        />
      </Card>

      {isDraft && priced && (
        <Card variant="borderless" title={t('tradeInvoices.pricingPanel')} style={{ marginTop: 16 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
            {t('tradeInvoices.applyLmeHint')}
          </Text>
          <Space wrap align="start">
            <div>
              <Text style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>{t('tradeInvoices.lmeDate')}</Text>
              <DatePicker value={lmeDate} onChange={setLmeDate} format="DD MMM YYYY" />
            </div>
            <div>
              <Text style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>{t('tradeInvoices.lmePrice')}</Text>
              <InputNumber min={0} step={1} value={lmePrice} onChange={setLmePrice} />
            </div>
            <div>
              <Text style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
                {t('tradeInvoices.discountPercent')}
              </Text>
              <InputNumber min={0} max={100} step={0.5} value={applyDiscount} onChange={setApplyDiscount} />
            </div>
            <Button type="primary" onClick={applyLme} loading={applyLmeMut.isPending} style={{ marginTop: 20 }}>
              {t('tradeInvoices.applyToAll')}
            </Button>
          </Space>
        </Card>
      )}

      <Card
        variant="borderless"
        title={`${t('tradeInvoices.items')} · ${invoice.items.length}`}
        style={{ marginTop: 16 }}
        styles={{ body: { padding: 12 } }}
      >
        <Table<InvoiceItem>
          rowKey="id"
          columns={itemColumns}
          dataSource={invoice.items}
          pagination={false}
          scroll={{ x: 1700 }}
          locale={{ emptyText: <Empty description={t('tradeInvoices.noItemsYet')} /> }}
        />
      </Card>

      {canRecordPayment && (isConfirmed || payments.length > 0) && (
        <Card
          variant="borderless"
          title={`${t('tradeInvoices.payments')} · ${payments.length}`}
          style={{ marginTop: 16 }}
          styles={{ body: { padding: 12 } }}
        >
          <Table<Payment>
            rowKey="id"
            pagination={false}
            dataSource={payments}
            locale={{ emptyText: <Empty description={t('tradeInvoices.noPaymentsYet')} /> }}
            columns={
              [
                {
                  title: t('tradeInvoices.recordedOn'),
                  key: 'recordedOn',
                  width: 150,
                  render: (_, r) => (
                    <Text style={{ fontFamily: 'monospace' }}>
                      {(r.invoiceId && invoiceNumberById.get(r.invoiceId)) || '—'}
                    </Text>
                  ),
                },
                {
                  title: t('payments.date'),
                  dataIndex: 'date',
                  width: 120,
                  render: (v) => formatDate(v),
                },
                {
                  title: t('payments.method'),
                  dataIndex: 'method',
                  width: 120,
                  render: (v) => <PaymentMethodTag method={v} />,
                },
                {
                  title: t('payments.amount'),
                  key: 'amount',
                  width: 150,
                  align: 'right',
                  render: (_, r) => <Money value={r.amount} currency={r.currency} />,
                },
                {
                  title: t('payments.amountUsd'),
                  dataIndex: 'amountUSD',
                  width: 150,
                  align: 'right',
                  render: (v) => <Money value={v} strong />,
                },
                {
                  title: t('payments.notes'),
                  dataIndex: 'notes',
                  ellipsis: true,
                  render: (v?: string) => v || <Text type="secondary">—</Text>,
                },
              ] as ColumnsType<Payment>
            }
          />
          <div style={{ marginTop: 16, display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Statistic title={t('tradeInvoices.paidToDate')} value={undefined} valueRender={() => <Money value={paidUSD} strong />} />
            <Statistic title={t('tradeInvoices.remaining')} value={undefined} valueRender={() => <Money value={remainingUSD} strong />} />
            <div style={{ flex: '1 1 220px', minWidth: 220 }}>
              <Progress
                percent={progressPercent}
                status={remainingUSD === 0 && paidUSD > 0 ? 'success' : 'active'}
              />
            </div>
          </div>
          {isOverpaid && (
            <Text type="warning" style={{ display: 'block', marginTop: 8 }}>
              {t('tradeInvoices.overpaidBy', { amount: formatCurrency(paidUSD - invoice.totalAmount, 'USD') })}
            </Text>
          )}
        </Card>
      )}

      {isDraft && (
        <>
          <CreateInvoiceModal
            open={activeModal === 'editHeader'}
            onClose={() => setActiveModal(null)}
            invoiceType={invoice.invoiceType}
            invoice={invoice}
          />
          <AddItemsModal
            open={activeModal === 'addItems'}
            onClose={() => setActiveModal(null)}
            invoice={invoice}
            side={side}
          />
          {editLineItem && (
            <EditLineModal
              open={activeModal === 'editLine'}
              onClose={() => {
                setActiveModal(null);
                setEditLineItem(undefined);
              }}
              invoice={invoice}
              item={editLineItem}
              side={side}
            />
          )}
          <ConfirmInvoiceModal
            open={activeModal === 'confirm'}
            onClose={() => setActiveModal(null)}
            invoice={invoice}
            onConfirmed={() => setShowUninvoicedAlert(true)}
          />
        </>
      )}

      {canRecordPayment && (
        <RecordPaymentModal
          open={activeModal === 'payment'}
          onClose={() => setActiveModal(null)}
          invoice={invoice}
          remainingUSD={remainingUSD}
        />
      )}

      {pendingConvertTarget && (
        <ConvertContainerModal
          open={activeModal === 'convertContainer'}
          onClose={() => {
            setActiveModal(null);
            setPendingConvertTarget(undefined);
          }}
          invoice={invoice}
          targetType={pendingConvertTarget}
        />
      )}
    </div>
  );
}
