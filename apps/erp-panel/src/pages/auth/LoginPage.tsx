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
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Logo } from '@/components/common/Logo';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { useAuthStore } from '@/store/useAuthStore';
import { ROUTES } from '@/config/constants';
import { USERS } from '@/config/roles';

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
  const [form] = Form.useForm<LoginForm>();
  const screens = useBreakpoint();
  const { message } = App.useApp();
  const login = useAuthStore((s) => s.login);
  const [loading, setLoading] = useState(false);

  const isDesktop = screens.lg;

  const onFinish = async (values: LoginForm) => {
    setLoading(true);
    try {
      const user = await login(values.email, values.password);
      message.success(`${t('auth.loginSuccess')}, ${user.name}`);
      // Where to land is the server's answer, alongside the permissions it granted.
      navigate(useAuthStore.getState().home, { replace: true });
    } catch {
      message.error(t('auth.invalidCredentials'));
    } finally {
      setLoading(false);
    }
  };

  const fillAccount = (email: string, password: string) =>
    form.setFieldsValue({ email, password });

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
                  <CheckCircleFilled style={{ color: '#e0a36b', fontSize: 18 }} />
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
            form={form}
            layout="vertical"
            requiredMark={false}
            // Prefilled in development so a reload does not cost a retype. In production the
            // fields start empty — arriving at a public login page with a working password
            // already in the box defeats having a password at all.
            initialValues={
              import.meta.env.DEV
                ? { email: 'amir@finora.app', password: 'demo1234', remember: true }
                : { remember: true }
            }
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
              <a style={{ color: '#b87333' }}>{t('auth.forgot')}</a>
            </div>

            <Button type="primary" htmlType="submit" block loading={loading} style={{ height: 46 }}>
              {loading ? t('auth.signingIn') : t('auth.signIn')}
            </Button>
          </Form>

          {/* Development only. These are real, working credentials, and the server validates
              them — printing them on a public login page would hand anyone who visits
              erp.metal-uae.com a Manager session over the whole trading book. Vite evaluates
              import.meta.env.DEV at build time, so the production bundle contains neither this
              markup nor the passwords in USERS. */}
          {import.meta.env.DEV && (
          <>
          <Divider plain style={{ color: '#999', fontSize: 12 }}>
            {t('auth.demoAccounts')}
          </Divider>
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            {USERS.map((u) => (
              <button
                key={u.email}
                type="button"
                onClick={() => fillAccount(u.email, u.password)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  width: '100%',
                  gap: 12,
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: `1px solid ${'rgba(125,140,160,0.2)'}`,
                  background: 'transparent',
                  cursor: 'pointer',
                  font: 'inherit',
                }}
              >
                <Text strong style={{ fontSize: 12.5 }}>{t(`roles.${u.role}`)}</Text>
                <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>
                  {u.email} · {u.password}
                </Text>
              </button>
            ))}
          </Space>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
