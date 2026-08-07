import type { Role } from '@/types';
import { ROUTES } from '@/config/constants';

/** Route keys that can be role-guarded / shown in the sidebar. */
export type RouteKey = Exclude<keyof typeof ROUTES, 'landing' | 'login' | 'app'>;

/**
 * The demo accounts listed on the login page, so a visitor can click one instead of being told
 * a password. They mirror the backend's seed (backend AccessCatalogue's SeededAccounts); the
 * server is what actually validates them.
 */
export interface SeededUser {
  email: string;
  password: string;
  role: Role;
  name: string;
  avatarColor: string;
}


export const USERS: SeededUser[] = [
  { email: 'ceo@finora.app', password: 'Ceo@2026', role: 'CEO', name: 'Khalid Al Mansoori', avatarColor: '#b87333' },
  { email: 'amir@finora.app', password: 'demo1234', role: 'Manager', name: 'Amir Karami', avatarColor: '#b87333' },
  { email: 'staff@finora.app', password: 'Staff@2026', role: 'Staff', name: 'Operations Desk', avatarColor: '#3b82f6' },
  // Which customer this login sees is resolved dynamically via `Customer.portalAccount`
  // (spec §3) — not hardcoded here, which used to double as an id-collision hole (a customer
  // coded "AM" would otherwise inherit the portal scope; `api.ts` derives `id = cust-<code>`).
  { email: 'portal@alcometal.ae', password: 'Alco@2026', role: 'Customer', name: 'Alco Metal Trading', avatarColor: '#b87333' },
];

/** Coerce any persisted/legacy role value to a valid Role (defaults to Manager). */
export function normalizeRole(value: unknown): Role {
  return value === 'CEO' || value === 'Manager' || value === 'Staff' || value === 'Customer'
    ? value
    : 'Manager';
}

export type NavGroup = 'main' | 'operations' | 'finance' | 'system';

export interface NavItemDef {
  key: RouteKey;
  route: string;
  /** icon name resolved to a component in SidebarNav */
  icon: string;
  group: NavGroup;
}

export const NAV_ITEMS: NavItemDef[] = [
  { key: 'executive', route: ROUTES.executive, icon: 'crown', group: 'main' },
  { key: 'dashboard', route: ROUTES.dashboard, icon: 'appstore', group: 'main' },
  { key: 'portal', route: ROUTES.portal, icon: 'wallet', group: 'main' },
  { key: 'customers', route: ROUTES.customers, icon: 'team', group: 'operations' },
  { key: 'contracts', route: ROUTES.contracts, icon: 'filetext', group: 'operations' },
  { key: 'partners', route: ROUTES.partners, icon: 'apartment', group: 'operations' },
  { key: 'containers', route: ROUTES.containers, icon: 'container', group: 'operations' },
  { key: 'warehouse', route: ROUTES.warehouse, icon: 'gold', group: 'operations' },
  { key: 'purchase', route: ROUTES.purchase, icon: 'shoppingcart', group: 'finance' },
  { key: 'sale', route: ROUTES.sale, icon: 'tags', group: 'finance' },
  { key: 'payments', route: ROUTES.payments, icon: 'creditcard', group: 'finance' },
  { key: 'transfers', route: ROUTES.transfers, icon: 'swap', group: 'finance' },
  { key: 'exchange', route: ROUTES.exchange, icon: 'linechart', group: 'finance' },
  { key: 'expenses', route: ROUTES.expenses, icon: 'accountbook', group: 'finance' },
  { key: 'revenues', route: ROUTES.revenues, icon: 'rise', group: 'finance' },
  { key: 'claims', route: ROUTES.claims, icon: 'exception', group: 'finance' },
  { key: 'reports', route: ROUTES.reports, icon: 'barchart', group: 'finance' },
  { key: 'baseInfo', route: ROUTES.baseInfo, icon: 'database', group: 'system' },
  { key: 'settings', route: ROUTES.settings, icon: 'setting', group: 'system' },
  { key: 'develop', route: ROUTES.develop, icon: 'code', group: 'system' },
];
