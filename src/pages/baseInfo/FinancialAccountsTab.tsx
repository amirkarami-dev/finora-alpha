import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { App, Button, Empty, Popconfirm, Segmented, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useFinancialAccounts, useSetFinancialAccountActive } from '@/services/queries';
import type { FinancialAccount, FinancialAccountType } from '@/types';
import { ltrTruncateStyle } from '@/pages/tradeInvoices/containerOptions';
import { FinancialAccountFormModal } from './FinancialAccountFormModal';

const { Text } = Typography;

export interface FinancialAccountsTabHandle {
  openCreate: () => void;
}

interface FinancialAccountsTabProps {
  type: FinancialAccountType;
}

/** Banks and cash safes share one implementation, parameterised by `type` — the
 *  `ChargeCategoriesTab`-by-direction precedent. Only the bank columns differ. */
export const FinancialAccountsTab = forwardRef<FinancialAccountsTabHandle, FinancialAccountsTabProps>(
  function FinancialAccountsTab({ type }, ref) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const { data, isLoading } = useFinancialAccounts(type);
    const setActive = useSetFinancialAccountActive();
    const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
    const [formState, setFormState] = useState<{ open: boolean; account?: FinancialAccount }>({ open: false });

    const isBank = type === 'BANK';
    const ns = isBank ? 'banks' : 'cashSafes';

    useImperativeHandle(ref, () => ({
      openCreate: () => setFormState({ open: true, account: undefined }),
    }));

    const filtered = useMemo(
      () =>
        (data ?? []).filter((a) =>
          statusFilter === 'all' ? true : statusFilter === 'active' ? a.active : !a.active,
        ),
      [data, statusFilter],
    );

    const columns: ColumnsType<FinancialAccount> = [
      { title: t('financialAccounts.name'), dataIndex: 'name', render: (v) => <Text strong>{v}</Text> },
      {
        title: t('financialAccounts.currency'),
        dataIndex: 'currency',
        width: 100,
        align: 'center',
        render: (v: string) => <Tag>{v}</Tag>,
      },
      // Account numbers, IBANs and SWIFT codes are Latin tokens: keep them LTR so they do not
      // reorder inside an RTL page.
      ...(isBank
        ? ([
            {
              title: t('banks.accountNumber'),
              dataIndex: 'accountNumber',
              width: 180,
              render: (v?: string) =>
                v ? (
                  <span dir="ltr" style={{ ...ltrTruncateStyle, fontFamily: 'monospace' }}>
                    {v}
                  </span>
                ) : (
                  <Text type="secondary">—</Text>
                ),
            },
            {
              title: t('banks.iban'),
              dataIndex: 'iban',
              width: 220,
              render: (v?: string) =>
                v ? (
                  <span dir="ltr" style={{ ...ltrTruncateStyle, fontFamily: 'monospace' }}>
                    {v}
                  </span>
                ) : (
                  <Text type="secondary">—</Text>
                ),
            },
            {
              title: t('banks.swiftCode'),
              dataIndex: 'swiftCode',
              width: 130,
              render: (v?: string) =>
                v ? (
                  <span dir="ltr" style={{ fontFamily: 'monospace' }}>
                    {v}
                  </span>
                ) : (
                  <Text type="secondary">—</Text>
                ),
            },
          ] as ColumnsType<FinancialAccount>)
        : []),
      {
        title: t('customers.status'),
        dataIndex: 'active',
        width: 110,
        align: 'center',
        render: (v: boolean) =>
          v ? <Tag color="success">{t('common.active')}</Tag> : <Tag>{t('common.inactive')}</Tag>,
      },
      {
        title: t('common.actions'),
        key: 'actions',
        width: 200,
        align: 'right',
        render: (_, r) => (
          <Space>
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => setFormState({ open: true, account: r })}
            >
              {t('common.edit')}
            </Button>
            <Popconfirm
              title={r.active ? t('common.deactivateConfirm') : t('common.activateConfirm')}
              okText={t('common.yes')}
              cancelText={t('common.no')}
              onConfirm={async () => {
                try {
                  // Capture the INTENDED next state before awaiting: the mock API mutates the
                  // record in place, so a post-await `r.active` already reads the flipped value.
                  const next = !r.active;
                  await setActive.mutateAsync({ id: r.id, active: next });
                  message.success(next ? t(`${ns}.activated`) : t(`${ns}.deactivated`));
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

    return (
      <>
        <div style={{ marginBottom: 16 }}>
          <Segmented
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as 'active' | 'inactive' | 'all')}
            options={[
              { label: t('common.active'), value: 'active' },
              { label: t('common.inactive'), value: 'inactive' },
              { label: t('common.all'), value: 'all' },
            ]}
          />
        </div>
        <Table<FinancialAccount>
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={filtered}
          scroll={{ x: isBank ? 1100 : 700 }}
          pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }}
          locale={{
            emptyText:
              (data ?? []).length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <Space direction="vertical" size={2}>
                      <Text>{t(`${ns}.emptyTitle`)}</Text>
                      <Text type="secondary">{t(`${ns}.emptyHint`)}</Text>
                    </Space>
                  }
                >
                  <Button type="primary" onClick={() => setFormState({ open: true, account: undefined })}>
                    {t(`${ns}.newAccount`)}
                  </Button>
                </Empty>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={<Text type="secondary">{t('common.noFilterResults')}</Text>}
                />
              ),
          }}
        />
        <FinancialAccountFormModal
          open={formState.open}
          onClose={() => setFormState((s) => ({ ...s, open: false }))}
          type={type}
          account={formState.account}
        />
      </>
    );
  },
);
