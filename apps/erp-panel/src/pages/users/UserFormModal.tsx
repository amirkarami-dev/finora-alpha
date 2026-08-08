import { App, Alert, Form, Input, Modal, Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { useAssignableRoles, useCreateUser, useUpdateUser } from '@/services/queries';
import type { UserInput } from '@/services/users';
import type { Role, User } from '@/types';
import { MIN_PASSWORD_LENGTH, fieldErrorFor } from './passwordRules';

interface UserFormValues {
  email: string;
  name: string;
  role: Role;
  password: string;
}

interface UserFormModalProps {
  open: boolean;
  onClose: () => void;
  user?: User;
  /** True when the row being edited is the signed-in administrator's own. */
  isSelf: boolean;
}

export function UserFormModal({ open, onClose, user, isSelf }: UserFormModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<UserFormValues>();
  const { data: roles } = useAssignableRoles();
  const createMut = useCreateUser();
  const updateMut = useUpdateUser();
  const isEdit = !!user;

  const initialValues: Partial<UserFormValues> = user
    ? { email: user.email, name: user.name, role: user.role }
    : {};

  const submit = async () => {
    let values: UserFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    const input: UserInput = {
      email: values.email.trim(),
      name: values.name.trim(),
      role: values.role,
      avatarColor: user?.avatarColor,
    };

    try {
      if (isEdit && user) {
        await updateMut.mutateAsync({ id: user.id, input });
        message.success(t('users.updated'));
      } else {
        await createMut.mutateAsync({ ...input, password: values.password });
        message.success(t('users.created'));
      }
      onClose();
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      const field = fieldErrorFor(code);
      if (field === 'email' || field === 'name' || field === 'role' || field === 'password') {
        form.setFields([{ name: field, errors: [t(`users.errors.${code}`)] }]);
        return;
      }
      message.error(t('common.saveFailed'));
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? t('users.editUser') : t('users.newUser')}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={createMut.isPending || updateMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Form
        key={user?.id ?? 'new'}
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={initialValues}
      >
        {isSelf && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={t('users.ownRoleLocked')}
          />
        )}

        <Form.Item
          name="email"
          label={t('users.email')}
          rules={[
            { required: true, message: t('common.required') },
            { type: 'email', message: t('users.emailInvalid') },
          ]}
        >
          {/* The email identifies the account and appears wherever a record says who touched
              it, so the server ignores changes to it. Disabled rather than hidden: seeing which
              account you are editing is the point of having it on the form. */}
          <Input placeholder={t('users.emailPlaceholder')} disabled={isEdit} />
        </Form.Item>

        <Form.Item
          name="name"
          label={t('users.name')}
          rules={[{ required: true, message: t('common.required') }]}
        >
          <Input placeholder={t('users.namePlaceholder')} />
        </Form.Item>

        <Form.Item
          name="role"
          label={t('users.role')}
          rules={[{ required: true, message: t('common.required') }]}
        >
          <Select
            // Locked on your own row: the server refuses it, because demoting yourself is the
            // one change here you cannot undo from inside the app.
            disabled={isSelf}
            options={(roles ?? []).map((r) => ({ value: r, label: t(`roles.${r}`) }))}
            placeholder={t('users.rolePlaceholder')}
          />
        </Form.Item>

        {!isEdit && (
          <Form.Item
            name="password"
            label={t('users.initialPassword')}
            extra={t('users.passwordHint')}
            rules={[
              { required: true, message: t('common.required') },
              { min: MIN_PASSWORD_LENGTH, message: t('users.errors.password-too-short') },
            ]}
          >
            {/* There is no mail server in this deployment, so an administrator sets the first
                password and passes it on. Changing it afterwards is the person's own to do. */}
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
