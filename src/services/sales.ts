import { db } from '../db/db';
import type { Invoice, Order } from '../db/types';

export interface SalesSummary {
  totalSales: number; // paise, paid invoices only
  completedOrders: number;
  cash: number;
  upi: number;
  discounts: number;
  taxes: number;
  cancelledOrders: number;
  cancelledInvoices: number;
  refundedAmount: number;
  unpaidInvoices: number;
  unpaidAmount: number;
}

export function startOfDay(d = new Date()): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export function endOfDay(d = new Date()): number {
  return startOfDay(d) + 24 * 60 * 60 * 1000;
}

const inRange = (t: number | undefined, from: number, to: number) => t !== undefined && t >= from && t < to;

/** Pure calculation so it can be unit-tested without a database. */
export function computeSales(invoices: Invoice[], orders: Order[], from: number, to: number): SalesSummary {
  const s: SalesSummary = {
    totalSales: 0,
    completedOrders: 0,
    cash: 0,
    upi: 0,
    discounts: 0,
    taxes: 0,
    cancelledOrders: 0,
    cancelledInvoices: 0,
    refundedAmount: 0,
    unpaidInvoices: 0,
    unpaidAmount: 0,
  };
  for (const inv of invoices) {
    if (inv.status === 'paid' && inRange(inv.paidAt, from, to)) {
      s.totalSales += inv.total;
      s.completedOrders += 1;
      s.discounts += inv.discountAmount;
      s.taxes += inv.taxes.reduce((a, t) => a + t.amount, 0);
      if (inv.paymentMethod === 'cash') s.cash += inv.total;
      else if (inv.paymentMethod === 'upi') s.upi += inv.total;
    } else if (inv.status === 'cancelled' && inRange(inv.cancelledAt, from, to)) {
      s.cancelledInvoices += 1;
      if (inv.paidAt) s.refundedAmount += inv.total;
    } else if (inv.status === 'unpaid' && inRange(inv.createdAt, from, to)) {
      s.unpaidInvoices += 1;
      s.unpaidAmount += inv.total;
    }
  }
  for (const o of orders) {
    if (o.status === 'cancelled' && inRange(o.closedAt ?? o.updatedAt, from, to)) s.cancelledOrders += 1;
  }
  return s;
}

export async function loadSales(from: number, to: number) {
  // Look back a week so late payments and refunds of recent bills are counted on the day they happen.
  const windowStart = from - 7 * 24 * 60 * 60 * 1000;
  const invoices = await db.invoices.where('createdAt').between(windowStart, to, true, false).toArray();
  const orders = await db.orders.where('createdAt').between(windowStart, to, true, false).toArray();
  return { summary: computeSales(invoices, orders, from, to), invoices, orders };
}
