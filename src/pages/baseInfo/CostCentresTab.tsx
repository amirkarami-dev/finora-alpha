import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { App, Button, Empty, Popconfirm, Segmented, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useCostCentres, useSetCostCentreActive } from '@/services/queries';
import type { CostCentre } from '@/types';
import { CostCentreFormModal } from './CostCentreFormModal';

const { Text } = Typography;

/** BaseInfoPage's per-tab PageHeader "New" button (design spec §6) needs to open this tab's
 *  create modal without lifting the modal's state up to the parent — an imperative handle
 *  keeps the tab self-contained, matching how CostCentresPage owned its own modal state. */
export interface CostCentresTabHandle {
  openCreate: () => void;
}

/** Body of the former `costCentres/CostCentresPage.tsx` (design spec §6), minus its
 *  `PageHeader` — BaseInfoPage supplies the shared header and tab shell. */
export const CostCentresTab = forwardRef<CostCentresTabHandle>(function CostCentresTab(_props, ref) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { data, isLoading } = useCostCentres();
  const setActive = useSetCostCentreActive();
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [formState, setFormState] = useState<{ open: boolean; costCentre?: CostCentre }>({ open: false });

  useImperativeHandle(ref, () => ({
    openCreate: () => setFormState({ open: true, costCentre: undefined }),
  }));

  const filtered = useMemo(
    () =>
      (data ?? []).filter((c) =>
        statusFilter === 'all' ? true : statusFilter === 'active' ? c.active : !c.active,
      ),
    [data, statusFilter],
  );

  const columns: ColumnsType<CostCentre> = [
    { title: t('costCentres.name'), dataIndex: 'name', render: (v) => <Text strong>{v}</Text> },
    {
      title: t('costCentres.code'),
      dataIndex: 'code',
      width: 140,
      render: (v) => <Tag style={{ fontFamily: 'monospace' }}>{v}</Tag>,
    },
    {
      title: t('costCentres.description'),
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
            onClick={() => setFormState({ open: true, costCentre: r })}
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
                message.success(next ? t('costCentres.activated') : t('costCentres.deactivated'));
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
      <Table<CostCentre>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={filtered}
        scroll={{ x: 760 }}
        pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }}
        locale={{
          // Empty-start sweep (spec §10.11) — the `ChargeCategoriesTab` precedent: an entirely
          // empty master gets an explanation plus the create action; a Segmented that filtered
          // everything out gets the other message.
          emptyText:
            (data ?? []).length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <Space direction="vertical" size={2}>
                    <Text>{t('costCentres.emptyTitle')}</Text>
                    <Text type="secondary">{t('costCentres.emptyHint')}</Text>
                  </Space>
                }
              >
                <Button type="primary" onClick={() => setFormState({ open: true, costCentre: undefined })}>
                  {t('costCentres.newCostCentre')}
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
      <CostCentreFormModal
        open={formState.open}
        onClose={() => setFormState((s) => ({ ...s, open: false }))}
        costCentre={formState.costCentre}
      />
    </>
  );
});
