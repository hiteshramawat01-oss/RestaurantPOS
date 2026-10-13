import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, PosDB, SCHEMA_V1 } from './db';

describe('database', () => {
  it('seeds a fresh database with rooms, tables, menu, staff and settings', async () => {
    const d = new PosDB('seed-test');
    await d.open();
    expect((await d.rooms.toArray()).map((r) => r.name).sort()).toEqual(['AC', 'Non-AC']);
    expect(await d.diningTables.count()).toBeGreaterThan(10);
    expect(await d.menuItems.count()).toBeGreaterThan(10);
    const s = await d.settings.get('app');
    expect(s?.taxes.every((t) => !t.enabled)).toBe(true); // no tax is charged until configured
    expect((await d.meta.get('schemaVersion'))?.value).toBe(CURRENT_SCHEMA_VERSION);
    d.close();
    await d.delete();
  });

  it('keeps data after the app is closed and reopened', async () => {
    const a = new PosDB('persist-test');
    await a.open();
    await a.categories.add({ id: 'c-x', name: 'Specials', sortOrder: 99, active: true });
    a.close();
    const b = new PosDB('persist-test');
    await b.open();
    expect((await b.categories.get('c-x'))?.name).toBe('Specials');
    b.close();
    await b.delete();
  });

  it('migrates a version 1 database to the current schema without losing data', async () => {
    const name = 'migration-test';
    const v1 = new Dexie(name);
    v1.version(1).stores(SCHEMA_V1);
    await v1.open();
    await v1.table('kots').add({ id: 'k1', kotNo: 1, orderId: 'o1', createdAt: 1, printStatus: 'printed', lines: [] });
    await v1.table('kots').add({ id: 'k2', kotNo: 2, orderId: 'o1', createdAt: 2, printStatus: 'failed', lines: [] });
    await v1.table('orders').add({ id: 'o1', orderNo: 1, tableId: 't', status: 'open', createdAt: 1 });
    await v1.table('invoices').add({ id: 'i1', invoiceNo: 'INV-00001', orderId: 'o1', status: 'paid', createdAt: 1 });
    v1.close();

    const v2 = new PosDB(name);
    await v2.open();
    expect(v2.verno).toBe(CURRENT_SCHEMA_VERSION);
    expect((await v2.kots.get('k1'))?.printCount).toBe(1);
    expect((await v2.kots.get('k2'))?.printCount).toBe(0);
    expect((await v2.invoices.get('i1'))?.printCount).toBe(0);
    expect((await v2.orders.get('o1'))?.orderNo).toBe(1);
    expect(await v2.audit.count()).toBe(0); // new table exists
    expect(await v2.meta.get('migratedToV2At')).toBeDefined();
    v2.close();
    await v2.delete();
  });
});
