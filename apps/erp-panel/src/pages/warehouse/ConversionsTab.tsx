import { useMemo, type CSSProperties, type MouseEvent } from 'react';
import { App, Button, Empty, Popconfirm, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Money } from '@/components/common/Money';
import { ROUTES } from '@/config/constants';
import {
  useCancelConversion,
  useChargeCategories,
  useConfirmConversion,
  useConversions,
  useCustomers,
  useWarehouses,
} from '@/services/queries';
import { useAuthStore } from '@/store/useAuthStore';
import { formatDate, formatMt } from '@/utils/format';
import type { ConversionCost, ConversionDocument, ConversionInput, ConversionOutput, ConversionStatus } from '@/types';

const { Text } = Typography;

// RTL fix (mirrors InventoryDocFormModal/ConversionFormModal): a plain truncated span inside an
// RTL ancestor clips the LEADING token, not the trailing one — the LTR span needs its own
// overflow/ellipsis box to clip the right (trailing) side instead.
const ltrTruncateStyle: CSSProperties = {
  display: 'block',
  direction: 'ltr',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const STATUS_COLOR: Record<ConversionStatus, string> = { DRAFT: 'blue', CONFIRMED: 'green', CANCELLED: 'red' };
const STATUS_LABEL_KEY: Record<ConversionStatus, string> = {
  DRAFT: 'conversions.statusDraft',
  CONFIRMED: 'conversions.statusConfirmed',
  CANCELLED: 'conversions.statusCancelled',
};

function summarize(lines: { product: string; quantityMt: number }[]): string {
  return lines.map((l) => `${l.product} ${formatMt(l.quantityMt)}`).join(' + ');
}

function yieldOf(r: ConversionDocument): string {
  const inMt = r.inputs.reduce((s, i) => s + i.quantityMt, 0);
  const outMt = r.outputs.reduce((s, o) => s + o.quantityMt, 0);
  return inMt > 0 ? `${((outMt / inMt) * 100).toFixed(2)}%` : '—';
}

interface ConversionsTabProps {
  onEdit: (conversion: ConversionDocument) => void;
}

export function ConversionsTab({ onEdit }: ConversionsTabProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const navigate = useNavigate();

  const { data: conversions, isLoading } = useConversions();
  const { data: warehouses } = useWarehouses();
  const { data: categories } = useChargeCategories();
  const { data: customers } = useCustomers();
  const confirmMut = useConfirmConversion();
  const cancelMut = useCancelConversion();
  const canConfirm = useAuthStore((s) => s.permissions.includes('conversions.confirm'));

  const warehouseById = useMemo(() => {
    const map = new Map<string, string>();
    for (const w of warehouses ?? []) map.set(w.id, w.name);
    return map;
  }, [warehouses]);

  const categoryById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories ?? []) map.set(c.id, c.name);
    return map;
  }, [categories]);

  const personById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of customers ?? []) map.set(c.id, c.name);
    return map;
  }, [customers]);

  const handleConfirm = async (id: string) => {
    try {
      await confirmMut.mutateAsync(id);
      message.success(t('conversions.confirmed'));
    } catch {
      message.error(t('common.saveFailed'));
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await cancelMut.mutateAsync(id);
      message.success(t('conversions.cancelled'));
    } catch (err) {
      const error = err as Error & { product?: string };
      if (error.message === 'cancel-blocked-stock') {
        message.error(t('conversions.cancelBlockedStock', { product: error.product }));
      } else {
        message.error(t('common.saveFailed'));
      }
    }
  };

  const inputDetailColumns = (confirmed: boolean): ColumnsType<ConversionInput> => [
    { title: t('conversions.product'), dataIndex: 'product' },
    {
      title: t('conversions.quantityMt'),
      dataIndex: 'quantityMt',
      align: 'right',
      render: (v: number) => formatMt(v),
    },
    ...(confirmed
      ? [
          {
            title: t('conversions.unitCost'),
            dataIndex: 'unitCostUsd',
            align: 'right' as const,
            render: (v: number) => <Money value={v} fractionDigits={4} />,
          },
          {
            title: t('conversions.inputCost'),
            dataIndex: 'costUsd',
            align: 'right' as const,
            render: (v: number) => <Money value={v} />,
          },
        ]
      : []),
  ];

  const outputDetailColumns = (confirmed: boolean): ColumnsType<ConversionOutput> => [
    { title: t('conversions.product'), dataIndex: 'product' },
    {
      title: t('conversions.quantityMt'),
      dataIndex: 'quantityMt',
      align: 'right',
      render: (v: number) => formatMt(v),
    },
    {
      title: t('conversions.share'),
      dataIndex: 'sharePercent',
      align: 'right',
      render: (v?: number | null) => (v === null || v === undefined ? <Text type="secondary">—</Text> : `${v}%`),
    },
    ...(confirmed
      ? [
          {
            title: t('conversions.unitCost'),
            dataIndex: 'unitCostUsd',
            align: 'right' as const,
            render: (v: number) => <Money value={v} fractionDigits={4} />,
          },
          {
            title: t('conversions.totalCost'),
            dataIndex: 'costUsd',
            align: 'right' as const,
            render: (v: number) => <Money value={v} />,
          },
        ]
      : []),
  ];

  const costDetailColumns: ColumnsType<ConversionCost> = [
    {
      title: t('conversions.category'),
      dataIndex: 'categoryId',
      render: (v: string) => categoryById.get(v) ?? '—',
    },
    {
      title: t('conversions.person'),
      dataIndex: 'personId',
      render: (v: string) => personById.get(v) ?? '—',
    },
    {
      title: t('conversions.amount'),
      key: 'amount',
      align: 'right',
      render: (_, r) => <Money value={r.amount} currency={r.currency} />,
    },
    {
      title: t('conversions.addedCost'),
      dataIndex: 'amountUsd',
      align: 'right',
      render: (v: number) => <Money value={v} />,
    },
    {
      title: t('conversions.description'),
      dataIndex: 'description',
      render: (v?: string) => v || <Text type="secondary">—</Text>,
    },
  ];

  const columns: ColumnsType<ConversionDocument> = [
    {
      title: t('conversions.number'),
      dataIndex: 'docNumber',
      width: 150,
      render: (v: string) => (
        <Text strong style={{ fontFamily: 'monospace', fontSize: 13 }}>
          {v}
        </Text>
      ),
    },
    {
      title: t('conversions.date'),
      dataIndex: 'date',
      width: 120,
      render: (v: string) => formatDate(v),
    },
    {
      title: t('conversions.warehouse'),
      key: 'warehouse',
      width: 160,
      render: (_, r) => warehouseById.get(r.warehouseId) ?? '—',
    },
    {
      title: t('conversions.title'),
      key: 'summary',
      width: 280,
      render: (_, r) => (
        <span dir="ltr" style={ltrTruncateStyle} title={t('conversions.summary', { inputs: summarize(r.inputs), outputs: summarize(r.outputs) })}>
          {t('conversions.summary', { inputs: summarize(r.inputs), outputs: summarize(r.outputs) })}
        </span>
      ),
    },
    {
      title: t('conversions.yield'),
      key: 'yield',
      width: 90,
      align: 'right',
      render: (_, r) => yieldOf(r),
    },
    {
      title: t('conversions.totalCost'),
      key: 'totalCost',
      width: 140,
      align: 'right',
      render: (_, r) =>
        r.status === 'CONFIRMED' ? (
          <Money value={r.totalInputCostUsd + r.totalAddedCostUsd} />
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: t('conversions.status'),
      dataIndex: 'status',
      width: 110,
      align: 'center',
      render: (v: ConversionStatus) => <Tag color={STATUS_COLOR[v]}>{t(STATUS_LABEL_KEY[v])}</Tag>,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 230,
      align: 'right',
      onCell: () => ({ onClick: (e: MouseEvent) => e.stopPropagation() }),
      render: (_, r) => (
        <Space size={4}>
          {r.status === 'DRAFT' && (
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => onEdit(r)}>
              {t('common.edit')}
            </Button>
          )}
          {r.status === 'DRAFT' && canConfirm && (
            <Popconfirm
              title={t('conversions.confirmHint')}
              okText={t('common.yes')}
              cancelText={t('common.no')}
              onConfirm={() => handleConfirm(r.id)}
            >
              <Button type="link" size="small">
                {t('conversions.confirm')}
              </Button>
            </Popconfirm>
          )}
          {r.status !== 'CANCELLED' && (
            <Popconfirm
              title={t('conversions.cancelConfirm')}
              okText={t('common.yes')}
              cancelText={t('common.no')}
              onConfirm={() => handleCancel(r.id)}
            >
              <Button type="link" size="small" danger>
                {t('conversions.cancel')}
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Table<ConversionDocument>
      rowKey="id"
      loading={isLoading}
      columns={columns}
      dataSource={conversions ?? []}
      scroll={{ x: 1300 }}
      pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }}
      locale={{
        emptyText: (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Space direction="vertical" size={2}>
                <Text>{t('conversions.emptyTitle')}</Text>
                <Text type="secondary">{t('conversions.emptyHint')}</Text>
              </Space>
            }
          />
        ),
      }}
      expandable={{
        rowExpandable: (r) => r.inputs.length > 0 || r.outputs.length > 0 || r.costs.length > 0,
        expandedRowRender: (r) => {
          const confirmed = r.status === 'CONFIRMED';
          return (
            <Space direction="vertical" style={{ width: '100%' }} size={16}>
              {r.inputs.length > 0 && (
                <div>
                  <Text strong style={{ fontSize: 12 }}>
                    {t('conversions.inputs')}
                  </Text>
                  <Table<ConversionInput>
                    rowKey="id"
                    size="small"
                    pagination={false}
                    columns={inputDetailColumns(confirmed)}
                    dataSource={r.inputs}
                  />
                </div>
              )}
              {r.outputs.length > 0 && (
                <div>
                  <Text strong style={{ fontSize: 12 }}>
                    {t('conversions.outputs')}
                  </Text>
                  <Table<ConversionOutput>
                    rowKey="id"
                    size="small"
                    pagination={false}
                    columns={outputDetailColumns(confirmed)}
                    dataSource={r.outputs}
                  />
                </div>
              )}
              {r.costs.length > 0 && (
                <div>
                  <Text strong style={{ fontSize: 12 }}>
                    {t('conversions.costs')}
                  </Text>
                  <Table<ConversionCost>
                    rowKey="id"
                    size="small"
                    pagination={false}
                    columns={costDetailColumns}
                    dataSource={r.costs}
                  />
                </div>
              )}
              {r.notes && (
                <div>
                  <Text strong style={{ fontSize: 12 }}>
                    {t('conversions.notes')}
                  </Text>
                  <div>
                    <Text type="secondary">{r.notes}</Text>
                  </div>
                </div>
              )}
              {r.chargeDocId && (
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0, height: 'auto', fontFamily: 'monospace' }}
                  onClick={() => navigate(`${ROUTES.expenses}/${encodeURIComponent(r.chargeDocId!)}`)}
                >
                  {t('conversions.linkedExpense')}
                </Button>
              )}
            </Space>
          );
        },
      }}
    />
  );
}
