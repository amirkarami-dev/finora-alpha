import { useMemo, useState } from 'react';
import { App, Button, Card, Popconfirm, Segmented, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';
import { useCostCentres, useSetCostCentreActive } from '@/services/queries';
import type { CostCentre } from '@/types';
import { CostCentreFormModal } from './CostCentreFormModal';

const { Text } = Typography;

export default function CostCentresPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { data, isLoading } = useCostCentres();
  const setActive = useSetCostCentreActive();
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [formState, setFormState] = useState<{ open: boolean; costCentre?: CostCentre }>({ open: false });

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
                await setActive.mutateAsync({ id: r.id, active: !r.active });
                message.success(r.active ? t('costCentres.deactivated') : t('costCentres.activated'));
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
    <div className="fade-in">
      <PageHeader
        title={t('costCentres.title')}
        subtitle={t('costCentres.subtitle')}
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setFormState({ open: true, costCentre: undefined })}
          >
            {t('costCentres.newCostCentre')}
          </Button>
        }
      />
      <Card variant="borderless" styles={{ body: { padding: 16 } }}>
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
        />
      </Card>
      <CostCentreFormModal
        open={formState.open}
        onClose={() => setFormState((s) => ({ ...s, open: false }))}
        costCentre={formState.costCentre}
      />
    </div>
  );
}
