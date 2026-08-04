import { useState } from 'react';
import { Button, Card, Segmented, Space } from 'antd';
import { ExportOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';

type View = 'status' | 'docs';

const FILE: Record<View, string> = {
  status: '/develop/index.html',
  docs: '/develop/docs.html',
};

/**
 * Build status and documentation.
 *
 * The two pages are plain HTML served from `/public/develop`, not React screens, so they stay
 * readable on their own — open the file, print it, or send the link to someone without the app.
 * This page frames them so the menu behaves like every other entry.
 */
export default function DevelopPage() {
  const { t } = useTranslation();
  const [view, setView] = useState<View>('status');

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title={t('develop.title')}
        subtitle={t('develop.subtitle')}
        extra={
          <Space wrap>
            <Segmented
              value={view}
              onChange={(v) => setView(v as View)}
              options={[
                { label: t('develop.tabStatus'), value: 'status' },
                { label: t('develop.tabDocs'), value: 'docs' },
              ]}
            />
            <Button
              icon={<ExportOutlined />}
              href={FILE[view]}
              target="_blank"
              rel="noreferrer"
            >
              {t('develop.openInTab')}
            </Button>
          </Space>
        }
      />

      <Card
        variant="borderless"
        styles={{ body: { padding: 0, height: '100%' } }}
        style={{ flex: 1, minHeight: 620, overflow: 'hidden' }}
      >
        <iframe
          // Remounts on switch so the frame always starts at the top of the new page rather
          // than keeping the previous scroll position.
          key={view}
          src={FILE[view]}
          title={t('develop.title')}
          style={{ width: '100%', height: '100%', minHeight: 620, border: 0, display: 'block' }}
        />
      </Card>
    </div>
  );
}
