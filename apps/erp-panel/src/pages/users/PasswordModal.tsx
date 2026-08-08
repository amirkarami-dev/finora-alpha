import { App, Form, Input, Modal, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { useSetUserPassword } from '@/services/queries';
import type { User } from '@/types';
import { MIN_PASSWORD_LENGTH, fieldErrorFor } from './passwordRules';

const { Text } = Typography;

interface PasswordFormValues {
  password: string;
}

interface PasswordModalProps {
  /** The user whose password is being reset; undefined keeps the modal closed. */
  user?: User;
  onClose: () => void;
}

/**
 * An administrator setting someone else's password.
 *
 * <p>There is no "current password" here — the whole point is that the administrator does not
 * know it. That makes this the one screen in the app that can take an account over, which is why
 * it names the account it is about to change in the body rather than only in the title.</p>
 */
export function PasswordModal({ user, onClose }: PasswordModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<PasswordFormValues>();
  const setPassword = useSetUserPassword();

  const submit = async () => {
    if (!user) return;

    let values: PasswordFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    try {
      await setPassword.mutateAsync({ id: user.id, password: values.password });
      message.success(t('users.passwordReset'));
      onClose();
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      if (fieldErrorFor(code) === 'password') {
        form.setFields([{ name: 'password', errors: [t(`users.errors.${code}`)] }]);
        return;
      }
      message.error(t('common.saveFailed'));
    }
  };

  return (
    <Modal
      open={!!user}
      title={t('users.resetPassword')}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={setPassword.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Text type="secondary">{t('users.resetPasswordFor', { name: user?.name ?? '' })}</Text>
      <Form form={form} layout="vertical" preserve={false} style={{ marginTop: 16 }}>
        <Form.Item
          name="password"
          label={t('users.newPassword')}
          extra={t('users.passwordHint')}
          rules={[
            { required: true, message: t('common.required') },
            { min: MIN_PASSWORD_LENGTH, message: t('users.errors.password-too-short') },
          ]}
        >
          <Input.Password autoComplete="new-password" autoFocus />
        </Form.Item>
      </Form>
    </Modal>
  );
}
