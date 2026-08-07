import {
  App,
  Button,
  Card,
  Col,
  Divider,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Segmented,
  Select,
  Space,
  Typography,
} from 'antd';
import { BgColorsOutlined, GlobalOutlined, MoonOutlined, SaveOutlined, SunOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';
import { useUiStore } from '@/store/useUiStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { CURRENCIES, LOCALES, SUPPORTED_LOCALES } from '@/config/constants';
import type { Currency, Locale } from '@/types';
import * as api from '@/services/api';

const { Text, Title } = Typography;

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Row align="middle" justify="space-between" gutter={[16, 12]} style={{ padding: '14px 0' }}>
      <Col xs={24} sm={14}>
        <div style={{ fontWeight: 600 }}>{title}</div>
        {description && <Text type="secondary" style={{ fontSize: 13 }}>{description}</Text>}
      </Col>
      <Col xs={24} sm={10} style={{ textAlign: 'end' }}>
        {children}
      </Col>
    </Row>
  );
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();

  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const locale = useUiStore((s) => s.locale);
  const setLocale = useUiStore((s) => s.setLocale);

  const {
    baseCurrency,
    fxRate,
    fxRateIqd,
    companyName,
    setBaseCurrency,
    setFxRate,
    setFxRateIqd,
    setCompanyName,
  } = useSettingsStore();

  const save = () => message.success(t('settings.saved'));

  // Both live behind the api.ts seam so this page never reaches into @/mock directly — an
  // eslint rule enforces that, because it is the one import that would survive the switch to
  // a real backend and quietly keep writing to localStorage.
  const resetData = () => api.resetData();
  const loadSampleData = () => api.loadSampleData();

  return (
    <div className="fade-in" style={{ maxWidth: 880, margin: '0 auto' }}>
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      <Card variant="borderless" style={{ marginBottom: 16 }}>
        <Title level={5} style={{ marginTop: 0 }}>
          <Space><BgColorsOutlined /> {t('settings.appearance')}</Space>
        </Title>
        <Divider style={{ margin: '8px 0 0' }} />
        <SettingRow title={t('settings.theme')}>
          <Segmented
            value={theme}
            onChange={(v) => setTheme(v as 'light' | 'dark')}
            options={[
              { label: t('settings.themeLight'), value: 'light', icon: <SunOutlined /> },
              { label: t('settings.themeDark'), value: 'dark', icon: <MoonOutlined /> },
            ]}
          />
        </SettingRow>
        <Divider style={{ margin: 0 }} />
        <SettingRow title={t('settings.language')} description={t('settings.languageDesc')}>
          <Select<Locale>
            value={locale}
            onChange={setLocale}
            style={{ minWidth: 180 }}
            suffixIcon={<GlobalOutlined />}
            options={SUPPORTED_LOCALES.map((code) => ({
              value: code,
              label: `${LOCALES[code].flag}  ${LOCALES[code].label}`,
            }))}
          />
        </SettingRow>
      </Card>

      <Card variant="borderless" style={{ marginBottom: 16 }}>
        <Title level={5} style={{ marginTop: 0 }}>{t('settings.regional')}</Title>
        <Divider style={{ margin: '8px 0 0' }} />
        <SettingRow title={t('settings.baseCurrency')}>
          <Select<Currency>
            value={baseCurrency}
            onChange={setBaseCurrency}
            style={{ minWidth: 140 }}
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          />
        </SettingRow>
        <Divider style={{ margin: 0 }} />
        <SettingRow title={t('settings.fxRate')} description={t('settings.fxRateDesc')}>
          <InputNumber
            value={fxRate}
            onChange={(v) => setFxRate(v ?? 0)}
            min={0}
            step={0.0001}
            style={{ width: 160 }}
            addonBefore="AED"
          />
        </SettingRow>
        <Divider style={{ margin: 0 }} />
        {/* One row per non-USD currency: these are only the values PREFILLED in forms — each
            record stores the rate that was actually used, so changing this never rewrites history. */}
        <SettingRow title={t('settings.fxRateIqd')} description={t('settings.fxRateIqdDesc')}>
          <InputNumber
            value={fxRateIqd}
            onChange={(v) => setFxRateIqd(v ?? 0)}
            min={0}
            step={1}
            style={{ width: 160 }}
            addonBefore="IQD"
          />
        </SettingRow>
      </Card>

      <Card variant="borderless" style={{ marginBottom: 16 }}>
        <Title level={5} style={{ marginTop: 0 }}>{t('settings.company')}</Title>
        <Divider style={{ margin: '8px 0 12px' }} />
        <SettingRow title={t('settings.companyName')}>
          <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} style={{ maxWidth: 280 }} />
        </SettingRow>
        <div style={{ textAlign: 'end', marginTop: 8 }}>
          <Button type="primary" icon={<SaveOutlined />} onClick={save}>
            {t('common.save')}
          </Button>
        </div>
      </Card>

      <Card variant="borderless" style={{ borderColor: 'rgba(229,72,77,0.3)' }}>
        <Title level={5} type="danger" style={{ marginTop: 0 }}>{t('settings.danger')}</Title>
        <Divider style={{ margin: '8px 0 12px' }} />
        <SettingRow title={t('settings.loadSample')} description={t('settings.loadSampleDesc')}>
          <Popconfirm
            title={t('settings.loadSample')}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            onConfirm={loadSampleData}
          >
            <Button>{t('settings.loadSample')}</Button>
          </Popconfirm>
        </SettingRow>
        <Divider style={{ margin: 0 }} />
        <SettingRow title={t('settings.resetData')} description={t('settings.resetDataDesc')}>
          <Popconfirm title={t('settings.resetData')} okText={t('common.confirm')} cancelText={t('common.cancel')} onConfirm={resetData}>
            <Button danger>{t('settings.resetData')}</Button>
          </Popconfirm>
        </SettingRow>
      </Card>
    </div>
  );
}
