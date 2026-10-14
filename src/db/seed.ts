import type { Transaction } from 'dexie';
import { newId } from '../lib/id';
import type { AppSettings, Category, DiningTable, MenuItem, Room, Staff } from './types';

/** The restaurant's tables: AC family tables 1–5 and Non-AC tables 1–8. */
export const TABLE_LAYOUT = { AC: 5, 'Non-AC': 8 } as const;

export function defaultSettings(): AppSettings {
  return {
    key: 'app',
    restaurant: {
      name: 'My Restaurant',
      address: '',
      phone: '',
      gstin: '',
      footer: 'Thank you! Visit again.',
    },
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

const MENU: Record<string, [string, number, boolean][]> = {
  Starters: [
    ['Paneer Tikka', 240, true],
    ['Veg Spring Roll', 160, true],
    ['Chicken 65', 260, false],
    ['Hara Bhara Kebab', 180, true],
  ],
  'Main Course': [
    ['Dal Makhani', 220, true],
    ['Paneer Butter Masala', 260, true],
    ['Kadai Veg', 220, true],
    ['Butter Chicken', 320, false],
    ['Dal Baati Churma', 280, true],
  ],
  Breads: [
    ['Tandoori Roti', 25, true],
    ['Butter Naan', 50, true],
    ['Garlic Naan', 70, true],
    ['Missi Roti', 40, true],
  ],
  Rice: [
    ['Steamed Rice', 120, true],
    ['Jeera Rice', 150, true],
    ['Veg Biryani', 220, true],
  ],
  Beverages: [
    ['Masala Chaas', 60, true],
    ['Sweet Lassi', 80, true],
    ['Fresh Lime Soda', 70, true],
    ['Mineral Water', 20, true],
  ],
  Desserts: [
    ['Gulab Jamun (2 pc)', 80, true],
    ['Rasmalai', 110, true],
  ],
};

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

  const categories: Category[] = [];
  const menuItems: MenuItem[] = [];
  Object.entries(MENU).forEach(([catName, items], ci) => {
    const cat: Category = { id: newId(), name: catName, sortOrder: ci + 1, active: true };
    categories.push(cat);
    items.forEach(([name, rupees, veg], ii) =>
      menuItems.push({
        id: newId(),
        categoryId: cat.id,
        name,
        price: rupees * 100,
        veg,
        active: true,
        available: true,
        sortOrder: ii + 1,
      }),
    );
  });

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
