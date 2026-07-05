import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';

export default function SalePage() {
  const { t } = useTranslation();

  return (
    <div className="fade-in">
      <PageHeader
        title={t('tradeInvoices.saleTitle')}
        subtitle={t('tradeInvoices.saleSubtitle')}
      />
    </div>
  );
}
