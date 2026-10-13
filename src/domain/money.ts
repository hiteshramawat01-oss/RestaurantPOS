/** Money helpers. All amounts are integer paise. */

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const plain = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "₹1,234.50" for on-screen display. */
export function formatINR(paise: number): string {
  return inr.format(paise / 100);
}

/** "1,234.50" for receipts (thermal code pages have no ₹ glyph). */
export function formatAmount(paise: number): string {
  return plain.format(paise / 100);
}

/** Short on-screen price: "₹240" or "₹240.50". */
export function formatPrice(paise: number): string {
  return paise % 100 === 0 ? `₹${(paise / 100).toLocaleString('en-IN')}` : formatINR(paise);
}

/** Parse a rupee string/number typed by a user into paise. */
export function rupeesToPaise(rupees: number | string): number {
  const n = typeof rupees === 'string' ? Number(rupees.replace(/[,₹\s]/g, '')) : rupees;
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}
