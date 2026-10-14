import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, PosDB, SCHEMA_V1, SCHEMA_V2 } from './db';

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

  it('seeds the restaurant layout: AC tables 1–5 and Non-AC tables 1–8', async () => {
    const d = new PosDB('layout-test');
    await d.open();
    const rooms = await d.rooms.toArray();
    const labels = async (name: string) =>
      (await d.diningTables.where('roomId').equals(rooms.find((r) => r.name === name)!.id).sortBy('sortOrder')).map((t) => t.label);
    expect(await labels('AC')).toEqual(['1', '2', '3', '4', '5']);
    expect(await labels('Non-AC')).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    d.close();
    await d.delete();
  });

  it('upgrading an installed app renumbers its tables and keeps orders on them', async () => {
    const name = 'v3-migration-test';
    const v2 = new Dexie(name);
    v2.version(1).stores(SCHEMA_V1);
    v2.version(2).stores(SCHEMA_V2);
    await v2.open();
    await v2.table('rooms').bulkAdd([
      { id: 'ac', name: 'AC', sortOrder: 1, active: true },
      { id: 'non', name: 'Non-AC', sortOrder: 2, active: true },
    ]);
    for (let i = 1; i <= 6; i++)
      await v2.table('diningTables').add({ id: `a${i}`, roomId: 'ac', label: `A${i}`, seats: 4, sortOrder: i, active: true });
    for (let i = 1; i <= 8; i++)
      await v2.table('diningTables').add({ id: `n${i}`, roomId: 'non', label: `N${i}`, seats: 4, sortOrder: i, active: true });
    await v2.table('orders').add({ id: 'o1', orderNo: 1, tableId: 'a3', roomId: 'ac', status: 'open', createdAt: 1 });
    await v2.table('settings').add({ key: 'app', requirePin: true });
    v2.close();

    const d = new PosDB(name);
    await d.open();
    expect(d.verno).toBe(CURRENT_SCHEMA_VERSION);
    expect((await d.diningTables.get('a3'))?.label).toBe('3');
    expect((await d.diningTables.get('a6'))?.active).toBe(false); // AC has 5 tables now
    expect((await d.diningTables.get('n8'))?.label).toBe('8');
    expect((await d.orders.get('o1'))?.tableId).toBe('a3');
    expect((await d.diningTables.filter((t) => t.active).count())).toBe(13);
    d.close();
    await d.delete();
  });

  it('upgrading replaces the sample menu with the real menu and keeps hand-added dishes', async () => {
    const name = 'v4-migration-test';
    const old = new Dexie(name);
    old.version(1).stores(SCHEMA_V1);
    old.version(2).stores(SCHEMA_V2);
    old.version(3).stores(SCHEMA_V2);
    await old.open();
    await old.table('categories').bulkAdd([
      { id: 'starters', name: 'Starters', sortOrder: 1, active: true },
      { id: 'breads', name: 'Breads', sortOrder: 2, active: true },
    ]);
    await old.table('menuItems').bulkAdd([
      { id: 's1', categoryId: 'starters', name: 'Veg Spring Roll', price: 16000, active: true, available: true, sortOrder: 1 },
      { id: 'b1', categoryId: 'breads', name: 'Butter Naan', price: 5000, active: true, available: true, sortOrder: 1 },
      { id: 'mine', categoryId: 'breads', name: 'Owner Special Roti', price: 3000, active: true, available: true, sortOrder: 2 },
    ]);
    await old.table('settings').add({ key: 'app', restaurant: { name: 'My Restaurant', address: '', phone: '', gstin: '', footer: '' } });
    old.close();

    const d = new PosDB(name);
    await d.open();
    expect(await d.menuItems.get('s1')).toBeUndefined();
    expect((await d.menuItems.get('mine'))?.name).toBe('Owner Special Roti');
    expect(await d.categories.get('starters')).toBeUndefined();
    expect((await d.categories.get('breads'))?.name).toBe('Breads');
    const dal = await d.menuItems.filter((m) => m.name === 'Dal Makhni').first();
    expect(dal?.variants).toEqual([
      { label: 'Half', price: 15000 },
      { label: 'Full', price: 28000 },
    ]);
    const s = await d.settings.get('app');
    expect(s?.restaurant.name).toBe('Mewari Makkhan Dhaba');
    expect(s?.restaurant.phone).toBe('7737788703');
    d.close();
    await d.delete();
  });
});
