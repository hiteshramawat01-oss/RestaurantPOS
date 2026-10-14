import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { DiningTable, Order, OrderItem, Room } from '../db/types';

export function useSettings() {
  return useLiveQuery(() => db.settings.get('app'), []);
}

export function useRooms(includeInactive = false): Room[] | undefined {
  return useLiveQuery(async () => {
    const rooms = await db.rooms.orderBy('sortOrder').toArray();
    return includeInactive ? rooms : rooms.filter((r) => r.active);
  }, [includeInactive]);
}

export function useTables(includeInactive = false): DiningTable[] | undefined {
  return useLiveQuery(async () => {
    const t = await db.diningTables.orderBy('sortOrder').toArray();
    return includeInactive ? t : t.filter((x) => x.active);
  }, [includeInactive]);
}

export interface ActiveOrderInfo {
  order: Order;
  items: OrderItem[];
}

/** All open and bill-pending orders with their lines. */
export function useActiveOrders(): ActiveOrderInfo[] | undefined {
  return useLiveQuery(async () => {
    const orders = await db.orders.where('status').anyOf('open', 'billing').toArray();
    const items = orders.length ? await db.orderItems.where('orderId').anyOf(orders.map((o) => o.id)).toArray() : [];
    return orders
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((order) => ({ order, items: items.filter((i) => i.orderId === order.id) }));
  }, []);
}

export function useStaffList() {
  return useLiveQuery(() => db.staff.toArray(), []);
}

/** Orders in progress with their lines and kitchen tickets (home screen). */
export function useOpenOrders() {
  return useLiveQuery(async () => {
    const orders = await db.orders.where('status').anyOf('open', 'billing').toArray();
    const ids = orders.map((o) => o.id);
    const [items, kots, tables, rooms] = await Promise.all([
      ids.length ? db.orderItems.where('orderId').anyOf(ids).toArray() : [],
      ids.length ? db.kots.where('orderId').anyOf(ids).toArray() : [],
      db.diningTables.toArray(),
      db.rooms.toArray(),
    ]);
    return { orders, items, kots, tables, rooms };
  }, []);
}
