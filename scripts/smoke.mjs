import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:4173';
const OUT = '/tmp/finora-shots';
mkdirSync(OUT, { recursive: true });

const errors = [];
const browser = await chromium.launch();

function attach(page, tag) {
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${tag}] console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => {
    const u = r.url();
    // Ignore optional external font fetches that may be blocked by network policy.
    if (!u.includes('fonts.g')) errors.push(`[${tag}] requestfailed: ${u} ${r.failure()?.errorText}`);
  });
}

async function seed(ctx, { theme = 'light', locale = 'en', auth = false } = {}) {
  await ctx.addInitScript(
    ([theme, locale, auth]) => {
      localStorage.setItem(
        'finora-ui',
        JSON.stringify({ state: { theme, locale, sidebarCollapsed: false }, version: 0 }),
      );
      localStorage.setItem('finora-lang', locale);
      if (auth) {
        localStorage.setItem(
          'finora-auth',
          JSON.stringify({
            state: {
              user: { id: 'u-001', name: 'Amir Karami', email: 'amir@finora.app', role: 'Finance Manager', avatarColor: '#10a37f' },
              token: 'demo-token',
              isAuthenticated: true,
            },
            version: 0,
          }),
        );
      }
    },
    [theme, locale, auth],
  );
}

async function shot(ctx, path, file, tag, wait = 1600) {
  const page = await ctx.newPage();
  attach(page, tag);
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: true });
  await page.close();
}

// 1. Landing (light, desktop)
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await seed(ctx, { theme: 'light', locale: 'en' });
  await shot(ctx, '/', '01-landing.png', 'landing');
  await shot(ctx, '/login', '02-login.png', 'login');
  await ctx.close();
}

// 2. App authed (dark, en)
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await seed(ctx, { theme: 'dark', locale: 'en', auth: true });
  await shot(ctx, '/app/dashboard', '03-dashboard-dark.png', 'dashboard');
  await shot(ctx, '/app/contracts', '04-contracts.png', 'contracts');
  await shot(ctx, '/app/contracts/AM-P-251101156', '05-contract-detail.png', 'contract-detail');
  await shot(ctx, '/app/customers', '06-customers.png', 'customers');
  await shot(ctx, '/app/reports', '07-reports.png', 'reports');
  await ctx.close();
}

// 3. App authed (light, Persian RTL)
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await seed(ctx, { theme: 'light', locale: 'fa', auth: true });
  await shot(ctx, '/app/dashboard', '08-dashboard-fa-rtl.png', 'dashboard-fa');
  await ctx.close();
}

// 4. Mobile dashboard (dark, ar RTL)
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  await seed(ctx, { theme: 'dark', locale: 'ar', auth: true });
  await shot(ctx, '/app/dashboard', '09-dashboard-mobile-ar.png', 'dashboard-mobile-ar');
  await ctx.close();
}

await browser.close();

console.log('\n=== Screenshots written to', OUT, '===');
if (errors.length) {
  console.log(`\n❌ ${errors.length} runtime issue(s):`);
  for (const e of [...new Set(errors)]) console.log(' -', e);
  process.exit(1);
} else {
  console.log('\n✅ No console/page errors detected.');
}
