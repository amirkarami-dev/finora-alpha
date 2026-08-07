import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Both are overridable: 4173 is not always free (other projects on this machine use it too),
// and `/tmp` does not exist on Windows, which silently wrote screenshots to C:\tmp.
const BASE = process.env.SMOKE_BASE ?? 'http://localhost:4173';
const OUT = process.env.SMOKE_OUT ?? join(tmpdir(), 'finora-shots');
mkdirSync(OUT, { recursive: true });
console.log(`Target: ${BASE}\nScreenshots: ${OUT}`);

const errors = [];

/**
 * Prefer Playwright's own Chromium. Fall back to the Edge that ships with Windows.
 *
 * Why the fallback exists: `npx playwright install chromium` cannot complete from some
 * locations. `cdn.playwright.dev` itself is fine — it 307-redirects to
 * `storage.googleapis.com`, and Google blocks the download there with
 * `403 AccessDenied … "this service is not available in your location"`. A VPN does not
 * reliably help: a datacenter-IP exit is blocked by Google regardless of country.
 * Note that HEAD on that URL returns 200 while GET returns 403, so a quick reachability
 * check is misleading — only a real download proves it.
 *
 * Edge is the same Chromium engine, so for a screenshot + console-error sweep the two are
 * equivalent. We print which one ran, because "smoke passed" means less if you don't know
 * what it passed on.
 */
async function launchBrowser() {
  try {
    const browser = await chromium.launch();
    console.log('Browser: bundled Chromium');
    return browser;
  } catch (err) {
    try {
      const browser = await chromium.launch({ channel: 'msedge' });
      console.log('Browser: Microsoft Edge (bundled Chromium unavailable)');
      return browser;
    } catch {
      // Report the ORIGINAL failure — the Edge error ("channel not found") would send
      // someone debugging the wrong problem.
      console.error('Could not launch a browser. Bundled Chromium failed with:\n', err.message);
      console.error('\nInstall one of:\n  npx playwright install chromium\n  or Microsoft Edge');
      process.exit(1);
    }
  }
}

const browser = await launchBrowser();

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
            // Must match useAuthStore's persist `version` (currently 1) — a mismatch triggers
            // zustand's `migrate`, which logs the seeded user straight back out.
            version: 1,
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
  // Not a specific id — the app starts EMPTY (no seeded contracts), so a hardcoded contract
  // detail path like the old 'AM-P-251101156' (only present in the sample dataset) would 404.
  await shot(ctx, '/app/settings', '05-settings.png', 'settings');
  await shot(ctx, '/app/customers', '06-customers.png', 'customers');
  await shot(ctx, '/app/reports', '07-reports.png', 'reports');
  await ctx.close();
}

// 2b. Charges / claims / BaseInfo (light, en) on the EMPTY db, so this also covers the
//     empty states — the thing a brand-new install actually shows.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await seed(ctx, { theme: 'light', locale: 'en', auth: true });
  await shot(ctx, '/app/expenses', '10-expenses.png', 'expenses');
  await shot(ctx, '/app/revenues', '11-revenues.png', 'revenues');
  await shot(ctx, '/app/claims', '12-claims.png', 'claims');
  await shot(ctx, '/app/base-info', '13-base-info.png', 'base-info');
  // `?tab=` must survive a fresh load, and the old cost-centres URL must still redirect
  // into BaseInfo so existing bookmarks keep working.
  await shot(ctx, '/app/base-info?tab=costCentres', '14-base-info-cost-centres.png', 'base-info-cc');
  await shot(ctx, '/app/cost-centres', '15-cost-centres-redirect.png', 'cost-centres-redirect');
  // A detail route with an unknown id must still render its not-found page rather than a
  // blank screen or a crash. That is what these two cover.
  //
  // What they do NOT cover, verified by re-introducing the bug and re-running: these routes
  // once logged "Query data cannot be undefined" (the API returned `undefined`, which
  // TanStack Query rejects). That message is a DEV-ONLY warning — it is stripped from the
  // production bundle, and this script runs against `npm run preview`, which is a production
  // build. Putting the bug back produced the error on the dev server and nothing here, so
  // treat this pair as a render check only. Catching that class of bug needs a run against
  // `npm run dev`.
  await shot(ctx, '/app/expenses/does-not-exist', '16-charge-not-found.png', 'charge-404');
  await shot(ctx, '/app/invoices/does-not-exist', '17-invoice-not-found.png', 'invoice-404');
  await ctx.close();
}

// 3. App authed (light, Persian RTL)
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await seed(ctx, { theme: 'light', locale: 'fa', auth: true });
  await shot(ctx, '/app/dashboard', '08-dashboard-fa-rtl.png', 'dashboard-fa');
  // Revenues in an RTL locale: `charges.*` keys are shared by both directions, so a
  // translation that bakes in "expense" only shows up on this page, never in English.
  await shot(ctx, '/app/revenues', '18-revenues-fa-rtl.png', 'revenues-fa');
  await shot(ctx, '/app/claims', '19-claims-fa-rtl.png', 'claims-fa');
  await ctx.close();
}

// 3b. Arabic RTL over the same new pages
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await seed(ctx, { theme: 'light', locale: 'ar', auth: true });
  await shot(ctx, '/app/revenues', '20-revenues-ar-rtl.png', 'revenues-ar');
  await shot(ctx, '/app/base-info', '21-base-info-ar-rtl.png', 'base-info-ar');
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
