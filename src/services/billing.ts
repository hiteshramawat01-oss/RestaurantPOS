import { db } from '../db/db';
import type { DiscountType, Invoice, PaymentMethod } from '../db/types';
import { newId } from '../lib/id';
import { computeBill, toInvoiceLines, type BillBreakdown } from '../domain/totals';
import { addAudit, nextNumber, PosError, requireOwner, type Actor } from './common';

export interface DiscountInput {
  discountType: DiscountType;
  discountValue: number; // percent, or paise for 'amount'
}

export function formatInvoiceNo(prefix: string, seq: number): string {
  return `${prefix}${String(seq).padStart(5, '0')}`;
}

/** Live preview of a bill before it is finalized (nothing is written). */
export async function previewBill(orderId: string, discount: DiscountInput): Promise<BillBreakdown & { lines: ReturnType<typeof toInvoiceLines> }> {
  const [items, settings] = await Promise.all([
    db.orderItems.where('orderId').equals(orderId).toArray(),
    db.settings.get('app'),
  ]);
  const lines = toInvoiceLines(items);
  const breakdown = computeBill({
    lines,
    ...discount,
    taxes: settings?.taxes ?? [],
    roundToRupee: settings?.roundToRupee ?? true,
  });
  return { ...breakdown, lines };
}

/**
 * Finalize an invoice for a bill-pending order. After this the amounts are
 * frozen; the only way to change them is to cancel the invoice (audited)
 * and issue a new one with a new number.
 */
export async function finalizeInvoice(orderId: string, discount: DiscountInput, actor: Actor): Promise<Invoice> {
  if (discount.discountType !== 'none' && actor.role !== 'owner' && discount.discountValue > 0) {
    // Staff can bill; only the owner can grant a discount.
    requireOwner(actor, 'give discounts');
  }
  return db.transaction(
    'rw',
    [db.orders, db.orderItems, db.invoices, db.counters, db.settings, db.diningTables, db.rooms, db.audit],
    async () => {
      const order = await db.orders.get(orderId);
      if (!order) throw new PosError('NO_ORDER', 'Order not found.');
      if (order.status !== 'billing')
        throw new PosError('NOT_BILLING', 'Request the bill for this order before finalizing an invoice.');
      if (order.invoiceId) {
        const current = await db.invoices.get(order.invoiceId);
        if (current && current.status !== 'cancelled') return current; // idempotent: double tap returns the same invoice
      }
      const settings = await db.settings.get('app');
      if (!settings) throw new PosError('NO_SETTINGS', 'Restaurant settings are missing.');
      const items = await db.orderItems.where('orderId').equals(orderId).toArray();
      const lines = toInvoiceLines(items);
      if (lines.length === 0) throw new PosError('EMPTY', 'This order has no items to bill.');
      const bill = computeBill({ lines, ...discount, taxes: settings.taxes, roundToRupee: settings.roundToRupee });

      const seq = await nextNumber('invoice');
      const invoiceNo = formatInvoiceNo(settings.invoicePrefix, seq);
      if (await db.invoices.where('invoiceNo').equals(invoiceNo).count())
        throw new PosError('DUP_INVOICE_NO', `Invoice number ${invoiceNo} already exists. Check invoice numbering in Settings.`);

      const takeaway = order.type === 'takeaway';
      const table = takeaway ? undefined : await db.diningTables.get(order.tableId);
      const room = takeaway ? undefined : await db.rooms.get(order.roomId);
      const invoice: Invoice = {
        id: newId(),
        invoiceNo,
        seq,
        orderId,
        orderNo: order.orderNo,
        tableLabel: takeaway ? 'Takeaway' : (table?.label ?? '?'),
        roomName: room?.name ?? '',
        ...(takeaway ? { takeaway: true, customerName: order.customerName } : {}),
        lines,
        subtotal: bill.subtotal,
        discountType: bill.discountAmount > 0 ? discount.discountType : 'none',
        discountValue: bill.discountAmount > 0 ? discount.discountValue : 0,
        discountAmount: bill.discountAmount,
        taxableAmount: bill.taxableAmount,
        taxes: bill.taxes,
        roundOff: bill.roundOff,
        total: bill.total,
        status: 'unpaid',
        restaurant: { ...settings.restaurant },
        staffName: actor.name,
        createdAt: Date.now(),
        printStatus: 'pending',
        printCount: 0,
      };
      await db.invoices.add(invoice); // unique index on invoiceNo is the final guard
      await db.orders.update(orderId, { invoiceId: invoice.id, updatedAt: Date.now() });
      if (bill.discountAmount > 0)
        await addAudit('DISCOUNT', `${invoiceNo}: discount ${bill.discountAmount / 100} INR`, actor);
      return invoice;
    },
  );
}

/** Staff confirms money received. Only now is the order closed and the table freed. */
export async function confirmPayment(invoiceId: string, method: PaymentMethod, actor: Actor): Promise<Invoice> {
  return db.transaction('rw', db.invoices, db.orders, db.payments, async () => {
    const inv = await db.invoices.get(invoiceId);
    if (!inv) throw new PosError('NO_INVOICE', 'Invoice not found.');
    if (inv.status === 'paid') return inv; // idempotent
    if (inv.status === 'cancelled') throw new PosError('CANCELLED', 'This invoice was cancelled.');
    const now = Date.now();
    await db.payments.add({
      id: newId(),
      invoiceId,
      orderId: inv.orderId,
      method,
      amount: inv.total,
      at: now,
      staffName: actor.name,
    });
    await db.invoices.update(invoiceId, { status: 'paid', paidAt: now, paymentMethod: method });
    await db.orders.update(inv.orderId, { status: 'paid', closedAt: now, updatedAt: now });
    return { ...inv, status: 'paid', paidAt: now, paymentMethod: method };
  });
}

/**
 * Cancel an invoice (owner only, reason required). The record is kept and
 * marked cancelled, so numbering stays continuous and auditable.
 * - Unpaid invoice: the order returns to "bill pending" for correction.
 * - Paid invoice (refund): the order is marked cancelled and leaves sales.
 */
export async function cancelInvoice(invoiceId: string, reason: string, actor: Actor): Promise<void> {
  requireOwner(actor, 'cancel invoices');
  if (!reason.trim()) throw new PosError('REASON_REQUIRED', 'Enter a reason for cancelling.');
  await db.transaction('rw', db.invoices, db.orders, db.audit, async () => {
    const inv = await db.invoices.get(invoiceId);
    if (!inv) throw new PosError('NO_INVOICE', 'Invoice not found.');
    if (inv.status === 'cancelled') return;
    const now = Date.now();
    const wasPaid = inv.status === 'paid';
    await db.invoices.update(invoiceId, {
      status: 'cancelled',
      cancelledAt: now,
      cancelReason: reason.trim(),
      cancelledBy: actor.name,
    });
    const order = await db.orders.get(inv.orderId);
    if (order) {
      if (wasPaid) {
        await db.orders.update(order.id, {
          status: 'cancelled',
          cancelReason: `Invoice ${inv.invoiceNo} refunded: ${reason.trim()}`,
          cancelledBy: actor.name,
          updatedAt: now,
        });
      } else if (order.status === 'billing') {
        await db.orders.update(order.id, { invoiceId: undefined, updatedAt: now });
      }
    }
    await addAudit(
      wasPaid ? 'REFUND_INVOICE' : 'CANCEL_INVOICE',
      `${inv.invoiceNo} (${inv.total / 100} INR): ${reason.trim()}`,
      actor,
    );
  });
}
