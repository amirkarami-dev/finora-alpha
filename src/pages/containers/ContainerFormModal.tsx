import { useEffect, useMemo, useState } from 'react';
import { App, Button, Col, DatePicker, Form, Input, InputNumber, Modal, Row, Select, Typography } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useContracts, useCreateContainer, useUpdateContainer } from '@/services/queries';
import { getContractRemaining, getGoodContainerUsage } from '@/services/api';
import { formatMt } from '@/utils/format';
import type { ContainerInput, ContainerRow } from '@/services/api';
import type { InvoiceSide } from '@/types';

const { Text } = Typography;

interface ContainerGoodRow {
  contractItemId?: string;
  quantityMt?: number;
}

interface ContainerFormValues {
  reference: string;
  shipmentDate: Dayjs;
  arrivalDate?: Dayjs;
  grossWeightKg?: number;
  netWeightKg?: number;
  blNumber?: string;
  bookingNumber?: string;
  sealNumber?: string;
  goods: ContainerGoodRow[];
}

interface ContainerFormModalProps {
  open: boolean;
  onClose: () => void;
  /** When provided the modal edits this container; otherwise it adds a new one. */
  container?: ContainerRow;
}

const sideOfContractType = (t: 'SELL' | 'PURCHASE'): InvoiceSide => (t === 'PURCHASE' ? 'PURCHASE' : 'SALE');

/**
 * Multi-goods logistics form (spec §4): reference/dates/weights/BL/booking/seal + a goods
 * `Form.List`. The goods `Select` groups every contract's items into a real `OptGroup`,
 * labelled by product with a remaining-MT hint (`getContractRemaining`, fetched per contract
 * when the modal opens). No quantity-vs-contract cap (accepted gap, spec §4). Removing a
 * goods row that is already referenced by an invoice (edit mode) is blocked with a warning
 * listing the invoice number(s); the same guard runs server-side on save (`'good-in-use'`).
 */
export function ContainerFormModal({ open, onClose, container }: ContainerFormModalProps) {
  const { t } = useTranslation();
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<ContainerFormValues>();
  const { data: contracts } = useContracts();
  const createMut = useCreateContainer();
  const updateMut = useUpdateContainer();
  const isEdit = !!container;

  const itemProduct = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of contracts ?? []) for (const i of c.items) map.set(i.id, i.product);
    return map;
  }, [contracts]);

  // Remaining-MT hint per contract item, fetched per contract once the modal opens
  // (getContractRemaining, spec §4 — mirrors the AddItemsModal hint idiom).
  const [remainingByItem, setRemainingByItem] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (!open || !contracts) return;
    let cancelled = false;
    Promise.all(
      contracts.map((c) => getContractRemaining(c.id, sideOfContractType(c.contractType))),
    ).then((results) => {
      if (cancelled) return;
      const map = new Map<string, number>();
      for (const rows of results) for (const r of rows) map.set(r.itemId, r.uninvoicedMt);
      setRemainingByItem(map);
    });
    return () => {
      cancelled = true;
    };
  }, [open, contracts]);

  const initialValues: Partial<ContainerFormValues> = container
    ? {
        reference: container.reference,
        shipmentDate: dayjs(container.shipmentDate),
        arrivalDate: container.arrivalDate ? dayjs(container.arrivalDate) : undefined,
        grossWeightKg: container.grossWeightKg,
        netWeightKg: container.netWeightKg,
        blNumber: container.blNumber ?? '',
        bookingNumber: container.bookingNumber ?? '',
        sealNumber: container.sealNumber ?? '',
        goods: container.goods.map((g) => ({ contractItemId: g.contractItemId, quantityMt: g.quantityMt })),
      }
    : { shipmentDate: dayjs(), goods: [{}] };

  /**
   * Removal guard (spec §4): a row whose good is on the persisted container is checked
   * against `getGoodContainerUsage` before it is dropped. Newly-added rows (not part of
   * `container.goods`) remove freely. Belt-and-braces: `updateContainer` re-checks server-side.
   */
  const handleRemoveGood = async (index: number, remove: (i: number | number[]) => void) => {
    const rows: ContainerGoodRow[] = form.getFieldValue('goods') ?? [];
    const row = rows[index];
    const wasPersisted = isEdit && container!.goods.some((g) => g.contractItemId === row?.contractItemId);
    if (wasPersisted && row?.contractItemId) {
      const usage = await getGoodContainerUsage(container!.id, row.contractItemId);
      if (usage.length > 0) {
        modal.warning({
          title: t('containers.goodInUseTitle'),
          content: t('containers.goodInUseBody', {
            product: itemProduct.get(row.contractItemId) ?? row.contractItemId,
            invoices: usage.join(', '),
          }),
        });
        return;
      }
    }
    remove(index);
  };

  const submit = async () => {
    let values: ContainerFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const goods = (values.goods ?? [])
      .filter((g): g is Required<ContainerGoodRow> => !!g?.contractItemId && !!g?.quantityMt)
      .map((g) => ({ contractItemId: g.contractItemId, quantityMt: g.quantityMt }));
    if (goods.length === 0) {
      message.error(t('containers.atLeastOneGood'));
      return;
    }
    const input: ContainerInput = {
      reference: values.reference.trim(),
      shipmentDate: values.shipmentDate.toISOString(),
      arrivalDate: values.arrivalDate ? values.arrivalDate.toISOString() : undefined,
      grossWeightKg: values.grossWeightKg,
      netWeightKg: values.netWeightKg,
      blNumber: values.blNumber?.trim() || undefined,
      bookingNumber: values.bookingNumber?.trim() || undefined,
      sealNumber: values.sealNumber?.trim() || undefined,
      goods,
    };
    try {
      if (isEdit && container) {
        await updateMut.mutateAsync({ id: container.id, input });
        message.success(t('containers.updated'));
      } else {
        await createMut.mutateAsync(input);
        message.success(t('containers.created'));
      }
      onClose();
    } catch (err) {
      const e = err as Error & { invoices?: string[]; product?: string };
      if (e.message === 'good-in-use') {
        modal.warning({
          title: t('containers.goodInUseTitle'),
          content: t('containers.goodInUseBody', {
            product: e.product ?? '',
            invoices: (e.invoices ?? []).join(', '),
          }),
        });
      } else {
        message.error(t('common.saveFailed'));
      }
    }
  };

  return (
    <Modal
      open={open}
      width={720}
      title={isEdit ? t('containers.editContainer') : t('containers.newContainer')}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={createMut.isPending || updateMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Form
        key={container?.id ?? 'new'}
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={initialValues}
      >
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              name="reference"
              label={t('containers.reference')}
              rules={[{ required: true, message: t('common.required') }]}
            >
              <Input placeholder="MSNU8018095" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} />

          <Col xs={24} sm={12}>
            <Form.Item
              name="shipmentDate"
              label={t('containers.shipmentDate')}
              rules={[{ required: true, message: t('common.required') }]}
            >
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="arrivalDate" label={t('containers.arrivalDate')}>
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>

          <Col xs={24} sm={12}>
            <Form.Item name="grossWeightKg" label={t('containers.grossWeight')}>
              <InputNumber min={0} step={1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="netWeightKg" label={t('containers.netWeight')}>
              <InputNumber min={0} step={1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>

          <Col xs={24} sm={8}>
            <Form.Item name="blNumber" label={t('containers.blNumber')}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="bookingNumber" label={t('containers.bookingNumber')}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="sealNumber" label={t('containers.sealNumber')}>
              <Input />
            </Form.Item>
          </Col>
        </Row>

        <Text type="secondary" style={{ fontSize: 12, fontWeight: 500, display: 'block', margin: '4px 0 8px' }}>
          {t('containers.goods')}
        </Text>
        <Form.List name="goods">
          {(fields, { add, remove }) => (
            <>
              {fields.map((field) => (
                <Row gutter={8} key={field.key} align="top" style={{ marginBottom: 4 }}>
                  <Col flex="auto">
                    <Form.Item
                      name={[field.name, 'contractItemId']}
                      rules={[{ required: true, message: t('common.required') }]}
                      style={{ marginBottom: 8 }}
                    >
                      <Select
                        showSearch
                        optionFilterProp="label"
                        placeholder={t('containers.goods')}
                      >
                        {(contracts ?? []).map((c) => (
                          <Select.OptGroup key={c.id} label={`${c.id} · ${c.customerName}`}>
                            {c.items.map((i) => (
                              <Select.Option key={i.id} value={i.id} label={i.product}>
                                <div>
                                  <div>{i.product}</div>
                                  <Text type="secondary" style={{ fontSize: 11 }}>
                                    {t('containers.goodRemainingHint', {
                                      mt: formatMt(remainingByItem.get(i.id) ?? i.remainingMt),
                                    })}
                                  </Text>
                                </div>
                              </Select.Option>
                            ))}
                          </Select.OptGroup>
                        ))}
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col flex="160px">
                    <Form.Item
                      name={[field.name, 'quantityMt']}
                      rules={[{ required: true, message: t('common.required') }]}
                      style={{ marginBottom: 8 }}
                    >
                      <InputNumber
                        min={0.01}
                        precision={2}
                        style={{ width: '100%' }}
                        placeholder={t('containers.quantityMt')}
                      />
                    </Form.Item>
                  </Col>
                  <Col flex="32px">
                    <Button
                      type="text"
                      icon={<MinusCircleOutlined />}
                      onClick={() => handleRemoveGood(field.name, remove)}
                    />
                  </Col>
                </Row>
              ))}
              <Button type="dashed" onClick={() => add({})} icon={<PlusOutlined />} block>
                {t('containers.addGood')}
              </Button>
            </>
          )}
        </Form.List>
      </Form>
    </Modal>
  );
}
