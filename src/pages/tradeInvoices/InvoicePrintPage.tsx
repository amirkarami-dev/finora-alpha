import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ConfigProvider, Result, Button } from 'antd';
import { ArrowLeftOutlined, PrinterOutlined } from '@ant-design/icons';
import { getThemeConfig } from '@/theme/tokens';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useTradeInvoice } from '@/services/queries';
import { invoiceItemUnitPrice } from '@/utils/calc';
import { formatDate, formatCurrency, formatMt } from '@/utils/format';
import { BRAND, APP_TAGLINE } from '@/config/constants';
import type { InvoiceItem, InvoiceType } from '@/types';

const lightTheme = getThemeConfig('light');

function invoiceSideOf(type: InvoiceType): 'PURCHASE' | 'SALE' {
  return type.startsWith('PURCHASE') ? 'PURCHASE' : 'SALE';
}

export default function InvoicePrintPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const invoiceId = decodeURIComponent(id);
  const companyName = useSettingsStore((s) => s.companyName);

  const { data, isLoading } = useTradeInvoice(invoiceId);
  const dir = i18n.dir();

  if (!isLoading && !data) {
    return (
      <ConfigProvider theme={lightTheme} direction={dir}>
        <div dir={dir} className="invoice-print-root" style={{ padding: 40 }}>
          <Result
            status="404"
            title={t('errors.notFoundTitle')}
            subTitle={t('errors.notFoundDesc')}
            extra={
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
                {t('common.back')}
              </Button>
            }
          />
        </div>
      </ConfigProvider>
    );
  }

  if (!data) {
    return (
      <ConfigProvider theme={lightTheme} direction={dir}>
        <div dir={dir} className="invoice-print-root" style={{ padding: 40 }} />
      </ConfigProvider>
    );
  }

  const { invoice, contract, customerName } = data;
  const side = invoiceSideOf(invoice.invoiceType);
  const showAed = invoice.currency === 'AED' && invoice.exchangeRate !== 1;
  const isWatermarked = invoice.status === 'DRAFT' || invoice.status === 'CANCELLED';
  const subtotal = invoice.totalAmount + invoice.totalDiscount;

  return (
    <ConfigProvider theme={lightTheme} direction={dir}>
      <div dir={dir} className="invoice-print-root">
        <style>{`
          @page { size: A4; margin: 14mm; }
          .invoice-print-root {
            background: #eef0f2;
            min-height: 100vh;
            padding-block: 32px;
            padding-inline: 16px;
            font-variant-numeric: tabular-nums;
            color: #1a1a1a;
          }
          .invoice-print-sheet {
            max-width: 800px;
            margin-inline: auto;
            background: #ffffff;
            padding: 20mm 16mm;
            outline: 1px solid #dcdfe4;
            box-shadow: 0 1px 3px rgba(0,0,0,0.04);
            position: relative;
            overflow: hidden;
          }
          .invoice-print-toolbar {
            max-width: 800px;
            margin-inline: auto;
            margin-block-end: 16px;
            display: flex;
            justify-content: space-between;
          }
          .invoice-print-watermark {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: none;
            z-index: 0;
          }
          .invoice-print-watermark span {
            font-size: 96px;
            font-weight: 800;
            letter-spacing: 8px;
            color: ${BRAND.danger};
            opacity: 0.08;
            transform: rotate(-28deg);
            white-space: nowrap;
            text-transform: uppercase;
          }
          .invoice-print-content { position: relative; z-index: 1; }
          .invoice-print-table { width: 100%; border-collapse: collapse; }
          .invoice-print-table th, .invoice-print-table td {
            padding-block: 8px;
            padding-inline: 6px;
            font-size: 12px;
          }
          .invoice-print-table thead th {
            text-align: start;
            background: #f7f5f2;
            color: #6b6458;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            font-size: 10px;
            border-block-end: 1px solid #e4dfd6;
          }
          .invoice-print-table tbody tr { border-block-end: 1px solid #eeece7; }
          .invoice-print-num { text-align: end; white-space: nowrap; }
          .invoice-print-secondary { color: #8a8478; font-size: 11px; display: block; margin-block-start: 2px; }
          @media print {
            .no-print { display: none !important; }
            .invoice-print-root { background: #ffffff; padding: 0; }
            .invoice-print-sheet { max-width: none; padding: 0; outline: none; box-shadow: none; }
          }
        `}</style>

        <div className="invoice-print-toolbar no-print">
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
            {t('common.back')}
          </Button>
          <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>
            {t('tradeInvoices.print')}
          </Button>
        </div>

        <div className="invoice-print-sheet">
          {isWatermarked && (
            <div className="invoice-print-watermark">
              <span>{t(`tradeInvoices.status.${invoice.status}`)}</span>
            </div>
          )}

          <div className="invoice-print-content">
            {/* Letterhead */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                columnGap: 24,
                alignItems: 'start',
              }}
            >
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', letterSpacing: 0.2 }}>
                  {companyName}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: BRAND.primary,
                    textTransform: 'uppercase',
                    letterSpacing: 2,
                    marginBlockStart: 4,
                    fontWeight: 600,
                  }}
                >
                  {APP_TAGLINE.replace(', in control.', '')}
                </div>
              </div>
              <div style={{ textAlign: 'end' }}>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    color: '#1a1a1a',
                  }}
                >
                  {t(`tradeInvoices.type.${invoice.invoiceType}`)}
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 14, marginBlockStart: 4 }}>
                  {invoice.invoiceNumber}
                </div>
                <div style={{ fontSize: 11, color: '#8a8478', marginBlockStart: 4 }}>
                  {t('tradeInvoices.date')}: {formatDate(invoice.invoiceDate)}
                </div>
              </div>
            </div>

            {/* Double copper rule */}
            <div
              style={{
                marginBlock: '14px 20px',
                borderBlockEnd: `3px double ${BRAND.primary}`,
              }}
            />

            {/* Parties / meta grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                columnGap: 24,
                rowGap: 6,
                fontSize: 12,
                marginBlockEnd: 24,
              }}
            >
              <div>
                <div style={{ color: '#8a8478', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {t('tradeInvoices.customer')}
                </div>
                <div style={{ fontWeight: 600 }}>{customerName}</div>
              </div>
              <div>
                <div style={{ color: '#8a8478', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {t('tradeInvoices.contract')}
                </div>
                <div style={{ fontFamily: 'monospace' }}>{contract ? contract.id : '—'}</div>
              </div>
              <div>
                <div style={{ color: '#8a8478', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {t('tradeInvoices.currency')}
                </div>
                <div>
                  {invoice.currency}
                  {invoice.currency === 'AED' ? ` (${t('tradeInvoices.exchangeRate')}: ${invoice.exchangeRate})` : ''}
                </div>
              </div>
              {invoice.description && (
                <div>
                  <div style={{ color: '#8a8478', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {t('tradeInvoices.description')}
                  </div>
                  <div>{invoice.description}</div>
                </div>
              )}
            </div>

            {/* Items table */}
            <table className="invoice-print-table">
              <thead>
                <tr>
                  <th style={{ width: 28 }}>#</th>
                  <th>{t('items.product')}</th>
                  <th className="invoice-print-num">{t('items.quantityMt')}</th>
                  <th className="invoice-print-num">{t('items.lmePercent')}</th>
                  <th>{t('tradeInvoices.priceBasis')}</th>
                  <th className="invoice-print-num">{t('items.unitPrice')}</th>
                  <th className="invoice-print-num">{t('tradeInvoices.discountPercent')}</th>
                  <th className="invoice-print-num">{t('tradeInvoices.totalAmount')}</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item: InvoiceItem, idx: number) => {
                  const unit = invoiceItemUnitPrice(item);
                  return (
                    <tr key={item.id}>
                      <td>{idx + 1}</td>
                      <td>
                        {item.product}
                        {(item.blNumber || item.containerNo) && (
                          <span className="invoice-print-secondary">
                            {[
                              item.blNumber ? `${t('containers.blNumber')}: ${item.blNumber}` : null,
                              item.containerNo ? `${t('tradeInvoices.containerNo')}: ${item.containerNo}` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        )}
                      </td>
                      <td className="invoice-print-num">{formatMt(item.quantityMt)}</td>
                      <td className="invoice-print-num">{item.lmePercent}%</td>
                      <td>
                        {item.lmeFixed
                          ? formatCurrency(item.fixedPrice, invoice.currency)
                          : item.lmePrice !== undefined
                            ? `${formatCurrency(item.lmePrice, invoice.currency)} @ ${formatDate(item.lmeDate)}`
                            : '—'}
                      </td>
                      <td className="invoice-print-num">{unit === null ? '—' : formatCurrency(unit, invoice.currency)}</td>
                      <td className="invoice-print-num">{item.discountPercent ? `${item.discountPercent}%` : '—'}</td>
                      <td className="invoice-print-num" style={{ fontWeight: 600 }}>
                        {unit === null ? '—' : formatCurrency(item.amount, invoice.currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Totals block */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBlockStart: 20 }}>
              <div style={{ width: 260, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBlock: 3 }}>
                  <span style={{ color: '#8a8478' }}>{t('tradeInvoices.subtotal')}</span>
                  <span>{formatCurrency(subtotal, invoice.currency)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBlock: 3 }}>
                  <span style={{ color: '#8a8478' }}>{t('tradeInvoices.totalDiscount')}</span>
                  <span>{formatCurrency(invoice.totalDiscount, invoice.currency)}</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    paddingBlockStart: 8,
                    marginBlockStart: 4,
                    borderBlockStart: `2px solid ${BRAND.primary}`,
                    fontWeight: 700,
                    fontSize: 15,
                  }}
                >
                  <span>{t('tradeInvoices.grandTotal')}</span>
                  <span>{formatCurrency(invoice.totalAmount, invoice.currency)}</span>
                </div>
                {showAed && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      paddingBlockStart: 4,
                      fontSize: 11,
                      color: '#8a8478',
                    }}
                  >
                    <span>{t('tradeInvoices.aedEquivalent')}</span>
                    <span>{formatCurrency(invoice.totalAmount * invoice.exchangeRate, 'AED')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Signature strip */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                columnGap: 40,
                marginBlockStart: 64,
              }}
            >
              <div>
                <div style={{ borderBlockEnd: '1px solid #c9c3b6', height: 36 }} />
                <div style={{ fontSize: 11, color: '#8a8478', marginBlockStart: 6 }}>
                  {t('tradeInvoices.preparedBy')}
                </div>
              </div>
              <div>
                <div style={{ borderBlockEnd: '1px solid #c9c3b6', height: 36 }} />
                <div style={{ fontSize: 11, color: '#8a8478', marginBlockStart: 6 }}>
                  {t('tradeInvoices.authorizedBy')}
                </div>
              </div>
            </div>

            <div
              style={{
                marginBlockStart: 32,
                paddingBlockStart: 10,
                borderBlockStart: '1px solid #eeece7',
                fontSize: 10,
                color: '#a8a196',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>
                {invoice.sentAt ? `${t('tradeInvoices.sent')}: ${formatDate(invoice.sentAt)} · ` : ''}
                {side === 'PURCHASE' ? t('tradeInvoices.purchaseTitle') : t('tradeInvoices.saleTitle')}
              </span>
              <span>{formatDate(invoice.invoiceDate)}</span>
            </div>
          </div>
        </div>
      </div>
    </ConfigProvider>
  );
}
