import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { menuItem, owner, resetDb, waiter } from '../test/helpers';
import { addItem, openOrderForTable, requestBill, sendToKitchen } from './orders';
import { cancelInvoice, confirmPayment, finalizeInvoice } from './billing';

beforeEach(resetDb);

async function billPendingOrder(tableIndex = 0) {
  const tables = await db.diningTables.orderBy('sortOrder').toArray();
  const o = await openOrderForTable(tables[tableIndex].id, waiter);
  await addItem(o.id, await menuItem('Paneer Tikka'), 2); // 640
  await addItem(o.id, await menuItem('Naan'), 4); // 160
  await sendToKitchen(o.id, waiter);
  await requestBill(o.id);
  return o;
}

describe('invoices', () => {
  it('finalizes with correct totals using configured taxes', async () => {
    const s = (await db.settings.get('app'))!;
    s.taxes = s.taxes.map((t) => ({ ...t, enabled: true }));
    await db.settings.put(s);
    const o = await billPendingOrder();
    const inv = await finalizeInvoice(o.id, { discountType: 'percent', discountValue: 10 }, owner);
    expect(inv.subtotal).toBe(80000);
    expect(inv.discountAmount).toBe(8000);
    expect(inv.taxes.map((t) => t.amount)).toEqual([1800, 1800]);
    // 720.00 taxable + 36.00 tax = 756.00
    expect(inv.total).toBe(75600);
    expect(inv.roundOff).toBe(0);
  });

  it('is idempotent on double tap and numbers invoices uniquely', async () => {
    const o1 = await billPendingOrder(0);
    const o2 = await billPendingOrder(1);
    const [a, b] = await Promise.all([
      finalizeInvoice(o1.id, { discountType: 'none', discountValue: 0 }, waiter),
      finalizeInvoice(o1.id, { discountType: 'none', discountValue: 0 }, waiter),
    ]);
    expect(a.id).toBe(b.id);
    const c = await finalizeInvoice(o2.id, { discountType: 'none', discountValue: 0 }, waiter);
    expect(a.invoiceNo).toBe('INV-00001');
    expect(c.invoiceNo).toBe('INV-00002');
    expect(await db.invoices.count()).toBe(2);
  });

  it('staff cannot grant discounts', async () => {
    const o = await billPendingOrder();
    await expect(finalizeInvoice(o.id, { discountType: 'percent', discountValue: 10 }, waiter)).rejects.toThrow(/owner/);
  });

  it('keeps the order open until payment is confirmed, then frees the table', async () => {
    const o = await billPendingOrder();
    const inv = await finalizeInvoice(o.id, { discountType: 'none', discountValue: 0 }, waiter);
    expect((await db.orders.get(o.id))?.status).toBe('billing');
    await confirmPayment(inv.id, 'upi', waiter);
    await confirmPayment(inv.id, 'upi', waiter); // double tap is harmless
    expect((await db.orders.get(o.id))?.status).toBe('paid');
    expect(await db.payments.count()).toBe(1);
    expect((await db.invoices.get(inv.id))?.paymentMethod).toBe('upi');
  });

  it('cancelling an unpaid invoice keeps the record and allows a corrected one with a new number', async () => {
    const o = await billPendingOrder();
    const inv = await finalizeInvoice(o.id, { discountType: 'none', discountValue: 0 }, waiter);
    await expect(cancelInvoice(inv.id, 'wrong items', waiter)).rejects.toThrow(/owner/);
    await cancelInvoice(inv.id, 'wrong items', owner);
    expect((await db.invoices.get(inv.id))?.status).toBe('cancelled');
    const again = await finalizeInvoice(o.id, { discountType: 'none', discountValue: 0 }, waiter);
    expect(again.invoiceNo).toBe('INV-00002');
    await expect(confirmPayment(inv.id, 'cash', waiter)).rejects.toThrow(/cancelled/);
  });

  it('refunding a paid invoice cancels the order', async () => {
    const o = await billPendingOrder();
    const inv = await finalizeInvoice(o.id, { discountType: 'none', discountValue: 0 }, waiter);
    await confirmPayment(inv.id, 'cash', waiter);
    await cancelInvoice(inv.id, 'customer complaint', owner);
    expect((await db.orders.get(o.id))?.status).toBe('cancelled');
    expect(await db.audit.count()).toBe(1);
  });

  it('unique index rejects a duplicate invoice number', async () => {
    const o = await billPendingOrder();
    const inv = await finalizeInvoice(o.id, { discountType: 'none', discountValue: 0 }, waiter);
    await expect(db.invoices.add({ ...inv, id: 'other' })).rejects.toThrow();
  });
});
