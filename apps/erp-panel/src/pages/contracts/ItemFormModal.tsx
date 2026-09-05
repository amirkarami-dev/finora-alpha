import {
  App,
  AutoComplete,
  Button,
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
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { Money } from '@/components/common/Money';
import { useCreateItem, usePartners, useProductNames, useUpdateItem } from '@/services/queries';
import { CONTRACT_STATUSES, INCOTERMS } from '@/config/constants';
import { unitPrice } from '@/utils/calc';
import type { ItemInput } from '@/services/api';
import type { ContractType, Incoterm, Item, ItemPartner, ItemStatus } from '@/types';

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
  partners: ItemPartner[];
}

interface ItemFormModalProps {
  open: boolean;
  onClose: () => void;
  contractId: string;
  /** When provided the modal edits this item; otherwise it adds a new one. */
  item?: Item;
  /** Direction of the parent contract; the partner section shows only for PURCHASE. */
  contractType?: ContractType;
}

export function ItemFormModal({ open, onClose, contractId, item, contractType }: ItemFormModalProps) {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const [form] = Form.useForm<ItemFormValues>();
  const { data: productNames } = useProductNames();
  const createMut = useCreateItem();
  const updateMut = useUpdateItem();
  const isEdit = !!item;
  const isPurchase = contractType === 'PURCHASE';
  const { data: partnerList } = usePartners();

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
        partners: item.partners ?? [],
      }
    : { lmeFixed: true, lmePercent: 100, premium: 0, incoterm: 'CIF', status: 'ACTIVE', partners: [] };

  // Live pricing preview, mirroring utils/calc.unitPrice.
  const fixedLmePrice = Form.useWatch('fixedLmePrice', form) ?? 0;
  const lmePercent = Form.useWatch('lmePercent', form) ?? 0;
  const premium = Form.useWatch('premium', form) ?? 0;
  const quantityMt = Form.useWatch('quantityMt', form) ?? 0;
  // When the price is LME-fixed it's a flat fixed price: LME % is locked at 100
  // (so unit price = fixed price + premium) and the field is disabled.
  const lmeFixed = (Form.useWatch('lmeFixed', form) ?? initialValues.lmeFixed) ?? false;
  // Floating (LME not fixed) has no fixed price, so the unit price is undetermined.
  const previewUnit = lmeFixed ? unitPrice({ fixedLmePrice, lmePercent, premium }) : 0;
  const previewValue = previewUnit * quantityMt;
  const partnersWatch = Form.useWatch('partners', form) as ItemPartner[] | undefined;
  const partnerSum = (partnersWatch ?? []).reduce((s, p) => s + (Number(p?.percent) || 0), 0);

  const submit = async () => {
    let values: ItemFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return; // validation errors render inline
    }
    const partnerRows = isPurchase
      ? (values.partners ?? []).filter((p) => p?.partnerId && typeof p.percent === 'number')
      : [];
    if (isPurchase) {
      const ids = partnerRows.map((p) => p.partnerId);
      if (new Set(ids).size !== ids.length) {
        message.error(t('items.partnerDupError'));
        return;
      }
      const sum = partnerRows.reduce((s, p) => s + p.percent, 0);
      if (sum > 100) {
        message.error(t('items.partnerSumError', { sum }));
        return;
      }
    }
    const input: ItemInput = {
      product: values.product.trim(),
      quantityMt: values.quantityMt,
      lmePercent: values.lmePercent,
      lmeFixed: values.lmeFixed,
      fixedLmePrice: values.fixedLmePrice ?? 0,
      premium: values.premium ?? 0,
      incoterm: values.incoterm,
      status: values.status,
      notes: values.notes?.trim() || '',
      partners: partnerRows,
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
        onValuesChange={(changed) => {
          // Switching mode resets the fixed price — it doesn't carry across modes.
          if (changed.lmeFixed !== undefined) {
            form.setFieldValue('fixedLmePrice', undefined);
            form.setFields([{ name: 'fixedLmePrice', errors: [] }]);
          }
          // Fixed price → lock LME % to 100; floating → clear it so the user enters it.
          // Also clear any stale "required" error on the field that just became disabled.
          if (changed.lmeFixed === true) {
            form.setFieldValue('lmePercent', 100);
            form.setFields([{ name: 'lmePercent', errors: [] }]);
          } else if (changed.lmeFixed === false) {
            form.setFieldValue('lmePercent', undefined);
          }
        }}
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
              <InputNumber min={0} step={1} precision={6} style={{ width: '100%' }} />
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
              rules={lmeFixed ? [] : [{ required: true, message: t('common.required') }]}
            >
              <InputNumber min={0} max={200} step={0.01} style={{ width: '100%' }} disabled={lmeFixed} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="fixedLmePrice"
              label={t('items.fixedLmePrice')}
              rules={lmeFixed ? [{ required: true, message: t('common.required') }] : []}
            >
              <InputNumber min={0} step={1} style={{ width: '100%' }} disabled={!lmeFixed} />
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

        {isPurchase && (
          <div style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 8 }}>
              {t('items.partners')}
            </Text>
            <Form.List name="partners">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((field) => (
                    <Row gutter={8} key={field.key} align="top" style={{ marginBottom: 4 }}>
                      <Col flex="auto">
                        <Form.Item
                          name={[field.name, 'partnerId']}
                          rules={[{ required: true, message: t('common.required') }]}
                          style={{ marginBottom: 0 }}
                        >
                          <Select
                            showSearch
                            optionFilterProp="label"
                            placeholder={t('items.partner')}
                            options={(partnerList ?? [])
                              .filter(
                                (p) =>
                                  p.active ||
                                  (item?.partners ?? []).some((ap) => ap.partnerId === p.id),
                              )
                              .filter(
                                (p) =>
                                  !(partnersWatch ?? []).some(
                                    (row, i) => i !== field.name && row?.partnerId === p.id,
                                  ),
                              )
                              .map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))}
                          />
                        </Form.Item>
                      </Col>
                      <Col flex="130px">
                        <Form.Item
                          name={[field.name, 'percent']}
                          rules={[{ required: true, message: t('common.required') }]}
                          style={{ marginBottom: 0 }}
                        >
                          <InputNumber min={1} max={100} precision={0} placeholder={t('items.sharePercent')} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col flex="32px">
                        <Button type="text" icon={<MinusCircleOutlined />} onClick={() => remove(field.name)} />
                      </Col>
                    </Row>
                  ))}
                  <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} block style={{ marginTop: 4 }}>
                    {t('items.addPartner')}
                  </Button>
                </>
              )}
            </Form.List>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
              {t('items.ownShare', { percent: Math.max(100 - partnerSum, 0) })}
            </Text>
          </div>
        )}

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
            {lmeFixed ? <Money value={previewUnit} strong /> : <Text type="secondary" strong>—</Text>}
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
              {t('items.value')}
            </Text>
            {lmeFixed ? <Money value={previewValue} strong /> : <Text type="secondary" strong>—</Text>}
          </div>
        </div>
      </Form>
    </Modal>
  );
}
