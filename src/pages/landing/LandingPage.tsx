import { Button, Col, Grid, Row, Space, Typography } from 'antd';
import {
  ArrowRightOutlined,
  BgColorsOutlined,
  ContainerOutlined,
  DollarOutlined,
  GlobalOutlined,
  LineChartOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Logo } from '@/components/common/Logo';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { useAuthStore } from '@/store/useAuthStore';
import { ROUTES, APP_NAME } from '@/config/constants';
import { HeroPreview } from './HeroPreview';

const { Title, Paragraph, Text } = Typography;
const { useBreakpoint } = Grid;

export default function LandingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const screens = useBreakpoint();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isMobile = !screens.md;

  const goToApp = () => navigate(isAuthenticated ? ROUTES.dashboard : ROUTES.login);

  const features = [
    { icon: <DollarOutlined />, key: 'feature1' },
    { icon: <ContainerOutlined />, key: 'feature2' },
    { icon: <SafetyCertificateOutlined />, key: 'feature3' },
    { icon: <LineChartOutlined />, key: 'feature4' },
    { icon: <BgColorsOutlined />, key: 'feature5' },
    { icon: <GlobalOutlined />, key: 'feature6' },
  ];

  const stats = [
    { value: '1,240+', label: t('landing.statContracts') },
    { value: '86,500', label: t('landing.statVolume') },
    { value: '$9.9M', label: t('landing.statCollected') },
  ];

  return (
    <div className="landing">
      {/* ---------------- Nav ---------------- */}
      <header className="landing-hero" style={{ paddingBottom: 0 }}>
        <nav
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Logo color="#fff" />
          <Space size={isMobile ? 4 : 18} align="center">
            {!isMobile && (
              <Space size={26}>
                <a href="#features" style={{ color: 'rgba(255,255,255,0.82)' }}>
                  {t('landing.navFeatures')}
                </a>
                <a href="#cta" style={{ color: 'rgba(255,255,255,0.82)' }}>
                  {t('landing.navSolutions')}
                </a>
              </Space>
            )}
            <LanguageSwitcher ghost />
            <ThemeToggle ghost />
            {!isMobile && (
              <Button ghost onClick={() => navigate(ROUTES.login)}>
                {t('landing.signIn')}
              </Button>
            )}
            <Button type="primary" onClick={goToApp}>
              {isAuthenticated ? t('landing.openApp') : t('landing.getStarted')}
            </Button>
          </Space>
        </nav>

        {/* ---------------- Hero ---------------- */}
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding: isMobile ? '32px 24px 80px' : '64px 24px 120px',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <Row gutter={[48, 48]} align="middle">
            <Col xs={24} lg={12}>
              <span
                className="glass"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 14px',
                  borderRadius: 999,
                  fontSize: 13,
                  color: '#f3dcc4',
                  marginBottom: 22,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: '#e0a36b',
                    boxShadow: '0 0 10px #e0a36b',
                  }}
                />
                {t('landing.heroBadge')}
              </span>
              <Title
                style={{
                  color: '#fff',
                  fontSize: isMobile ? 38 : 56,
                  lineHeight: 1.05,
                  fontWeight: 800,
                  margin: '0 0 20px',
                  letterSpacing: -1,
                }}
              >
                {t('landing.heroTitle').split(' ').slice(0, -2).join(' ')}{' '}
                <span className="gradient-text">
                  {t('landing.heroTitle').split(' ').slice(-2).join(' ')}
                </span>
              </Title>
              <Paragraph
                style={{
                  color: 'rgba(234,244,240,0.78)',
                  fontSize: 18,
                  maxWidth: 540,
                  marginBottom: 32,
                }}
              >
                {t('landing.heroSubtitle')}
              </Paragraph>
              <Space size={14} wrap>
                <Button type="primary" size="large" onClick={goToApp} style={{ height: 50, paddingInline: 28 }}>
                  {t('landing.heroCtaPrimary')} <ArrowRightOutlined />
                </Button>
                <Button
                  ghost
                  size="large"
                  href="#features"
                  style={{ height: 50, paddingInline: 28 }}
                >
                  {t('landing.heroCtaSecondary')}
                </Button>
              </Space>

              <div style={{ display: 'flex', gap: 36, marginTop: 48, flexWrap: 'wrap' }}>
                {stats.map((s) => (
                  <div key={s.label}>
                    <div style={{ color: '#fff', fontSize: 26, fontWeight: 800 }}>{s.value}</div>
                    <div style={{ color: 'rgba(234,244,240,0.6)', fontSize: 13 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </Col>

            <Col xs={24} lg={12}>
              <HeroPreview />
            </Col>
          </Row>
        </div>
      </header>

      {/* ---------------- Features ---------------- */}
      <section
        id="features"
        style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '64px 24px' : '96px 24px' }}
      >
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <Text style={{ color: '#b87333', fontWeight: 700, letterSpacing: 1 }}>
            {t('landing.navFeatures').toUpperCase()}
          </Text>
          <Title level={2} style={{ fontSize: isMobile ? 30 : 40, fontWeight: 800, margin: '12px 0 10px' }}>
            {t('landing.featuresTitle')}
          </Title>
          <Paragraph style={{ fontSize: 17, opacity: 0.7, maxWidth: 600, margin: '0 auto' }}>
            {t('landing.featuresSubtitle')}
          </Paragraph>
        </div>

        <Row gutter={[24, 24]} className="stagger">
          {features.map((f) => (
            <Col xs={24} sm={12} lg={8} key={f.key}>
              <div
                className="soft-card"
                style={{
                  height: '100%',
                  padding: 28,
                  borderRadius: 16,
                  border: '1px solid rgba(125,140,160,0.16)',
                  background: 'rgba(125,140,160,0.04)',
                }}
              >
                <div className="feature-icon">{f.icon}</div>
                <Title level={4} style={{ margin: '18px 0 8px', fontWeight: 700 }}>
                  {t(`landing.${f.key}Title`)}
                </Title>
                <Paragraph style={{ opacity: 0.72, margin: 0, fontSize: 15 }}>
                  {t(`landing.${f.key}Desc`)}
                </Paragraph>
              </div>
            </Col>
          ))}
        </Row>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section id="cta" style={{ padding: isMobile ? '0 24px 64px' : '0 24px 96px' }}>
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            borderRadius: 28,
            padding: isMobile ? '48px 28px' : '72px 64px',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
            background:
              'radial-gradient(800px 400px at 70% -20%, rgba(224,163,107,0.35), transparent 60%), linear-gradient(135deg, #2a160a, #43260f)',
          }}
        >
          <Title style={{ color: '#fff', fontSize: isMobile ? 28 : 42, fontWeight: 800, margin: 0 }}>
            {t('landing.ctaTitle')}
          </Title>
          <Paragraph
            style={{ color: 'rgba(234,244,240,0.8)', fontSize: 18, margin: '16px auto 32px', maxWidth: 560 }}
          >
            {t('landing.ctaSubtitle')}
          </Paragraph>
          <Button type="primary" size="large" onClick={goToApp} style={{ height: 52, paddingInline: 36 }}>
            {t('landing.ctaButton')} <ArrowRightOutlined />
          </Button>
        </div>
      </section>

      {/* ---------------- Footer ---------------- */}
      <footer style={{ borderTop: '1px solid rgba(125,140,160,0.16)' }}>
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding: '32px 24px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Logo />
          <Text style={{ opacity: 0.6, fontSize: 13 }}>
            © {new Date().getFullYear()} {APP_NAME}. {t('landing.footerRights')}
          </Text>
          <Space size={20} wrap>
            <a href="#features" style={{ opacity: 0.7 }}>
              {t('landing.footerPrivacy')}
            </a>
            <a href="#features" style={{ opacity: 0.7 }}>
              {t('landing.footerTerms')}
            </a>
            <a href="#features" style={{ opacity: 0.7 }}>
              {t('landing.footerAbout')}
            </a>
          </Space>
        </div>
      </footer>
    </div>
  );
}
