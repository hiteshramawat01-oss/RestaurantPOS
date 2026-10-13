import { Capacitor } from '@capacitor/core';
import { CURRENT_SCHEMA_VERSION, db } from '../db/db';
import { APP_VERSION } from '../version';

export const BACKUP_APP_ID = 'restaurant-pos';
export const BACKUP_FORMAT = 1;

/** Every table in the database is included, so nothing is silently left out. */
export function backupTableNames(): string[] {
  return db.tables.map((t) => t.name);
}

export interface BackupFile {
  app: typeof BACKUP_APP_ID;
  format: number;
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
}

export async function exportBackup(): Promise<BackupFile> {
  const tables: BackupFile['tables'] = {};
  await db.transaction('r', db.tables, async () => {
    for (const t of db.tables) tables[t.name] = await t.toArray();
  });
  return {
    app: BACKUP_APP_ID,
    format: BACKUP_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    tables,
  };
}

export function backupFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `restaurant-pos-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  counts: Record<string, number>;
  backup?: BackupFile;
}

const REQUIRED = ['settings', 'rooms', 'diningTables', 'categories', 'menuItems', 'staff', 'counters'];
const KEY_FIELD: Record<string, string> = { settings: 'key', counters: 'name', meta: 'key' };

/** Check a parsed backup thoroughly before anything is replaced. */
export function validateBackup(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const counts: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['File is not a valid backup.'], counts };
  const b = raw as Partial<BackupFile>;
  if (b.app !== BACKUP_APP_ID) errors.push('This file was not created by this POS app.');
  if (typeof b.format !== 'number' || b.format > BACKUP_FORMAT)
    errors.push('Backup format is newer than this app. Update the app first.');
  if (typeof b.schemaVersion !== 'number' || b.schemaVersion > CURRENT_SCHEMA_VERSION)
    errors.push(`Backup is from a newer database version (${b.schemaVersion}). Update the app first.`);
  if (!b.tables || typeof b.tables !== 'object') {
    errors.push('Backup has no data tables.');
    return { ok: false, errors, counts };
  }
  const known = new Set(backupTableNames());
  for (const name of REQUIRED) if (!Array.isArray(b.tables[name])) errors.push(`Missing table: ${name}.`);
  for (const [name, rows] of Object.entries(b.tables)) {
    if (!known.has(name)) {
      errors.push(`Unknown table: ${name}.`);
      continue;
    }
    if (!Array.isArray(rows)) {
      errors.push(`Table ${name} is not a list.`);
      continue;
    }
    counts[name] = rows.length;
    const keyField = KEY_FIELD[name] ?? 'id';
    const seen = new Set<unknown>();
    for (const row of rows) {
      const key = row && typeof row === 'object' ? (row as Record<string, unknown>)[keyField] : undefined;
      if (typeof key !== 'string' || !key) {
        errors.push(`Table ${name} has a record without "${keyField}".`);
        break;
      }
      if (seen.has(key)) {
        errors.push(`Table ${name} has duplicate records (${String(key)}).`);
        break;
      }
      seen.add(key);
    }
  }
  if (Array.isArray(b.tables.settings) && !b.tables.settings.some((s) => s.key === 'app'))
    errors.push('Backup has no restaurant settings.');
  const invoiceNos = new Set<unknown>();
  for (const inv of (b.tables.invoices ?? []) as { invoiceNo?: unknown }[]) {
    if (invoiceNos.has(inv.invoiceNo)) {
      errors.push(`Duplicate invoice number ${String(inv.invoiceNo)}.`);
      break;
    }
    invoiceNos.add(inv.invoiceNo);
  }
  return { ok: errors.length === 0, errors, counts, backup: errors.length ? undefined : (b as BackupFile) };
}

export function parseBackupText(text: string): ValidationResult {
  try {
    return validateBackup(JSON.parse(text));
  } catch {
    return { ok: false, errors: ['File is not valid JSON.'], counts: {} };
  }
}

/**
 * Replace ALL local data with the backup, in one transaction: either the
 * whole restore succeeds or nothing changes.
 */
export async function restoreBackup(backup: BackupFile): Promise<void> {
  const check = validateBackup(backup);
  if (!check.ok) throw new Error(check.errors.join(' '));
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) {
      await t.clear();
      const rows = backup.tables[t.name];
      if (rows?.length) await t.bulkAdd(rows as never[]);
    }
    // Keep numbering unique even if the counters in the file are behind.
    const maxOf = async (table: 'orders' | 'kots' | 'invoices', field: string) =>
      (await db.table(table).toArray()).reduce((m, r) => Math.max(m, Number(r[field]) || 0), 0);
    const fixes = [
      ['order', await maxOf('orders', 'orderNo')],
      ['kot', await maxOf('kots', 'kotNo')],
      ['invoice', await maxOf('invoices', 'seq')],
    ] as const;
    for (const [name, max] of fixes) {
      const c = await db.counters.get(name);
      if (!c || c.value < max) await db.counters.put({ name, value: max });
    }
    await db.meta.put({ key: 'restoredAt', value: Date.now() });
  });
}

/**
 * Save a JSON file for the user. In a browser this is a normal download.
 * Inside the Android app (WebView) downloads are not supported, so the file
 * is written to the app cache and the Android share sheet opens, letting
 * staff save it to Drive, WhatsApp, email or Files.
 */
export async function downloadJson(data: unknown, fileName: string): Promise<void> {
  const text = JSON.stringify(data, null, 1);
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const res = await Filesystem.writeFile({ path: fileName, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: 'POS backup', text: fileName, files: [res.uri], dialogTitle: 'Save the backup file' });
    return;
  }
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
