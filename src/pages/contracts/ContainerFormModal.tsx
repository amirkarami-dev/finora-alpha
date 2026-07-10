import { App, Col, DatePicker, Form, Input, InputNumber, Modal, Row, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useContracts, useCreateContainer, useUpdateContainer } from '@/services/queries';
import { formatMt } from '@/utils/format';
import type { ContainerInput, ContainerRow, ContractRow } from '@/services/api';

interface ContainerFormValues {
  contractId: string;
  itemId: string;
  quantityMt: number;
  reference: string;
  shipmentDate: Dayjs;
  arrivalDate?: Dayjs;
  grossWeightKg?: number;
  netWeightKg?: number;
  blNumber?: string;
  bookingNumber?: string;
  sealNumber?: string;
}

interface ContainerFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Fixes the contract (contract detail page); absent => global picker. */
  contract?: ContractRow;
  /** When provided the modal edits this container; otherwise it adds a new one. */
  container?: ContainerRow;
}

/**
 * TEMP Phase A — single-goods-line editor (reference/shipmentDate/arrivalDate/weights/BL/
 * booking/seal + one contract-item + qty). Phase B (plan Task B2) rebuilds this with a
 * stable-id-keyed `Form.List` for multiple goods lines, grouped item picker (`OptGroup` by
 * contract), and the invoiced-good removal guard (spec §4).
 */
export function ContainerFormModal({ open, onClose, contract, container }: ContainerFormModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<ContainerFormValues>();
  const { data: contracts } = useContracts();
  const createMut = useCreateContainer();
  const updateMut = useUpdateContainer();
  const isEdit = !!container;

  const firstGood = container?.goods[0];
  // On edit, resolve the owning contract (containers no longer carry contractId directly).
  const editingContract = container
    ? contracts?.find((c) => c.items.some((i) => i.id === firstGood?.contractItemId))
    : undefined;

  const watchedContractId = Form.useWatch('contractId', form);
  const activeContractId = contract?.id ?? editingContract?.id ?? watchedContractId;
  const activeContract = contract ?? contracts?.find((c) => c.id === activeContractId);
  const items = activeContract?.items ?? [];

  const initialValues: Partial<ContainerFormValues> = container
    ? {
        contractId: editingContract?.id,
        itemId: firstGood?.contractItemId,
        quantityMt: firstGood?.quantityMt,
        reference: container.reference,
        shipmentDate: dayjs(container.shipmentDate),
        arrivalDate: container.arrivalDate ? dayjs(container.arrivalDate) : undefined,
        grossWeightKg: container.grossWeightKg,
        netWeightKg: container.netWeightKg,
        blNumber: container.blNumber ?? '',
        bookingNumber: container.bookingNumber ?? '',
        sealNumber: container.sealNumber ?? '',
      }
    : { contractId: contract?.id, shipmentDate: dayjs() };

  const onContractChange = () => {
    form.setFieldsValue({ itemId: undefined });
  };

  const submit = async () => {
    let values: ContainerFormValues;
    try {
      values = await form.validateFields();
    } catch {
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
      goods: [{ contractItemId: values.itemId, quantityMt: values.quantityMt }],
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
    } catch {
      message.error(t('common.saveFailed'));
    }
  };

  return (
    <Modal
      open={open}
      width={680}
      title={
        isEdit
          ? t('containers.editContainer')
          : contract
            ? t('containers.addContainer')
            : t('containers.newContainer')
      }
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={createMut.isPending || updateMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Form
        key={container?.id ?? `new-${contract?.id ?? 'global'}`}
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={initialValues}
      >
        <Form.Item
          name="contractId"
          label={t('containers.contract')}
          rules={[{ required: true, message: t('common.required') }]}
        >
          <Select
            showSearch
            disabled={!!contract}
            placeholder={t('containers.selectContract')}
            optionFilterProp="label"
            onChange={onContractChange}
            options={(contracts ?? []).map((c) => ({
              value: c.id,
              label: `${c.id} · ${c.customerName}`,
            }))}
          />
        </Form.Item>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              name="itemId"
              label={t('containers.goods')}
              rules={[{ required: true, message: t('common.required') }]}
            >
              <Select
                placeholder={t('containers.goods')}
                options={items.map((i) => ({
                  value: i.id,
                  label: `${i.product} · ${t('containers.remainingHint', { mt: formatMt(i.remainingMt) })}`,
                }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="quantityMt"
              label={t('containers.quantityMt')}
              rules={[{ required: true, message: t('common.required') }]}
            >
              <InputNumber min={0} step={1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>

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
      </Form>
    </Modal>
  );
}
