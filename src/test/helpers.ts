import { db } from '../db/db';
import type { Actor } from '../services/common';

export const owner: Actor = { id: 'owner', name: 'Owner', role: 'owner' };
export const waiter: Actor = { id: 'w1', name: 'Waiter 1', role: 'staff' };

/** Fresh, freshly-seeded database for each test. */
export async function resetDb() {
  db.close();
  await db.delete();
  await db.open();
}

export async function firstTable(roomName = 'AC') {
  const room = (await db.rooms.toArray()).find((r) => r.name === roomName)!;
  const tables = await db.diningTables.where('roomId').equals(room.id).sortBy('sortOrder');
  return tables[0];
}

export async function menuItem(name: string) {
  return (await db.menuItems.toArray()).find((m) => m.name === name)!;
}
