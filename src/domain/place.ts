import type { DiningTable, Invoice, Kot, Order, Room } from '../db/types';

/** Where an order belongs, for lists and headings: "Table A3 · AC" or "Takeaway #12 · Ravi". */
export function orderPlace(order: Order, tables?: DiningTable[], rooms?: Room[]): { short: string; long: string } {
  if (order.type === 'takeaway') {
    return {
      short: 'TA',
      long: `Takeaway #${order.orderNo}${order.customerName ? ` · ${order.customerName}` : ''}`,
    };
  }
  const t = tables?.find((x) => x.id === order.tableId);
  const r = rooms?.find((x) => x.id === order.roomId);
  return { short: t?.label ?? '?', long: `Table ${t?.label ?? '?'}${r ? ` · ${r.name}` : ''}` };
}

/** Screen for continuing an order. */
export function orderPath(order: Order): string {
  if (order.status === 'billing') return `/billing/${order.id}`;
  return order.type === 'takeaway' ? `/takeaway/${order.id}` : `/order/${order.tableId}`;
}

export function invoicePlace(inv: Pick<Invoice, 'takeaway' | 'customerName' | 'tableLabel' | 'roomName'>): string {
  if (inv.takeaway) return `Takeaway${inv.customerName ? ` · ${inv.customerName}` : ''}`;
  return `Table ${inv.tableLabel}${inv.roomName ? ` (${inv.roomName})` : ''}`;
}

export function kotPlace(k: Pick<Kot, 'takeaway' | 'customerName' | 'tableLabel' | 'orderNo'>): string {
  if (k.takeaway) return `Takeaway #${k.orderNo}${k.customerName ? ` · ${k.customerName}` : ''}`;
  return `Table ${k.tableLabel}`;
}
