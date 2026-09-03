import type { ReactNode } from 'react';
import { Button, Space, Typography, theme } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useUiStore, isRtl as isRtlLocale } from '@/store/useUiStore';

const { Title, Text } = Typography;

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  extra?: ReactNode;
  onBack?: boolean | (() => void);
}

export function PageHeader({ title, subtitle, extra, onBack }: PageHeaderProps) {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const locale = useUiStore((s) => s.locale);
  const isRtl = isRtlLocale(locale);

  const handleBack = () => {
    if (typeof onBack === 'function') onBack();
    else navigate(-1);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 20,
      }}
    >
      <Space align="start" size={12}>
        {onBack && (
          <Button
            shape="circle"
            icon={<ArrowLeftOutlined rotate={isRtl ? 180 : 0} />}
            onClick={handleBack}
            style={{ marginTop: 4 }}
          />
        )}
        <div>
          <Title level={3} style={{ margin: 0, fontWeight: 700 }}>
            {title}
          </Title>
          {subtitle && (
            <Text style={{ color: token.colorTextSecondary, fontSize: 14 }}>{subtitle}</Text>
          )}
        </div>
      </Space>
      {extra && <Space wrap>{extra}</Space>}
    </div>
  );
}
