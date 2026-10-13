/**
 * Printer-independent receipt layout. A receipt is a list of blocks that is
 * rendered either to ESC/POS bytes (direct Wi-Fi printing) or to HTML
 * (browser print dialog). Both use the same character-column layout so the
 * slip looks the same either way.
 */
import type { Invoice, Kot, PaperWidth } from '../db/types';
import { formatAmount } from '../domain/money';

export type TextSize = 'normal' | 'tall' | 'big'; // big = double width + height

export type Block =
  | { t: 'text'; text: string; align?: 'left' | 'center' | 'right'; bold?: boolean; size?: TextSize; invert?: boolean }
  | { t: 'row'; left: string; right: string; bold?: boolean; size?: TextSize }
  | { t: 'divider'; char?: '-' | '=' }
  | { t: 'feed'; lines: number }
  | { t: 'cut' };

/** Characters per line with the printer's default font A. */
export function columnsFor(width: PaperWidth): number {
  return width === 58 ? 32 : 48;
}

export function colsForSize(cols: number, size: TextSize = 'normal'): number {
  return size === 'big' ? Math.floor(cols / 2) : cols;
}

/** Thermal printers' default code page has no ₹ or Indic glyphs. */
export function toPrintable(s: string): string {
  return s
    .replace(/₹/g, 'Rs.')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/×/g, 'x')
    .replace(/→/g, '->')
    .replace(/…/g, '...')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, '?');
}

/** Word-wrap to `width` columns; words longer than a line are split. */
export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (let word of para.split(/\s+/).filter(Boolean)) {
      while (word.length > width) {
        if (line) {
          out.push(line);
          line = '';
        }
        out.push(word.slice(0, width));
        word = word.slice(width);
      }
      if (!line) line = word;
      else if (line.length + 1 + word.length <= width) line += ' ' + word;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

/** Left text and right-aligned text on one line (wrapping the left part if needed). */
export function rowLines(left: string, right: string, width: number): string[] {
  if (left.length + right.length + 1 <= width) return [left + ' '.repeat(width - left.length - right.length) + right];
  const leftLines = wrap(left, width);
  const last = leftLines[leftLines.length - 1];
  if (last.length + right.length + 1 <= width) {
    leftLines[leftLines.length - 1] = last + ' '.repeat(width - last.length - right.length) + right;
    return leftLines;
  }
  return [...leftLines, right.padStart(width)];
}

export function alignLine(text: string, width: number, align: 'left' | 'center' | 'right' = 'left'): string {
  if (text.length >= width || align === 'left') return text;
  if (align === 'right') return text.padStart(width);
  const pad = Math.floor((width - text.length) / 2);
  return ' '.repeat(pad) + text;
}

function dateTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const KIND_BANNER: Record<Kot['kind'], string> = {
  NEW: 'NEW ORDER',
  ADDED: 'ADDED ITEMS',
  VOID: 'CANCEL / VOID',
};

export interface KotLayoutOptions {
  restaurantName: string;
  reprint?: boolean;
}

/** Kitchen Order Ticket. Never contains prices or payment details. */
export function kotBlocks(kot: Kot, opts: KotLayoutOptions): Block[] {
  const b: Block[] = [];
  if (opts.reprint) b.push({ t: 'text', text: '** REPRINT - NOT A NEW ORDER **', align: 'center', bold: true });
  b.push({ t: 'text', text: KIND_BANNER[kot.kind], align: 'center', bold: true, size: 'big', invert: kot.kind !== 'NEW' });
  b.push({ t: 'text', text: opts.restaurantName, align: 'center' });
  b.push({ t: 'divider' });
  b.push({ t: 'row', left: `TABLE ${kot.tableLabel}`, right: kot.roomName, bold: true, size: 'tall' });
  b.push({ t: 'row', left: `KOT #${kot.kotNo}`, right: `Order #${kot.orderNo}` });
  b.push({ t: 'row', left: dateTime(kot.createdAt), right: `By: ${kot.staffName}` });
  b.push({ t: 'divider', char: '=' });
  for (const line of kot.lines) {
    b.push({ t: 'text', text: `${line.qty} x ${line.name}`, bold: true, size: 'tall' });
    if (line.note) b.push({ t: 'text', text: `   >> ${line.note}` });
  }
  b.push({ t: 'divider', char: '=' });
  const qty = kot.lines.reduce((s, l) => s + l.qty, 0);
  b.push({ t: 'row', left: `${kot.lines.length} item(s)`, right: `Qty ${qty}` });
  if (opts.reprint) b.push({ t: 'text', text: `Reprinted ${dateTime(Date.now())}`, align: 'center' });
  b.push({ t: 'feed', lines: 3 });
  b.push({ t: 'cut' });
  return b;
}

export function invoiceBlocks(inv: Invoice, opts: { reprint?: boolean } = {}): Block[] {
  const r = inv.restaurant;
  const b: Block[] = [];
  b.push({ t: 'text', text: r.name, align: 'center', bold: true, size: 'big' });
  if (r.address) b.push({ t: 'text', text: r.address, align: 'center' });
  if (r.phone) b.push({ t: 'text', text: `Ph: ${r.phone}`, align: 'center' });
  if (r.gstin) b.push({ t: 'text', text: `GSTIN: ${r.gstin}`, align: 'center' });
  b.push({ t: 'divider' });
  b.push({ t: 'text', text: 'INVOICE', align: 'center', bold: true });
  if (inv.status === 'cancelled') b.push({ t: 'text', text: '*** CANCELLED ***', align: 'center', bold: true, invert: true });
  if (opts.reprint) b.push({ t: 'text', text: 'DUPLICATE COPY', align: 'center' });
  b.push({ t: 'row', left: `No: ${inv.invoiceNo}`, right: dateTime(inv.createdAt) });
  b.push({ t: 'row', left: `Table ${inv.tableLabel} (${inv.roomName})`, right: `Order #${inv.orderNo}` });
  b.push({ t: 'divider' });
  b.push({ t: 'row', left: 'Item', right: 'Amount', bold: true });
  b.push({ t: 'divider' });
  for (const l of inv.lines) {
    b.push({ t: 'text', text: l.name });
    b.push({ t: 'row', left: `  ${l.qty} x ${formatAmount(l.unitPrice)}`, right: formatAmount(l.amount) });
  }
  b.push({ t: 'divider' });
  b.push({ t: 'row', left: 'Subtotal', right: formatAmount(inv.subtotal) });
  if (inv.discountAmount > 0) {
    const label = inv.discountType === 'percent' ? `Discount (${inv.discountValue}%)` : 'Discount';
    b.push({ t: 'row', left: label, right: `-${formatAmount(inv.discountAmount)}` });
  }
  for (const tx of inv.taxes) b.push({ t: 'row', left: `${tx.name} @ ${tx.ratePercent}%`, right: formatAmount(tx.amount) });
  if (inv.roundOff !== 0)
    b.push({ t: 'row', left: 'Round off', right: `${inv.roundOff > 0 ? '+' : '-'}${formatAmount(Math.abs(inv.roundOff))}` });
  b.push({ t: 'divider', char: '=' });
  b.push({ t: 'row', left: 'TOTAL', right: `Rs.${formatAmount(inv.total)}`, bold: true, size: 'big' });
  b.push({ t: 'divider', char: '=' });
  if (inv.status === 'paid') b.push({ t: 'text', text: `PAID - ${(inv.paymentMethod ?? '').toUpperCase()}`, align: 'center', bold: true });
  else if (inv.status === 'unpaid') b.push({ t: 'text', text: 'Payment due', align: 'center' });
  if (r.footer) b.push({ t: 'text', text: r.footer, align: 'center' });
  b.push({ t: 'feed', lines: 3 });
  b.push({ t: 'cut' });
  return b;
}

export function testPageBlocks(restaurantName: string, width: PaperWidth): Block[] {
  const cols = columnsFor(width);
  return [
    { t: 'text', text: 'TEST PRINT', align: 'center', bold: true, size: 'big' },
    { t: 'text', text: restaurantName, align: 'center' },
    { t: 'divider' },
    { t: 'text', text: `Paper ${width} mm, ${cols} columns` },
    { t: 'text', text: '1234567890'.repeat(Math.ceil(cols / 10)).slice(0, cols) },
    { t: 'row', left: 'Left aligned', right: 'Right aligned' },
    { t: 'text', text: 'Bold text', bold: true },
    { t: 'text', text: 'Tall text', size: 'tall' },
    { t: 'text', text: 'Inverted', invert: true },
    { t: 'divider', char: '=' },
    { t: 'text', text: `Printed ${dateTime(Date.now())}`, align: 'center' },
    { t: 'feed', lines: 3 },
    { t: 'cut' },
  ];
}

/** Plain-text rendering (used by tests and the on-screen slip preview). */
export function renderText(blocks: Block[], cols: number): string[] {
  const out: string[] = [];
  for (const blk of blocks) {
    switch (blk.t) {
      case 'text': {
        const w = colsForSize(cols, blk.size);
        for (const l of wrap(toPrintable(blk.text), w)) out.push(alignLine(l, w, blk.align));
        break;
      }
      case 'row':
        out.push(...rowLines(toPrintable(blk.left), toPrintable(blk.right), colsForSize(cols, blk.size)));
        break;
      case 'divider':
        out.push((blk.char ?? '-').repeat(cols));
        break;
      case 'feed':
      case 'cut':
        break;
    }
  }
  return out;
}
