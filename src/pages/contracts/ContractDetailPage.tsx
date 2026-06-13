import { Card, Col, Descriptions, Empty, Progress, Result, Row, Space, Table, Tag, Typography, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckCircleTwoTone, CloseCircleOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';
import { Money } from '@/components/common/Money';
import { StatusTag } from '@/components/common/StatusTag';
import { useContainersByContract, useContract } from '@/services/queries';
import type { ContainerRow } from '@/services/api';
import { unitPrice } from '@/utils/calc';
import { formatDate, formatMt, formatNumber } from '@/utils/format';
import type { Item } from '@/types';

const { Text } = Typography;

export default function ContractDetailPage() {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const { id = '' } = useParams();
  const contractId = decodeURIComponent(id);
  const { data: contract, isLoading } = useContract(contractId);
  const { data: containers } = useContainersByContract(contractId);

  if (!isLoading && !contract) {
    return <Result status="404" title={t('errors.notFoundTitle')} subTitle={t('errors.notFoundDesc')} />;
  }

  const itemColumns: ColumnsType<Item> = [
    {
      title: t('items.product'),
      dataIndex: 'product',
      fixed: 'left',
      width: 200,
      render: (v) => <Text strong>{v}</Text>,
    },
    {
      title: t('items.quantityMt'),
      dataIndex: 'quantityMt',
      width: 120,
      align: 'right',
      render: (v) => formatMt(v),
    },
    {
      title: t('items.lmePercent'),
      dataIndex: 'lmePercent',
      width: 100,
      align: 'right',
      render: (v) => `${formatNumber(v, 2)}%`,
    },
    {
      title: t('items.lmeFixed'),
      dataIndex: 'lmeFixed',
      width: 100,
      align: 'center',
      render: (v: boolean) =>
        v ? (
          <CheckCircleTwoTone twoToneColor={token.colorSuccess} />
        ) : (
          <CloseCircleOutlined style={{ color: token.colorTextQuaternary }} />
        ),
    },
    {
      title: t('items.fixedLmePrice'),
      dataIndex: 'fixedLmePrice',
      width: 140,
      align: 'right',
      render: (v) => <Money value={v} />,
    },
    {
      title: t('items.premium'),
      dataIndex: 'premium',
      width: 130,
      align: 'right',
      render: (v) => <Money value={v} muteZero />,
    },
    {
      title: t('items.unitPrice'),
      key: 'unitPrice',
      width: 140,
      align: 'right',
      render: (_, r) => <Money value={unitPrice(r)} strong />,
    },
    {
      title: t('items.incoterm'),
      dataIndex: 'incoterm',
      width: 100,
      align: 'center',
      render: (v) => <Tag bordered={false}>{v}</Tag>,
    },
    {
      title: t('items.remainingMt'),
      dataIndex: 'remainingMt',
      width: 130,
      align: 'right',
      render: (v: number, r) => {
        const pct = r.quantityMt > 0 ? ((r.quantityMt - v) / r.quantityMt) * 100 : 0;
        return (
          <Space direction="vertical" size={0} style={{ width: 110 }}>
            <Text style={{ fontSize: 12 }}>{formatMt(v)}</Text>
            <Progress percent={Math.round(pct)} size="small" showInfo={false} strokeColor={token.colorPrimary} />
          </Space>
        );
      },
    },
    {
      title: t('items.status'),
      dataIndex: 'status',
      width: 110,
      align: 'center',
      render: (v) => <StatusTag status={v} />,
    },
  ];

  const containerColumns: ColumnsType<ContainerRow> = [
    { title: t('containers.reference'), dataIndex: 'reference', render: (v) => <Text style={{ fontFamily: 'monospace' }}>{v}</Text> },
    { title: t('containers.quantityMt'), dataIndex: 'quantityMt', align: 'right', render: (v) => formatMt(v) },
    { title: t('containers.lmePrice'), dataIndex: 'lmePrice', align: 'right', render: (v) => <Money value={v} /> },
    { title: t('containers.shipmentDate'), dataIndex: 'shipmentDate', render: (v) => formatDate(v) },
    { title: t('containers.dueDate'), dataIndex: 'dueDate', render: (v) => formatDate(v) },
    { title: t('containers.invoice'), dataIndex: 'invoiceUSD', align: 'right', render: (v) => <Money value={v} strong /> },
    { title: t('containers.status'), dataIndex: 'status', align: 'center', render: (v) => <StatusTag status={v} /> },
  ];

  const totalQty = contract?.items.reduce((s, i) => s + i.quantityMt, 0) ?? 0;
  const totalRemaining = contract?.items.reduce((s, i) => s + i.remainingMt, 0) ?? 0;

  return (
    <div className="fade-in">
      <PageHeader
        onBack
        title={
          <Space wrap>
            <span style={{ fontFamily: 'monospace' }}>{contractId}</span>
            {contract && <StatusTag status={contract.status} />}
          </Space>
        }
        subtitle={contract ? `${contract.customerName} · ${contract.destination}` : t('common.loading')}
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card variant="borderless" loading={isLoading} title={t('contracts.detailTitle')}>
            <Descriptions
              column={{ xs: 1, sm: 2, lg: 3 }}
              items={[
                { key: 'cust', label: t('contracts.customer'), children: contract?.customerName },
                { key: 'date', label: t('contracts.date'), children: formatDate(contract?.date) },
                { key: 'dest', label: t('contracts.destination'), children: contract?.destination },
                { key: 'qty', label: t('contracts.quantity'), children: formatMt(totalQty) },
                { key: 'rem', label: t('contracts.remaining'), children: formatMt(totalRemaining) },
                {
                  key: 'val',
                  label: t('contracts.value'),
                  children: contract ? <Money value={contract.value} strong /> : '—',
                },
              ]}
            />
            {contract?.notes && (
              <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
                {contract.notes}
              </Text>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card variant="borderless" loading={isLoading} title={t('contracts.progress')} style={{ height: '100%' }}>
            <div style={{ display: 'grid', placeItems: 'center', padding: '8px 0' }}>
              <Progress
                type="dashboard"
                percent={contract ? Math.round(contract.shippedPct) : 0}
                strokeColor={{ '0%': '#10a37f', '100%': '#2ee6b6' }}
              />
              <Text type="secondary" style={{ marginTop: 8 }}>
                {formatMt(totalQty - totalRemaining)} / {formatMt(totalQty)}
              </Text>
            </div>
          </Card>
        </Col>
      </Row>

      <Card
        variant="borderless"
        title={`${t('contracts.items')} · ${contract?.items.length ?? 0}`}
        style={{ marginTop: 16 }}
        styles={{ body: { padding: 12 } }}
      >
        <Table<Item>
          rowKey="id"
          loading={isLoading}
          columns={itemColumns}
          dataSource={contract?.items ?? []}
          pagination={false}
          scroll={{ x: 1320 }}
          expandable={{
            expandedRowRender: (r) =>
              r.notes ? (
                <Text type="secondary">{r.notes}</Text>
              ) : (
                <Text type="secondary">{t('common.none')}</Text>
              ),
            rowExpandable: () => true,
          }}
          locale={{ emptyText: <Empty description={t('contracts.noItems')} /> }}
        />
      </Card>

      <Card
        variant="borderless"
        title={`${t('containers.title')} · ${containers?.length ?? 0}`}
        style={{ marginTop: 16 }}
        styles={{ body: { padding: 12 } }}
      >
        <Table<ContainerRow>
          rowKey="id"
          columns={containerColumns}
          dataSource={containers ?? []}
          pagination={false}
          scroll={{ x: 900 }}
          locale={{ emptyText: <Empty description={t('common.noData')} /> }}
        />
      </Card>
    </div>
  );
}
