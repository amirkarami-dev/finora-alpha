import { App, Form, Input, Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import { useChangeOwnPassword } from '@/services/queries';
import { MIN_PASSWORD_LENGTH, fieldErrorFor } from './passwordRules';

interface ChangePasswordValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Changing your own password.
 *
 * <p>Opened from the account menu in the header rather than living on the Settings page, because
 * Settings is behind a permission that Staff and Customer do not hold — putting it there would
 * have left the two roles least able to ask an administrator unable to reach it at all. The
 * account menu is the one surface every signed-in role has.</p>
 */
export function ChangePasswordModal({ open, onClose }: ChangePasswordModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<ChangePasswordValues>();
  const changePassword = useChangeOwnPassword();

  const submit = async () => {
    let values: ChangePasswordValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    try {
      await changePassword.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      message.success(t('users.passwordChanged'));
      onClose();
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      // `password-too-short` is reported against `password` by the admin forms; here the same
      // rule belongs on `newPassword`.
      const mapped = fieldErrorFor(code);
      const field = mapped === 'password' ? 'newPassword' : mapped;
      if (field === 'newPassword' || field === 'currentPassword') {
        form.setFields([{ name: field, errors: [t(`users.errors.${code}`)] }]);
        return;
      }
      message.error(t('common.saveFailed'));
    }
  };

  return (
    <Modal
      open={open}
      title={t('users.changePassword')}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={changePassword.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Form form={form} layout="vertical" preserve={false} style={{ marginTop: 8 }}>
        <Form.Item
          name="currentPassword"
          label={t('users.currentPassword')}
          rules={[{ required: true, message: t('common.required') }]}
        >
          <Input.Password autoComplete="current-password" autoFocus />
        </Form.Item>
        <Form.Item
          name="newPassword"
          label={t('users.newPassword')}
          extra={t('users.passwordHint')}
          rules={[
            { required: true, message: t('common.required') },
            { min: MIN_PASSWORD_LENGTH, message: t('users.errors.password-too-short') },
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          name="confirmPassword"
          label={t('users.confirmPassword')}
          dependencies={['newPassword']}
          rules={[
            { required: true, message: t('common.required') },
            // Caught here rather than on the server: a typo in a field nobody can read back is
            // the one password mistake that locks you out of your own account.
            ({ getFieldValue }) => ({
              validator: (_, value) =>
                !value || value === getFieldValue('newPassword')
                  ? Promise.resolve()
                  : Promise.reject(new Error(t('users.passwordMismatch'))),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
