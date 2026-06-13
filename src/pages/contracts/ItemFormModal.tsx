import {
  App,
  AutoComplete,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Switch,
  Typography,
  theme,
} from 'antd';
import { useTranslation } from 'react-i18next';
import { Money } from '@/components/common/Money';
import { useCreateItem, useProductNames, useUpdateItem } from '@/services/queries';
import { CONTRACT_STATUSES, INCOTERMS } from '@/config/constants';
import { unitPrice } from '@/utils/calc';
import type { ItemInput } from '@/services/api';
import type { Incoterm, Item, ItemStatus } from '@/types';

const { TextArea } = Input;
const { Text } = Typography;

interface ItemFormValues {
  product: string;
  quantityMt: number;
  lmePercent: number;
  lmeFixed: boolean;
  fixedLmePrice: number;
  premium: number;
  incoterm: Incoterm;
  status: ItemStatus;
  notes?: string;
}

interface ItemFormModalProps {
  open: boolean;
  onClose: () => void;
  contractId: string;
  /** When provided the modal edits this item; otherwise it adds a new one. */
  item?: Item;
}

export function ItemFormModal({ open, onClose, contractId, item }: ItemFormModalProps) {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const [form] = Form.useForm<ItemFormValues>();
  const { data: productNames } = useProductNames();
  const createMut = useCreateItem();
  const updateMut = useUpdateItem();
  const isEdit = !!item;

  // Applied on each open: `destroyOnHidden` remounts the form, so initial values
  // are re-read from the current item (edit) or the create defaults.
  const initialValues: Partial<ItemFormValues> = item
    ? {
        product: item.product,
        quantityMt: item.quantityMt,
        lmePercent: item.lmePercent,
        lmeFixed: item.lmeFixed,
        fixedLmePrice: item.fixedLmePrice,
        premium: item.premium,
        incoterm: item.incoterm,
        status: item.status,
        notes: item.notes ?? '',
      }
    : { lmeFixed: true, premium: 0, incoterm: 'CIF', status: 'ACTIVE' };

  // Live pricing preview, mirroring utils/calc.unitPrice.
  const fixedLmePrice = Form.useWatch('fixedLmePrice', form) ?? 0;
  const lmePercent = Form.useWatch('lmePercent', form) ?? 0;
  const premium = Form.useWatch('premium', form) ?? 0;
  const quantityMt = Form.useWatch('quantityMt', form) ?? 0;
  const previewUnit = unitPrice({ fixedLmePrice, lmePercent, premium });
  const previewValue = previewUnit * quantityMt;

  const submit = async () => {
    let values: ItemFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return; // validation errors render inline
    }
    const input: ItemInput = {
      product: values.product.trim(),
      quantityMt: values.quantityMt,
      lmePercent: values.lmePercent,
      lmeFixed: values.lmeFixed,
      fixedLmePrice: values.fixedLmePrice,
      premium: values.premium ?? 0,
      incoterm: values.incoterm,
      status: values.status,
      notes: values.notes?.trim() || '',
    };
    try {
      if (isEdit && item) {
        await updateMut.mutateAsync({ id: item.id, input });
        message.success(t('items.updated'));
      } else {
        await createMut.mutateAsync({ contractId, input });
        message.success(t('items.created'));
      }
      onClose();
    } catch {
      message.error(t('common.saveFailed'));
    }
  };

  return (
    <Modal
      open={open}
      width={640}
      title={isEdit ? t('items.editTitle') : t('items.addTitle')}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={createMut.isPending || updateMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Form
        key={item?.id ?? 'new'}
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={initialValues}
      >
        <Form.Item
          name="product"
          label={t('items.product')}
          rules={[{ required: true, message: t('common.required') }]}
        >
          <AutoComplete
            placeholder={t('items.productPlaceholder')}
            options={(productNames ?? []).map((p) => ({ value: p }))}
            filterOption={(input, option) =>
              String(option?.value ?? '')
                .toLowerCase()
                .includes(input.toLowerCase())
            }
          />
        </Form.Item>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              name="quantityMt"
              label={t('items.quantityMt')}
              rules={[{ required: true, message: t('common.required') }]}
            >
              <InputNumber min={0} step={1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="incoterm"
              label={t('items.incoterm')}
              rules={[{ required: true, message: t('common.required') }]}
            >
              <Select options={INCOTERMS.map((i) => ({ value: i, label: i }))} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="lmePercent"
              label={t('items.lmePercent')}
              rules={[{ required: true, message: t('common.required') }]}
            >
              <InputNumber min={0} max={200} step={0.01} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="fixedLmePrice"
              label={t('items.fixedLmePrice')}
              rules={[{ required: true, message: t('common.required') }]}
            >
              <InputNumber min={0} step={1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="premium"
              label={t('items.premium')}
              rules={[{ required: true, message: t('common.required') }]}
            >
              <InputNumber min={0} step={1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="status"
              label={t('items.status')}
              rules={[{ required: true, message: t('common.required') }]}
            >
              <Select
                options={CONTRACT_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="lmeFixed" label={t('items.lmeFixed')} valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="notes" label={t('items.notes')}>
          <TextArea rows={2} maxLength={500} showCount />
        </Form.Item>

        <div
          style={{
            display: 'flex',
            gap: 32,
            paddingTop: 12,
            borderTop: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
              {t('items.unitPrice')}
            </Text>
            <Money value={previewUnit} strong />
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
              {t('items.value')}
            </Text>
            <Money value={previewValue} strong />
          </div>
        </div>
      </Form>
    </Modal>
  );
}
