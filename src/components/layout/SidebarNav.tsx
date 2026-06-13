import { Menu, type MenuProps } from 'antd';
import {
  AppstoreOutlined,
  BarChartOutlined,
  ContainerOutlined,
  CreditCardOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ROUTES } from '@/config/constants';
import { Logo } from '@/components/common/Logo';

interface Props {
  collapsed?: boolean;
  onNavigate?: () => void;
}

export function SidebarNav({ collapsed = false, onNavigate }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const items: MenuProps['items'] = [
    {
      key: 'grp-main',
      type: 'group',
      label: t('nav.main'),
      children: [{ key: ROUTES.dashboard, icon: <AppstoreOutlined />, label: t('nav.dashboard') }],
    },
    {
      key: 'grp-ops',
      type: 'group',
      label: t('nav.operations'),
      children: [
        { key: ROUTES.customers, icon: <TeamOutlined />, label: t('nav.customers') },
        { key: ROUTES.contracts, icon: <FileTextOutlined />, label: t('nav.contracts') },
        { key: ROUTES.containers, icon: <ContainerOutlined />, label: t('nav.containers') },
      ],
    },
    {
      key: 'grp-fin',
      type: 'group',
      label: t('nav.finance'),
      children: [
        { key: ROUTES.invoices, icon: <FileDoneOutlined />, label: t('nav.invoices') },
        { key: ROUTES.payments, icon: <CreditCardOutlined />, label: t('nav.payments') },
        { key: ROUTES.reports, icon: <BarChartOutlined />, label: t('nav.reports') },
      ],
    },
    {
      key: 'grp-sys',
      type: 'group',
      label: t('nav.system'),
      children: [{ key: ROUTES.settings, icon: <SettingOutlined />, label: t('nav.settings') }],
    },
  ];

  // Highlight the closest matching route (handles detail pages like /customers/:id).
  const selectedKey =
    [
      ROUTES.dashboard,
      ROUTES.customers,
      ROUTES.contracts,
      ROUTES.containers,
      ROUTES.invoices,
      ROUTES.payments,
      ROUTES.reports,
      ROUTES.settings,
    ]
      .filter((p) => location.pathname.startsWith(p))
      .sort((a, b) => b.length - a.length)[0] ?? ROUTES.dashboard;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          paddingInline: collapsed ? 0 : 20,
          flexShrink: 0,
        }}
      >
        <Logo size={30} showText={!collapsed} color="#fff" />
      </div>
      <Menu
        mode="inline"
        theme="dark"
        items={items}
        selectedKeys={[selectedKey]}
        style={{ border: 'none', background: 'transparent', flex: 1, paddingBottom: 16 }}
        onClick={({ key }) => {
          navigate(key);
          onNavigate?.();
        }}
      />
    </div>
  );
}
