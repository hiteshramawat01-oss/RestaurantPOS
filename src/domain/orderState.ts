import type { DiningTable, Kot, Order, OrderItem, Room } from '../db/types';
import { billableItems, itemCount, orderTotal } from './totals';

export type OrderStage = 'preparing' | 'payment';

export interface OrderSummary {
  order: Order;
  items: OrderItem[];
  kots: Kot[];
  stage: OrderStage;
  title: string; // "Table 3" / "Takeaway #12"
  subtitle: string; // "AC" / customer name
  total: number;
  count: number;
  unprinted: Kot[]; // kitchen slips not printed yet
}

/** Preparing until the food is marked delivered (or payment was requested). */
export function stageOf(order: Order): OrderStage {
  return order.servedAt || order.status === 'billing' ? 'payment' : 'preparing';
}

export function summarize(order: Order, items: OrderItem[], kots: Kot[], tables: DiningTable[], rooms: Room[]): OrderSummary {
  const takeaway = order.type === 'takeaway';
  const table = tables.find((t) => t.id === order.tableId);
  const room = rooms.find((r) => r.id === order.roomId);
  return {
    order,
    items,
    kots: [...kots].sort((a, b) => a.kotNo - b.kotNo),
    stage: stageOf(order),
    title: takeaway ? `Takeaway #${order.orderNo}` : `Table ${table?.label ?? '?'}`,
    subtitle: takeaway ? (order.customerName ?? 'Parcel') : (room?.name ?? ''),
    total: orderTotal(items),
    count: itemCount(items),
    unprinted: kots.filter((k) => k.printStatus !== 'printed').sort((a, b) => a.kotNo - b.kotNo),
  };
}

export function hasFood(items: OrderItem[]): boolean {
  return billableItems(items).length > 0;
}
