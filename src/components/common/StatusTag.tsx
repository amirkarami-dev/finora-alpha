import { Badge, Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import {
  CONTAINER_STATUS_COLOR,
  CONTRACT_STATUS_COLOR,
  PAYMENT_METHOD_COLOR,
} from '@/config/constants';
import type { ContainerStatus, ContractStatus, PaymentMethod } from '@/types';

const ALL_STATUS_COLORS: Record<string, string> = {
  ...CONTRACT_STATUS_COLOR,
  ...CONTAINER_STATUS_COLOR,
};

export function StatusTag({ status }: { status: ContractStatus | ContainerStatus | string }) {
  const { t } = useTranslation();
  const color = ALL_STATUS_COLORS[status] ?? 'default';
  return (
    <Tag color={color} style={{ margin: 0, borderRadius: 6, fontWeight: 500 }}>
      {t(`status.${status}`, status)}
    </Tag>
  );
}

const DOT_COLORS: Record<string, string> = {
  ACTIVE: '#30a46c',
  OPEN: '#3b82f6',
  PAID: '#30a46c',
  OVERDUE: '#e5484d',
  'ON HOLD': '#f5a623',
  CLOSED: '#8a94a6',
  CANCELLED: '#e5484d',
};

export function StatusDot({ status }: { status: string }) {
  const { t } = useTranslation();
  return <Badge color={DOT_COLORS[status] ?? '#8a94a6'} text={t(`status.${status}`, status)} />;
}

export function PaymentMethodTag({ method }: { method: PaymentMethod }) {
  return (
    <Tag color={PAYMENT_METHOD_COLOR[method]} style={{ margin: 0, borderRadius: 6 }}>
      {method}
    </Tag>
  );
}
