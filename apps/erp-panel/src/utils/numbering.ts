import type { MetalType } from '@/types';

/**
 * The codes the server assigns, mirrored line for line from
 * `backend/src/Modules/Erp/Finora.Erp.Domain/Numbering.cs`.
 *
 * Used only by the offline fallback in `api.ts` (a browser that lost the API) and by the sample
 * data generator, so a record made without the server still carries the shape the server would
 * have given it. Change the C# and this file together.
 */

const GULF_OFFSET_MS = 4 * 60 * 60 * 1000;

/** "1", "2", … — one past the highest existing code that is an integer; strays ignored. */
export function nextIntegerCode(existing: readonly string[]): string {
  let highest = 0;
  for (const code of existing) {
    if (/^\d+$/.test(code)) highest = Math.max(highest, Number(code));
  }
  return String(highest + 1);
}

/** "copper-001" — lowercase metal, then three digits counted per metal (growing past 999). */
export function nextGoodCode(metal: MetalType, existing: readonly string[]): string {
  const prefix = `${metal.toLowerCase()}-`;
  let highest = 0;
  for (const code of existing) {
    if (code.startsWith(prefix) && /^\d+$/.test(code.slice(prefix.length))) {
      highest = Math.max(highest, Number(code.slice(prefix.length)));
    }
  }
  return `${prefix}${String(highest + 1).padStart(3, '0')}`;
}

/** "26090001" — YYMM of the date in Gulf time (UTC+4), then four digits counted across every
 *  document type, restarting each month and growing past 9999 rather than failing. */
export function nextDocumentNumber(dateIso: string, existing: readonly string[]): string {
  const gulf = new Date(new Date(dateIso).getTime() + GULF_OFFSET_MS);
  const month = `${String(gulf.getUTCFullYear() % 100).padStart(2, '0')}${String(gulf.getUTCMonth() + 1).padStart(2, '0')}`;
  let highest = 0;
  for (const number of existing) {
    if (number.length > 4 && number.startsWith(month) && /^\d+$/.test(number.slice(4))) {
      highest = Math.max(highest, Number(number.slice(4)));
    }
  }
  return `${month}${String(highest + 1).padStart(4, '0')}`;
}
