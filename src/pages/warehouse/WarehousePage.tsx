import { useMemo, useState, type MouseEvent } from 'react';
import { App, Button, Card, Col, Empty, Popconfirm, Row, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';
import {
  useInventoryDocuments,
  useSetWarehouseActive,
  useStockLevels,
  useTradeInvoices,
  useWarehouses,
} from '@/services/queries';
import type { StockLevelRow } from '@/services/api';
import { formatDate, formatMt } from '@/utils/format';
import { useTabParam } from '@/hooks/useTabParam';
import type { InventoryDocType, InventoryDocument, InventoryDocumentItem, Warehouse } from '@/types';
import { WarehouseFormModal } from './WarehouseFormModal';

const { Text } = Typography;

const TAB_KEYS = ['warehouses', 'inventory'] as const;
type TabKey = (typeof TAB_KEYS)[number];

const DOC_TYPE_COLOR: Record<InventoryDocType, string> = { IN: 'blue', OUT: 'gold' };

export default function WarehousePage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useTabParam(TAB_KEYS, 'warehouses');

  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const setActive = useSetWarehouseActive();
  const [formState, setFormState] = useState<{ open: boolean; warehouse?: Warehouse }>({ open: false });

  const { data: stockLevels, isLoading: stockLoading } = useStockLevels();
  const { data: inventoryDocs, isLoading: docsLoading } = useInventoryDocuments();
  const { data: purchaseInvoices } = useTradeInvoices('PURCHASE');
  const { data: saleInvoices } = useTradeInvoices('SALE');

  const warehouseById = useMemo(() => {
    const map = new Map<string, Warehouse>();
    for (const w of warehouses ?? []) map.set(w.id, w);
    return map;
  }, [warehouses]);

  const invoiceNumberById = useMemo(() => {
    const map = new Map<string, string>();
    for (const inv of purchaseInvoices ?? []) map.set(inv.id, inv.invoiceNumber);
    for (const inv of saleInvoices ?? []) map.set(inv.id, inv.invoiceNumber);
    return map;
  }, [purchaseInvoices, saleInvoices]);

  const stockByWarehouse = useMemo(() => {
    const map = new Map<string, StockLevelRow[]>();
    for (const row of stockLevels ?? []) {
      const list = map.get(row.warehouseId) ?? [];
      list.push(row);
      map.set(row.warehouseId, list);
    }
    return map;
  }, [stockLevels]);

  const warehouseColumns: ColumnsType<Warehouse> = [
    { title: t('warehouse.name'), dataIndex: 'name', render: (v) => <Text strong>{v}</Text> },
    {
      title: t('warehouse.code'),
      dataIndex: 'code',
      width: 140,
      render: (v) => <Tag style={{ fontFamily: 'monospace' }}>{v}</Tag>,
    },
    {
      title: t('warehouse.location'),
      dataIndex: 'location',
      render: (v?: string) => v || <Text type="secondary">—</Text>,
    },
    {
      title: t('customers.status'),
      dataIndex: 'active',
      width: 120,
      align: 'center',
      render: (v: boolean) =>
        v ? <Tag color="success">{t('common.active')}</Tag> : <Tag>{t('common.inactive')}</Tag>,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 200,
      align: 'right',
      onCell: () => ({ onClick: (e: MouseEvent) => e.stopPropagation() }),
      render: (_, r) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => setFormState({ open: true, warehouse: r })}
          >
            {t('common.edit')}
          </Button>
          <Popconfirm
            title={r.active ? t('common.deactivateConfirm') : t('common.activateConfirm')}
            okText={t('common.yes')}
            cancelText={t('common.no')}
            onConfirm={async () => {
              try {
                await setActive.mutateAsync({ id: r.id, active: !r.active });
                message.success(r.active ? t('warehouse.deactivated') : t('warehouse.activated'));
              } catch {
                message.error(t('common.saveFailed'));
              }
            }}
          >
            <Button type="link" size="small" danger={r.active}>
              {r.active ? t('common.deactivate') : t('common.activate')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const docColumns: ColumnsType<InventoryDocument> = [
    {
      title: t('warehouse.docNumber'),
      dataIndex: 'docNumber',
      width: 170,
      render: (v) => (
        <Text strong style={{ fontFamily: 'monospace', fontSize: 13 }}>
          {v}
        </Text>
      ),
    },
    {
      title: t('warehouse.docType'),
      dataIndex: 'type',
      width: 100,
      align: 'center',
      render: (v: InventoryDocType) => (
        <Tag color={DOC_TYPE_COLOR[v]}>{t(v === 'IN' ? 'warehouse.in' : 'warehouse.out')}</Tag>
      ),
    },
    {
      title: t('warehouse.warehouse'),
      key: 'warehouse',
      width: 180,
      render: (_, r) => warehouseById.get(r.warehouseId)?.name ?? '—',
    },
    {
      title: t('warehouse.date'),
      dataIndex: 'date',
      width: 130,
      render: (v) => formatDate(v),
    },
    {
      title: t('warehouse.linkedInvoice'),
      key: 'invoice',
      width: 170,
      onCell: () => ({ onClick: (e: MouseEvent) => e.stopPropagation() }),
      render: (_, r) =>
        r.invoiceId ? (
          <Button
            type="link"
            size="small"
            style={{ padding: 0, height: 'auto', fontFamily: 'monospace' }}
            onClick={() => navigate(`/app/invoices/${encodeURIComponent(r.invoiceId!)}`)}
          >
            {invoiceNumberById.get(r.invoiceId) ?? r.invoiceId}
          </Button>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: t('warehouse.docStatus'),
      dataIndex: 'status',
      width: 120,
      align: 'center',
      render: (v: 'CONFIRMED' | 'CANCELLED') => (
        <Tag color={v === 'CONFIRMED' ? 'success' : 'default'} style={{ opacity: v === 'CANCELLED' ? 0.6 : 1 }}>
          {t(v === 'CONFIRMED' ? 'tradeInvoices.status.CONFIRMED' : 'tradeInvoices.status.CANCELLED')}
        </Tag>
      ),
    },
  ];

  const itemColumns: ColumnsType<InventoryDocumentItem> = [
    { title: t('items.product'), dataIndex: 'product' },
    {
      title: t('items.quantityMt'),
      dataIndex: 'quantityMt',
      align: 'right',
      render: (v: number) => formatMt(v),
    },
  ];

  return (
    <div className="fade-in">
      <PageHeader
        title={t('warehouse.title')}
        subtitle={t('warehouse.subtitle')}
        extra={
          tab === 'warehouses' ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setFormState({ open: true, warehouse: undefined })}
            >
              {t('warehouse.newWarehouse')}
            </Button>
          ) : undefined
        }
      />

      <Card
        variant="borderless"
        styles={{ body: { padding: 16 } }}
        tabList={[
          { key: 'warehouses', label: t('warehouse.tabWarehouses') },
          { key: 'inventory', label: t('warehouse.tabInventory') },
        ]}
        activeTabKey={tab}
        onTabChange={(key) => setTab(key as TabKey)}
      >
        {tab === 'warehouses' && (
          <Table<Warehouse>
            rowKey="id"
            loading={warehousesLoading}
            columns={warehouseColumns}
            dataSource={warehouses ?? []}
            scroll={{ x: 720 }}
            pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }}
          />
        )}

        {tab === 'inventory' && (
          <>
            <div style={{ marginBottom: 20 }}>
              <Typography.Title level={5} style={{ marginBottom: 12 }}>
                {t('warehouse.stockTitle')}
              </Typography.Title>
              <Row gutter={[16, 16]}>
                {(warehouses ?? []).map((w) => {
                  const rows = stockByWarehouse.get(w.id) ?? [];
                  return (
                    <Col xs={24} sm={12} lg={8} key={w.id}>
                      <Card size="small" title={w.name} loading={stockLoading}>
                        {rows.length === 0 ? (
                          <Text type="secondary">{t('warehouse.noStock')}</Text>
                        ) : (
                          <Space direction="vertical" size={4} style={{ width: '100%' }}>
                            {rows.map((r) => (
                              <div
                                key={r.productKey}
                                style={{ display: 'flex', justifyContent: 'space-between' }}
                              >
                                <Text>{r.product}</Text>
                                <Text strong>{formatMt(r.mt)}</Text>
                              </div>
                            ))}
                          </Space>
                        )}
                      </Card>
                    </Col>
                  );
                })}
              </Row>
            </div>

            <Typography.Title level={5} style={{ marginBottom: 12 }}>
              {t('warehouse.docsTitle')}
            </Typography.Title>
            <Table<InventoryDocument>
              rowKey="id"
              loading={docsLoading}
              columns={docColumns}
              dataSource={inventoryDocs ?? []}
              scroll={{ x: 900 }}
              pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }}
              locale={{ emptyText: <Empty description={t('common.noData')} /> }}
              expandable={{
                rowExpandable: (r) => r.items.length > 0,
                expandedRowRender: (r) => (
                  <Table<InventoryDocumentItem>
                    rowKey="id"
                    columns={itemColumns}
                    dataSource={r.items}
                    pagination={false}
                    size="small"
                  />
                ),
              }}
            />
          </>
        )}
      </Card>

      <WarehouseFormModal
        open={formState.open}
        onClose={() => setFormState((s) => ({ ...s, open: false }))}
        warehouse={formState.warehouse}
      />
    </div>
  );
}
