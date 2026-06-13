import { App, DatePicker, Form, Input, Modal, Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { useCreateContract, useCustomers, useUpdateContract } from '@/services/queries';
import { CONTRACT_STATUSES, ROUTES } from '@/config/constants';
import type { ContractInput } from '@/services/api';
import type { Contract, ContractStatus } from '@/types';

const { TextArea } = Input;

interface ContractFormValues {
  customerId: string;
  date: dayjs.Dayjs;
  destination: string;
  status: ContractStatus;
  notes?: string;
}

interface ContractFormModalProps {
  open: boolean;
  onClose: () => void;
  /** When provided the modal edits this contract; otherwise it creates a new one. */
  contract?: Contract;
  /** Pre-select a customer when creating. */
  defaultCustomerId?: string;
  /** Open the new contract's detail page after a successful create. Default: true. */
  navigateOnCreate?: boolean;
}

export function ContractFormModal({
  open,
  onClose,
  contract,
  defaultCustomerId,
  navigateOnCreate = true,
}: ContractFormModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm<ContractFormValues>();
  const { data: customers, isLoading: customersLoading } = useCustomers();
  const createMut = useCreateContract();
  const updateMut = useUpdateContract();
  const isEdit = !!contract;

  // Applied on each open: `destroyOnHidden` remounts the form, so initial values
  // are re-read from the current contract (edit) or the create defaults.
  const initialValues: Partial<ContractFormValues> = contract
    ? {
        customerId: contract.customerId,
        date: dayjs(contract.date),
        destination: contract.destination,
        status: contract.status,
        notes: contract.notes ?? '',
      }
    : { customerId: defaultCustomerId, date: dayjs(), status: 'ACTIVE', notes: '' };

  const submit = async () => {
    let values: ContractFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return; // validation errors render inline
    }
    const input: ContractInput = {
      customerId: values.customerId,
      date: values.date.toISOString(),
      destination: values.destination.trim(),
      status: values.status,
      notes: values.notes?.trim() || '',
    };
    try {
      if (isEdit && contract) {
        await updateMut.mutateAsync({ id: contract.id, input });
        message.success(t('contracts.updated'));
        onClose();
      } else {
        const row = await createMut.mutateAsync(input);
        message.success(t('contracts.created'));
        onClose();
        if (navigateOnCreate) navigate(`${ROUTES.contracts}/${encodeURIComponent(row.id)}`);
      }
    } catch {
      message.error(t('common.saveFailed'));
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? t('contracts.editContract') : t('contracts.newContract')}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={createMut.isPending || updateMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Form
        key={contract?.id ?? 'new'}
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={initialValues}
      >
        <Form.Item
          name="customerId"
          label={t('contracts.customer')}
          rules={[{ required: true, message: t('common.required') }]}
        >
          <Select
            showSearch
            loading={customersLoading}
            placeholder={t('contracts.selectCustomer')}
            optionFilterProp="label"
            options={(customers ?? []).map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))}
          />
        </Form.Item>
        <Form.Item
          name="date"
          label={t('contracts.date')}
          rules={[{ required: true, message: t('common.required') }]}
        >
          <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
        </Form.Item>
        <Form.Item
          name="destination"
          label={t('contracts.destination')}
          rules={[{ required: true, message: t('common.required') }]}
        >
          <Input placeholder={t('contracts.destinationPlaceholder')} />
        </Form.Item>
        <Form.Item
          name="status"
          label={t('contracts.status')}
          rules={[{ required: true, message: t('common.required') }]}
        >
          <Select options={CONTRACT_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))} />
        </Form.Item>
        <Form.Item name="notes" label={t('contracts.notes')}>
          <TextArea rows={3} maxLength={500} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}
