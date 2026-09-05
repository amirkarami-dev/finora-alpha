import { useState } from 'react';
import { Button, Card, Col, Descriptions, Empty, Progress, Result, Row, Space, Table, Tag, Typography, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckCircleTwoTone, CloseCircleOutlined, EditOutlined, PlusOutlined, SwapOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { PageHeader } from '@/components/common/PageHeader';
import { Money } from '@/components/common/Money';
import { StatusTag } from '@/components/common/StatusTag';
import { useContract, useContractItemOverview, usePartners } from '@/services/queries';
import { unitPrice } from '@/utils/calc';
import { formatDate, formatMt, formatNumber } from '@/utils/format';
import type { Item, ItemChange } from '@/types';
import { ContractFormModal } from './ContractFormModal';
import { ItemFormModal } from './ItemFormModal';
import { ChangeQuantityModal } from './ChangeQuantityModal';

const { Text } = Typography;

export default function ContractDetailPage() {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const { id = '' } = useParams();
  const contractId = decodeURIComponent(id);
  const { data: contract, isLoading } = useContract(contractId);
  const { data: partners } = usePartners();
  const { data: overview } = useContractItemOverview(contractId);
  const overviewById = new Map((overview ?? []).map((o) => [o.itemId, o]));
  const partnerName = (id: string) => partners?.find((p) => p.id === id)?.name ?? id;
  const isPurchase = contract?.contractType === 'PURCHASE';
  const [contractFormOpen, setContractFormOpen] = useState(false);
  const [itemForm, setItemForm] = useState<{ open: boolean; item?: Item }>({ open: false });
  const [changeFor, setChangeFor] = useState<Item | undefined>(undefined);

  if (!isLoading && !contract) {
    return <Result status="404" title={t('errors.notFoundTitle')} subTitle={t('errors.notFoundDesc')} />;
  }

  const partnersColumn = {
    title: t('items.partners'),
    key: 'partners',
    width: 260,
    render: (_: unknown, r: Item) => {
      if (!r.partners || r.partners.length === 0) return <Text type="secondary">{t('items.noPartners')}</Text>;
      const sum = r.partners.reduce((s, p) => s + p.percent, 0);
      return (
        <Space size={[4, 4]} wrap>
          {r.partners.map((p) => (
            <Tag key={p.partnerId} color="blue">
              {t('items.partnerTag', { name: partnerName(p.partnerId), percent: p.percent })}
            </Tag>
          ))}
          <Tag>{t('items.ownShare', { percent: Math.max(100 - sum, 0) })}</Tag>
        </Space>
      );
    },
  };

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
      title: t('contracts.originalMt'),
      key: 'originalMt',
      width: 120,
      align: 'right',
      render: (_, r) => {
        const originalMt = overviewById.get(r.id)?.originalMt;
        return originalMt === undefined ? <Text type="secondary">—</Text> : formatMt(originalMt);
      },
    },
    {
      title: t('contracts.changesMt'),
      key: 'changesMt',
      width: 120,
      align: 'right',
      render: (_, r) => {
        const v = overviewById.get(r.id)?.changesMt ?? 0;
        if (Math.abs(v) < 1e-9) return <Text type="secondary">—</Text>;
        return <Text type={v > 0 ? 'success' : 'danger'}>{v > 0 ? `+${formatMt(v)}` : formatMt(v)}</Text>;
      },
    },
    {
      title: t('contracts.overMt'),
      key: 'overMt',
      width: 130,
      align: 'right',
      render: (_, r) => {
        const v = overviewById.get(r.id)?.overMt ?? 0;
        return v > 1e-9 ? <Text type="warning" strong>{formatMt(v)}</Text> : <Text type="secondary">—</Text>;
      },
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
    ...(isPurchase ? [partnersColumn] : []),
    {
      title: t('common.actions'),
      key: 'actions',
      fixed: 'right',
      width: 200,
      align: 'center',
      render: (_, r) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => setItemForm({ open: true, item: r })}>
            {t('common.edit')}
          </Button>
          <Button type="link" size="small" icon={<SwapOutlined />} onClick={() => setChangeFor(r)}>
            {t('contracts.changeQuantity')}
          </Button>
        </Space>
      ),
    },
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
            {contract && (
              <Tag color={contract.contractType === 'SELL' ? 'green' : 'blue'}>
                {t(contract.contractType === 'SELL' ? 'contracts.typeSell' : 'contracts.typePurchase')}
              </Tag>
            )}
          </Space>
        }
        subtitle={contract ? `${contract.customerName} · ${contract.destination}` : t('common.loading')}
        extra={
          <Button icon={<EditOutlined />} onClick={() => setContractFormOpen(true)} disabled={!contract}>
            {t('contracts.editContract')}
          </Button>
        }
      />

      <Row gutter={[16, 16]}>
        <Col xs={24}>
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
      </Row>

      <Card
        variant="borderless"
        title={`${t('contracts.items')} · ${contract?.items.length ?? 0}`}
        style={{ marginTop: 16 }}
        styles={{ body: { padding: 12 } }}
        extra={
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => setItemForm({ open: true })}
            disabled={!contract}
          >
            {t('contracts.addItem')}
          </Button>
        }
      >
        <Table<Item>
          rowKey="id"
          loading={isLoading}
          columns={itemColumns}
          dataSource={contract?.items ?? []}
          pagination={false}
          scroll={{ x: isPurchase ? 2150 : 1890 }}
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

      {contract && contract.items.some((i) => i.changes.length > 0) && (
        <Card variant="borderless" title={t('contracts.quantityHistory')} style={{ marginTop: 16 }} styles={{ body: { padding: 12 } }}>
          <Table<ItemChange & { product: string }>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={contract.items
              .flatMap((i) => i.changes.map((c) => ({ ...c, product: i.product })))
              .sort((a, b) => dayjs(b.at).valueOf() - dayjs(a.at).valueOf())}
            columns={[
              { title: t('contracts.historyWhen'), dataIndex: 'at', width: 160, render: (v: string) => formatDate(v, 'DD MMM YYYY HH:mm') },
              { title: t('items.product'), dataIndex: 'product', width: 200, render: (v: string) => <Text strong>{v}</Text> },
              { title: t('contracts.historyWho'), dataIndex: 'userName', width: 160 },
              {
                title: t('contracts.deltaMt'),
                dataIndex: 'deltaMt',
                width: 120,
                align: 'right',
                render: (v: number) => <Text type={v > 0 ? 'success' : 'danger'}>{v > 0 ? `+${formatMt(v)}` : formatMt(v)}</Text>,
              },
              {
                title: t('contracts.historyBeforeAfter'),
                key: 'beforeAfter',
                width: 180,
                align: 'right',
                render: (_: unknown, r: ItemChange) => (
                  <span dir="ltr">{`${formatMt(r.beforeMt)} → ${formatMt(r.afterMt)}`}</span>
                ),
              },
              { title: t('contracts.changeNote'), dataIndex: 'note' },
            ]}
            scroll={{ x: 1000 }}
          />
        </Card>
      )}

      {contract && (
        <ContractFormModal
          open={contractFormOpen}
          onClose={() => setContractFormOpen(false)}
          contract={contract}
          navigateOnCreate={false}
        />
      )}
      <ItemFormModal
        open={itemForm.open}
        onClose={() => setItemForm((s) => ({ ...s, open: false }))}
        contractId={contractId}
        item={itemForm.item}
        contractType={contract?.contractType}
      />
      {changeFor && (
        <ChangeQuantityModal open onClose={() => setChangeFor(undefined)} item={changeFor} />
      )}
    </div>
  );
}
