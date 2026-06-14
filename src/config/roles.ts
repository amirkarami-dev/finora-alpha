import type { Role } from '@/types';
import { ROUTES } from '@/config/constants';

/** Route keys that can be role-guarded / shown in the sidebar. */
export type RouteKey = Exclude<keyof typeof ROUTES, 'landing' | 'login' | 'app'>;

/** Which routes each role may access (and see in the menu). */
export const ROLE_ACCESS: Record<Role, RouteKey[]> = {
  CEO: ['executive', 'reports', 'settings'],
  Manager: [
    'dashboard',
    'customers',
    'contracts',
    'containers',
    'invoices',
    'payments',
    'reports',
    'settings',
  ],
  Staff: ['dashboard', 'customers', 'contracts', 'containers', 'invoices'],
};

/** Landing route per role. */
export const ROLE_HOME: Record<Role, string> = {
  CEO: ROUTES.executive,
  Manager: ROUTES.dashboard,
  Staff: ROUTES.dashboard,
};

export interface SeededUser {
  email: string;
  password: string;
  role: Role;
  name: string;
  avatarColor: string;
}

/** Seeded demo accounts (mock, non-production). */
export const USERS: SeededUser[] = [
  { email: 'ceo@finora.app', password: 'Ceo@2026', role: 'CEO', name: 'Khalid Al Mansoori', avatarColor: '#b87333' },
  { email: 'amir@finora.app', password: 'demo1234', role: 'Manager', name: 'Amir Karami', avatarColor: '#b87333' },
  { email: 'staff@finora.app', password: 'Staff@2026', role: 'Staff', name: 'Operations Desk', avatarColor: '#3b82f6' },
];

/** Coerce any persisted/legacy role value to a valid Role (defaults to Manager). */
export function normalizeRole(value: unknown): Role {
  return value === 'CEO' || value === 'Manager' || value === 'Staff' ? value : 'Manager';
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
  { key: 'customers', route: ROUTES.customers, icon: 'team', group: 'operations' },
  { key: 'contracts', route: ROUTES.contracts, icon: 'filetext', group: 'operations' },
  { key: 'containers', route: ROUTES.containers, icon: 'container', group: 'operations' },
  { key: 'invoices', route: ROUTES.invoices, icon: 'filedone', group: 'finance' },
  { key: 'payments', route: ROUTES.payments, icon: 'creditcard', group: 'finance' },
  { key: 'reports', route: ROUTES.reports, icon: 'barchart', group: 'finance' },
  { key: 'settings', route: ROUTES.settings, icon: 'setting', group: 'system' },
];
