# Customers & Partners CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add create / edit / deactivate (soft-delete via `active`) for Customers and Partners, plus a new RBAC-gated Partners management page.

**Architecture:** Entity fields `Customer.active` / `Partner.active` are required (forcing the two seed literals to set them in Task 1). The API CRUD mirrors the existing `db` + `reindex()` mutation pattern. New form modals reuse the `key`+`initialValues`+`destroyOnHidden` pattern. Inactive records are filtered from the contract customer dropdown and the goods partner select but remain referenced by existing data.

**Tech Stack:** React 18 · TS strict · Ant Design 5.22 · React Router 6 · TanStack Query 5 · react-i18next (en/ar/fa).

**Spec:** `docs/superpowers/specs/2026-06-15-customer-partner-crud-design.md`

**No component test framework.** Gate every task with `npm run typecheck && npm run lint && npm run build` (exit 0) before committing. `git add <explicit paths>`; never `git add -A`; never stage `.claude/launch.json`. Commit messages end with a blank line then `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File map

| Action | File |
|---|---|
| Modify | `src/types/index.ts` |
| Modify | `src/mock/data.ts` |
| Modify | `src/services/api.ts` |
| Modify | `src/services/queries.ts` |
| Modify | `src/i18n/locales/{en,ar,fa}.json` |
| Create | `src/pages/customers/CustomerFormModal.tsx` |
| Modify | `src/pages/customers/CustomersPage.tsx` |
| Modify | `src/pages/customers/CustomerDetailPage.tsx` |
| Create | `src/pages/partners/PartnersPage.tsx` |
| Create | `src/pages/partners/PartnerFormModal.tsx` |
| Modify | `src/config/constants.ts` |
| Modify | `src/config/roles.ts` |
| Modify | `src/components/layout/SidebarNav.tsx` |
| Modify | `src/routes/index.tsx` |
| Modify | `src/pages/contracts/ContractFormModal.tsx` |
| Modify | `src/pages/contracts/ItemFormModal.tsx` |

---

## Task 1: Data foundation (types + seed + API + queries)

**Files:** `src/types/index.ts`, `src/mock/data.ts`, `src/services/api.ts`, `src/services/queries.ts`

- [ ] **Step 1: `active` on entities** — `src/types/index.ts`

In `interface Customer`, add after `customerType: CustomerType;`:
```ts
  active: boolean;
```
In `interface Partner`, add after `code: string;`:
```ts
  active: boolean;
```

- [ ] **Step 2: Seed `active: true`** — `src/mock/data.ts`

In the customer object literal (inside `CUSTOMER_SEEDS.forEach`), add after `customerType: seed.type,`:
```ts
    active: true,
```
In the `partners` master map, add `active: true`:
```ts
const partners: Partner[] = PARTNER_SEEDS.map((p) => ({
  id: `ptnr-${p.code.toLowerCase()}`,
  name: p.name,
  code: p.code,
  active: true,
}));
```

- [ ] **Step 3: Customer + Partner CRUD** — `src/services/api.ts`

Add `Currency, CustomerType` to the existing `import type { ... } from '@/types';` (`Partner` is already imported). Append at the end of the file:
```ts
/* ----------------------------- Customer CRUD ------------------------ */
export interface CustomerInput {
  name: string;
  code: string;
  defaultCurrency: Currency;
  customerType: CustomerType;
  contactName?: string;
  email?: string;
  phone?: string;
  country?: string;
  paymentTermsDays: number;
  creditLimit: number;
}

export async function createCustomer(input: CustomerInput): Promise<Customer> {
  await delay(200);
  const code = input.code.trim().toUpperCase();
  const id = `cust-${code.toLowerCase()}`;
  if (db.customers.some((c) => c.id === id)) throw new Error('duplicate-code');
  const customer: Customer = {
    id,
    name: input.name.trim(),
    code,
    defaultCurrency: input.defaultCurrency,
    customerType: input.customerType,
    contactName: input.contactName?.trim() || undefined,
    email: input.email?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    country: input.country?.trim() || undefined,
    paymentTermsDays: input.paymentTermsDays,
    creditLimit: input.creditLimit,
    active: true,
    createdAt: dayjs().toISOString(),
  };
  db.customers.push(customer);
  reindex();
  return customer;
}

export async function updateCustomer(id: string, input: CustomerInput): Promise<Customer> {
  await delay(200);
  const customer = db.customers.find((c) => c.id === id);
  if (!customer) throw new Error(`Customer ${id} not found`);
  // id, code, createdAt are immutable — mutate the rest in place.
  customer.name = input.name.trim();
  customer.defaultCurrency = input.defaultCurrency;
  customer.customerType = input.customerType;
  customer.contactName = input.contactName?.trim() || undefined;
  customer.email = input.email?.trim() || undefined;
  customer.phone = input.phone?.trim() || undefined;
  customer.country = input.country?.trim() || undefined;
  customer.paymentTermsDays = input.paymentTermsDays;
  customer.creditLimit = input.creditLimit;
  reindex();
  return customer;
}

export async function setCustomerActive(id: string, active: boolean): Promise<Customer> {
  await delay(160);
  const customer = db.customers.find((c) => c.id === id);
  if (!customer) throw new Error(`Customer ${id} not found`);
  customer.active = active;
  return customer;
}

/* ----------------------------- Partner CRUD ------------------------- */
export interface PartnerInput {
  name: string;
  code: string;
}

export async function createPartner(input: PartnerInput): Promise<Partner> {
  await delay(180);
  const code = input.code.trim().toUpperCase();
  const id = `ptnr-${code.toLowerCase()}`;
  if (db.partners.some((p) => p.id === id)) throw new Error('duplicate-code');
  const partner: Partner = { id, name: input.name.trim(), code, active: true };
  db.partners.push(partner);
  return partner; // no reindex — nothing in api.ts indexes partners
}

export async function updatePartner(id: string, input: PartnerInput): Promise<Partner> {
  await delay(160);
  const partner = db.partners.find((p) => p.id === id);
  if (!partner) throw new Error(`Partner ${id} not found`);
  partner.name = input.name.trim(); // code immutable
  return partner;
}

export async function setPartnerActive(id: string, active: boolean): Promise<Partner> {
  await delay(140);
  const partner = db.partners.find((p) => p.id === id);
  if (!partner) throw new Error(`Partner ${id} not found`);
  partner.active = active;
  return partner;
}
```

- [ ] **Step 4: Mutation hooks** — `src/services/queries.ts`

Append after the existing mutations:
```ts
/* -------------------- Customer & Partner mutations ------------------- */
function useInvalidateCustomers() {
  const qc = useQueryClient();
  return (id?: string) => {
    qc.invalidateQueries({ queryKey: qk.customers });
    qc.invalidateQueries({ queryKey: qk.accounts });
    qc.invalidateQueries({ queryKey: qk.kpis });
    qc.invalidateQueries({ queryKey: qk.executiveSummary });
    if (id) {
      qc.invalidateQueries({ queryKey: qk.account(id) });
      qc.invalidateQueries({ queryKey: qk.customerPortal(id) });
    }
  };
}

export const useCreateCustomer = () => {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: (input: api.CustomerInput) => api.createCustomer(input),
    onSuccess: (c) => invalidate(c.id),
  });
};

export const useUpdateCustomer = () => {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: api.CustomerInput }) =>
      api.updateCustomer(id, input),
    onSuccess: (c) => invalidate(c.id),
  });
};

export const useSetCustomerActive = () => {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.setCustomerActive(id, active),
    onSuccess: (c) => invalidate(c.id),
  });
};

function useInvalidatePartners() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: qk.partners });
}

export const useCreatePartner = () => {
  const invalidate = useInvalidatePartners();
  return useMutation({ mutationFn: (input: api.PartnerInput) => api.createPartner(input), onSuccess: invalidate });
};

export const useUpdatePartner = () => {
  const invalidate = useInvalidatePartners();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: api.PartnerInput }) => api.updatePartner(id, input),
    onSuccess: invalidate,
  });
};

export const useSetPartnerActive = () => {
  const invalidate = useInvalidatePartners();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.setPartnerActive(id, active),
    onSuccess: invalidate,
  });
};
```

- [ ] **Step 5: Gate** — `npm run typecheck && npm run lint && npm run build`.
- [ ] **Step 6: Commit**
```bash
git add src/types/index.ts src/mock/data.ts src/services/api.ts src/services/queries.ts
git commit -m "feat(crud): active flag + customer/partner CRUD API & hooks (data layer)"
```

---

## Task 2: i18n (en / ar / fa)

**Files:** `src/i18n/locales/{en,ar,fa}.json`

- [ ] **Step 1: English** — `src/i18n/locales/en.json`

`common` — add after `"days": "days"`:
```json
    "days": "days",
    "active": "Active",
    "inactive": "Inactive",
    "activate": "Activate",
    "deactivate": "Deactivate",
    "deactivateConfirm": "Deactivate this record?",
    "activateConfirm": "Activate this record?"
```
`customers` — add after `"type": "Type"`:
```json
    "type": "Type",
    "nameLabel": "Name",
    "termsLabel": "Payment terms (days)",
    "creditLimit": "Credit limit",
    "phone": "Phone",
    "editCustomer": "Edit customer",
    "created": "Customer created",
    "updated": "Customer updated",
    "deactivated": "Customer deactivated",
    "activated": "Customer activated",
    "status": "Status",
    "codeTaken": "This code is already in use",
    "codeInvalid": "Letters, numbers and hyphens only",
    "emailInvalid": "Enter a valid email",
    "namePlaceholder": "e.g. Alco Metal Trading",
    "codePlaceholder": "e.g. AM",
    "emailPlaceholder": "name@company.com",
    "phonePlaceholder": "+971 50 000 0000",
    "countryPlaceholder": "e.g. UAE"
```
`nav` — add after `"portal": "My Account",`:
```json
    "partners": "Partners",
```
Add a new top-level `partners` block (place after the `customerTypes` block):
```json
  "partners": {
    "title": "Partners",
    "subtitle": "Joint-venture partners for purchase deals",
    "newPartner": "New partner",
    "editPartner": "Edit partner",
    "name": "Name",
    "code": "Code",
    "created": "Partner created",
    "updated": "Partner updated",
    "deactivated": "Partner deactivated",
    "activated": "Partner activated",
    "codeTaken": "This code is already in use",
    "codeInvalid": "Letters, numbers and hyphens only",
    "namePlaceholder": "e.g. Crescent Capital Partners",
    "codePlaceholder": "e.g. CC"
  },
```

- [ ] **Step 2: Arabic** — `src/i18n/locales/ar.json` (same keys/positions)

`common`: `active "نشط"`, `inactive "غير نشط"`, `activate "تفعيل"`, `deactivate "إلغاء التفعيل"`, `deactivateConfirm "إلغاء تفعيل هذا السجل؟"`, `activateConfirm "تفعيل هذا السجل؟"`.
`customers`: `nameLabel "الاسم"`, `termsLabel "مدة السداد (أيام)"`, `creditLimit "حد الائتمان"`, `phone "الهاتف"`, `editCustomer "تعديل العميل"`, `created "تم إنشاء العميل"`, `updated "تم تحديث العميل"`, `deactivated "تم إلغاء تفعيل العميل"`, `activated "تم تفعيل العميل"`, `status "الحالة"`, `codeTaken "هذا الرمز مستخدم بالفعل"`, `codeInvalid "أحرف وأرقام وشرطات فقط"`, `emailInvalid "أدخل بريداً إلكترونياً صحيحاً"`, `namePlaceholder "مثال: ألكو لتجارة المعادن"`, `codePlaceholder "مثال: AM"`, `emailPlaceholder "name@company.com"`, `phonePlaceholder "+971 50 000 0000"`, `countryPlaceholder "مثال: الإمارات"`.
`nav.partners "الشركاء"`.
`partners` block: `title "الشركاء"`, `subtitle "شركاء المشاريع المشتركة لصفقات الشراء"`, `newPartner "شريك جديد"`, `editPartner "تعديل الشريك"`, `name "الاسم"`, `code "الرمز"`, `created "تم إنشاء الشريك"`, `updated "تم تحديث الشريك"`, `deactivated "تم إلغاء تفعيل الشريك"`, `activated "تم تفعيل الشريك"`, `codeTaken "هذا الرمز مستخدم بالفعل"`, `codeInvalid "أحرف وأرقام وشرطات فقط"`, `namePlaceholder "مثال: كريسنت كابيتال بارتنرز"`, `codePlaceholder "مثال: CC"`.

- [ ] **Step 3: Persian** — `src/i18n/locales/fa.json` (same keys/positions)

`common`: `active "فعال"`, `inactive "غیرفعال"`, `activate "فعال‌سازی"`, `deactivate "غیرفعال‌سازی"`, `deactivateConfirm "این مورد غیرفعال شود؟"`, `activateConfirm "این مورد فعال شود؟"`.
`customers`: `nameLabel "نام"`, `termsLabel "مهلت پرداخت (روز)"`, `creditLimit "سقف اعتبار"`, `phone "تلفن"`, `editCustomer "ویرایش مشتری"`, `created "مشتری ایجاد شد"`, `updated "مشتری به‌روزرسانی شد"`, `deactivated "مشتری غیرفعال شد"`, `activated "مشتری فعال شد"`, `status "وضعیت"`, `codeTaken "این کد قبلاً استفاده شده است"`, `codeInvalid "فقط حروف، اعداد و خط تیره"`, `emailInvalid "ایمیل معتبر وارد کنید"`, `namePlaceholder "مثال: آلکو متال تریدینگ"`, `codePlaceholder "مثال: AM"`, `emailPlaceholder "name@company.com"`, `phonePlaceholder "+971 50 000 0000"`, `countryPlaceholder "مثال: امارات"`.
`nav.partners "شرکا"`.
`partners` block: `title "شرکا"`, `subtitle "شرکای سرمایه‌گذاری مشترک برای معاملات خرید"`, `newPartner "شریک جدید"`, `editPartner "ویرایش شریک"`, `name "نام"`, `code "کد"`, `created "شریک ایجاد شد"`, `updated "شریک به‌روزرسانی شد"`, `deactivated "شریک غیرفعال شد"`, `activated "شریک فعال شد"`, `codeTaken "این کد قبلاً استفاده شده است"`, `codeInvalid "فقط حروف، اعداد و خط تیره"`, `namePlaceholder "مثال: کرسنت کپیتال پارتنرز"`, `codePlaceholder "مثال: CC"`.

- [ ] **Step 4: Gate** — `npm run typecheck && npm run lint && npm run build` (the build parses the JSON).
- [ ] **Step 5: Commit**
```bash
git add src/i18n/locales/en.json src/i18n/locales/ar.json src/i18n/locales/fa.json
git commit -m "feat(crud): i18n for customer/partner CRUD + active states (en/ar/fa)"
```

---

## Task 3: CustomerFormModal + Customers page wiring

**Files:** Create `src/pages/customers/CustomerFormModal.tsx`; modify `src/pages/customers/CustomersPage.tsx`

- [ ] **Step 1: Create `src/pages/customers/CustomerFormModal.tsx`** (verbatim)
```tsx
import { App, Col, Form, Input, InputNumber, Modal, Row, Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { useCreateCustomer, useUpdateCustomer } from '@/services/queries';
import { CURRENCIES } from '@/config/constants';
import type { CustomerInput } from '@/services/api';
import type { Customer, CustomerType } from '@/types';

const CUSTOMER_TYPES: CustomerType[] = ['BUYER', 'SUPPLIER', 'BOTH'];

interface CustomerFormValues {
  name: string;
  code: string;
  customerType: CustomerType;
  defaultCurrency: Customer['defaultCurrency'];
  contactName?: string;
  email?: string;
  phone?: string;
  country?: string;
  paymentTermsDays: number;
  creditLimit: number;
}

interface CustomerFormModalProps {
  open: boolean;
  onClose: () => void;
  /** When provided the modal edits this customer; otherwise it creates one. */
  customer?: Customer;
}

export function CustomerFormModal({ open, onClose, customer }: CustomerFormModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<CustomerFormValues>();
  const createMut = useCreateCustomer();
  const updateMut = useUpdateCustomer();
  const isEdit = !!customer;

  const initialValues: Partial<CustomerFormValues> = customer
    ? {
        name: customer.name,
        code: customer.code,
        customerType: customer.customerType,
        defaultCurrency: customer.defaultCurrency,
        contactName: customer.contactName,
        email: customer.email,
        phone: customer.phone,
        country: customer.country,
        paymentTermsDays: customer.paymentTermsDays,
        creditLimit: customer.creditLimit,
      }
    : { defaultCurrency: 'AED', customerType: 'BUYER', paymentTermsDays: 30, creditLimit: 0 };

  const submit = async () => {
    let values: CustomerFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const input: CustomerInput = {
      name: values.name.trim(),
      code: values.code.trim(),
      customerType: values.customerType,
      defaultCurrency: values.defaultCurrency,
      contactName: values.contactName?.trim() || undefined,
      email: values.email?.trim() || undefined,
      phone: values.phone?.trim() || undefined,
      country: values.country?.trim() || undefined,
      paymentTermsDays: values.paymentTermsDays,
      creditLimit: values.creditLimit,
    };
    try {
      if (isEdit && customer) {
        await updateMut.mutateAsync({ id: customer.id, input });
        message.success(t('customers.updated'));
      } else {
        await createMut.mutateAsync(input);
        message.success(t('customers.created'));
      }
      onClose();
    } catch (e) {
      if (e instanceof Error && e.message === 'duplicate-code') {
        form.setFields([{ name: 'code', errors: [t('customers.codeTaken')] }]);
        return;
      }
      message.error(t('common.saveFailed'));
    }
  };

  return (
    <Modal
      open={open}
      width={640}
      title={isEdit ? t('customers.editCustomer') : t('customers.newCustomer')}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={createMut.isPending || updateMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Form key={customer?.id ?? 'new'} form={form} layout="vertical" preserve={false} initialValues={initialValues}>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item name="name" label={t('customers.nameLabel')} rules={[{ required: true, message: t('common.required') }]}>
              <Input placeholder={t('customers.namePlaceholder')} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="code"
              label={t('customers.code')}
              rules={[
                { required: true, message: t('common.required') },
                { pattern: /^[A-Za-z0-9-]+$/, message: t('customers.codeInvalid') },
              ]}
            >
              <Input placeholder={t('customers.codePlaceholder')} disabled={isEdit} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="customerType" label={t('customers.type')} rules={[{ required: true, message: t('common.required') }]}>
              <Select options={CUSTOMER_TYPES.map((v) => ({ value: v, label: t(`customerTypes.${v}`) }))} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="defaultCurrency" label={t('customers.currency')} rules={[{ required: true, message: t('common.required') }]}>
              <Select options={CURRENCIES.map((v) => ({ value: v, label: v }))} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="contactName" label={t('customers.contact')}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="email" label={t('auth.email')} rules={[{ type: 'email', message: t('customers.emailInvalid') }]}>
              <Input placeholder={t('customers.emailPlaceholder')} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="phone" label={t('customers.phone')}>
              <Input placeholder={t('customers.phonePlaceholder')} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="country" label={t('customers.country')}>
              <Input placeholder={t('customers.countryPlaceholder')} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="paymentTermsDays" label={t('customers.termsLabel')} rules={[{ required: true, message: t('common.required') }]}>
              <InputNumber min={0} step={1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="creditLimit" label={t('customers.creditLimit')} rules={[{ required: true, message: t('common.required') }]}>
              <InputNumber min={0} step={1000} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}
```

- [ ] **Step 2: Wire CustomersPage** — `src/pages/customers/CustomersPage.tsx`

Imports: add `Popconfirm, Segmented` to the antd import; add `EditOutlined` to the icons import (`import { EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';`); add `import { useAccounts, useSetCustomerActive } from '@/services/queries';` (replace the existing `useAccounts` import line); add `import { CustomerFormModal } from './CustomerFormModal';`.

Inside the component, after `const [search, setSearch] = useState('');` add:
```ts
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [formState, setFormState] = useState<{ open: boolean; customer?: CustomerAccount }>({ open: false });
  const setActive = useSetCustomerActive();
```
Replace the `filtered` memo with:
```ts
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((c) => {
      const matchesStatus =
        statusFilter === 'all' ? true : statusFilter === 'active' ? c.active : !c.active;
      const matchesQ = !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
      return matchesStatus && matchesQ;
    });
  }, [data, search, statusFilter]);
```
In the **name** column `render`, add an inactive tag after the name/code block — change the `<div style={{ lineHeight: 1.3 }}>...</div>` to include a tag:
```tsx
          <div style={{ lineHeight: 1.3 }}>
            <div style={{ fontWeight: 600 }}>
              {r.name}
              {!r.active && (
                <Tag style={{ marginInlineStart: 8 }}>{t('common.inactive')}</Tag>
              )}
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {r.code} · {r.country}
            </Text>
          </div>
```
Append an **Actions** column at the end of the `columns` array (after the `contracts` column object):
```tsx
    {
      title: t('common.actions'),
      key: 'actions',
      fixed: 'right',
      width: 180,
      align: 'right',
      onCell: () => ({ onClick: (e) => e.stopPropagation() }),
      render: (_, r) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              setFormState({ open: true, customer: r });
            }}
          >
            {t('common.edit')}
          </Button>
          <Popconfirm
            title={r.active ? t('common.deactivateConfirm') : t('common.activateConfirm')}
            okText={t('common.yes')}
            cancelText={t('common.no')}
            onConfirm={async () => {
              await setActive.mutateAsync({ id: r.id, active: !r.active });
              message.success(r.active ? t('customers.deactivated') : t('customers.activated'));
            }}
          >
            <Button type="link" size="small" danger={r.active}>
              {r.active ? t('common.deactivate') : t('common.activate')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
```
Bump the table `scroll` to `scroll={{ x: 1330 }}`.
Change the **New customer** button `onClick` from `message.info(t('common.comingSoon'))` to `() => setFormState({ open: true, customer: undefined })`.
In the toolbar `<div style={{ marginBottom: 16, ... }}>`, add a `Segmented` before the `Text` total (so the row is: search · segmented · total) — replace the toolbar's `<Text type="secondary">{t('customers.totalCustomers'...)}</Text>` with:
```tsx
          <Space wrap>
            <Segmented
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as 'active' | 'inactive' | 'all')}
              options={[
                { label: t('common.active'), value: 'active' },
                { label: t('common.inactive'), value: 'inactive' },
                { label: t('common.all'), value: 'all' },
              ]}
            />
            <Text type="secondary">{t('customers.totalCustomers', { count: filtered.length })}</Text>
          </Space>
```
Before the closing `</div>` of the component (after the `</Card>`), add:
```tsx
      <CustomerFormModal
        open={formState.open}
        onClose={() => setFormState((s) => ({ ...s, open: false }))}
        customer={formState.customer}
      />
```

- [ ] **Step 3: Gate** — `npm run typecheck && npm run lint && npm run build`.
- [ ] **Step 4: Commit**
```bash
git add src/pages/customers/CustomerFormModal.tsx src/pages/customers/CustomersPage.tsx
git commit -m "feat(crud): customer create/edit/deactivate on the Customers page"
```

---

## Task 4: Customer detail — Edit button + inactive tag

**Files:** `src/pages/customers/CustomerDetailPage.tsx`

- [ ] **Step 1: Edit button + tag**

Imports: add `Button` to the antd import; add `import { EditOutlined } from '@ant-design/icons';` (merge with existing icon import line); add `import { useState } from 'react';` (the file currently has no React import — add it); add `import { CustomerFormModal } from './CustomerFormModal';`.

Add state after `const { id = '' } = useParams();`:
```ts
  const [editOpen, setEditOpen] = useState(false);
```
Replace the `<PageHeader ... />` line with:
```tsx
      <PageHeader
        onBack
        title={
          <Space wrap>
            <span>{account?.name ?? t('common.loading')}</span>
            {account && !account.active && <Tag>{t('common.inactive')}</Tag>}
          </Space>
        }
        subtitle={t('customers.detailTitle')}
        extra={
          <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)} disabled={!account}>
            {t('common.edit')}
          </Button>
        }
      />
```
Before the final closing `</div>`, add:
```tsx
      {account && (
        <CustomerFormModal open={editOpen} onClose={() => setEditOpen(false)} customer={account} />
      )}
```

- [ ] **Step 2: Gate** — `npm run typecheck && npm run lint && npm run build`.
- [ ] **Step 3: Commit**
```bash
git add src/pages/customers/CustomerDetailPage.tsx
git commit -m "feat(crud): Edit button + inactive tag on customer detail"
```

---

## Task 5: Partners page + route + nav + RBAC

**Files:** Create `src/pages/partners/PartnersPage.tsx`, `src/pages/partners/PartnerFormModal.tsx`; modify `src/config/constants.ts`, `src/config/roles.ts`, `src/components/layout/SidebarNav.tsx`, `src/routes/index.tsx`

- [ ] **Step 1: Create `src/pages/partners/PartnerFormModal.tsx`** (verbatim)
```tsx
import { App, Form, Input, Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import { useCreatePartner, useUpdatePartner } from '@/services/queries';
import type { PartnerInput } from '@/services/api';
import type { Partner } from '@/types';

interface PartnerFormValues {
  name: string;
  code: string;
}

interface PartnerFormModalProps {
  open: boolean;
  onClose: () => void;
  partner?: Partner;
}

export function PartnerFormModal({ open, onClose, partner }: PartnerFormModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<PartnerFormValues>();
  const createMut = useCreatePartner();
  const updateMut = useUpdatePartner();
  const isEdit = !!partner;

  const initialValues: Partial<PartnerFormValues> = partner
    ? { name: partner.name, code: partner.code }
    : {};

  const submit = async () => {
    let values: PartnerFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const input: PartnerInput = { name: values.name.trim(), code: values.code.trim() };
    try {
      if (isEdit && partner) {
        await updateMut.mutateAsync({ id: partner.id, input });
        message.success(t('partners.updated'));
      } else {
        await createMut.mutateAsync(input);
        message.success(t('partners.created'));
      }
      onClose();
    } catch (e) {
      if (e instanceof Error && e.message === 'duplicate-code') {
        form.setFields([{ name: 'code', errors: [t('partners.codeTaken')] }]);
        return;
      }
      message.error(t('common.saveFailed'));
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? t('partners.editPartner') : t('partners.newPartner')}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={createMut.isPending || updateMut.isPending}
      destroyOnHidden
      maskClosable={false}
    >
      <Form key={partner?.id ?? 'new'} form={form} layout="vertical" preserve={false} initialValues={initialValues}>
        <Form.Item name="name" label={t('partners.name')} rules={[{ required: true, message: t('common.required') }]}>
          <Input placeholder={t('partners.namePlaceholder')} />
        </Form.Item>
        <Form.Item
          name="code"
          label={t('partners.code')}
          rules={[
            { required: true, message: t('common.required') },
            { pattern: /^[A-Za-z0-9-]+$/, message: t('partners.codeInvalid') },
          ]}
        >
          <Input placeholder={t('partners.codePlaceholder')} disabled={isEdit} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
```

- [ ] **Step 2: Create `src/pages/partners/PartnersPage.tsx`** (verbatim)
```tsx
import { useMemo, useState } from 'react';
import { App, Button, Card, Popconfirm, Segmented, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';
import { usePartners, useSetPartnerActive } from '@/services/queries';
import type { Partner } from '@/types';
import { PartnerFormModal } from './PartnerFormModal';

const { Text } = Typography;

export default function PartnersPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { data, isLoading } = usePartners();
  const setActive = useSetPartnerActive();
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [formState, setFormState] = useState<{ open: boolean; partner?: Partner }>({ open: false });

  const filtered = useMemo(
    () =>
      (data ?? []).filter((p) =>
        statusFilter === 'all' ? true : statusFilter === 'active' ? p.active : !p.active,
      ),
    [data, statusFilter],
  );

  const columns: ColumnsType<Partner> = [
    { title: t('partners.name'), dataIndex: 'name', render: (v) => <Text strong>{v}</Text> },
    {
      title: t('partners.code'),
      dataIndex: 'code',
      width: 160,
      render: (v) => <Tag style={{ fontFamily: 'monospace' }}>{v}</Tag>,
    },
    {
      title: t('customers.status'),
      dataIndex: 'active',
      width: 120,
      align: 'center',
      render: (v: boolean) =>
        v ? <Tag color="success">{t('common.active')}</Tag> : <Tag>{t('common.inactive')}</Tag>,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 200,
      align: 'right',
      render: (_, r) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => setFormState({ open: true, partner: r })}
          >
            {t('common.edit')}
          </Button>
          <Popconfirm
            title={r.active ? t('common.deactivateConfirm') : t('common.activateConfirm')}
            okText={t('common.yes')}
            cancelText={t('common.no')}
            onConfirm={async () => {
              await setActive.mutateAsync({ id: r.id, active: !r.active });
              message.success(r.active ? t('partners.deactivated') : t('partners.activated'));
            }}
          >
            <Button type="link" size="small" danger={r.active}>
              {r.active ? t('common.deactivate') : t('common.activate')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="fade-in">
      <PageHeader
        title={t('partners.title')}
        subtitle={t('partners.subtitle')}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormState({ open: true, partner: undefined })}>
            {t('partners.newPartner')}
          </Button>
        }
      />
      <Card variant="borderless" styles={{ body: { padding: 16 } }}>
        <div style={{ marginBottom: 16 }}>
          <Segmented
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as 'active' | 'inactive' | 'all')}
            options={[
              { label: t('common.active'), value: 'active' },
              { label: t('common.inactive'), value: 'inactive' },
              { label: t('common.all'), value: 'all' },
            ]}
          />
        </div>
        <Table<Partner>
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={filtered}
          scroll={{ x: 720 }}
          pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }}
        />
      </Card>
      <PartnerFormModal
        open={formState.open}
        onClose={() => setFormState((s) => ({ ...s, open: false }))}
        partner={formState.partner}
      />
    </div>
  );
}
```

- [ ] **Step 3: Route key** — `src/config/constants.ts`

In `ROUTES`, add after `settings: '/app/settings',`:
```ts
  partners: '/app/partners',
```
(Insert before `portal: '/app/portal',` if present — order doesn't matter functionally.)

- [ ] **Step 4: Nav + RBAC** — `src/config/roles.ts`

In `ROLE_ACCESS`, add `'partners'` to **Manager** and **Staff** arrays (e.g. after `'contracts'`). Do NOT add it to CEO or Customer.
In `NAV_ITEMS`, add after the `contracts` entry:
```ts
  { key: 'partners', route: ROUTES.partners, icon: 'apartment', group: 'operations' },
```

- [ ] **Step 5: Sidebar icon** — `src/components/layout/SidebarNav.tsx`

Add `ApartmentOutlined` to the `@ant-design/icons` import. Add to the `ICONS` map:
```ts
  apartment: <ApartmentOutlined />,
```

- [ ] **Step 6: Route** — `src/routes/index.tsx`

Add `import PartnersPage from '@/pages/partners/PartnersPage';` with the other page imports. Inside the `<Route path={ROUTES.app}>` block, add (after the `contracts/:id` route):
```tsx
        <Route path="partners" element={<RoleRoute routeKey="partners"><PartnersPage /></RoleRoute>} />
```

- [ ] **Step 7: Gate** — `npm run typecheck && npm run lint && npm run build`.
- [ ] **Step 8: Commit**
```bash
git add src/pages/partners/PartnersPage.tsx src/pages/partners/PartnerFormModal.tsx src/config/constants.ts src/config/roles.ts src/components/layout/SidebarNav.tsx src/routes/index.tsx
git commit -m "feat(crud): Partners management page (route + nav + RBAC) with create/edit/deactivate"
```

---

## Task 6: Exclude inactive from pickers

**Files:** `src/pages/contracts/ContractFormModal.tsx`, `src/pages/contracts/ItemFormModal.tsx`

- [ ] **Step 1: Contract dropdown** — `src/pages/contracts/ContractFormModal.tsx`

In `customerOptions`, change the base filter to also require `active`:
```ts
    const list = (customers ?? []).filter((c) => allowed.includes(c.customerType) && c.active);
```
**Leave the edit-mode union untouched** — the current-customer re-add must keep pulling from the unfiltered `customers` list so an inactive customer on an existing contract stays selectable.

- [ ] **Step 2: Goods partner select** — `src/pages/contracts/ItemFormModal.tsx`

Change the partner `Select` `options` to pool active partners PLUS any partner already allocated on the edited line, then exclude already-chosen:
```tsx
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
```

- [ ] **Step 3: Gate** — `npm run typecheck && npm run lint && npm run build`.
- [ ] **Step 4: Commit**
```bash
git add src/pages/contracts/ContractFormModal.tsx src/pages/contracts/ItemFormModal.tsx
git commit -m "feat(crud): exclude inactive customers/partners from new-work pickers"
```

---

## Task 7: Verification (no code)

- [ ] **Step 1: Gate clean** — `npm run typecheck && npm run lint && npm run build`.
- [ ] **Step 2: Live preview** (port 3031, Manager `amir@finora.app`/`demo1234`):
  - Customers page: Active/Inactive/All Segmented (default Active). New customer with a fresh code appears; a **duplicate code** shows a field error on `code`; an invalid email is rejected. Edit persists. Deactivate (confirm) → row leaves the Active view, shows under Inactive/All with an "Inactive" tag; Reactivate restores it. Row Edit/Deactivate do **not** navigate to the detail.
  - New contract dialog: the deactivated customer is **absent** from the customer dropdown; editing an existing contract whose customer is inactive still shows that customer.
  - Sidebar shows **Partners** (Operations) for Manager; log in as `staff@finora.app`/`Staff@2026` → Partners visible; as `ceo@finora.app`/`Ceo@2026` and the portal Customer → Partners absent, and **direct** nav to `/app/partners` redirects to the role home.
  - Partners page: create/edit/deactivate work; deactivated partner is **absent** from the goods partner select; but editing a goods line that already allocates a now-inactive partner still shows it (label intact) and a no-op save preserves the allocation; the contract-detail partner column still renders an inactive partner's name.
  - Customer detail: Edit button works; inactive tag shows for an inactive customer; editing credit limit then reopening that customer's My-Account portal shows the new value.
  - Dark/light + ar/fa (RTL) hold for the new tables/segmented/forms.

---

## Self-review (against the spec)

**Coverage:** active field (T1) · API CRUD + active toggles (T1) · mutation hooks incl. `qk.customerPortal`/`qk.account` invalidation (T1) · i18n incl. dedicated nameLabel/termsLabel, code/email validation, common active states, partners block, nav.partners (T2) · CustomerFormModal + Customers page filter/new/actions/inactive-tag (T3) · customer-detail Edit + tag (T4) · Partners page + modal + route/nav/RBAC ordered constants→roles→sidebar→routes (T5) · dropdown exclusions with the contract union kept + the goods active-OR-allocated pool (T6) · verification incl. direct-URL RBAC, inactive-allocated-partner edit, portal refresh (T7). ✓

**Green commits:** required `active` only forces the two seed literals + the new create* literals, all in T1; DTOs are new so no existing caller breaks. ✓

**Type consistency:** `CustomerInput`/`PartnerInput` and the six hooks names are used identically across T1/T3/T5; `useSetCustomerActive`/`useSetPartnerActive` signatures (`{id, active}`) match their call sites; `Partner.active`/`Customer.active` referenced consistently. ✓

**Placeholders:** none.
