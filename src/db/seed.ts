import type { Transaction } from 'dexie';
import { newId } from '../lib/id';
import type { AppSettings, DiningTable, Room, Staff } from './types';
import { buildMenu, RESTAURANT } from './menuData';

/** The restaurant's tables: AC family tables 1–5 and Non-AC tables 1–8. */
export const TABLE_LAYOUT = { AC: 5, 'Non-AC': 8 } as const;

export function defaultSettings(): AppSettings {
  return {
    key: 'app',
    restaurant: { ...RESTAURANT },
    // Present but switched OFF: the owner must confirm the rates that apply
    // to their business before any tax is charged.
    taxes: [
      { id: newId(), name: 'CGST', ratePercent: 2.5, enabled: false },
      { id: newId(), name: 'SGST', ratePercent: 2.5, enabled: false },
    ],
    roundToRupee: true,
    invoicePrefix: 'INV-',
    printer: {
      method: 'browser',
      host: '',
      port: 9100,
      paperWidth: 80,
      autoPrintKot: true,
      copiesKot: 1,
    },
    requirePin: false,
    setupComplete: false,
  };
}

export function seedRows() {
  const ac: Room = { id: newId(), name: 'AC', sortOrder: 1, active: true };
  const nonAc: Room = { id: newId(), name: 'Non-AC', sortOrder: 2, active: true };

  const tables: DiningTable[] = [];
  for (const [room, count] of [
    [ac, TABLE_LAYOUT.AC],
    [nonAc, TABLE_LAYOUT['Non-AC']],
  ] as const)
    for (let i = 1; i <= count; i++)
      tables.push({ id: newId(), roomId: room.id, label: String(i), seats: 4, sortOrder: i, active: true });

  const { categories, menuItems } = buildMenu();

  const staff: Staff[] = [
    { id: newId(), name: 'Owner', role: 'owner', pin: '1234', active: true },
    { id: newId(), name: 'Waiter 1', role: 'staff', active: true },
    { id: newId(), name: 'Waiter 2', role: 'staff', active: true },
    { id: newId(), name: 'Waiter 3', role: 'staff', active: true },
    { id: newId(), name: 'Cashier', role: 'staff', active: true },
  ];

  return { rooms: [ac, nonAc], tables, categories, menuItems, staff };
}

export async function seedDatabase(tx: Transaction) {
  const rows = seedRows();
  await tx.table('rooms').bulkAdd(rows.rooms);
  await tx.table('diningTables').bulkAdd(rows.tables);
  await tx.table('categories').bulkAdd(rows.categories);
  await tx.table('menuItems').bulkAdd(rows.menuItems);
  await tx.table('staff').bulkAdd(rows.staff);
  await tx.table('settings').add(defaultSettings());
  await tx.table('counters').bulkAdd([
    { name: 'order', value: 0 },
    { name: 'kot', value: 0 },
    { name: 'invoice', value: 0 },
  ]);
  await tx.table('meta').add({ key: 'createdAt', value: Date.now() });
}
