import { Button, Tooltip } from 'antd';
import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { useUiStore } from '@/store/useUiStore';

export function ThemeToggle({ ghost = false }: { ghost?: boolean }) {
  const theme = useUiStore((s) => s.theme);
  const toggle = useUiStore((s) => s.toggleTheme);
  const isDark = theme === 'dark';

  return (
    <Tooltip title={isDark ? 'Light mode' : 'Dark mode'}>
      <Button
        type="text"
        shape="circle"
        onClick={toggle}
        icon={isDark ? <SunOutlined /> : <MoonOutlined />}
        style={{ color: ghost ? '#fff' : undefined }}
      />
    </Tooltip>
  );
}
