import { beforeEach, describe, expect, it } from 'vitest';
import type { Invoice, Order } from '../db/types';
import { computeSales, endOfDay, loadSales, startOfDay } from './sales';
import { firstTable, menuItem, owner, resetDb, waiter } from '../test/helpers';
import { db } from '../db/db';
import { addItem, cancelOrder, openOrderForTable, requestBill, sendToKitchen } from './orders';
import { confirmPayment, finalizeInvoice } from './billing';

const day = startOfDay(new Date(2026, 9, 13));
const H = 60 * 60 * 1000;

const inv = (p: Partial<Invoice>): Invoice =>
  ({
    id: Math.random().toString(),
    invoiceNo: 'x',
    total: 10000,
    discountAmount: 0,
    taxes: [],
    status: 'paid',
    createdAt: day + 12 * H,
    paidAt: day + 12 * H,
    paymentMethod: 'cash',
    ...p,
  }) as Invoice;

describe('computeSales', () => {
  it('counts only paid invoices as sales and splits cash/UPI', () => {
    const s = computeSales(
      [
        inv({ total: 50000, paymentMethod: 'cash' }),
        inv({ total: 30000, paymentMethod: 'upi' }),
        inv({ total: 99900, status: 'unpaid', paidAt: undefined, paymentMethod: undefined }),
        inv({ total: 20000, status: 'cancelled', paidAt: day + 11 * H, cancelledAt: day + 13 * H }),
        inv({ total: 40000, paidAt: day - 2 * H }), // yesterday
      ],
      [{ status: 'cancelled', closedAt: day + 14 * H } as Order, { status: 'paid', closedAt: day + 14 * H } as Order],
      day,
      day + 24 * H,
    );
    expect(s.totalSales).toBe(80000);
    expect(s.completedOrders).toBe(2);
    expect(s.cash).toBe(50000);
    expect(s.upi).toBe(30000);
    expect(s.unpaidInvoices).toBe(1);
    expect(s.unpaidAmount).toBe(99900);
    expect(s.cancelledInvoices).toBe(1);
    expect(s.refundedAmount).toBe(20000);
    expect(s.cancelledOrders).toBe(1);
  });
});

describe('loadSales', () => {
  beforeEach(resetDb);

  it('reports today from the database', async () => {
    const tables = await db.diningTables.toArray();
    for (const [i, method] of (['cash', 'upi'] as const).entries()) {
      const o = await openOrderForTable(tables[i].id, waiter);
      await addItem(o.id, await menuItem('Veg Biryani'));
      await sendToKitchen(o.id, waiter);
      await requestBill(o.id);
      const invoice = await finalizeInvoice(o.id, { discountType: 'none', discountValue: 0 }, waiter);
      await confirmPayment(invoice.id, method, waiter);
    }
    const t = await firstTable('Non-AC');
    const cancelled = await openOrderForTable(t.id, waiter);
    await cancelOrder(cancelled.id, 'test', owner);
    const { summary } = await loadSales(startOfDay(), endOfDay());
    expect(summary.totalSales).toBe(44000);
    expect(summary.cash).toBe(22000);
    expect(summary.upi).toBe(22000);
    expect(summary.completedOrders).toBe(2);
    expect(summary.cancelledOrders).toBe(1);
  });
});
