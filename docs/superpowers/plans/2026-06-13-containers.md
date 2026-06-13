# Containers (shipments) create/edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add create/edit forms for Containers (shipments) — including Bill of Lading, booking, and seal numbers — wired into the Containers page and the contract detail page, with the parent item's remaining MT kept in sync.

**Architecture:** Mirror the existing Contract/Goods form pattern: a single reusable `ContainerFormModal` (create + edit) opened from both pages; mutations write through the in-memory `db`, recompute the parent item's `remainingMt`, and invalidate the dependent TanStack Query reads. No backend; mock data is mutated in-session.

**Tech Stack:** Vite 6 · React 18 · TypeScript (strict) · Ant Design 5 · TanStack Query 5 · react-i18next · dayjs.

**Testing note:** This project has **no component test framework** (consistent with the existing Contract/Goods forms). Each task is gated by `npm run typecheck && npm run lint && npm run build`; the final task is a live preview drive. Commit after each task.

**Spec:** `docs/superpowers/specs/2026-06-13-containers-design.md`

---

## File Structure

- `src/types/index.ts` — add 3 optional fields to `Container`.
- `src/mock/data.ts` — seed the 3 doc fields deterministically (no PRNG disruption).
- `src/services/api.ts` — `ContainerInput`, `createContainer`, `updateContainer`, `recomputeItemRemaining` helper.
- `src/services/queries.ts` — `useCreateContainer`, `useUpdateContainer`; extend `useInvalidateTrade` with `aging`.
- `src/pages/contracts/ContainerFormModal.tsx` — **new** create/edit modal.
- `src/pages/containers/ContainersPage.tsx` — New-container button, Actions (Edit) column, expandable doc rows.
- `src/pages/contracts/ContractDetailPage.tsx` — Add-container button, Actions (Edit) column, expandable doc rows.
- `src/i18n/locales/{en,ar,fa}.json` — new `containers.*` keys.

---

## Task 1: Add shipping-document fields to the Container type

**Files:**
- Modify: `src/types/index.ts` (the `Container` interface, around lines 68-82)

- [ ] **Step 1: Add the three optional fields**

In `src/types/index.ts`, inside `export interface Container { … }`, add the fields just before the closing `}` (after `status: ContainerStatus;`):

```ts
  status: ContainerStatus;
  /** Bill of Lading number (transport contract / title document). */
  blNumber?: string;
  /** Carrier booking number. */
  bookingNumber?: string;
  /** Container seal number (recorded on the B/L). */
  sealNumber?: string;
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: PASS (no output / exit 0). Optional fields don't break existing construction sites.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add B/L, booking, seal fields to Container"
```

---

## Task 2: Seed the document fields in mock data

**Files:**
- Modify: `src/mock/data.ts`

Doc numbers are derived deterministically from each container's `reference` so the existing seeded dataset (quantities, prices, totals) stays byte-identical — only the new fields are added.

- [ ] **Step 1: Add a deterministic doc-number helper**

In `src/mock/data.ts`, just after the `makeContainerRef` function (around line 117), add:

```ts
const BL_PREFIXES = ['MAEU', 'MSCU', 'COSU', 'HLCU', 'ONEY'];
const SEAL_PREFIXES = ['SL', 'CN', 'ML'];

/** Deterministic shipping-doc numbers derived from the container reference (no PRNG impact). */
function docNumbersFor(reference: string) {
  let h = 0;
  for (let i = 0; i < reference.length; i++) h = (h * 31 + reference.charCodeAt(i)) >>> 0;
  return {
    blNumber: `${BL_PREFIXES[h % BL_PREFIXES.length]}${100000000 + (h % 900000000)}`,
    bookingNumber: `BK${10000000 + (h % 90000000)}`,
    sealNumber: `${SEAL_PREFIXES[(h >> 3) % SEAL_PREFIXES.length]}${1000000 + (h % 9000000)}`,
  };
}
```

- [ ] **Step 2: Capture the reference and spread the doc numbers onto each generated container**

In the shipment-generation loop, find the `const container: Container = { … }` object (around lines 209-222). The reference is generated inline; capture it in a local so the doc numbers can derive from it. Replace the whole block with:

```ts
        const reference = makeContainerRef();
        const container: Container = {
          id: `cnt-${contractId}-${s + 1}`,
          contractId,
          itemId: item.id,
          reference,
          quantityMt: qty,
          lmePrice: round(price, 2),
          premium: 0,
          shipmentDate: shipmentDate.toISOString(),
          arrivalDate: arrival.toISOString(),
          dueDate: due.toISOString(),
          invoiceUSD: invoice,
          status,
          ...docNumbersFor(reference),
        };
```

- [ ] **Step 3: Add explicit doc numbers to the two Alco anchor containers**

In the IIFE that builds the canonical Alco contract (around lines 288-315), add the three fields to **both** `c1` and `c2`. For `c1` (reference `MSNU8018095`), add after `status: 'PAID',`:

```ts
    status: 'PAID',
    blNumber: 'MAEU604815097',
    bookingNumber: 'BK20461185',
    sealNumber: 'SL3392041',
```

For `c2` (reference `DFSU7152890`), add after `status: 'PAID',`:

```ts
    status: 'PAID',
    blNumber: 'MSCU518327744',
    bookingNumber: 'BK20461186',
    sealNumber: 'CN7741250',
```

- [ ] **Step 4: Verify build + that existing totals are unchanged**

Run: `npm run typecheck && npm run build`
Expected: PASS. (Because doc numbers don't call the PRNG, all existing quantities/prices/totals are identical.)

- [ ] **Step 5: Commit**

```bash
git add src/mock/data.ts
git commit -m "feat(mock): seed B/L, booking, seal numbers on containers"
```

---

## Task 3: Data-layer mutations (`api.ts`)

**Files:**
- Modify: `src/services/api.ts`

- [ ] **Step 1: Extend the type and calc imports**

In `src/services/api.ts`, add `ContainerStatus` to the `@/types` import list and `containerInvoice` to the calc import.

Change the types import to include `ContainerStatus`:

```ts
import type {
  Container,
  ContainerStatus,
  Contract,
  ContractStatus,
  Customer,
  CustomerAccount,
  DashboardKpis,
  Incoterm,
  Invoice,
  Item,
  ItemStatus,
  Payment,
  ProductVolume,
  StatusBreakdown,
  TimeSeriesPoint,
} from '@/types';
```

Change the calc import to add `containerInvoice`:

```ts
import { containerInvoice, contractValue, shippedMt } from '@/utils/calc';
```

- [ ] **Step 2: Append the container mutations + helper at the end of the file**

Add at the **end** of `src/services/api.ts` (after the existing item mutations):

```ts
/* ----------------------------- Containers (mutations) --------------- */

export interface ContainerInput {
  contractId: string;
  itemId: string;
  reference: string;
  quantityMt: number;
  lmePrice: number;
  premium: number;
  /** ISO date string. */
  shipmentDate: string;
  /** ISO date string. */
  arrivalDate?: string;
  /** ISO date string. */
  dueDate: string;
  status: ContainerStatus;
  blNumber?: string;
  bookingNumber?: string;
  sealNumber?: string;
}

function findItemById(itemId: string): Item | undefined {
  for (const contract of db.contracts) {
    const item = contract.items.find((i) => i.id === itemId);
    if (item) return item;
  }
  return undefined;
}

/** Recompute a parent item's remaining MT from the containers currently shipped against it. */
function recomputeItemRemaining(itemId: string): void {
  const item = findItemById(itemId);
  if (!item) return;
  const shipped = shippedMt(itemId, db.containers);
  item.remainingMt = Math.round(Math.max(item.quantityMt - shipped, 0) * 1000) / 1000;
}

function nextContainerId(contractId: string): string {
  const prefix = `cnt-${contractId}-`;
  let max = 0;
  for (const c of db.containers) {
    if (c.id.startsWith(prefix)) {
      const n = Number(c.id.slice(prefix.length));
      if (Number.isFinite(n)) max = Math.max(max, n);
    }
  }
  return `${prefix}${max + 1}`;
}

export async function createContainer(input: ContainerInput): Promise<ContainerRow> {
  await delay(180);
  const container: Container = {
    id: nextContainerId(input.contractId),
    contractId: input.contractId,
    itemId: input.itemId,
    reference: input.reference,
    quantityMt: input.quantityMt,
    lmePrice: input.lmePrice,
    premium: input.premium,
    shipmentDate: input.shipmentDate,
    arrivalDate: input.arrivalDate,
    dueDate: input.dueDate,
    invoiceUSD: round(
      containerInvoice({
        quantityMt: input.quantityMt,
        lmePrice: input.lmePrice,
        premium: input.premium,
      }),
    ),
    status: input.status,
    blNumber: input.blNumber,
    bookingNumber: input.bookingNumber,
    sealNumber: input.sealNumber,
  };
  db.containers.push(container);
  recomputeItemRemaining(input.itemId);
  reindex();
  return buildContainerRows().find((c) => c.id === container.id)!;
}

export async function updateContainer(id: string, input: ContainerInput): Promise<ContainerRow> {
  await delay(180);
  const container = db.containers.find((c) => c.id === id);
  if (!container) throw new Error(`Container ${id} not found`);
  const previousItemId = container.itemId;
  container.contractId = input.contractId;
  container.itemId = input.itemId;
  container.reference = input.reference;
  container.quantityMt = input.quantityMt;
  container.lmePrice = input.lmePrice;
  container.premium = input.premium;
  container.shipmentDate = input.shipmentDate;
  container.arrivalDate = input.arrivalDate;
  container.dueDate = input.dueDate;
  container.invoiceUSD = round(
    containerInvoice({
      quantityMt: input.quantityMt,
      lmePrice: input.lmePrice,
      premium: input.premium,
    }),
  );
  container.status = input.status;
  container.blNumber = input.blNumber;
  container.bookingNumber = input.bookingNumber;
  container.sealNumber = input.sealNumber;
  // Moving a container between items frees the old item and draws down the new one.
  if (previousItemId !== input.itemId) recomputeItemRemaining(previousItemId);
  recomputeItemRemaining(input.itemId);
  reindex();
  return buildContainerRows().find((c) => c.id === id)!;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/services/api.ts
git commit -m "feat(api): createContainer/updateContainer with remaining-MT recompute"
```

---

## Task 4: Query hooks (`queries.ts`)

**Files:**
- Modify: `src/services/queries.ts`

- [ ] **Step 1: Add `aging` to the shared invalidator**

In `src/services/queries.ts`, find `useInvalidateTrade` and add the `aging` line after the `invoices` invalidation:

```ts
    qc.invalidateQueries({ queryKey: qk.containers });
    qc.invalidateQueries({ queryKey: qk.invoices });
    qc.invalidateQueries({ queryKey: qk.aging });
  };
```

- [ ] **Step 2: Add the two container mutation hooks**

At the **end** of `src/services/queries.ts`, after the existing item mutation hooks, add:

```ts
export const useCreateContainer = () => {
  const invalidate = useInvalidateTrade();
  return useMutation({
    mutationFn: (input: api.ContainerInput) => api.createContainer(input),
    onSuccess: (row) => invalidate(row.contractId),
  });
};

export const useUpdateContainer = () => {
  const invalidate = useInvalidateTrade();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: api.ContainerInput }) =>
      api.updateContainer(id, input),
    onSuccess: (row) => invalidate(row.contractId),
  });
};
```

- [ ] **Step 3: Verify build**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/services/queries.ts
git commit -m "feat(queries): container mutation hooks + aging invalidation"
```

---

## Task 5: i18n keys (en / ar / fa)

**Files:**
- Modify: `src/i18n/locales/en.json`, `src/i18n/locales/ar.json`, `src/i18n/locales/fa.json`

Each `containers` block currently ends with `"dueIn": "…"`. Add the new keys right after `dueIn` in each file (add a comma to the `dueIn` line).

- [ ] **Step 1: English** — in `src/i18n/locales/en.json`, change:

```json
    "dueIn": "Due in {{count}} days"
  },
```
to:
```json
    "dueIn": "Due in {{count}} days",
    "editContainer": "Edit container",
    "addContainer": "Add container",
    "created": "Container added",
    "updated": "Container updated",
    "blNumber": "Bill of Lading no.",
    "bookingNumber": "Booking no.",
    "sealNumber": "Seal no.",
    "selectContract": "Select a contract",
    "goods": "Goods",
    "remainingHint": "{{mt}} remaining",
    "qtyExceedsRemaining": "Exceeds remaining ({{mt}})"
  },
```

- [ ] **Step 2: Arabic** — in `src/i18n/locales/ar.json`, change:

```json
    "dueIn": "يستحق خلال {{count}} يوماً"
  },
```
to:
```json
    "dueIn": "يستحق خلال {{count}} يوماً",
    "editContainer": "تعديل الحاوية",
    "addContainer": "إضافة حاوية",
    "created": "تمت إضافة الحاوية",
    "updated": "تم تحديث الحاوية",
    "blNumber": "رقم بوليصة الشحن",
    "bookingNumber": "رقم الحجز",
    "sealNumber": "رقم الرصاص",
    "selectContract": "اختر عقداً",
    "goods": "البضائع",
    "remainingHint": "{{mt}} متبقٍ",
    "qtyExceedsRemaining": "يتجاوز المتبقي ({{mt}})"
  },
```

- [ ] **Step 3: Persian** — in `src/i18n/locales/fa.json`, change:

```json
    "dueIn": "سررسید تا {{count}} روز"
  },
```
to:
```json
    "dueIn": "سررسید تا {{count}} روز",
    "editContainer": "ویرایش کانتینر",
    "addContainer": "افزودن کانتینر",
    "created": "کانتینر افزوده شد",
    "updated": "کانتینر به‌روزرسانی شد",
    "blNumber": "شماره بارنامه",
    "bookingNumber": "شماره بوکینگ",
    "sealNumber": "شماره سیل",
    "selectContract": "یک قرارداد انتخاب کنید",
    "goods": "کالاها",
    "remainingHint": "{{mt}} باقی‌مانده",
    "qtyExceedsRemaining": "بیش از باقی‌مانده ({{mt}})"
  },
```

- [ ] **Step 4: Verify JSON parses (build picks up the locales)**

Run: `npm run build`
Expected: PASS (a JSON syntax error would fail the Vite build).

- [ ] **Step 5: Commit**

```bash
git add src/i18n/locales/en.json src/i18n/locales/ar.json src/i18n/locales/fa.json
git commit -m "i18n: add container form keys (en/ar/fa)"
```

---

## Task 6: ContainerFormModal component (create/edit)

**Files:**
- Create: `src/pages/contracts/ContainerFormModal.tsx`

- [ ] **Step 1: Create the component**

Create `src/pages/contracts/ContainerFormModal.tsx` with this exact content:

```tsx
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
```

- [ ] **Step 2: Verify build**

Run: `npm run typecheck && npm run lint`
Expected: PASS. (If lint flags an unused import, remove it.)

- [ ] **Step 3: Commit**

```bash
git add src/pages/contracts/ContainerFormModal.tsx
git commit -m "feat(containers): ContainerFormModal create/edit with invoice preview"
```

---

## Task 7: Wire the Containers page

**Files:**
- Modify: `src/pages/containers/ContainersPage.tsx`

- [ ] **Step 1: Update imports**

In `src/pages/containers/ContainersPage.tsx`:
- Remove `App` from the `antd` import (it's only used for the comingSoon stub).
- Add `EditOutlined` to the `@ant-design/icons` import.
- Add the modal import.

Change the antd import line from:

```ts
import { App, Button, Card, Input, Segmented, Space, Table, Tag, Typography } from 'antd';
```
to:
```ts
import { Button, Card, Input, Segmented, Space, Table, Tag, Typography } from 'antd';
```

Change the icons import from:

```ts
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
```
to:
```ts
import { EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
```

Add after the existing imports (e.g. after the `@/types` import):

```ts
import { ContainerFormModal } from '@/pages/contracts/ContainerFormModal';
```

- [ ] **Step 2: Replace the `message` hook with form state**

Remove this line:

```ts
  const { message } = App.useApp();
```

Add (next to the other `useState` calls):

```ts
  const [form, setForm] = useState<{ open: boolean; container?: ContainerRow }>({ open: false });
```

- [ ] **Step 3: Add the Actions column**

In the `columns` array, after the `status` column object, add:

```ts
    {
      title: t('common.actions'),
      key: 'actions',
      fixed: 'right',
      width: 90,
      align: 'center',
      render: (_, r) => (
        <Button
          type="link"
          size="small"
          icon={<EditOutlined />}
          onClick={() => setForm({ open: true, container: r })}
        >
          {t('common.edit')}
        </Button>
      ),
    },
```

- [ ] **Step 4: Point the New-container button at the form, widen scroll, add expandable rows, render the modal**

Change the header button onClick from:

```tsx
          <Button type="primary" icon={<PlusOutlined />} onClick={() => message.info(t('common.comingSoon'))}>
            {t('containers.newContainer')}
          </Button>
```
to:
```tsx
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setForm({ open: true })}>
            {t('containers.newContainer')}
          </Button>
```

Change the `<Table … scroll={{ x: 1300 }}` to `scroll={{ x: 1390 }}` and add the `expandable` prop. The full `<Table>` becomes:

```tsx
        <Table<ContainerRow>
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={filtered}
          scroll={{ x: 1390 }}
          pagination={{ pageSize: 12, showSizeChanger: false, hideOnSinglePage: true }}
          expandable={{
            rowExpandable: () => true,
            expandedRowRender: (r) => (
              <Space size="large" wrap>
                <span>
                  <Text type="secondary">{t('containers.blNumber')}: </Text>
                  {r.blNumber || t('common.none')}
                </span>
                <span>
                  <Text type="secondary">{t('containers.bookingNumber')}: </Text>
                  {r.bookingNumber || t('common.none')}
                </span>
                <span>
                  <Text type="secondary">{t('containers.sealNumber')}: </Text>
                  {r.sealNumber || t('common.none')}
                </span>
              </Space>
            ),
          }}
        />
```

Add the modal just before the closing `</Card>` (after the `</Table>`'s card) — i.e. right before the final `</div>`:

```tsx
      <ContainerFormModal
        open={form.open}
        onClose={() => setForm((s) => ({ ...s, open: false }))}
        container={form.container}
      />
```

- [ ] **Step 5: Verify build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/containers/ContainersPage.tsx
git commit -m "feat(containers): wire New/Edit container + doc expandable rows on Containers page"
```

---

## Task 8: Wire the contract detail page

**Files:**
- Modify: `src/pages/contracts/ContractDetailPage.tsx`

`useState`, `Button`, `PlusOutlined`, and `EditOutlined` are already imported here (from the goods form work).

- [ ] **Step 1: Import the modal**

Add after the `import { ItemFormModal } from './ItemFormModal';` line:

```ts
import { ContainerFormModal } from './ContainerFormModal';
```

- [ ] **Step 2: Add container form state**

Next to the existing `itemForm` state, add:

```ts
  const [containerForm, setContainerForm] = useState<{ open: boolean; container?: ContainerRow }>({
    open: false,
  });
```

- [ ] **Step 3: Add an Actions column to the container table**

In `containerColumns`, after the `status` column object, add:

```ts
    {
      title: t('common.actions'),
      key: 'actions',
      fixed: 'right',
      width: 90,
      align: 'center',
      render: (_, r) => (
        <Button
          type="link"
          size="small"
          icon={<EditOutlined />}
          onClick={() => setContainerForm({ open: true, container: r })}
        >
          {t('common.edit')}
        </Button>
      ),
    },
```

- [ ] **Step 4: Add the "Add container" button, widen scroll, add expandable rows**

Find the Containers `<Card>` (title `${t('containers.title')} · …`). Add an `extra` prop to it:

```tsx
        extra={
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => setContainerForm({ open: true })}
            disabled={!contract}
          >
            {t('containers.addContainer')}
          </Button>
        }
```

Change that table's `scroll={{ x: 900 }}` to `scroll={{ x: 1000 }}` and add the `expandable` prop. The container `<Table>` becomes:

```tsx
        <Table<ContainerRow>
          rowKey="id"
          columns={containerColumns}
          dataSource={containers ?? []}
          pagination={false}
          scroll={{ x: 1000 }}
          locale={{ emptyText: <Empty description={t('common.noData')} /> }}
          expandable={{
            rowExpandable: () => true,
            expandedRowRender: (r) => (
              <Space size="large" wrap>
                <span>
                  <Text type="secondary">{t('containers.blNumber')}: </Text>
                  {r.blNumber || t('common.none')}
                </span>
                <span>
                  <Text type="secondary">{t('containers.bookingNumber')}: </Text>
                  {r.bookingNumber || t('common.none')}
                </span>
                <span>
                  <Text type="secondary">{t('containers.sealNumber')}: </Text>
                  {r.sealNumber || t('common.none')}
                </span>
              </Space>
            ),
          }}
        />
```

- [ ] **Step 5: Render the modal**

After the existing `<ItemFormModal … />` near the end of the component, add (guarded by `contract`, which is the `ContractRow` already in scope):

```tsx
      {contract && (
        <ContainerFormModal
          open={containerForm.open}
          onClose={() => setContainerForm((s) => ({ ...s, open: false }))}
          contract={contract}
          container={containerForm.container}
        />
      )}
```

- [ ] **Step 6: Verify build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS. (`Space` and `Text` are already imported in this file.)

- [ ] **Step 7: Commit**

```bash
git add src/pages/contracts/ContractDetailPage.tsx
git commit -m "feat(containers): add/edit containers + doc rows on contract detail page"
```

---

## Task 9: Live verification

**Files:** none (manual verification + optional review)

- [ ] **Step 1: Final static gate**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all PASS.

- [ ] **Step 2: Drive it in a browser**

Start the preview (`.claude/launch.json` "dev" config), seed an authed light session, and:
- Open a contract detail page → **Add container** → pick the item (note its remaining MT), enter qty ≤ remaining, ref, B/L/booking/seal; confirm the **invoice preview** = (LME+premium)×qty and the **due date** auto-fills from the customer terms → Save.
- Verify the contract's goods row **remaining MT decreased** by the qty, the new container appears in the table, and its **expandable row** shows B/L/booking/seal.
- Go to **Invoices** → the new shipment appears; **Dashboard** KPIs/aging reflect it.
- Edit the container's qty → remaining recomputes. Try qty > remaining → inline `qtyExceedsRemaining` error blocks save.
- From the **Containers page**: New container with the global contract+item pickers → Save; Edit a row.
- Toggle **dark mode** and **fa (RTL)** with the modal open — layout stays intact.

Confirm via the fiber/DOM (not screenshots) per the known preview gotcha: the modal's `open` prop and the table data, since this headless preview freezes `requestAnimationFrame`.

- [ ] **Step 3: (Optional) Adversarial review**

Run an adversarial multi-agent review of the diff (data-layer correctness incl. remaining recompute on item-change, form lifecycle/validation, i18n/RTL completeness), as done for the Contract/Goods forms. Fix confirmed findings.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(containers): address verification findings"
```

---

## Self-review notes (for the implementer)

- **Remaining-MT ceiling:** `maxQty = item.remainingMt + (editing same item ? container.quantityMt : 0)` — because `remainingMt` already nets out this container when editing.
- **Item moved between items on edit:** `updateContainer` recomputes BOTH the old and new item.
- **Invoice is derived** in `api.ts` (never read from the form's preview).
- **Due date** is user-editable after auto-fill; `recomputeDue` only fires on shipment/arrival change.
- **No delete** — matches Contracts/Goods; reduce a shipment by editing its quantity.
- **Type names** used consistently: `ContainerInput`, `ContainerRow`, `useCreateContainer`, `useUpdateContainer`, `recomputeItemRemaining`, `nextContainerId`.
