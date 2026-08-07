import { Button, Dropdown, type MenuProps } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import { useUiStore } from '@/store/useUiStore';
import { LOCALES, SUPPORTED_LOCALES } from '@/config/constants';
import type { Locale } from '@/types';

interface Props {
  variant?: 'icon' | 'button';
  ghost?: boolean;
}

export function LanguageSwitcher({ variant = 'icon', ghost = false }: Props) {
  const locale = useUiStore((s) => s.locale);
  const setLocale = useUiStore((s) => s.setLocale);

  const items: MenuProps['items'] = SUPPORTED_LOCALES.map((code) => ({
    key: code,
    label: (
      <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', minWidth: 120 }}>
        <span style={{ fontSize: 16 }}>{LOCALES[code].flag}</span>
        <span>{LOCALES[code].label}</span>
      </span>
    ),
  }));

  return (
    <Dropdown
      menu={{
        items,
        selectable: true,
        selectedKeys: [locale],
        onClick: ({ key }) => setLocale(key as Locale),
      }}
      trigger={['click']}
      placement="bottomRight"
    >
      {variant === 'icon' ? (
        <Button
          type="text"
          shape="circle"
          icon={<GlobalOutlined />}
          style={{ color: ghost ? '#fff' : undefined }}
        />
      ) : (
        <Button icon={<GlobalOutlined />} ghost={ghost}>
          {LOCALES[locale].flag} {LOCALES[locale].label}
        </Button>
      )}
    </Dropdown>
  );
}
