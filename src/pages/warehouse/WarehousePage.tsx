import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';

export default function WarehousePage() {
  const { t } = useTranslation();

  return (
    <div className="fade-in">
      <PageHeader title={t('warehouse.title')} subtitle={t('warehouse.subtitle')} />
    </div>
  );
}
