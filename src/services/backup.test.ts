import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { menuItem, resetDb, waiter } from '../test/helpers';
import { exportBackup, parseBackupText, restoreBackup, validateBackup } from './backup';
import { addItem, openOrderForTable, sendToKitchen } from './orders';

beforeEach(resetDb);

describe('backup and restore', () => {
  it('round-trips all data', async () => {
    const t = (await db.diningTables.toArray())[0];
    const o = await openOrderForTable(t.id, waiter);
    await addItem(o.id, await menuItem('Dal Makhani'), 2);
    await sendToKitchen(o.id, waiter);
    const backup = JSON.parse(JSON.stringify(await exportBackup()));

    // wipe and change things
    await db.orders.clear();
    await db.menuItems.clear();
    await db.settings.update('app', { restaurant: { name: 'Changed', address: '', phone: '', gstin: '', footer: '' } });

    const check = parseBackupText(JSON.stringify(backup));
    expect(check.ok).toBe(true);
    await restoreBackup(check.backup!);
    expect(await db.orders.count()).toBe(1);
    expect(await db.kots.count()).toBe(1);
    expect((await db.menuItems.count()) > 10).toBe(true);
    expect((await db.settings.get('app'))?.restaurant.name).toBe('My Restaurant');
  });

  it('rejects files that are not POS backups', () => {
    expect(parseBackupText('not json').ok).toBe(false);
    expect(validateBackup({ hello: 1 }).ok).toBe(false);
    expect(validateBackup({ app: 'restaurant-pos', format: 1, schemaVersion: 2, tables: {} }).errors.join(' ')).toMatch(/Missing table/);
  });

  it('rejects backups from a newer app version', async () => {
    const b = await exportBackup();
    expect(validateBackup({ ...b, schemaVersion: 99 }).ok).toBe(false);
  });

  it('rejects corrupted records and duplicate invoice numbers', async () => {
    const b = JSON.parse(JSON.stringify(await exportBackup()));
    b.tables.menuItems.push({ name: 'no id' });
    expect(validateBackup(b).ok).toBe(false);

    const c = JSON.parse(JSON.stringify(await exportBackup()));
    c.tables.invoices = [
      { id: 'a', invoiceNo: 'INV-1' },
      { id: 'b', invoiceNo: 'INV-1' },
    ];
    expect(validateBackup(c).errors.join(' ')).toMatch(/Duplicate invoice number/);
  });

  it('leaves existing data untouched when a restore fails', async () => {
    const before = await db.menuItems.count();
    await expect(restoreBackup({ app: 'nope' } as never)).rejects.toThrow();
    expect(await db.menuItems.count()).toBe(before);
  });

  it('repairs counters that are behind the data so numbering stays unique', async () => {
    const t = (await db.diningTables.toArray())[0];
    await openOrderForTable(t.id, waiter);
    const b = JSON.parse(JSON.stringify(await exportBackup()));
    b.tables.counters = b.tables.counters.map((c: { name: string }) => ({ ...c, value: 0 }));
    await restoreBackup(b);
    expect((await db.counters.get('order'))?.value).toBe(1);
  });
});
