import type { DiscountType, InvoiceLine, InvoiceTax, OrderItem, TaxRate } from '../db/types';

/** Lines that count toward the bill: not voided and quantity > 0. */
export function billableItems(items: OrderItem[]): OrderItem[] {
  return items.filter((i) => !i.voided && i.qty > 0);
}

export function lineAmount(item: Pick<OrderItem, 'qty' | 'unitPrice'>): number {
  return item.qty * item.unitPrice;
}

/** Running order total shown on table cards and the order screen. */
export function orderTotal(items: OrderItem[]): number {
  return billableItems(items).reduce((sum, i) => sum + lineAmount(i), 0);
}

export function itemCount(items: OrderItem[]): number {
  return billableItems(items).reduce((sum, i) => sum + i.qty, 0);
}

/**
 * Merge order lines into invoice lines. The same dish ordered in two rounds
 * (two KOTs) appears once on the customer's bill with the combined quantity.
 */
export function toInvoiceLines(items: OrderItem[]): InvoiceLine[] {
  const map = new Map<string, InvoiceLine>();
  for (const i of billableItems(items)) {
    const key = `${i.menuItemId}|${i.unitPrice}|${i.name}`;
    const existing = map.get(key);
    if (existing) {
      existing.qty += i.qty;
      existing.amount += lineAmount(i);
    } else {
      map.set(key, { name: i.name, qty: i.qty, unitPrice: i.unitPrice, amount: lineAmount(i) });
    }
  }
  return [...map.values()];
}

export interface BillInput {
  lines: InvoiceLine[];
  discountType: DiscountType;
  discountValue: number; // percent for 'percent', paise for 'amount'
  taxes: TaxRate[];
  roundToRupee: boolean;
}

export interface BillBreakdown {
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  taxes: InvoiceTax[];
  taxTotal: number;
  roundOff: number;
  total: number;
}

export function computeDiscount(subtotal: number, type: DiscountType, value: number): number {
  if (type === 'none' || !Number.isFinite(value) || value <= 0) return 0;
  if (type === 'percent') {
    const pct = Math.min(value, 100);
    return Math.round((subtotal * pct) / 100);
  }
  return Math.min(Math.round(value), subtotal);
}

export function computeBill(input: BillInput): BillBreakdown {
  const subtotal = input.lines.reduce((s, l) => s + l.amount, 0);
  const discountAmount = computeDiscount(subtotal, input.discountType, input.discountValue);
  const taxableAmount = subtotal - discountAmount;
  const taxes: InvoiceTax[] = input.taxes
    .filter((t) => t.enabled && t.ratePercent > 0)
    .map((t) => ({
      name: t.name,
      ratePercent: t.ratePercent,
      amount: Math.round((taxableAmount * t.ratePercent) / 100),
    }));
  const taxTotal = taxes.reduce((s, t) => s + t.amount, 0);
  const gross = taxableAmount + taxTotal;
  const total = input.roundToRupee ? Math.round(gross / 100) * 100 : gross;
  return { subtotal, discountAmount, taxableAmount, taxes, taxTotal, roundOff: total - gross, total };
}
