import { describe, expect, it } from 'vitest';
import type { Invoice, Kot } from '../db/types';
import { encodeEscPos, toBase64 } from './escpos';
import { columnsFor, invoiceBlocks, kotBlocks, renderText, rowLines, toPrintable, wrap } from './receipt';

const kot: Kot = {
  id: 'k',
  kotNo: 17,
  orderId: 'o',
  orderNo: 42,
  tableLabel: 'A3',
  roomName: 'AC',
  kind: 'ADDED',
  lines: [
    { name: 'Paneer Tikka', qty: 2, note: 'less spicy' },
    { name: 'Butter Naan', qty: 4 },
  ],
  staffName: 'Waiter 1',
  createdAt: new Date(2026, 9, 13, 19, 5).getTime(),
  printStatus: 'pending',
  printCount: 0,
};

describe('KOT layout', () => {
  const text = renderText(kotBlocks(kot, { restaurantName: 'Spice Court' }), 48).join('\n');

  it('contains every field the kitchen needs', () => {
    for (const s of ['ADDED ITEMS', 'Spice Court', 'TABLE A3', 'AC', 'KOT #17', 'Order #42', '13/10/2026 19:05', 'Waiter 1', '2 x Paneer Tikka', '>> less spicy', '4 x Butter Naan'])
      expect(text).toContain(s);
  });

  it('never prints prices or payment details', () => {
    expect(text).not.toMatch(/Rs\.|₹|\d+\.\d{2}|cash|upi/i);
  });

  it('marks reprints clearly', () => {
    const r = renderText(kotBlocks(kot, { restaurantName: 'X', reprint: true }), 48).join('\n');
    expect(r).toContain('REPRINT');
  });

  it('fits 58 mm paper', () => {
    for (const line of renderText(kotBlocks(kot, { restaurantName: 'Spice Court' }), columnsFor(58)))
      expect(line.length).toBeLessThanOrEqual(32);
  });
});

describe('invoice layout', () => {
  const inv = {
    invoiceNo: 'INV-00007',
    orderNo: 42,
    tableLabel: 'A3',
    roomName: 'AC',
    lines: [{ name: 'Paneer Tikka', qty: 2, unitPrice: 24000, amount: 48000 }],
    subtotal: 48000,
    discountType: 'percent',
    discountValue: 10,
    discountAmount: 4800,
    taxableAmount: 43200,
    taxes: [{ name: 'CGST', ratePercent: 2.5, amount: 1080 }],
    roundOff: 20,
    total: 44300,
    status: 'paid',
    paymentMethod: 'upi',
    restaurant: { name: 'Spice Court', address: 'MI Road, Jaipur', phone: '99999', gstin: '', footer: 'Thanks' },
    createdAt: 0,
  } as unknown as Invoice;

  it('shows totals, tax and payment', () => {
    const text = renderText(invoiceBlocks(inv), 48).join('\n');
    for (const s of ['INV-00007', 'Paneer Tikka', '2 x 240.00', '480.00', 'Discount (10%)', '-48.00', 'CGST @ 2.5%', '10.80', 'Round off', '+0.20', 'Rs.443.00', 'PAID - UPI'])
      expect(text).toContain(s);
    expect(text).not.toContain('GSTIN');
  });
});

describe('text helpers', () => {
  it('wraps long words and lines', () => {
    expect(wrap('a verylongword here', 5)).toEqual(['a', 'veryl', 'ongwo', 'rd', 'here']);
  });
  it('right-aligns amounts', () => {
    expect(rowLines('Total', '100.00', 20)).toEqual(['Total         100.00']);
  });
  it('converts characters thermal printers cannot print', () => {
    expect(toPrintable('₹50 – café')).toBe('Rs.50 - cafe');
  });
});

describe('ESC/POS encoding', () => {
  it('starts with init, ends with cut, and contains only 7-bit text', () => {
    const bytes = encodeEscPos(kotBlocks(kot, { restaurantName: 'Spice Court' }), 48);
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x1b, 0x40]);
    expect(Array.from(bytes.slice(-4))).toEqual([0x1d, 0x56, 0x42, 0x00]);
    expect(new TextDecoder().decode(bytes)).toContain('2 x Paneer Tikka');
    expect(toBase64(bytes).length).toBeGreaterThan(100);
  });
  it('repeats the ticket for multiple copies', () => {
    const one = encodeEscPos(kotBlocks(kot, { restaurantName: 'S' }), 48, 1);
    const two = encodeEscPos(kotBlocks(kot, { restaurantName: 'S' }), 48, 2);
    expect(two.length).toBe(one.length * 2);
  });
});
