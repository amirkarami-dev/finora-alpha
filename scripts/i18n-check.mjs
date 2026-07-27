/**
 * i18n parity check.
 *
 * CLAUDE.md says "i18n is mandatory — keep ar/fa in sync with en". This turns that
 * convention into a check an agent (or CI) can actually run, so a missing Arabic key
 * fails loudly instead of shipping as an English string in an RTL screen.
 *
 * Reports, per non-English locale:
 *   - missing keys   (present in en, absent here)         → hard error
 *   - extra keys     (present here, absent in en)         → hard error (usually a typo/rename)
 *   - untranslated   (identical string to en)             → warning only, listed for review
 *
 * Usage: npm run i18n:check
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = new URL('../src/i18n/locales/', import.meta.url).pathname;
const BASE = 'en';
/** Values legitimately identical across locales (brand names, symbols, codes). */
const SAME_OK = /^(Finora|LME|USD|AED|MT|%|-|—|\d+|\{\{.*\}\})$/;

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = String(v);
  }
  return out;
}

const locales = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));

const read = (l) => flatten(JSON.parse(readFileSync(join(DIR, `${l}.json`), 'utf8')));
const base = read(BASE);
const baseKeys = Object.keys(base);

let failed = false;
console.log(`i18n base: ${BASE} (${baseKeys.length} keys)\n`);

for (const locale of locales.filter((l) => l !== BASE)) {
  const target = read(locale);
  const missing = baseKeys.filter((k) => !(k in target));
  const extra = Object.keys(target).filter((k) => !(k in base));
  const untranslated = baseKeys.filter(
    (k) => k in target && target[k] === base[k] && !SAME_OK.test(base[k]),
  );

  const status = missing.length || extra.length ? '❌' : '✅';
  console.log(
    `${status} ${locale}: ${missing.length} missing, ${extra.length} extra, ${untranslated.length} untranslated`,
  );
  for (const k of missing) console.log(`     missing: ${k}  (en: "${base[k]}")`);
  for (const k of extra) console.log(`     extra:   ${k}`);
  for (const k of untranslated.slice(0, 20)) console.log(`     same as en: ${k} = "${base[k]}"`);
  if (untranslated.length > 20) console.log(`     … and ${untranslated.length - 20} more`);
  if (missing.length || extra.length) failed = true;
}

process.exit(failed ? 1 : 0);
