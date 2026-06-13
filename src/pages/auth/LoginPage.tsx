import { useState } from 'react';
import {
  App,
  Button,
  Checkbox,
  Divider,
  Form,
  Grid,
  Input,
  Space,
  Typography,
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  LockOutlined,
  MailOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Logo } from '@/components/common/Logo';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { useAuthStore } from '@/store/useAuthStore';
import { ROUTES } from '@/config/constants';

const { Title, Paragraph, Text } = Typography;
const { useBreakpoint } = Grid;

interface LoginForm {
  email: string;
  password: string;
  remember: boolean;
}

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const screens = useBreakpoint();
  const { message } = App.useApp();
  const login = useAuthStore((s) => s.login);
  const [loading, setLoading] = useState(false);

  const from = (location.state as { from?: Location })?.from?.pathname ?? ROUTES.dashboard;
  const isDesktop = screens.lg;

  const onFinish = async (values: LoginForm) => {
    setLoading(true);
    try {
      const user = await login(values.email);
      message.success(`${t('auth.loginSuccess')}, ${user.name}`);
      navigate(from, { replace: true });
    } finally {
      setLoading(false);
    }
  };

  const valueProps = [
    t('landing.feature1Title'),
    t('landing.feature3Title'),
    t('landing.feature6Title'),
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex' }}>
      {/* ---------------- Aside ---------------- */}
      {isDesktop && (
        <div
          className="auth-aside"
          style={{ flex: '0 0 46%', padding: 48, display: 'flex', flexDirection: 'column' }}
        >
          <Logo color="#fff" />
          <div style={{ margin: 'auto 0', maxWidth: 440 }}>
            <Title style={{ color: '#fff', fontSize: 40, fontWeight: 800, lineHeight: 1.1 }}>
              {t('landing.heroTitle')}
            </Title>
            <Paragraph style={{ color: 'rgba(234,244,240,0.78)', fontSize: 17, marginTop: 16 }}>
              {t('app.description')}
            </Paragraph>
            <Space direction="vertical" size={14} style={{ marginTop: 28 }}>
              {valueProps.map((v) => (
                <Space key={v} size={12}>
                  <CheckCircleFilled style={{ color: '#2ee6b6', fontSize: 18 }} />
                  <Text style={{ color: '#eaf4f0', fontSize: 15 }}>{v}</Text>
                </Space>
              ))}
            </Space>
          </div>
          <Text style={{ color: 'rgba(234,244,240,0.5)', fontSize: 13 }}>
            © {new Date().getFullYear()} Finora
          </Text>
        </div>
      )}

      {/* ---------------- Form ---------------- */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: screens.md ? 40 : 24,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(ROUTES.landing)}>
            {t('auth.backToHome')}
          </Button>
          <Space>
            <LanguageSwitcher />
            <ThemeToggle />
          </Space>
        </div>

        <div style={{ margin: 'auto', width: '100%', maxWidth: 400 }}>
          {!isDesktop && (
            <div style={{ marginBottom: 24 }}>
              <Logo size={36} />
            </div>
          )}
          <Title level={2} style={{ marginBottom: 4, fontWeight: 800 }}>
            {t('auth.loginTitle')}
          </Title>
          <Paragraph type="secondary" style={{ fontSize: 15 }}>
            {t('auth.loginSubtitle')}
          </Paragraph>

          <Form<LoginForm>
            layout="vertical"
            requiredMark={false}
            initialValues={{ email: 'amir@finora.app', password: 'demo1234', remember: true }}
            onFinish={onFinish}
            style={{ marginTop: 20 }}
            size="large"
          >
            <Form.Item
              name="email"
              label={t('auth.email')}
              rules={[{ required: true, type: 'email' }]}
            >
              <Input prefix={<MailOutlined />} placeholder={t('auth.emailPlaceholder')} />
            </Form.Item>
            <Form.Item
              name="password"
              label={t('auth.password')}
              rules={[{ required: true, min: 4 }]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder={t('auth.passwordPlaceholder')} />
            </Form.Item>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <Form.Item name="remember" valuePropName="checked" noStyle>
                <Checkbox>{t('auth.remember')}</Checkbox>
              </Form.Item>
              <a style={{ color: '#10a37f' }}>{t('auth.forgot')}</a>
            </div>

            <Button type="primary" htmlType="submit" block loading={loading} style={{ height: 46 }}>
              {loading ? t('auth.signingIn') : t('auth.signIn')}
            </Button>
          </Form>

          <Divider plain style={{ color: '#999', fontSize: 12 }}>
            {t('auth.demoHint')}
          </Divider>
        </div>
      </div>
    </div>
  );
}
