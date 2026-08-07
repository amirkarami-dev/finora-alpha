import { useMemo, useState } from 'react';
import { App, Button, Card, Popconfirm, Segmented, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';
import { usePartners, useSetPartnerActive } from '@/services/queries';
import type { Partner } from '@/types';
import { PartnerFormModal } from './PartnerFormModal';

const { Text } = Typography;

export default function PartnersPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { data, isLoading } = usePartners();
  const setActive = useSetPartnerActive();
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [formState, setFormState] = useState<{ open: boolean; partner?: Partner }>({ open: false });

  const filtered = useMemo(
    () =>
      (data ?? []).filter((p) =>
        statusFilter === 'all' ? true : statusFilter === 'active' ? p.active : !p.active,
      ),
    [data, statusFilter],
  );

  const columns: ColumnsType<Partner> = [
    { title: t('partners.name'), dataIndex: 'name', render: (v) => <Text strong>{v}</Text> },
    {
      title: t('partners.code'),
      dataIndex: 'code',
      width: 160,
      render: (v) => <Tag style={{ fontFamily: 'monospace' }}>{v}</Tag>,
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
            onClick={() => setFormState({ open: true, partner: r })}
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
                message.success(next ? t('partners.activated') : t('partners.deactivated'));
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
        title={t('partners.title')}
        subtitle={t('partners.subtitle')}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormState({ open: true, partner: undefined })}>
            {t('partners.newPartner')}
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
        <Table<Partner>
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={filtered}
          scroll={{ x: 720 }}
          pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }}
        />
      </Card>
      <PartnerFormModal
        open={formState.open}
        onClose={() => setFormState((s) => ({ ...s, open: false }))}
        partner={formState.partner}
      />
    </div>
  );
}
