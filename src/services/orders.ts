import { db } from '../db/db';
import type { KitchenStatus, Kot, KotLine, MenuItem, Order, OrderItem } from '../db/types';
import { newId } from '../lib/id';
import { billableItems } from '../domain/totals';
import { addAudit, nextNumber, PosError, requireOwner, type Actor } from './common';

let lastStamp = 0;
/** Strictly increasing time stamp, so lines added in the same millisecond keep their order. */
function stamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
}

export const ACTIVE_STATUSES: Order['status'][] = ['open', 'billing'];

export function isActive(order: Order | undefined): order is Order {
  return !!order && ACTIVE_STATUSES.includes(order.status);
}

export async function getActiveOrderForTable(tableId: string): Promise<Order | undefined> {
  const orders = await db.orders.where('tableId').equals(tableId).toArray();
  return orders.find(isActive);
}

/**
 * Return the table's active order, creating one if none exists. Runs in a
 * single transaction so two quick taps can never create two orders.
 */
export async function openOrderForTable(tableId: string, actor: Actor): Promise<Order> {
  return db.transaction('rw', db.orders, db.counters, db.diningTables, async () => {
    const existing = await getActiveOrderForTable(tableId);
    if (existing) return existing;
    const table = await db.diningTables.get(tableId);
    if (!table || !table.active) throw new PosError('NO_TABLE', 'This table no longer exists.');
    const now = Date.now();
    const order: Order = {
      id: newId(),
      orderNo: await nextNumber('order'),
      tableId,
      roomId: table.roomId,
      status: 'open',
      staffId: actor.id,
      staffName: actor.name,
      createdAt: now,
      updatedAt: now,
    };
    await db.orders.add(order);
    return order;
  });
}

export function isTakeaway(order: Pick<Order, 'type'> | undefined): boolean {
  return order?.type === 'takeaway';
}

/**
 * Start a takeaway (parcel) order. It has no table, so any number can be
 * open at the same time. The customer name is optional.
 */
export async function openTakeawayOrder(actor: Actor, customerName?: string): Promise<Order> {
  return db.transaction('rw', db.orders, db.counters, async () => {
    const now = Date.now();
    const name = customerName?.trim().slice(0, 30);
    const order: Order = {
      id: newId(),
      orderNo: await nextNumber('order'),
      type: 'takeaway',
      tableId: '',
      roomId: '',
      customerName: name || undefined,
      status: 'open',
      staffId: actor.id,
      staffName: actor.name,
      createdAt: now,
      updatedAt: now,
    };
    await db.orders.add(order);
    return order;
  });
}

export async function setCustomerName(orderId: string, name: string): Promise<void> {
  await db.transaction('rw', db.orders, async () => {
    const order = await db.orders.get(orderId);
    if (!isActive(order)) throw new PosError('ORDER_CLOSED', 'This order is already closed.');
    const clean = name.trim().slice(0, 30);
    await db.orders.update(orderId, { customerName: clean || undefined, updatedAt: Date.now() });
  });
}

async function requireOpenOrder(orderId: string): Promise<Order> {
  const order = await db.orders.get(orderId);
  if (!order) throw new PosError('NO_ORDER', 'Order not found.');
  if (order.status === 'billing')
    throw new PosError('ORDER_BILLING', 'The bill has been requested. Reopen the order to make changes.');
  if (order.status !== 'open') throw new PosError('ORDER_CLOSED', 'This order is already closed.');
  return order;
}

async function touch(orderId: string) {
  await db.orders.update(orderId, { updatedAt: Date.now() });
}

/** Add one (or `qty`) of a dish. Merges into an unsent line of the same dish without a note. */
/**
 * Add one (or `qty`) of a dish. For dishes with sizes (Half / Full, Plain /
 * Butter) the size label must be given. Merges into an unsent line of the
 * same dish and size without a note.
 */
export async function addItem(orderId: string, menuItem: MenuItem, qty = 1, variant?: string): Promise<OrderItem> {
  if (!menuItem.active || !menuItem.available)
    throw new PosError('UNAVAILABLE', `${menuItem.name} is not available right now.`);
  let unitPrice = menuItem.price;
  let name = menuItem.name;
  if (menuItem.variants?.length) {
    const v = menuItem.variants.find((x) => x.label === variant);
    if (!v) throw new PosError('CHOOSE_SIZE', `Choose ${menuItem.variants.map((x) => x.label).join(' or ')} for ${menuItem.name}.`);
    unitPrice = v.price;
    name = `${menuItem.name} (${v.label})`;
  }
  return db.transaction('rw', db.orders, db.orderItems, async () => {
    await requireOpenOrder(orderId);
    const items = await db.orderItems.where('orderId').equals(orderId).toArray();
    const mergeable = items.find(
      (i) => !i.kotId && !i.voided && i.menuItemId === menuItem.id && i.variant === (menuItem.variants?.length ? variant : undefined) && !i.note,
    );
    if (mergeable) {
      mergeable.qty += qty;
      await db.orderItems.update(mergeable.id, { qty: mergeable.qty });
      await touch(orderId);
      return mergeable;
    }
    const item: OrderItem = {
      id: newId(),
      orderId,
      menuItemId: menuItem.id,
      name,
      ...(menuItem.variants?.length ? { variant } : {}),
      unitPrice,
      qty,
      createdAt: stamp(),
    };
    await db.orderItems.add(item);
    await touch(orderId);
    return item;
  });
}

async function requireDraftLine(itemId: string): Promise<OrderItem> {
  const item = await db.orderItems.get(itemId);
  if (!item) throw new PosError('NO_ITEM', 'Item not found.');
  if (item.kotId)
    throw new PosError('ITEM_SENT', 'This item was already sent to the kitchen. Use Void to cancel it.');
  await requireOpenOrder(item.orderId);
  return item;
}

/** Change quantity of an unsent line. Quantity 0 removes it. */
export async function setItemQty(itemId: string, qty: number): Promise<void> {
  if (!Number.isInteger(qty) || qty < 0) throw new PosError('BAD_QTY', 'Quantity must be a whole number.');
  await db.transaction('rw', db.orders, db.orderItems, async () => {
    const item = await requireDraftLine(itemId);
    if (qty === 0) await db.orderItems.delete(itemId);
    else await db.orderItems.update(itemId, { qty });
    await touch(item.orderId);
  });
}

export async function setItemNote(itemId: string, note: string): Promise<void> {
  await db.transaction('rw', db.orders, db.orderItems, async () => {
    const item = await requireDraftLine(itemId);
    const trimmed = note.trim().slice(0, 120);
    await db.orderItems.update(itemId, { note: trimmed || undefined });
    await touch(item.orderId);
  });
}

/** Delete an order that never received any item (waiter opened a table by mistake). */
export async function discardIfEmpty(orderId: string): Promise<boolean> {
  return db.transaction('rw', db.orders, db.orderItems, db.kots, async () => {
    const order = await db.orders.get(orderId);
    if (!order || order.status !== 'open') return false;
    const [itemCount, kotCount] = await Promise.all([
      db.orderItems.where('orderId').equals(orderId).count(),
      db.kots.where('orderId').equals(orderId).count(),
    ]);
    if (itemCount > 0 || kotCount > 0) return false;
    await db.orders.delete(orderId);
    return true;
  });
}

async function tableAndRoom(order: Order) {
  if (isTakeaway(order))
    return { tableLabel: 'Takeaway', roomName: '', takeaway: true, customerName: order.customerName };
  const table = await db.diningTables.get(order.tableId);
  const room = await db.rooms.get(order.roomId);
  return { tableLabel: table?.label ?? '?', roomName: room?.name ?? '' };
}

function kotLineFor(item: OrderItem, menu: Map<string, MenuItem>): KotLine {
  const standing = menu.get(item.menuItemId)?.prepNote?.trim();
  const note = [item.note?.trim(), standing].filter(Boolean).join(' / ');
  return { name: item.name, qty: item.qty, note: note || undefined };
}

/**
 * Create a Kitchen Order Ticket for every line not yet sent.
 * Atomic: lines are stamped with the KOT id in the same transaction, so a
 * second tap finds nothing to send and can never create a duplicate ticket.
 */
export async function sendToKitchen(orderId: string, actor: Actor): Promise<Kot> {
  return db.transaction(
    'rw',
    [db.orders, db.orderItems, db.kots, db.counters, db.menuItems, db.diningTables, db.rooms],
    async () => {
      const order = await requireOpenOrder(orderId);
      const items = await db.orderItems.where('orderId').equals(orderId).toArray();
      // In the order they were added, so the slip reads like the order was taken.
      const pending = items.filter((i) => !i.kotId && !i.voided && i.qty > 0).sort((a, b) => a.createdAt - b.createdAt);
      if (pending.length === 0) throw new PosError('NOTHING_TO_SEND', 'There are no new items to send.');
      const previousKots = await db.kots.where('orderId').equals(orderId).count();
      const menu = new Map((await db.menuItems.toArray()).map((m) => [m.id, m]));
      const kot: Kot = {
        id: newId(),
        kotNo: await nextNumber('kot'),
        orderId,
        orderNo: order.orderNo,
        ...(await tableAndRoom(order)),
        kind: previousKots === 0 ? 'NEW' : 'ADDED',
        lines: pending.map((i) => kotLineFor(i, menu)),
        staffName: actor.name,
        createdAt: Date.now(),
        printStatus: 'pending',
        printCount: 0,
        kitchenStatus: 'new',
        statusAt: Date.now(),
      };
      await db.kots.add(kot);
      for (const i of pending) await db.orderItems.update(i.id, { kotId: kot.id });
      // New food is on its way, so the order is no longer "delivered".
      await db.orders.update(orderId, { servedAt: undefined, updatedAt: Date.now() });
      return kot;
    },
  );
}

/**
 * Cancel a line already sent to the kitchen. Creates a VOID ticket so the
 * kitchen is told explicitly; the line stays on record, marked voided.
 */
export async function voidSentItem(itemId: string, reason: string, actor: Actor): Promise<Kot> {
  requireOwner(actor, 'void items already sent to the kitchen');
  if (!reason.trim()) throw new PosError('REASON_REQUIRED', 'Enter a reason for voiding.');
  return db.transaction(
    'rw',
    [db.orders, db.orderItems, db.kots, db.counters, db.diningTables, db.rooms, db.audit],
    async () => {
      const item = await db.orderItems.get(itemId);
      if (!item) throw new PosError('NO_ITEM', 'Item not found.');
      if (!item.kotId) throw new PosError('NOT_SENT', 'This item has not been sent yet; just remove it.');
      if (item.voided) throw new PosError('ALREADY_VOID', 'This item is already voided.');
      const order = await requireOpenOrder(item.orderId);
      const kot: Kot = {
        id: newId(),
        kotNo: await nextNumber('kot'),
        orderId: order.id,
        orderNo: order.orderNo,
        ...(await tableAndRoom(order)),
        kind: 'VOID',
        lines: [{ name: item.name, qty: item.qty, note: `VOID: ${reason.trim()}` }],
        staffName: actor.name,
        createdAt: Date.now(),
        printStatus: 'pending',
        printCount: 0,
        kitchenStatus: 'new',
        statusAt: Date.now(),
      };
      await db.kots.add(kot);
      await db.orderItems.update(itemId, { voided: true, voidReason: reason.trim(), voidKotId: kot.id });
      await addAudit('VOID_ITEM', `Order #${order.orderNo}: ${item.qty} x ${item.name} (${reason.trim()})`, actor);
      await touch(order.id);
      return kot;
    },
  );
}

export async function moveOrder(orderId: string, targetTableId: string, actor: Actor): Promise<void> {
  requireOwner(actor, 'move orders between tables');
  await db.transaction('rw', [db.orders, db.diningTables, db.audit, db.rooms], async () => {
    const order = await db.orders.get(orderId);
    if (!isActive(order)) throw new PosError('ORDER_CLOSED', 'Only active orders can be moved.');
    if (isTakeaway(order)) throw new PosError('TAKEAWAY', 'Takeaway orders are not on a table.');
    if (order.tableId === targetTableId) return;
    const target = await db.diningTables.get(targetTableId);
    if (!target || !target.active) throw new PosError('NO_TABLE', 'Target table not found.');
    const busy = await getActiveOrderForTable(targetTableId);
    if (busy) throw new PosError('TABLE_BUSY', `Table ${target.label} already has an active order.`);
    const from = await db.diningTables.get(order.tableId);
    await db.orders.update(orderId, { tableId: target.id, roomId: target.roomId, updatedAt: Date.now() });
    await addAudit('MOVE_ORDER', `Order #${order.orderNo}: ${from?.label ?? '?'} → ${target.label}`, actor);
  });
}

/** Lock the order for billing. All items must have been sent to the kitchen first. */
export async function requestBill(orderId: string): Promise<void> {
  await db.transaction('rw', db.orders, db.orderItems, async () => {
    const order = await db.orders.get(orderId);
    if (!order) throw new PosError('NO_ORDER', 'Order not found.');
    if (order.status === 'billing') return;
    if (order.status !== 'open') throw new PosError('ORDER_CLOSED', 'This order is already closed.');
    const items = await db.orderItems.where('orderId').equals(orderId).toArray();
    if (items.some((i) => !i.kotId && !i.voided && i.qty > 0))
      throw new PosError('UNSENT_ITEMS', 'Some items have not been sent to the kitchen. Send or remove them first.');
    if (billableItems(items).length === 0) throw new PosError('EMPTY', 'This order has no items to bill.');
    await db.orders.update(orderId, { status: 'billing', updatedAt: Date.now() });
  });
}

/** Return a bill-pending order to "open" so items can be added or voided. */
export async function reopenOrder(orderId: string, actor: Actor): Promise<void> {
  await db.transaction('rw', db.orders, db.invoices, db.audit, async () => {
    const order = await db.orders.get(orderId);
    if (!order || order.status !== 'billing') throw new PosError('NOT_BILLING', 'Order is not waiting for a bill.');
    if (order.invoiceId) {
      const inv = await db.invoices.get(order.invoiceId);
      if (inv && inv.status !== 'cancelled')
        throw new PosError('INVOICE_EXISTS', `Invoice ${inv.invoiceNo} is final. Cancel it first to make changes.`);
    }
    await db.orders.update(orderId, { status: 'open', updatedAt: Date.now() });
    await addAudit('REOPEN_ORDER', `Order #${order.orderNo} reopened`, actor);
  });
}

export async function cancelOrder(orderId: string, reason: string, actor: Actor): Promise<void> {
  requireOwner(actor, 'cancel orders');
  if (!reason.trim()) throw new PosError('REASON_REQUIRED', 'Enter a reason for cancelling.');
  await db.transaction('rw', db.orders, db.invoices, db.audit, async () => {
    const order = await db.orders.get(orderId);
    if (!isActive(order)) throw new PosError('ORDER_CLOSED', 'Only active orders can be cancelled.');
    if (order.invoiceId) {
      const inv = await db.invoices.get(order.invoiceId);
      if (inv && inv.status === 'unpaid')
        await db.invoices.update(inv.id, {
          status: 'cancelled',
          cancelledAt: Date.now(),
          cancelReason: `Order cancelled: ${reason.trim()}`,
          cancelledBy: actor.name,
        });
    }
    await db.orders.update(orderId, {
      status: 'cancelled',
      cancelReason: reason.trim(),
      cancelledBy: actor.name,
      closedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await addAudit('CANCEL_ORDER', `Order #${order.orderNo}: ${reason.trim()}`, actor);
  });
}

export const KITCHEN_STATUSES: KitchenStatus[] = ['new', 'preparing', 'ready', 'served'];

export function kitchenStatusOf(kot: Pick<Kot, 'kitchenStatus'>): KitchenStatus {
  return kot.kitchenStatus ?? 'served';
}

/** Move a kitchen ticket to New, Preparing, Ready or Served. */
export async function setKitchenStatus(kotId: string, status: KitchenStatus): Promise<void> {
  if (!KITCHEN_STATUSES.includes(status)) throw new PosError('BAD_STATUS', 'Unknown ticket status.');
  const n = await db.kots.update(kotId, { kitchenStatus: status, statusAt: Date.now() });
  if (!n) throw new PosError('NO_KOT', 'Kitchen ticket not found.');
}

/* ---------- One-step ordering (New order flow) ---------- */

export interface CartLine {
  menuItemId: string;
  variant?: string;
  qty: number;
  note?: string;
}

export type OrderTarget =
  | { kind: 'table'; tableId: string }
  | { kind: 'takeaway'; customerName?: string }
  | { kind: 'existing'; orderId: string };

/**
 * Place an order (or add items to one) and send it to the kitchen, all in a
 * single step: either everything is saved and a kitchen ticket is created,
 * or nothing changes. Nothing is printed here.
 */
export async function placeOrder(target: OrderTarget, lines: CartLine[], actor: Actor): Promise<{ order: Order; kot: Kot }> {
  const wanted = lines.filter((l) => l.qty > 0);
  if (wanted.length === 0) throw new PosError('EMPTY', 'Add at least one dish.');
  return db.transaction(
    'rw',
    [db.orders, db.orderItems, db.kots, db.counters, db.menuItems, db.diningTables, db.rooms, db.invoices],
    async () => {
      let order: Order;
      if (target.kind === 'table') order = await openOrderForTable(target.tableId, actor);
      else if (target.kind === 'takeaway') order = await openTakeawayOrder(actor, target.customerName);
      else {
        const o = await db.orders.get(target.orderId);
        if (!isActive(o)) throw new PosError('ORDER_CLOSED', 'This order is already closed.');
        order = o;
      }
      if (order.status === 'billing') {
        // Adding food after the bill was requested: back to an open order,
        // unless a bill has already been made.
        const inv = order.invoiceId ? await db.invoices.get(order.invoiceId) : undefined;
        if (inv && inv.status !== 'cancelled')
          throw new PosError('INVOICE_EXISTS', `Bill ${inv.invoiceNo} is already made. Cancel it before adding items.`);
        await db.orders.update(order.id, { status: 'open', invoiceId: undefined });
        order = { ...order, status: 'open' };
      }
      for (const l of wanted) {
        const m = await db.menuItems.get(l.menuItemId);
        if (!m) throw new PosError('NO_DISH', 'A dish in this order was removed from the menu.');
        const note = l.note?.trim();
        if (note) {
          const line = await addSeparateLine(order.id, m, l.qty, l.variant);
          await db.orderItems.update(line.id, { note: note.slice(0, 120) });
        } else await addItem(order.id, m, l.qty, l.variant);
      }
      const kot = await sendToKitchen(order.id, actor);
      return { order: (await db.orders.get(order.id))!, kot };
    },
  );
}

/** Like addItem, but always a new line (so a note stays with just these dishes). */
async function addSeparateLine(orderId: string, m: MenuItem, qty: number, variant?: string): Promise<OrderItem> {
  const v = m.variants?.find((x) => x.label === variant);
  if (m.variants?.length && !v) throw new PosError('CHOOSE_SIZE', `Choose a size for ${m.name}.`);
  if (!m.active || !m.available) throw new PosError('UNAVAILABLE', `${m.name} is not available right now.`);
  const item: OrderItem = {
    id: newId(),
    orderId,
    menuItemId: m.id,
    name: v ? `${m.name} (${v.label})` : m.name,
    ...(v ? { variant: v.label } : {}),
    unitPrice: v ? v.price : m.price,
    qty,
    createdAt: stamp(),
  };
  await db.orderItems.add(item);
  return item;
}

/** Dishes that count as food for the guests (sent to the kitchen, not removed). */
function servable(items: OrderItem[]): OrderItem[] {
  return items.filter((i) => i.kotId && !i.voided && i.qty > 0);
}

/** The order is "delivered" (waiting for payment) once every dish is delivered. */
async function syncDelivered(orderId: string): Promise<void> {
  const items = servable(await db.orderItems.where('orderId').equals(orderId).toArray());
  const all = items.length > 0 && items.every((i) => i.deliveredAt);
  const order = await db.orders.get(orderId);
  if (!order) return;
  if (all && !order.servedAt) {
    const now = Date.now();
    await db.orders.update(orderId, { servedAt: now, updatedAt: now });
    await db.kots.where('orderId').equals(orderId).modify({ kitchenStatus: 'served', statusAt: now });
  } else if (!all && order.servedAt) await db.orders.update(orderId, { servedAt: undefined, updatedAt: Date.now() });
}

/** Mark one dish as delivered to the guests (or undo it). */
export async function setItemDelivered(itemId: string, delivered: boolean): Promise<void> {
  await db.transaction('rw', db.orders, db.orderItems, db.kots, async () => {
    const item = await db.orderItems.get(itemId);
    if (!item) throw new PosError('NO_ITEM', 'Item not found.');
    const order = await db.orders.get(item.orderId);
    if (!isActive(order)) throw new PosError('ORDER_CLOSED', 'This order is already closed.');
    if (!item.kotId) throw new PosError('NOT_SENT', 'This dish has not been sent to the kitchen yet.');
    await db.orderItems.update(itemId, { deliveredAt: delivered ? Date.now() : undefined });
    await syncDelivered(item.orderId);
  });
}

/** All food has been delivered; the order now waits for payment. */
export async function markDelivered(orderId: string): Promise<void> {
  await db.transaction('rw', db.orders, db.orderItems, db.kots, async () => {
    const order = await db.orders.get(orderId);
    if (!isActive(order)) throw new PosError('ORDER_CLOSED', 'This order is already closed.');
    const now = Date.now();
    for (const i of servable(await db.orderItems.where('orderId').equals(orderId).toArray()))
      if (!i.deliveredAt) await db.orderItems.update(i.id, { deliveredAt: now });
    await db.orders.update(orderId, { servedAt: now, updatedAt: now });
    await db.kots.where('orderId').equals(orderId).modify({ kitchenStatus: 'served', statusAt: now });
  });
}

/** Undo "all delivered" (the dishes go back to not delivered). */
export async function markNotDelivered(orderId: string): Promise<void> {
  await db.transaction('rw', db.orders, db.orderItems, async () => {
    await db.orderItems.where('orderId').equals(orderId).modify((i: OrderItem) => {
      delete i.deliveredAt;
    });
    await db.orders.update(orderId, { servedAt: undefined, updatedAt: Date.now() });
  });
}
