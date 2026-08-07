export interface SheetSpec {
  /** Tab name. Excel rejects > 31 chars and the characters below, so both are enforced here. */
  name: string;
  /** One object per row; the keys of the FIRST row become the header. */
  rows: Array<Record<string, string | number | null | undefined>>;
}

/**
 * Excel refuses a sheet name over 31 characters or containing : \ / ? * [ ], and silently
 * refuses to open the whole file if two sheets share a name. Rather than let a report title
 * decide whether the download works, every name is squeezed through here.
 */
function safeSheetName(name: string, taken: Set<string>): string {
  const base = (name.replace(/[:\\/?*[\]]/g, ' ').trim() || 'Sheet').slice(0, 31);
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  for (let i = 2; ; i += 1) {
    const suffix = ` (${i})`;
    const candidate = base.slice(0, 31 - suffix.length) + suffix;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}

/** Widens each column to its longest cell, capped — the default is narrow enough that money
 *  columns show as ###### and the file looks broken on open. */
function columnWidths(rows: SheetSpec['rows']): Array<{ wch: number }> {
  if (rows.length === 0) return [];
  return Object.keys(rows[0]).map((key) => {
    const longest = rows.reduce(
      (max, row) => Math.max(max, String(row[key] ?? '').length),
      key.length,
    );
    return { wch: Math.min(Math.max(longest + 2, 10), 42) };
  });
}

/**
 * Writes a real .xlsx and hands it to the browser.
 *
 * Empty sheets are kept rather than dropped: a workbook whose "Expenses" tab is missing reads
 * as an export that went wrong, where an empty tab plainly says there was nothing in the period.
 *
 * SheetJS is loaded on demand — it is ~400 kB, and only a click on Export ever needs it. Keeping
 * it out of the entry bundle costs this one await; callers can safely ignore the promise.
 */
export async function downloadXlsx(fileName: string, sheets: SheetSpec[]): Promise<void> {
  const XLSX = await import('xlsx');
  const book = XLSX.utils.book_new();
  const taken = new Set<string>();
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.json_to_sheet(sheet.rows);
    worksheet['!cols'] = columnWidths(sheet.rows);
    XLSX.utils.book_append_sheet(book, worksheet, safeSheetName(sheet.name, taken));
  }
  XLSX.writeFile(book, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
}

/** `Report 2026-08-05.xlsx` — the date makes two downloads distinguishable in a Downloads folder. */
export function datedFileName(prefix: string, isoDate: string): string {
  return `${prefix} ${isoDate.slice(0, 10)}.xlsx`;
}
