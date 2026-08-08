import { Button, Result } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/useAuthStore';
import { ROUTES } from '@/config/constants';

export default function NotFoundPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--finora-bg, #f4f6fb)',
      }}
    >
      <Result
        status="404"
        title="404"
        subTitle={t('errors.notFoundDesc')}
        // One destination for both: /app resolves itself. A visitor is sent to the login page,
        // and a signed-in user to their own home — which is not always the dashboard, since a
        // Customer has no permission for it.
        extra={
          <Button type="primary" size="large" onClick={() => navigate(ROUTES.app)}>
            {isAuthenticated ? t('errors.goHome') : t('auth.backToHome')}
          </Button>
        }
      />
    </div>
  );
}
