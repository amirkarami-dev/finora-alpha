import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';

export default function PurchasePage() {
  const { t } = useTranslation();

  return (
    <div className="fade-in">
      <PageHeader
        title={t('tradeInvoices.purchaseTitle')}
        subtitle={t('tradeInvoices.purchaseSubtitle')}
      />
    </div>
  );
}
