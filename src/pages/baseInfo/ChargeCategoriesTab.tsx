import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { App, Button, Empty, Popconfirm, Segmented, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useChargeCategories, useSetChargeCategoryActive } from '@/services/queries';
import type { ChargeCategory, ChargeDirection, ChargeScope } from '@/types';
import { ChargeCategoryFormModal } from './ChargeCategoryFormModal';

const { Text } = Typography;

/** See `CostCentresTabHandle` (CostCentresTab.tsx) — same rationale, one handle per direction
 *  instance since BaseInfoPage mounts only the active tab's component at a time. */
export interface ChargeCategoriesTabHandle {
  openCreate: () => void;
}

interface ChargeCategoriesTabProps {
  direction: ChargeDirection;
}

/** Expense/Revenue category tab (design spec §6) — one implementation parameterised by
 *  `direction`, used twice by BaseInfoPage. Copies `CostCentresTab`'s table/modal wiring and
 *  adds a scope Segmented alongside the status Segmented. */
export const ChargeCategoriesTab = forwardRef<ChargeCategoriesTabHandle, ChargeCategoriesTabProps>(
  function ChargeCategoriesTab({ direction }, ref) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const { data, isLoading } = useChargeCategories(direction);
    const setActive = useSetChargeCategoryActive();
    const [scopeFilter, setScopeFilter] = useState<'all' | ChargeScope>('all');
    const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
    const [formState, setFormState] = useState<{ open: boolean; category?: ChargeCategory }>({
      open: false,
    });

    useImperativeHandle(ref, () => ({
      openCreate: () => setFormState({ open: true, category: undefined }),
    }));

    const filtered = useMemo(
      () =>
        (data ?? []).filter((c) => {
          if (scopeFilter !== 'all' && c.scope !== scopeFilter) return false;
          if (statusFilter === 'active' && !c.active) return false;
          if (statusFilter === 'inactive' && c.active) return false;
          return true;
        }),
      [data, scopeFilter, statusFilter],
    );

    const columns: ColumnsType<ChargeCategory> = [
      { title: t('chargeCategories.name'), dataIndex: 'name', render: (v) => <Text strong>{v}</Text> },
      {
        title: t('chargeCategories.code'),
        dataIndex: 'code',
        width: 120,
        render: (v) => <Tag style={{ fontFamily: 'monospace' }}>{v}</Tag>,
      },
      {
        title: t('chargeCategories.scope'),
        dataIndex: 'scope',
        width: 120,
        render: (v: ChargeScope) => (
          <Tag color={v === 'INVOICE' ? 'blue' : 'default'}>{t(`chargeScopes.${v}`)}</Tag>
        ),
      },
      {
        title: t('chargeCategories.description'),
        dataIndex: 'description',
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
        render: (_, r) => (
          <Space>
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => setFormState({ open: true, category: r })}
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
                  // record in place, so a post-await `r.active` already reads the flipped value
                  // and the toast would announce the opposite of what just happened.
                  const next = !r.active;
                  await setActive.mutateAsync({ id: r.id, active: next });
                  message.success(
                    next ? t('chargeCategories.activated') : t('chargeCategories.deactivated'),
                  );
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
        <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <Segmented
            value={scopeFilter}
            onChange={(v) => setScopeFilter(v as 'all' | ChargeScope)}
            options={[
              { label: t('chargeScopes.INVOICE'), value: 'INVOICE' },
              { label: t('chargeScopes.GENERAL'), value: 'GENERAL' },
              { label: t('common.all'), value: 'all' },
            ]}
          />
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
        <Table<ChargeCategory>
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={filtered}
          scroll={{ x: 820 }}
          pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }}
          locale={{
            // Empty-start sweep (spec §10.11): with no categories at all, say what a category is
            // for and offer to create one — the two Segmenteds above can also empty this table,
            // and that needs the other message.
            emptyText:
              (data ?? []).length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <Space direction="vertical" size={2}>
                      <Text>{t('chargeCategories.emptyTitle')}</Text>
                      <Text type="secondary">
                        {direction === 'EXPENSE'
                          ? t('chargeCategories.emptyExpenseHint')
                          : t('chargeCategories.emptyRevenueHint')}
                      </Text>
                    </Space>
                  }
                >
                  <Button type="primary" onClick={() => setFormState({ open: true, category: undefined })}>
                    {t('chargeCategories.newCategory')}
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
        <ChargeCategoryFormModal
          open={formState.open}
          onClose={() => setFormState((s) => ({ ...s, open: false }))}
          category={formState.category}
          direction={direction}
        />
      </>
    );
  },
);
