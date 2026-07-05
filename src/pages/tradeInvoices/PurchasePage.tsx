import { useTranslation } from 'react-i18next';
import { InvoiceListTabs } from './InvoiceListTabs';

export default function PurchasePage() {
  const { t } = useTranslation();

  return (
    <InvoiceListTabs
      side="PURCHASE"
      title={t('tradeInvoices.purchaseTitle')}
      subtitle={t('tradeInvoices.purchaseSubtitle')}
    />
  );
}
