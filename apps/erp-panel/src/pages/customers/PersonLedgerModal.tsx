import { Alert, Modal, Space, Statistic, Table, Tag, Tooltip, Typography, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import { Money } from '@/components/common/Money';
import { usePersonLedger } from '@/services/queries';
import { formatDate, formatNumber } from '@/utils/format';
import type { LedgerKind, PersonLedgerEntry } from '@/services/api';

const { Text } = Typography;

/** Sale rows lean on the brand's positive colour, purchase rows on its negative one, so the two
 *  sides of a both-roles person are separable at a glance without reading the kind column. */
const KIND_COLOR: Record<LedgerKind, string> = {
  SALE_INVOICE: 'blue',
  SALE_CLAIM: 'geekblue',
  SALE_PAYMENT: 'cyan',
  PURCHASE_INVOICE: 'orange',
  PURCHASE_CLAIM: 'gold',
  PURCHASE_PAYMENT: 'volcano',
  // Charges sit apart from the trade colours: they are money with the person, but not a
  // document they bought or sold.
  EXPENSE: 'red',
  REVENUE: 'green',
  TRANSFER: 'default',
};

interface PersonLedgerModalProps {
  open: boolean;
  onClose: () => void;
  personId: string;
  personName: string;
}

/**
 * Explains one person's balance, one movement at a time.
 *
 * The running column is the balance itself: `netBalance` IS this list's last running value
 * (see `personLedgers` in api.ts), so the headline figure and this explanation cannot disagree.
 */
export function PersonLedgerModal({ open, onClose, personId, personName }: PersonLedgerModalProps) {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const { data, isLoading } = usePersonLedger(personId, { enabled: open });

  const columns: ColumnsType<PersonLedgerEntry> = [
    {
      title: t('ledger.date'),
      dataIndex: 'date',
      width: 120,
      render: (v: string) => formatDate(v),
    },
    {
      title: t('ledger.kind'),
      dataIndex: 'kind',
      width: 190,
      render: (v: LedgerKind) => <Tag color={KIND_COLOR[v]}>{t(`ledger.kinds.${v}`)}</Tag>,
    },
    {
      title: t('ledger.reference'),
      dataIndex: 'reference',
      render: (v: string, r) => (
        <Space size={4} wrap>
          <span dir="ltr" style={{ fontFamily: 'monospace' }}>
            {v}
          </span>
          {r.pending && (
            <Tooltip title={t('ledger.pendingHint')}>
              <Tag color="warning">{t('ledger.pending')}</Tag>
            </Tooltip>
          )}
          {r.informational && (
            <Tooltip title={t('ledger.informationalHint')}>
              <Tag>{t('ledger.informational')}</Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: t('ledger.amount'),
      dataIndex: 'amount',
      width: 150,
      align: 'right',
      render: (v: number, r) => (
        <Text type="secondary">
          {formatNumber(v, 2)} {r.currency}
        </Text>
      ),
    },
    {
      title: t('ledger.effect'),
      dataIndex: 'effect',
      width: 150,
      align: 'right',
      // Signed on purpose: the sign IS the information, so it is never dropped.
      render: (v: number) =>
        v === 0 ? (
          <Text type="secondary">—</Text>
        ) : (
          <Text style={{ color: v > 0 ? token.colorSuccess : token.colorError }}>
            {v > 0 ? '+' : ''}
            {formatNumber(v, 2)}
          </Text>
        ),
    },
    {
      title: t('ledger.running'),
      dataIndex: 'running',
      width: 160,
      align: 'right',
      render: (v: number) => <Money value={v} fractionDigits={2} signed />,
    },
  ];

  const ledger = data;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={1000}
      title={`${t('ledger.title')} · ${personName}`}
      destroyOnHidden
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Statistic
          title={t('ledger.saleSide')}
          valueRender={() => <Money value={ledger?.saleTotal ?? 0} fractionDigits={2} signed />}
        />
        <Statistic
          title={t('ledger.purchaseSide')}
          valueRender={() => <Money value={ledger?.purchaseTotal ?? 0} fractionDigits={2} signed />}
        />
        <Statistic
          title={t('ledger.net')}
          valueRender={() => <Money value={ledger?.netBalance ?? 0} fractionDigits={2} signed />}
        />
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message={(ledger?.netBalance ?? 0) >= 0 ? t('ledger.owesUs') : t('ledger.weOwe')}
      />
      {(ledger?.pendingCount ?? 0) > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={t('ledger.pendingBanner', { n: ledger?.pendingCount ?? 0 })}
        />
      )}

      <Table<PersonLedgerEntry>
        rowKey="id"
        size="small"
        loading={isLoading}
        columns={columns}
        dataSource={ledger?.entries ?? []}
        pagination={false}
        scroll={{ x: 900, y: 420 }}
        locale={{ emptyText: t('ledger.empty') }}
      />
    </Modal>
  );
}
