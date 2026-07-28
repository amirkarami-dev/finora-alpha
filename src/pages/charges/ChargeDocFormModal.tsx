import { App, DatePicker, Form, Input, Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import dayjs, { type Dayjs } from 'dayjs';
import { useCreateChargeDoc, useUpdateChargeDoc } from '@/services/queries';
import type { ChargeDocInput } from '@/services/api';
import type { ChargeDirection, ChargeDoc, ChargeScope } from '@/types';
import { chargeDetailRoute } from './routes';

const { TextArea } = Input;

// Doc-level guards, in order (design spec §4's `createChargeDoc`/`updateChargeDoc`).
const KNOWN_ERROR_CODES = [
  'title-required',
  'date-required',
  'invoice-required',
  'invoice-not-found',
  'invoice-not-confirmed',
  'doc-cancelled',
  'invoice-immutable',
  'kind-immutable',
  'direction-immutable',
] as const;

interface ChargeDocFormValues {
  title: string;
  date: Dayjs;
  description?: string;
}

/** Read-only invoice info to display when `kind === 'INVOICE'` — `invoiceId` is immutable
 *  (design spec §2), so this modal never lets it be picked or changed, only shown. */
export interface ChargeDocInvoiceInfo {
  id: string;
  invoiceNumber: string;
  customerName?: string;
}

interface ChargeDocFormModalProps {
  open: boolean;
  onClose: () => void;
  direction: ChargeDirection;
  kind: ChargeScope;
  /** Present when editing. */
  doc?: ChargeDoc;
  /** Present when `kind === 'INVOICE'` — the picked (create) or already-booked (edit) invoice,
   *  shown read-only. */
  invoiceInfo?: ChargeDocInvoiceInfo;
}

/** design spec §6 — header-only form (title, date, description). The invoice is never a form
 *  field: it is fixed at create time and immutable forever after (spec §2), so it is rendered as
 *  a disabled display, not a Select. Create navigates to the new document's detail page and asks
 *  it to auto-open the add-line modal (spec §6 "a header with no lines is the flow's main
 *  confusion point") via router state, consumed once by `ChargeDocDetailPage`. */
export function ChargeDocFormModal({ open, onClose, direction, kind, doc, invoiceInfo }: ChargeDocFormModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm<ChargeDocFormValues>();
  const createMut = useCreateChargeDoc();
  const updateMut = useUpdateChargeDoc();
  const isEdit = !!doc;

  const initialValues: Partial<ChargeDocFormValues> = doc
    ? { title: doc.title, date: dayjs(doc.date), description: doc.description }
    : { date: dayjs() };

  const submit = async () => {
    let values: ChargeDocFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const input: ChargeDocInput = {
      direction,
      kind,
      title: values.title.trim(),
      invoiceId: kind === 'INVOICE' ? invoiceInfo?.id : undefined,
      date: values.date.toISOString(),
      description: values.description?.trim() || undefined,
    };
    try {
      if (isEdit && doc) {
        await updateMut.mutateAsync({ id: doc.id, input });
        message.success(t('charges.updated'));
        onClose();
      } else {
        const created = await createMut.mutateAsync(input);
        message.success(t('charges.created'));
        onClose();
        navigate(chargeDetailRoute(direction, created.id), { state: { autoOpenAddLine: true } });
      }
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      if ((KNOWN_ERROR_CODES as readonly string[]).includes(code)) message.error(t(`charges.errors.${code}`));
      else message.error(t('common.saveFailed'));
    }
  };

  const title = isEdit
    ? t('charges.editDoc')
    : kind === 'INVOICE'
      ? t('charges.newInvoiceDoc')
      : t('charges.newGeneralDoc');

  return (
    <Modal
      open={open}
      title={title}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={createMut.isPending || updateMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Form key={doc?.id ?? 'new'} form={form} layout="vertical" preserve={false} initialValues={initialValues}>
        {kind === 'INVOICE' && invoiceInfo && (
          <Form.Item label={t('charges.invoice')}>
            <Input
              disabled
              dir="ltr"
              value={invoiceInfo.customerName ? `${invoiceInfo.invoiceNumber} — ${invoiceInfo.customerName}` : invoiceInfo.invoiceNumber}
            />
          </Form.Item>
        )}

        <Form.Item name="title" label={t('charges.docTitle')} rules={[{ required: true, message: t('common.required') }]}>
          <Input placeholder={t('charges.titlePlaceholder')} />
        </Form.Item>

        <Form.Item name="date" label={t('charges.date')} rules={[{ required: true, message: t('common.required') }]}>
          <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
        </Form.Item>

        <Form.Item name="description" label={t('charges.description')}>
          <TextArea rows={3} maxLength={500} showCount placeholder={t('charges.descriptionPlaceholder')} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
