import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { invoiceBlocks, kotBlocks, renderText } from '../printing/receipt';
import { menuItem, owner, resetDb, waiter } from '../test/helpers';
import { confirmPayment, finalizeInvoice } from './billing';
import { addItem, moveOrder, openTakeawayOrder, requestBill, sendToKitchen, setCustomerName } from './orders';
import { loadSales, startOfDay, endOfDay } from './sales';

beforeEach(resetDb);

describe('takeaway orders', () => {
  it('allows several takeaway orders at once, numbered with the other orders', async () => {
    const a = await openTakeawayOrder(waiter, 'Ravi');
    const b = await openTakeawayOrder(waiter);
    expect(a.id).not.toBe(b.id);
    expect([a.orderNo, b.orderNo]).toEqual([1, 2]);
    expect(a.type).toBe('takeaway');
    expect(a.customerName).toBe('Ravi');
  });

  it('prints a KOT marked TAKEAWAY with the customer name and no table', async () => {
    const o = await openTakeawayOrder(waiter);
    await setCustomerName(o.id, '  Meena  ');
    await addItem(o.id, await menuItem('Veg Biryani'), 2);
    const kot = await sendToKitchen(o.id, waiter);
    expect(kot.takeaway).toBe(true);
    expect(kot.customerName).toBe('Meena');
    const text = renderText(kotBlocks(kot, { restaurantName: 'R' }), 48).join('\n');
    expect(text).toContain(`TAKEAWAY #${o.orderNo}`);
    expect(text).toContain('Name: Meena');
    expect(text).not.toContain('TABLE');
  });

  it('bills and closes a takeaway order and counts it in sales', async () => {
    const o = await openTakeawayOrder(waiter, 'Ravi');
    await addItem(o.id, await menuItem('Veg Biryani'));
    await sendToKitchen(o.id, waiter);
    await requestBill(o.id);
    const inv = await finalizeInvoice(o.id, { discountType: 'none', discountValue: 0 }, waiter);
    expect(inv.takeaway).toBe(true);
    expect(renderText(invoiceBlocks(inv), 48).join('\n')).toContain('Takeaway: Ravi');
    await confirmPayment(inv.id, 'cash', waiter);
    expect((await db.orders.get(o.id))?.status).toBe('paid');
    const { summary } = await loadSales(startOfDay(), endOfDay());
    expect(summary.totalSales).toBe(22000);
  });

  it('cannot be moved to a table', async () => {
    const o = await openTakeawayOrder(waiter);
    const t = (await db.diningTables.toArray())[0];
    await expect(moveOrder(o.id, t.id, owner)).rejects.toThrow(/not on a table/);
  });
});
