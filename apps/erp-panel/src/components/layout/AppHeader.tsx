import { Avatar, Badge, Button, Dropdown, Input, Layout, Space, type MenuProps, theme } from 'antd';
import {
  BellOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SearchOutlined,
  SettingOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { useAuthStore } from '@/store/useAuthStore';
import { ROUTES } from '@/config/constants';
import { normalizeRole } from '@/config/roles';
import { initials } from '@/utils/format';

const { Header } = Layout;

interface Props {
  onMenuClick: () => void;
  collapsed: boolean;
  isMobile: boolean;
}

export function AppHeader({ onMenuClick, collapsed, isMobile }: Props) {
  const { token } = theme.useToken();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const userMenu: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: user?.name ?? t('auth.profile'),
      disabled: true,
    },
    { type: 'divider' },
    { key: 'settings', icon: <SettingOutlined />, label: t('nav.settings') },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: t('auth.signOut'),
      danger: true,
    },
  ];

  const onUserMenu: MenuProps['onClick'] = ({ key }) => {
    if (key === 'settings') navigate(ROUTES.settings);
    if (key === 'logout') {
      logout();
      navigate(ROUTES.login);
    }
  };

  return (
    <Header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        paddingInline: 16,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorBgContainer,
      }}
    >
      <Button
        type="text"
        onClick={onMenuClick}
        icon={collapsed || isMobile ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
      />

      <Input
        allowClear
        prefix={<SearchOutlined style={{ color: token.colorTextTertiary }} />}
        placeholder={t('common.searchPlaceholder')}
        className="hide-mobile"
        style={{ maxWidth: 380, borderRadius: 10 }}
      />

      <div style={{ flex: 1 }} />

      <Space size={4} align="center">
        <Button
          type="text"
          shape="circle"
          icon={<SearchOutlined />}
          className="only-mobile"
          aria-label={t('common.search')}
        />
        <LanguageSwitcher />
        <ThemeToggle />
        <Badge count={4} size="small" offset={[-2, 4]}>
          <Button type="text" shape="circle" icon={<BellOutlined />} />
        </Badge>
        <Dropdown
          menu={{ items: userMenu, onClick: onUserMenu }}
          trigger={['click']}
          placement="bottomRight"
        >
          <Space style={{ cursor: 'pointer', paddingInline: 6 }}>
            <Avatar
              style={{ background: user?.avatarColor ?? token.colorPrimary, fontWeight: 600 }}
              size={34}
            >
              {user ? initials(user.name) : <UserOutlined />}
            </Avatar>
            <span className="hide-mobile" style={{ lineHeight: 1.2 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{user?.name}</div>
              <div style={{ fontSize: 11, color: token.colorTextTertiary }}>
                {user ? t(`roles.${normalizeRole(user.role)}`) : ''}
              </div>
            </span>
          </Space>
        </Dropdown>
      </Space>
    </Header>
  );
}
