import type { DiningTable, Kot, Order, OrderItem, Room } from '../db/types';
import { billableItems, itemCount, orderTotal } from './totals';

export type OrderStage = 'preparing' | 'partly' | 'payment';

export interface OrderSummary {
  order: Order;
  items: OrderItem[];
  kots: Kot[];
  stage: OrderStage;
  title: string; // "Table 3" / "Takeaway #12"
  subtitle: string; // "AC" / customer name
  total: number;
  count: number;
  servable: number; // dishes sent to the kitchen
  delivered: number; // of those, already taken to the guests
  unprinted: Kot[]; // kitchen slips not printed yet
}

/** Preparing → partly delivered → payment pending (all food delivered, or payment requested). */
export function stageOf(order: Order, items: OrderItem[] = []): OrderStage {
  if (order.servedAt || order.status === 'billing') return 'payment';
  return items.some((i) => i.kotId && !i.voided && i.deliveredAt) ? 'partly' : 'preparing';
}

export const STAGE_LABEL: Record<OrderStage, string> = {
  preparing: 'Preparing',
  partly: 'Partly served',
  payment: 'Payment pending',
};

export function summarize(order: Order, items: OrderItem[], kots: Kot[], tables: DiningTable[], rooms: Room[]): OrderSummary {
  const takeaway = order.type === 'takeaway';
  const table = tables.find((t) => t.id === order.tableId);
  const room = rooms.find((r) => r.id === order.roomId);
  return {
    order,
    items,
    kots: [...kots].sort((a, b) => a.kotNo - b.kotNo),
    stage: stageOf(order, items),
    title: takeaway ? `Takeaway #${order.orderNo}` : `Table ${table?.label ?? '?'}`,
    subtitle: takeaway ? (order.customerName ?? 'Parcel') : (room?.name ?? ''),
    total: orderTotal(items),
    count: itemCount(items),
    servable: items.filter((i) => i.kotId && !i.voided && i.qty > 0).length,
    delivered: items.filter((i) => i.kotId && !i.voided && i.qty > 0 && i.deliveredAt).length,
    unprinted: kots.filter((k) => k.printStatus !== 'printed').sort((a, b) => a.kotNo - b.kotNo),
  };
}

export function hasFood(items: OrderItem[]): boolean {
  return billableItems(items).length > 0;
}
