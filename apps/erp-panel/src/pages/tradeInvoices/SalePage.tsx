import { useTranslation } from 'react-i18next';
import { InvoiceListTabs } from './InvoiceListTabs';

export default function SalePage() {
  const { t } = useTranslation();

  return (
    <InvoiceListTabs
      side="SALE"
      title={t('tradeInvoices.saleTitle')}
      subtitle={t('tradeInvoices.saleSubtitle')}
    />
  );
}
