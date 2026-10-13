import { describe, expect, it } from 'vitest';
import type { OrderItem, TaxRate } from '../db/types';
import { computeBill, computeDiscount, itemCount, orderTotal, toInvoiceLines } from './totals';
import { formatINR, rupeesToPaise } from './money';

const line = (p: Partial<OrderItem>): OrderItem => ({
  id: Math.random().toString(),
  orderId: 'o',
  menuItemId: 'm',
  name: 'Dish',
  unitPrice: 10000,
  qty: 1,
  createdAt: 0,
  ...p,
});

const gst: TaxRate[] = [
  { id: '1', name: 'CGST', ratePercent: 2.5, enabled: true },
  { id: '2', name: 'SGST', ratePercent: 2.5, enabled: true },
];

describe('order totals', () => {
  it('sums quantity x price and ignores voided lines', () => {
    const items = [
      line({ unitPrice: 24000, qty: 2 }),
      line({ menuItemId: 'n', unitPrice: 5000, qty: 3 }),
      line({ unitPrice: 99900, qty: 1, voided: true }),
    ];
    expect(orderTotal(items)).toBe(63000);
    expect(itemCount(items)).toBe(5);
  });

  it('reflects quantity changes', () => {
    const l = line({ unitPrice: 2500, qty: 1 });
    expect(orderTotal([l])).toBe(2500);
    l.qty = 4;
    expect(orderTotal([l])).toBe(10000);
    l.qty = 0;
    expect(orderTotal([l])).toBe(0);
  });

  it('merges the same dish from different KOT rounds into one invoice line', () => {
    const lines = toInvoiceLines([
      line({ menuItemId: 'naan', name: 'Butter Naan', unitPrice: 5000, qty: 2, kotId: 'k1' }),
      line({ menuItemId: 'naan', name: 'Butter Naan', unitPrice: 5000, qty: 3, kotId: 'k2' }),
      line({ menuItemId: 'dal', name: 'Dal', unitPrice: 22000, qty: 1 }),
    ]);
    expect(lines).toEqual([
      { name: 'Butter Naan', qty: 5, unitPrice: 5000, amount: 25000 },
      { name: 'Dal', qty: 1, unitPrice: 22000, amount: 22000 },
    ]);
  });
});

describe('discounts', () => {
  it('percent discount rounds to the nearest paisa', () => {
    expect(computeDiscount(33333, 'percent', 10)).toBe(3333);
  });
  it('amount discount never exceeds the subtotal', () => {
    expect(computeDiscount(10000, 'amount', 50000)).toBe(10000);
  });
  it('ignores invalid or zero discounts', () => {
    expect(computeDiscount(10000, 'percent', -5)).toBe(0);
    expect(computeDiscount(10000, 'none', 50)).toBe(0);
    expect(computeDiscount(10000, 'percent', NaN)).toBe(0);
  });
  it('caps percent at 100', () => {
    expect(computeDiscount(10000, 'percent', 150)).toBe(10000);
  });
});

describe('invoice totals', () => {
  const lines = [
    { name: 'Paneer Tikka', qty: 2, unitPrice: 24000, amount: 48000 },
    { name: 'Butter Naan', qty: 3, unitPrice: 5000, amount: 15000 },
  ];

  it('no tax, no discount, rounding off', () => {
    const b = computeBill({ lines, discountType: 'none', discountValue: 0, taxes: [], roundToRupee: true });
    expect(b).toMatchObject({ subtotal: 63000, discountAmount: 0, taxTotal: 0, roundOff: 0, total: 63000 });
  });

  it('applies discount before tax', () => {
    const b = computeBill({ lines, discountType: 'percent', discountValue: 10, taxes: gst, roundToRupee: false });
    expect(b.discountAmount).toBe(6300);
    expect(b.taxableAmount).toBe(56700);
    expect(b.taxes.map((t) => t.amount)).toEqual([1418, 1418]); // 2.5% of 567.00 = 14.175 -> 14.18
    expect(b.total).toBe(56700 + 2836);
    expect(b.roundOff).toBe(0);
  });

  it('rounds the final amount to the rupee and records round-off', () => {
    const b = computeBill({ lines, discountType: 'percent', discountValue: 10, taxes: gst, roundToRupee: true });
    expect(b.total).toBe(59500); // 595.36 -> 595
    expect(b.roundOff).toBe(-36);
    expect(b.taxableAmount + b.taxTotal + b.roundOff).toBe(b.total);
  });

  it('skips disabled or zero-rate taxes', () => {
    const b = computeBill({
      lines,
      discountType: 'none',
      discountValue: 0,
      taxes: [{ ...gst[0], enabled: false }, { ...gst[1], ratePercent: 0 }],
      roundToRupee: true,
    });
    expect(b.taxes).toEqual([]);
  });

  it('flat discount', () => {
    const b = computeBill({ lines, discountType: 'amount', discountValue: 5000, taxes: [], roundToRupee: true });
    expect(b.total).toBe(58000);
  });
});

describe('money', () => {
  it('formats INR with Indian grouping', () => {
    expect(formatINR(12345650)).toBe('₹1,23,456.50');
  });
  it('parses rupee input to paise without float drift', () => {
    expect(rupeesToPaise('0.29')).toBe(29);
    expect(rupeesToPaise('₹1,234.50')).toBe(123450);
    expect(Number.isNaN(rupeesToPaise('abc'))).toBe(true);
  });
});
