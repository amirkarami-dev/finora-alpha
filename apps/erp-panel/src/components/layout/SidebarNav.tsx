import { type ReactNode } from 'react';
import { Menu, type MenuProps } from 'antd';
import {
  AccountBookOutlined,
  ApartmentOutlined,
  AppstoreOutlined,
  BarChartOutlined,
  ContainerOutlined,
  CreditCardOutlined,
  CrownOutlined,
  DatabaseOutlined,
  CodeOutlined,
  ExceptionOutlined,
  LineChartOutlined,
  SwapOutlined,
  FileTextOutlined,
  GoldOutlined,
  RiseOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  TagsOutlined,
  TeamOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Logo } from '@/components/common/Logo';
import { useUiStore } from '@/store/useUiStore';
import { useAuthStore } from '@/store/useAuthStore';
import { NAV_ITEMS, type NavGroup } from '@/config/roles';

interface Props {
  collapsed?: boolean;
  onNavigate?: () => void;
}

const ICONS: Record<string, ReactNode> = {
  apartment: <ApartmentOutlined />,
  crown: <CrownOutlined />,
  appstore: <AppstoreOutlined />,
  wallet: <WalletOutlined />,
  team: <TeamOutlined />,
  filetext: <FileTextOutlined />,
  container: <ContainerOutlined />,
  creditcard: <CreditCardOutlined />,
  barchart: <BarChartOutlined />,
  setting: <SettingOutlined />,
  shoppingcart: <ShoppingCartOutlined />,
  tags: <TagsOutlined />,
  gold: <GoldOutlined />,
  database: <DatabaseOutlined />,
  accountbook: <AccountBookOutlined />,
  rise: <RiseOutlined />,
  exception: <ExceptionOutlined />,
  swap: <SwapOutlined />,
  linechart: <LineChartOutlined />,
  code: <CodeOutlined />,
};

const GROUP_ORDER: NavGroup[] = ['main', 'operations', 'finance', 'system'];
const GROUP_LABEL: Record<NavGroup, string> = {
  main: 'nav.main',
  operations: 'nav.operations',
  finance: 'nav.finance',
  system: 'nav.system',
};

export function SidebarNav({ collapsed = false, onNavigate }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const themeMode = useUiStore((s) => s.theme);
  const isDark = themeMode === 'dark';
  // What the server granted this session, not what a table in the bundle says. The two
  // agreed by construction until now; only one of them is authoritative.
  const allowed = useAuthStore((s) => s.permissions);

  const visible = NAV_ITEMS.filter((i) => allowed.includes(i.key));

  const items: MenuProps['items'] = GROUP_ORDER.map((group) => {
    const children = visible
      .filter((i) => i.group === group)
      .map((i) => ({ key: i.route, icon: ICONS[i.icon], label: t(`nav.${i.key}`) }));
    if (children.length === 0) return null;
    return { key: `grp-${group}`, type: 'group' as const, label: t(GROUP_LABEL[group]), children };
  }).filter(Boolean) as MenuProps['items'];

  const navPaths = visible.map((i) => i.route);
  // Longest matching prefix wins, so `/app/invoices/purchase` beats a shorter sibling.
  //
  // No `?? navPaths[0]` fallback: a detail route that matches nothing — `/app/invoices/:id`,
  // whose nav entries are `/app/invoices/purchase` and `/app/invoices/sale`, so neither is a
  // prefix of `/app/invoices/inv-po-0001` — used to fall back to the FIRST nav item and light
  // up Dashboard. Highlighting the wrong page is worse than highlighting none.
  const selectedKey = navPaths
    .filter((p) => location.pathname.startsWith(p))
    .sort((a, b) => b.length - a.length)[0];

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
        <Logo size={30} showText={!collapsed} color={isDark ? '#fff' : undefined} />
      </div>
      <Menu
        mode="inline"
        theme={isDark ? 'dark' : 'light'}
        items={items}
        selectedKeys={selectedKey ? [selectedKey] : []}
        style={{ border: 'none', background: 'transparent', flex: 1, paddingBottom: 16 }}
        onClick={({ key }) => {
          navigate(key);
          onNavigate?.();
        }}
      />
    </div>
  );
}
