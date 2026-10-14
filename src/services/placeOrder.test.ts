import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { firstTable, menuItem, resetDb, waiter } from '../test/helpers';
import { cancelInvoice, finalizeInvoice } from './billing';
import { getActiveOrderForTable, markDelivered, markNotDelivered, placeOrder, requestBill, setItemDelivered } from './orders';
import { stageOf } from '../domain/orderState';
import { owner } from '../test/helpers';

beforeEach(resetDb);

describe('placing orders in one step', () => {
  it('creates the table order, its lines with sizes and notes, and one kitchen ticket', async () => {
    const t = await firstTable();
    const dal = await menuItem('Dal Makhni');
    const naan = await menuItem('Garlic Naan');
    const { order, kot } = await placeOrder(
      { kind: 'table', tableId: t.id },
      [
        { menuItemId: dal.id, variant: 'Full', qty: 1, note: 'less spicy' },
        { menuItemId: naan.id, qty: 3 },
      ],
      waiter,
    );
    expect(order.tableId).toBe(t.id);
    expect(kot.kind).toBe('NEW');
    expect(kot.printStatus).toBe('pending'); // nothing prints by itself
    expect(kot.lines).toEqual([
      { name: 'Dal Makhni (Full)', qty: 1, note: 'less spicy' },
      { name: 'Garlic Naan', qty: 3 },
    ]);
    const items = await db.orderItems.where('orderId').equals(order.id).toArray();
    expect(items.every((i) => i.kotId === kot.id)).toBe(true);
  });

  it('takeaway orders keep the customer name', async () => {
    const thali = await menuItem('Rajasthani Thali');
    const { order, kot } = await placeOrder({ kind: 'takeaway', customerName: 'Ravi' }, [{ menuItemId: thali.id, qty: 2 }], waiter);
    expect(order.type).toBe('takeaway');
    expect(kot.customerName).toBe('Ravi');
  });

  it('adding to an existing order makes an ADDED ticket and the order is no longer "delivered"', async () => {
    const t = await firstTable();
    const naan = await menuItem('Naan');
    const { order } = await placeOrder({ kind: 'table', tableId: t.id }, [{ menuItemId: naan.id, qty: 2 }], waiter);
    await markDelivered(order.id);
    expect((await db.orders.get(order.id))?.servedAt).toBeDefined();
    expect((await db.kots.where('orderId').equals(order.id).first())?.kitchenStatus).toBe('served');
    const { kot } = await placeOrder({ kind: 'existing', orderId: order.id }, [{ menuItemId: naan.id, qty: 1 }], waiter);
    expect(kot.kind).toBe('ADDED');
    expect(kot.lines).toEqual([{ name: 'Naan', qty: 1 }]);
    expect((await db.orders.get(order.id))?.servedAt).toBeUndefined();
  });

  it('choosing a busy table adds to its order instead of opening a second one', async () => {
    const t = await firstTable();
    const naan = await menuItem('Naan');
    const a = await placeOrder({ kind: 'table', tableId: t.id }, [{ menuItemId: naan.id, qty: 1 }], waiter);
    const b = await placeOrder({ kind: 'table', tableId: t.id }, [{ menuItemId: naan.id, qty: 1 }], waiter);
    expect(b.order.id).toBe(a.order.id);
    expect(b.kot.kind).toBe('ADDED');
  });

  it('can add items after payment was requested, but not once a bill is made', async () => {
    const t = await firstTable();
    const naan = await menuItem('Naan');
    const { order } = await placeOrder({ kind: 'table', tableId: t.id }, [{ menuItemId: naan.id, qty: 1 }], waiter);
    await requestBill(order.id);
    await placeOrder({ kind: 'existing', orderId: order.id }, [{ menuItemId: naan.id, qty: 1 }], waiter);
    expect((await db.orders.get(order.id))?.status).toBe('open');
    await requestBill(order.id);
    const inv = await finalizeInvoice(order.id, { discountType: 'none', discountValue: 0 }, waiter);
    await expect(placeOrder({ kind: 'existing', orderId: order.id }, [{ menuItemId: naan.id, qty: 1 }], waiter)).rejects.toThrow(/already made/);
    await cancelInvoice(inv.id, 'add food', owner);
    await placeOrder({ kind: 'existing', orderId: order.id }, [{ menuItemId: naan.id, qty: 1 }], waiter);
    expect((await getActiveOrderForTable(t.id))?.id).toBe(order.id);
  });

  it('saves nothing when a dish is missing a size', async () => {
    const t = await firstTable();
    const dal = await menuItem('Dal Makhni');
    await expect(placeOrder({ kind: 'table', tableId: t.id }, [{ menuItemId: dal.id, qty: 1 }], waiter)).rejects.toThrow(/Half or Full/);
    expect(await db.orders.count()).toBe(0);
    expect(await db.kots.count()).toBe(0);
  });
});

describe('serving dish by dish', () => {
  it('ticks single dishes, shows partly served, and becomes payment pending when all are served', async () => {
    const t = await firstTable();
    const naan = await menuItem('Naan');
    const dal = await menuItem('Dal Makhni');
    const { order } = await placeOrder(
      { kind: 'table', tableId: t.id },
      [
        { menuItemId: dal.id, variant: 'Full', qty: 1 },
        { menuItemId: naan.id, qty: 4 },
      ],
      waiter,
    );
    const [first, second] = (await db.orderItems.where('orderId').equals(order.id).toArray()).sort((a, b) => a.createdAt - b.createdAt);
    const items = () => db.orderItems.where('orderId').equals(order.id).toArray();

    await setItemDelivered(first.id, true);
    let o = (await db.orders.get(order.id))!;
    expect(stageOf(o, await items())).toBe('partly');

    await setItemDelivered(second.id, true);
    o = (await db.orders.get(order.id))!;
    expect(o.servedAt).toBeDefined();
    expect(stageOf(o, await items())).toBe('payment');

    await setItemDelivered(second.id, false); // undo one
    o = (await db.orders.get(order.id))!;
    expect(o.servedAt).toBeUndefined();
    expect(stageOf(o, await items())).toBe('partly');

    // new food arrives: the new dish is not served yet
    await setItemDelivered(second.id, true);
    await placeOrder({ kind: 'existing', orderId: order.id }, [{ menuItemId: naan.id, qty: 1 }], waiter);
    o = (await db.orders.get(order.id))!;
    expect(stageOf(o, await items())).toBe('partly');

    await markDelivered(order.id);
    expect((await items()).every((i) => i.deliveredAt)).toBe(true);
    await markNotDelivered(order.id);
    o = (await db.orders.get(order.id))!;
    expect(stageOf(o, await items())).toBe('preparing');
  });
});
