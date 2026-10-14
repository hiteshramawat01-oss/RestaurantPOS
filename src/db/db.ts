import Dexie, { type Table } from 'dexie';
import type {
  AppSettings,
  AuditEntry,
  Category,
  Counter,
  DiningTable,
  Invoice,
  Kot,
  MenuItem,
  Meta,
  Order,
  OrderItem,
  Payment,
  PrintAttempt,
  Room,
  Staff,
} from './types';
import { seedDatabase, TABLE_LAYOUT } from './seed';
import { newId } from '../lib/id';

export const DB_NAME = 'restaurant-pos';

/**
 * Schema history. NEVER edit an existing version's store definition after
 * it has shipped: add a new version with an upgrade function instead.
 * Dexie keeps all data across version bumps, and nothing in the app ever
 * deletes the database during an update.
 */
export const SCHEMA_V1 = {
  rooms: 'id, sortOrder',
  diningTables: 'id, roomId, sortOrder',
  categories: 'id, sortOrder',
  menuItems: 'id, categoryId, sortOrder',
  staff: 'id',
  orders: 'id, &orderNo, tableId, status, createdAt',
  orderItems: 'id, orderId, kotId',
  kots: 'id, &kotNo, orderId, createdAt',
  printAttempts: 'id, docId, at',
  invoices: 'id, &invoiceNo, orderId, status, createdAt',
  payments: 'id, invoiceId, at',
  settings: 'key',
  counters: 'name',
  meta: 'key',
};

export const SCHEMA_V2 = {
  ...SCHEMA_V1,
  audit: 'id, at',
  orders: 'id, &orderNo, tableId, status, createdAt, closedAt',
};

export const CURRENT_SCHEMA_VERSION = 3;

export class PosDB extends Dexie {
  rooms!: Table<Room, string>;
  diningTables!: Table<DiningTable, string>;
  categories!: Table<Category, string>;
  menuItems!: Table<MenuItem, string>;
  staff!: Table<Staff, string>;
  orders!: Table<Order, string>;
  orderItems!: Table<OrderItem, string>;
  kots!: Table<Kot, string>;
  printAttempts!: Table<PrintAttempt, string>;
  invoices!: Table<Invoice, string>;
  payments!: Table<Payment, string>;
  settings!: Table<AppSettings, string>;
  counters!: Table<Counter, string>;
  meta!: Table<Meta, string>;
  audit!: Table<AuditEntry, string>;

  constructor(name = DB_NAME) {
    super(name);

    this.version(1).stores(SCHEMA_V1);

    // v2: audit trail for corrections/cancellations, closedAt index for
    // sales reports, and backfill of print counters on older records.
    this.version(2)
      .stores(SCHEMA_V2)
      .upgrade(async (tx) => {
        await tx
          .table('kots')
          .toCollection()
          .modify((k: Partial<Kot>) => {
            if (typeof k.printCount !== 'number') k.printCount = k.printStatus === 'printed' ? 1 : 0;
          });
        await tx
          .table('invoices')
          .toCollection()
          .modify((i: Partial<Invoice>) => {
            if (typeof i.printCount !== 'number') i.printCount = 0;
          });
        await tx.table('meta').put({ key: 'migratedToV2At', value: Date.now() });
      });

    // v3: the restaurant's real layout. Tables are renumbered in place
    // (AC 1–5, Non-AC 1–8) so past orders keep pointing at the same tables.
    // A table beyond the layout is hidden, unless it still has an open order.
    this.version(3)
      .stores(SCHEMA_V2)
      .upgrade(async (tx) => {
        const rooms = await tx.table('rooms').toArray();
        const orders: Order[] = await tx.table('orders').toArray();
        const busy = new Set(orders.filter((o) => o.status === 'open' || o.status === 'billing').map((o) => o.tableId));
        for (const room of rooms as Room[]) {
          const count = TABLE_LAYOUT[room.name as keyof typeof TABLE_LAYOUT];
          if (!count) continue;
          const existing = ((await tx.table('diningTables').where('roomId').equals(room.id).toArray()) as DiningTable[]).sort(
            (a, b) => a.sortOrder - b.sortOrder,
          );
          for (let i = 0; i < Math.max(count, existing.length); i++) {
            const t = existing[i];
            if (i < count) {
              if (t) await tx.table('diningTables').update(t.id, { label: String(i + 1), sortOrder: i + 1, active: true });
              else
                await tx
                  .table('diningTables')
                  .add({ id: newId(), roomId: room.id, label: String(i + 1), seats: 4, sortOrder: i + 1, active: true });
            } else if (t) {
              await tx.table('diningTables').update(t.id, { sortOrder: 100 + i, active: busy.has(t.id) });
            }
          }
        }
        await tx.table('settings').toCollection().modify((s: Partial<AppSettings>) => {
          s.requirePin = false;
        });
      });

    this.on('populate', (tx) => seedDatabase(tx));
    this.on('ready', async () => {
      await this.meta.put({ key: 'schemaVersion', value: CURRENT_SCHEMA_VERSION });
    });
  }
}

export const db = new PosDB();

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage(): Promise<'granted' | 'denied' | 'unsupported'> {
  try {
    if (!navigator.storage?.persist) return 'unsupported';
    if (await navigator.storage.persisted()) return 'granted';
    return (await navigator.storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'unsupported';
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const e = await navigator.storage.estimate();
    return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
  } catch {
    return null;
  }
}
