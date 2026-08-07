import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { App, Button, Empty, Input, Popconfirm, Segmented, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined, SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useGoods, useSetGoodActive } from '@/services/queries';
import type { Good } from '@/types';
import { GoodFormModal } from './GoodFormModal';

const { Text } = Typography;

export interface GoodsTabHandle {
  openCreate: () => void;
}

/** Goods master (BaseInfo → Goods). Copies `CostCentresTab` — status Segmented, imperative
 *  `openCreate` for the page header's New button, deactivate rather than delete — and adds a
 *  search box, since a goods list grows far longer than a cost-centre list. */
export const GoodsTab = forwardRef<GoodsTabHandle>(function GoodsTab(_props, ref) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { data, isLoading } = useGoods();
  const setActive = useSetGoodActive();
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [search, setSearch] = useState('');
  const [formState, setFormState] = useState<{ open: boolean; good?: Good }>({ open: false });

  useImperativeHandle(ref, () => ({
    openCreate: () => setFormState({ open: true, good: undefined }),
  }));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? [])
      .filter((g) => (statusFilter === 'all' ? true : statusFilter === 'active' ? g.active : !g.active))
      .filter((g) =>
        q ? g.name.toLowerCase().includes(q) || g.code.toLowerCase().includes(q) : true,
      );
  }, [data, statusFilter, search]);

  const columns: ColumnsType<Good> = [
    { title: t('goods.name'), dataIndex: 'name', render: (v) => <Text strong>{v}</Text> },
    {
      title: t('goods.code'),
      dataIndex: 'code',
      width: 130,
      render: (v) => <Tag style={{ fontFamily: 'monospace' }}>{v}</Tag>,
    },
    {
      title: t('goods.metalType'),
      dataIndex: 'metalType',
      width: 130,
      render: (v: Good['metalType']) => t(`metalTypes.${v}`),
    },
    {
      title: t('goods.form'),
      dataIndex: 'form',
      width: 120,
      render: (v: Good['form']) => (v ? t(`goodForms.${v}`) : <Text type="secondary">—</Text>),
    },
    { title: t('goods.unit'), dataIndex: 'unit', width: 80, align: 'center' },
    {
      title: t('goods.hsCode'),
      dataIndex: 'hsCode',
      width: 120,
      // Customs codes are Latin digits and dots: keep them LTR so they don't reorder in ar/fa.
      render: (v?: string) =>
        v ? (
          <span dir="ltr" style={{ fontFamily: 'monospace' }}>
            {v}
          </span>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
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
            onClick={() => setFormState({ open: true, good: r })}
          >
            {t('common.edit')}
          </Button>
          <Popconfirm
            title={r.active ? t('goods.deactivateConfirm') : t('common.activateConfirm')}
            okText={t('common.yes')}
            cancelText={t('common.no')}
            onConfirm={async () => {
              try {
                // Capture the INTENDED next state before awaiting: the mock API mutates the
                // record in place, so a post-await `r.active` already reads the flipped value
                // and the toast would announce the opposite of what just happened.
                const next = !r.active;
                await setActive.mutateAsync({ id: r.id, active: next });
                message.success(next ? t('goods.activated') : t('goods.deactivated'));
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
      <Space style={{ marginBottom: 16 }} wrap>
        <Segmented
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as 'active' | 'inactive' | 'all')}
          options={[
            { label: t('common.active'), value: 'active' },
            { label: t('common.inactive'), value: 'inactive' },
            { label: t('common.all'), value: 'all' },
          ]}
        />
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder={t('goods.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 260 }}
        />
      </Space>
      <Table<Good>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={filtered}
        scroll={{ x: 1000 }}
        pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }}
        locale={{
          // An entirely empty master gets an explanation plus the create action; a filter or
          // search that emptied the view gets the other message.
          emptyText:
            (data ?? []).length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <Space direction="vertical" size={2}>
                    <Text>{t('goods.emptyTitle')}</Text>
                    <Text type="secondary">{t('goods.emptyHint')}</Text>
                  </Space>
                }
              >
                <Button type="primary" onClick={() => setFormState({ open: true, good: undefined })}>
                  {t('goods.newGood')}
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
      <GoodFormModal
        open={formState.open}
        onClose={() => setFormState((s) => ({ ...s, open: false }))}
        good={formState.good}
      />
    </>
  );
});
