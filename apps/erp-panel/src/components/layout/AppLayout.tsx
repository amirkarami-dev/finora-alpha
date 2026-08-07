import { useEffect, useState } from 'react';
import { Drawer, Grid, Layout, theme } from 'antd';
import { Outlet, useLocation } from 'react-router-dom';
import { SidebarNav } from './SidebarNav';
import { AppHeader } from './AppHeader';
import { useUiStore } from '@/store/useUiStore';

const { Sider, Content } = Layout;
const { useBreakpoint } = Grid;

export function AppLayout() {
  const { token } = theme.useToken();
  const screens = useBreakpoint();
  const isMobile = !screens.lg;
  const location = useLocation();

  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const locale = useUiStore((s) => s.locale);
  const themeMode = useUiStore((s) => s.theme);
  const isRtl = locale === 'ar' || locale === 'fa';
  // The sidebar follows the theme: white rail in light, dark navy in dark.
  const siderBg = themeMode === 'dark' ? '#0d1626' : '#ffffff';

  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const handleMenuClick = () => {
    if (isMobile) setDrawerOpen(true);
    else toggleSidebar();
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {isMobile ? (
        <Drawer
          placement={isRtl ? 'right' : 'left'}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width={250}
          closable={false}
          styles={{ body: { padding: 0, background: siderBg } }}
          className="finora-drawer"
        >
          <div style={{ background: siderBg, height: '100%' }}>
            <SidebarNav onNavigate={() => setDrawerOpen(false)} />
          </div>
        </Drawer>
      ) : (
        <Sider
          collapsible
          collapsed={collapsed}
          trigger={null}
          width={252}
          collapsedWidth={80}
          style={{
            position: 'sticky',
            top: 0,
            height: '100vh',
            overflow: 'auto',
            insetInlineStart: 0,
            borderInlineEnd: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <SidebarNav collapsed={collapsed} />
        </Sider>
      )}

      <Layout style={{ background: token.colorBgLayout }}>
        <AppHeader onMenuClick={handleMenuClick} collapsed={collapsed} isMobile={isMobile} />
        <Content
          style={{
            padding: isMobile ? 16 : 24,
            maxWidth: 1480,
            width: '100%',
            margin: '0 auto',
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
