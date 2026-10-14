import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { firstTable, menuItem, owner, resetDb, waiter } from '../test/helpers';
import {
  addItem,
  cancelOrder,
  discardIfEmpty,
  getActiveOrderForTable,
  moveOrder,
  openOrderForTable,
  requestBill,
  reopenOrder,
  sendToKitchen,
  setItemNote,
  setItemQty,
  setKitchenStatus,
  voidSentItem,
} from './orders';
import { orderTotal } from '../domain/totals';

beforeEach(resetDb);

describe('opening orders', () => {
  it('numbers orders sequentially', async () => {
    const tables = await db.diningTables.toArray();
    const a = await openOrderForTable(tables[0].id, waiter);
    const b = await openOrderForTable(tables[1].id, waiter);
    const c = await openOrderForTable(tables[2].id, waiter);
    expect([a.orderNo, b.orderNo, c.orderNo]).toEqual([1, 2, 3]);
  });

  it('never creates two active orders for the same table, even on simultaneous taps', async () => {
    const t = await firstTable();
    const results = await Promise.all([openOrderForTable(t.id, waiter), openOrderForTable(t.id, waiter), openOrderForTable(t.id, waiter)]);
    expect(new Set(results.map((o) => o.id)).size).toBe(1);
    expect(await db.orders.count()).toBe(1);
  });

  it('discards an order opened by mistake with no items', async () => {
    const t = await firstTable();
    const o = await openOrderForTable(t.id, waiter);
    expect(await discardIfEmpty(o.id)).toBe(true);
    expect(await getActiveOrderForTable(t.id)).toBeUndefined();
  });
});

describe('editing an order', () => {
  it('adds items, merges taps on the same dish, and changes quantities', async () => {
    const t = await firstTable();
    const o = await openOrderForTable(t.id, waiter);
    const naan = await menuItem('Naan');
    await addItem(o.id, naan);
    await addItem(o.id, naan);
    let items = await db.orderItems.where('orderId').equals(o.id).toArray();
    expect(items).toHaveLength(1);
    expect(items[0].qty).toBe(2);
    await setItemQty(items[0].id, 5);
    items = await db.orderItems.where('orderId').equals(o.id).toArray();
    expect(orderTotal(items)).toBe(5 * naan.price);
    await setItemQty(items[0].id, 0);
    expect(await db.orderItems.where('orderId').equals(o.id).count()).toBe(0);
  });

  it('keeps a noted line separate from plain taps of the same dish', async () => {
    const t = await firstTable();
    const o = await openOrderForTable(t.id, waiter);
    const dal = await menuItem('Lassan ki Chatni');
    const first = await addItem(o.id, dal);
    await setItemNote(first.id, 'less spicy');
    await addItem(o.id, dal);
    expect(await db.orderItems.where('orderId').equals(o.id).count()).toBe(2);
  });

  it('refuses unavailable dishes', async () => {
    const t = await firstTable();
    const o = await openOrderForTable(t.id, waiter);
    const dish = await menuItem('Gulab Jamun');
    await expect(addItem(o.id, { ...dish, available: false })).rejects.toThrow(/not available/);
  });
});

describe('kitchen tickets', () => {
  it('first ticket is NEW, later ones are ADDED and contain only the new items', async () => {
    const t = await firstTable();
    const o = await openOrderForTable(t.id, waiter);
    await addItem(o.id, await menuItem('Paneer Tikka'), 2);
    const k1 = await sendToKitchen(o.id, waiter);
    expect(k1.kind).toBe('NEW');
    expect(k1.lines).toEqual([{ name: 'Paneer Tikka', qty: 2 }]);

    await addItem(o.id, await menuItem('Naan'), 4);
    const k2 = await sendToKitchen(o.id, waiter);
    expect(k2.kind).toBe('ADDED');
    expect(k2.lines).toEqual([{ name: 'Naan', qty: 4 }]);
    expect(k2.kotNo).toBe(k1.kotNo + 1);
    expect(k2.tableLabel).toBe(t.label);
    expect(k2.roomName).toBe('AC');
  });

  it('adding the same dish after it was sent creates a new line, not a change to the sent one', async () => {
    const t = await firstTable();
    const o = await openOrderForTable(t.id, waiter);
    const naan = await menuItem('Naan');
    await addItem(o.id, naan, 2);
    await sendToKitchen(o.id, waiter);
    await addItem(o.id, naan, 1);
    const items = await db.orderItems.where('orderId').equals(o.id).toArray();
    expect(items.map((i) => [i.qty, !!i.kotId]).sort()).toEqual([
      [1, false],
      [2, true],
    ]);
  });

  it('prevents duplicate tickets from double taps', async () => {
    const t = await firstTable();
    const o = await openOrderForTable(t.id, waiter);
    await addItem(o.id, await menuItem('Plain Curd'));
    const results = await Promise.allSettled([sendToKitchen(o.id, waiter), sendToKitchen(o.id, waiter), sendToKitchen(o.id, waiter)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.kots.count()).toBe(1);
    await expect(sendToKitchen(o.id, waiter)).rejects.toThrow(/no new items/);
  });

  it('locks sent lines against edits', async () => {
    const t = await firstTable();
    const o = await openOrderForTable(t.id, waiter);
    const item = await addItem(o.id, await menuItem('Plain Curd'));
    await sendToKitchen(o.id, waiter);
    await expect(setItemQty(item.id, 3)).rejects.toThrow(/already sent/);
  });

  it('voiding a sent item needs the owner and produces a VOID ticket', async () => {
    const t = await firstTable();
    const o = await openOrderForTable(t.id, waiter);
    const item = await addItem(o.id, await menuItem('Paneer Tikka Butter Masala'));
    await sendToKitchen(o.id, waiter);
    await expect(voidSentItem(item.id, 'customer changed mind', waiter)).rejects.toThrow(/owner/);
    const v = await voidSentItem(item.id, 'customer changed mind', owner);
    expect(v.kind).toBe('VOID');
    const items = await db.orderItems.where('orderId').equals(o.id).toArray();
    expect(orderTotal(items)).toBe(0);
    expect(await db.audit.count()).toBe(1);
  });
});

describe('moving and closing', () => {
  it('moves an order to a free table only', async () => {
    const tables = await db.diningTables.toArray();
    const o = await openOrderForTable(tables[0].id, waiter);
    await openOrderForTable(tables[1].id, waiter);
    await expect(moveOrder(o.id, tables[1].id, owner)).rejects.toThrow(/already has an active order/);
    await expect(moveOrder(o.id, tables[2].id, waiter)).rejects.toThrow(/owner/);
    await moveOrder(o.id, tables[2].id, owner);
    expect((await getActiveOrderForTable(tables[2].id))?.id).toBe(o.id);
    expect(await getActiveOrderForTable(tables[0].id)).toBeUndefined();
  });

  it('requesting the bill requires every item to be sent first', async () => {
    const t = await firstTable();
    const o = await openOrderForTable(t.id, waiter);
    await addItem(o.id, await menuItem('Butter Milk'));
    await expect(requestBill(o.id)).rejects.toThrow(/not been sent/);
    await sendToKitchen(o.id, waiter);
    await requestBill(o.id);
    expect((await db.orders.get(o.id))?.status).toBe('billing');
    await expect(addItem(o.id, await menuItem('Butter Milk'))).rejects.toThrow(/Reopen/);
    await reopenOrder(o.id, waiter);
    await addItem(o.id, await menuItem('Butter Milk'));
  });

  it('cancels an order with a reason (owner only)', async () => {
    const t = await firstTable();
    const o = await openOrderForTable(t.id, waiter);
    await expect(cancelOrder(o.id, 'walked out', waiter)).rejects.toThrow(/owner/);
    await expect(cancelOrder(o.id, '  ', owner)).rejects.toThrow(/reason/);
    await cancelOrder(o.id, 'walked out', owner);
    expect((await db.orders.get(o.id))?.status).toBe('cancelled');
    expect(await getActiveOrderForTable(t.id)).toBeUndefined();
  });
});

describe('dishes with two sizes', () => {
  it('needs a size, prices by size, and keeps Half and Full on separate lines', async () => {
    const t = await firstTable();
    const o = await openOrderForTable(t.id, waiter);
    const dal = await menuItem('Dal Makhni');
    await expect(addItem(o.id, dal)).rejects.toThrow(/Half or Full/);
    await addItem(o.id, dal, 1, 'Half');
    await addItem(o.id, dal, 1, 'Half');
    await addItem(o.id, dal, 1, 'Full');
    const items = (await db.orderItems.where('orderId').equals(o.id).toArray()).sort((a, b) => a.unitPrice - b.unitPrice);
    expect(items.map((i) => [i.name, i.qty, i.unitPrice])).toEqual([
      ['Dal Makhni (Half)', 2, 15000],
      ['Dal Makhni (Full)', 1, 28000],
    ]);
    const kot = await sendToKitchen(o.id, waiter);
    expect(kot.lines.map((l) => `${l.qty} x ${l.name}`).sort()).toEqual(['1 x Dal Makhni (Full)', '2 x Dal Makhni (Half)']);
  });

  it('rotis use Plain / Butter', async () => {
    const t = await firstTable();
    const o = await openOrderForTable(t.id, waiter);
    const roti = await menuItem('Tandoori Roti');
    const line = await addItem(o.id, roti, 4, 'Butter');
    expect([line.name, line.unitPrice]).toEqual(['Tandoori Roti (Butter)', 2000]);
  });
});

describe('kitchen ticket status', () => {
  it('new tickets start as New, move through statuses, and are never printed automatically', async () => {
    const t = await firstTable();
    const o = await openOrderForTable(t.id, waiter);
    await addItem(o.id, await menuItem('Naan'), 2);
    const kot = await sendToKitchen(o.id, waiter);
    expect(kot.kitchenStatus).toBe('new');
    expect(kot.printStatus).toBe('pending');
    for (const s of ['preparing', 'ready', 'served'] as const) {
      await setKitchenStatus(kot.id, s);
      expect((await db.kots.get(kot.id))?.kitchenStatus).toBe(s);
    }
    await expect(setKitchenStatus('missing', 'ready')).rejects.toThrow(/not found/);
  });

  it('void tickets also start as New', async () => {
    const t = await firstTable();
    const o = await openOrderForTable(t.id, waiter);
    const item = await addItem(o.id, await menuItem('Naan'));
    await sendToKitchen(o.id, waiter);
    const v = await voidSentItem(item.id, 'wrong dish', owner);
    expect(v.kitchenStatus).toBe('new');
  });
});
