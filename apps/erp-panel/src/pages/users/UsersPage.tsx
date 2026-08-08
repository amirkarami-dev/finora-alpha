import { useMemo, useState } from 'react';
import { App, Avatar, Button, Card, Input, Popconfirm, Segmented, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined, KeyOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';
import { useSetUserActive, useUsers } from '@/services/queries';
import { useAuthStore } from '@/store/useAuthStore';
import { formatDate } from '@/utils/format';
import type { User } from '@/types';
import { UserFormModal } from './UserFormModal';
import { PasswordModal } from './PasswordModal';

const { Text } = Typography;

export default function UsersPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { data, isLoading } = useUsers();
  const setActive = useSetUserActive();
  const currentUserId = useAuthStore((s) => s.user?.id);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [formState, setFormState] = useState<{ open: boolean; user?: User }>({ open: false });
  const [passwordFor, setPasswordFor] = useState<User | undefined>();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((u) => {
      const matchesStatus = statusFilter === 'all' ? true : statusFilter === 'active' ? u.active : !u.active;
      const matchesQ = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      return matchesStatus && matchesQ;
    });
  }, [data, search, statusFilter]);

  const columns: ColumnsType<User> = [
    {
      title: t('users.name'),
      dataIndex: 'name',
      // Widths on purpose. Without them the avatar and the "You" tag squeeze the text column
      // until a name breaks mid-word ("Amir Kara / mi") on any window narrower than a desk
      // monitor; the table scrolls horizontally instead.
      width: 260,
      render: (v: string, r) => (
        <Space>
          <Avatar size="small" style={{ backgroundColor: r.avatarColor }}>
            {v.slice(0, 1).toUpperCase()}
          </Avatar>
          <Text strong style={{ whiteSpace: 'nowrap' }}>{v}</Text>
          {r.id === currentUserId && <Tag color="processing">{t('users.you')}</Tag>}
        </Space>
      ),
    },
    {
      title: t('users.email'),
      dataIndex: 'email',
      width: 240,
      ellipsis: true,
      render: (v: string) => <Text type="secondary">{v}</Text>,
    },
    {
      title: t('users.role'),
      dataIndex: 'role',
      width: 160,
      // The same `roles.*` block the header and login page use, so a role is spelled one way
      // everywhere in the app.
      render: (v: User['role']) => <Tag>{t(`roles.${v}`)}</Tag>,
    },
    {
      title: t('users.lastLogin'),
      dataIndex: 'lastLoginAt',
      width: 150,
      render: (v: string | null) =>
        v ? formatDate(v) : <Text type="secondary">{t('users.never')}</Text>,
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
      width: 280,
      align: 'right',
      render: (_, r) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => setFormState({ open: true, user: r })}
          >
            {t('common.edit')}
          </Button>
          <Button type="link" size="small" icon={<KeyOutlined />} onClick={() => setPasswordFor(r)}>
            {t('users.resetPassword')}
          </Button>
          {/* Your own row cannot be deactivated — the server refuses it, and a button that
              always fails is worse than one that is not there. */}
          {r.id === currentUserId ? (
            <Tooltip title={t('users.cannotDeactivateSelf')}>
              <Button type="link" size="small" disabled>
                {t('common.deactivate')}
              </Button>
            </Tooltip>
          ) : (
            <Popconfirm
              title={r.active ? t('users.deactivateConfirm') : t('common.activateConfirm')}
              okText={t('common.yes')}
              cancelText={t('common.no')}
              onConfirm={async () => {
                try {
                  const next = !r.active;
                  await setActive.mutateAsync({ id: r.id, active: next });
                  message.success(next ? t('users.activated') : t('users.deactivated'));
                } catch {
                  message.error(t('common.saveFailed'));
                }
              }}
            >
              <Button type="link" size="small" danger={r.active}>
                {r.active ? t('common.deactivate') : t('common.activate')}
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="fade-in">
      <PageHeader
        title={t('users.title')}
        subtitle={t('users.subtitle')}
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setFormState({ open: true, user: undefined })}
          >
            {t('users.newUser')}
          </Button>
        }
      />
      <Card variant="borderless" styles={{ body: { padding: 16 } }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 16,
          }}
        >
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder={t('users.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 300 }}
          />
          <Space wrap>
            <Segmented
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as 'active' | 'inactive' | 'all')}
              options={[
                { label: t('common.active'), value: 'active' },
                { label: t('common.inactive'), value: 'inactive' },
                { label: t('common.all'), value: 'all' },
              ]}
            />
          </Space>
        </div>
        <Table<User>
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={filtered}
          scroll={{ x: 1120 }}
          pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }}
          locale={{ emptyText: t('common.noFilterResults') }}
        />
      </Card>

      <UserFormModal
        open={formState.open}
        onClose={() => setFormState((s) => ({ ...s, open: false }))}
        user={formState.user}
        isSelf={formState.user?.id === currentUserId}
      />
      <PasswordModal user={passwordFor} onClose={() => setPasswordFor(undefined)} />
    </div>
  );
}
