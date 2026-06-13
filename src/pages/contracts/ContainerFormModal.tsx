import {
  App,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Typography,
  theme,
} from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { Money } from '@/components/common/Money';
import {
  useContracts,
  useCreateContainer,
  useCustomers,
  useUpdateContainer,
} from '@/services/queries';
import { CONTAINER_STATUSES } from '@/config/constants';
import { unitPrice } from '@/utils/calc';
import { formatMt } from '@/utils/format';
import type { ContainerInput, ContainerRow, ContractRow } from '@/services/api';
import type { ContainerStatus } from '@/types';

const { Text } = Typography;

interface ContainerFormValues {
  contractId: string;
  itemId: string;
  reference: string;
  quantityMt: number;
  lmePrice: number;
  premium: number;
  shipmentDate: Dayjs;
  arrivalDate?: Dayjs;
  dueDate: Dayjs;
  status: ContainerStatus;
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

const round2 = (n: number) => Math.round(n * 100) / 100;

export function ContainerFormModal({ open, onClose, contract, container }: ContainerFormModalProps) {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const [form] = Form.useForm<ContainerFormValues>();
  const { data: contracts } = useContracts();
  const { data: customers } = useCustomers();
  const createMut = useCreateContainer();
  const updateMut = useUpdateContainer();
  const isEdit = !!container;

  // Resolve the active contract (fixed prop, or the picked one in global mode).
  const watchedContractId = Form.useWatch('contractId', form);
  const activeContractId = contract?.id ?? watchedContractId;
  const activeContract = contract ?? contracts?.find((c) => c.id === activeContractId);
  const items = activeContract?.items ?? [];
  const customer = customers?.find((c) => c.id === activeContract?.customerId);
  const termsDays = customer?.paymentTermsDays ?? 30;

  // Quantity ceiling = item remaining + this container's own qty (when editing the same item).
  const watchedItemId = Form.useWatch('itemId', form);
  const selectedItem = items.find((i) => i.id === watchedItemId);
  const ownQty = container && container.itemId === watchedItemId ? container.quantityMt : 0;
  const maxQty = (selectedItem?.remainingMt ?? 0) + ownQty;

  // Live invoice preview, mirroring utils/calc.containerInvoice.
  const wLme = Form.useWatch('lmePrice', form) ?? 0;
  const wPremium = Form.useWatch('premium', form) ?? 0;
  const wQty = Form.useWatch('quantityMt', form) ?? 0;
  const previewInvoice = (wLme + wPremium) * wQty;

  const initialValues: Partial<ContainerFormValues> = container
    ? {
        contractId: container.contractId,
        itemId: container.itemId,
        reference: container.reference,
        quantityMt: container.quantityMt,
        lmePrice: container.lmePrice,
        premium: container.premium,
        shipmentDate: dayjs(container.shipmentDate),
        arrivalDate: container.arrivalDate ? dayjs(container.arrivalDate) : undefined,
        dueDate: dayjs(container.dueDate),
        status: container.status,
        blNumber: container.blNumber ?? '',
        bookingNumber: container.bookingNumber ?? '',
        sealNumber: container.sealNumber ?? '',
      }
    : { contractId: contract?.id, premium: 0, status: 'OPEN', shipmentDate: dayjs() };

  /** Due date = (arrival || shipment) + customer payment terms. */
  const recomputeDue = () => {
    const shipment = form.getFieldValue('shipmentDate') as Dayjs | undefined;
    const arrival = form.getFieldValue('arrivalDate') as Dayjs | undefined;
    const base = arrival ?? shipment;
    if (base) form.setFieldValue('dueDate', base.add(termsDays, 'day'));
  };

  const onItemChange = (itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    if (item) form.setFieldValue('lmePrice', round2(unitPrice(item)));
  };

  const onContractChange = () => {
    form.setFieldsValue({ itemId: undefined, lmePrice: undefined });
  };

  const submit = async () => {
    let values: ContainerFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const input: ContainerInput = {
      contractId: values.contractId,
      itemId: values.itemId,
      reference: values.reference.trim(),
      quantityMt: values.quantityMt,
      lmePrice: values.lmePrice,
      premium: values.premium ?? 0,
      shipmentDate: values.shipmentDate.toISOString(),
      arrivalDate: values.arrivalDate ? values.arrivalDate.toISOString() : undefined,
      dueDate: values.dueDate.toISOString(),
      status: values.status,
      blNumber: values.blNumber?.trim() || undefined,
      bookingNumber: values.bookingNumber?.trim() || undefined,
      sealNumber: values.sealNumber?.trim() || undefined,
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
                onChange={onItemChange}
                options={items.map((i) => ({
                  value: i.id,
                  label: `${i.product} · ${t('containers.remainingHint', { mt: formatMt(i.remainingMt) })}`,
                }))}
              />
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

          <Col xs={24} sm={12}>
            <Form.Item
              name="quantityMt"
              label={t('containers.quantityMt')}
              rules={[
                { required: true, message: t('common.required') },
                () => ({
                  validator(_, value) {
                    if (value == null) return Promise.resolve();
                    if (value > maxQty + 1e-6) {
                      return Promise.reject(
                        new Error(t('containers.qtyExceedsRemaining', { mt: formatMt(maxQty) })),
                      );
                    }
                    return Promise.resolve();
                  },
                }),
              ]}
            >
              <InputNumber min={0} step={1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="status"
              label={t('containers.status')}
              rules={[{ required: true, message: t('common.required') }]}
            >
              <Select
                options={CONTAINER_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))}
              />
            </Form.Item>
          </Col>

          <Col xs={24} sm={12}>
            <Form.Item
              name="lmePrice"
              label={t('containers.lmePrice')}
              rules={[{ required: true, message: t('common.required') }]}
            >
              <InputNumber min={0} step={1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="premium"
              label={t('containers.premium')}
              rules={[{ required: true, message: t('common.required') }]}
            >
              <InputNumber min={0} step={1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>

          <Col xs={24} sm={8}>
            <Form.Item
              name="shipmentDate"
              label={t('containers.shipmentDate')}
              rules={[{ required: true, message: t('common.required') }]}
            >
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" onChange={recomputeDue} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="arrivalDate" label={t('containers.arrivalDate')}>
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" onChange={recomputeDue} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item
              name="dueDate"
              label={t('containers.dueDate')}
              rules={[{ required: true, message: t('common.required') }]}
            >
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
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
              {t('containers.invoice')}
            </Text>
            <Money value={previewInvoice} strong />
          </div>
        </div>
      </Form>
    </Modal>
  );
}
