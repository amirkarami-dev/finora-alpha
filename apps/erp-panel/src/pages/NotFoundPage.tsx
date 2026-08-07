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
        extra={
          <Button
            type="primary"
            size="large"
            onClick={() => navigate(isAuthenticated ? ROUTES.dashboard : ROUTES.landing)}
          >
            {isAuthenticated ? t('errors.goHome') : t('auth.backToHome')}
          </Button>
        }
      />
    </div>
  );
}
