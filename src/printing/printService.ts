import { db } from '../db/db';
import type { AppSettings, PrintDocType, PrinterMethod, PrinterSettings, PrintStatus } from '../db/types';
import { newId } from '../lib/id';
import { printHtml } from './browserPrinter';
import { encodeEscPos, toBase64 } from './escpos';
import { receiptHtml } from './html';
import { EscPosPrinter, nativePrintingAvailable } from './nativePrinter';
import { columnsFor, invoiceBlocks, kotBlocks, testPageBlocks, type Block } from './receipt';

export type PrintOutcome =
  | { status: 'printed'; method: PrinterMethod }
  | { status: 'awaiting_confirmation'; method: PrinterMethod }
  | { status: 'failed'; method: PrinterMethod; error: string }
  | { status: 'skipped'; reason: string };

const inFlight = new Set<string>();

async function getSettings(): Promise<AppSettings> {
  const s = await db.settings.get('app');
  if (!s) throw new Error('Settings missing');
  return s;
}

export function describeMethod(p: PrinterSettings): string {
  if (p.method === 'native') return p.host ? `Direct Wi-Fi (${p.host}:${p.port})` : 'Direct Wi-Fi (no IP set)';
  return 'System print dialog';
}

/** Human-friendly explanations for common socket errors. */
export function explainPrintError(raw: string, p: PrinterSettings): string {
  const m = raw.toLowerCase();
  if (m.includes('timed out') || m.includes('timeout'))
    return `Printer at ${p.host}:${p.port} did not respond. Check it is on, has paper, and is on the same Wi-Fi.`;
  if (m.includes('refused')) return `Printer refused the connection on port ${p.port}. Check the port (usually 9100).`;
  if (m.includes('unreachable') || m.includes('no route'))
    return `Cannot reach ${p.host}. Make sure this device is connected to the restaurant Wi-Fi.`;
  if (m.includes('unknown host') || m.includes('unable to resolve')) return `"${p.host}" is not a valid printer address.`;
  return raw;
}

/** Send blocks to the printer with the configured method. Does not touch the database. */
export async function sendToPrinter(
  pages: Block[][],
  printer: PrinterSettings,
  title: string,
): Promise<Exclude<PrintOutcome, { status: 'skipped' }>> {
  const cols = columnsFor(printer.paperWidth);
  if (printer.method === 'native') {
    if (!nativePrintingAvailable())
      return {
        status: 'failed',
        method: 'native',
        error: 'Direct Wi-Fi printing only works in the installed Android app (APK). Switch the printer method in Settings or use the APK.',
      };
    if (!printer.host) return { status: 'failed', method: 'native', error: 'Printer IP address is not set (Settings → Printer).' };
    try {
      const bytes = pages.map((p) => encodeEscPos(p, cols));
      const total = new Uint8Array(bytes.reduce((n, b) => n + b.length, 0));
      let off = 0;
      for (const b of bytes) {
        total.set(b, off);
        off += b.length;
      }
      await EscPosPrinter.print({ host: printer.host, port: printer.port || 9100, data: toBase64(total), timeoutMs: 5000 });
      return { status: 'printed', method: 'native' };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { status: 'failed', method: 'native', error: explainPrintError(msg, printer) };
    }
  }
  try {
    await printHtml(receiptHtml(pages, printer.paperWidth, title));
    return { status: 'awaiting_confirmation', method: 'browser' };
  } catch (e) {
    return { status: 'failed', method: 'browser', error: e instanceof Error ? e.message : String(e) };
  }
}

async function recordAttempt(docType: PrintDocType, docId: string, method: PrinterMethod, ok: boolean, reprint: boolean, error?: string) {
  await db.printAttempts.add({ id: newId(), docType, docId, at: Date.now(), method, ok, reprint, error });
}

async function run(
  docType: 'kot' | 'invoice',
  id: string,
  reprint: boolean,
  build: (s: AppSettings) => Promise<{ pages: Block[][]; title: string; status: PrintStatus } | null>,
  update: (changes: { printStatus?: PrintStatus; lastError?: string; printCountDelta?: number }) => Promise<void>,
): Promise<PrintOutcome> {
  const lock = `${docType}:${id}`;
  if (inFlight.has(lock)) return { status: 'skipped', reason: 'Already printing.' };
  inFlight.add(lock);
  try {
    const settings = await getSettings();
    const doc = await build(settings);
    if (!doc) return { status: 'skipped', reason: 'Document not found.' };
    if (!reprint && doc.status === 'printed') return { status: 'skipped', reason: 'Already printed. Use Reprint for another copy.' };
    if (!reprint && doc.status === 'awaiting_confirmation')
      return { status: 'skipped', reason: 'Waiting for staff to confirm the last print.' };
    if (!reprint) await update({ printStatus: 'printing' });
    const outcome = await sendToPrinter(doc.pages, settings.printer, doc.title);
    await recordAttempt(docType, id, outcome.method, outcome.status !== 'failed', reprint, outcome.status === 'failed' ? outcome.error : undefined);
    if (outcome.status === 'printed') await update({ printStatus: 'printed', lastError: undefined, printCountDelta: 1 });
    else if (outcome.status === 'awaiting_confirmation') {
      if (!reprint) await update({ printStatus: 'awaiting_confirmation' });
    } else if (!reprint) await update({ printStatus: 'failed', lastError: outcome.error });
    return outcome;
  } finally {
    inFlight.delete(lock);
  }
}

export async function printKot(kotId: string, opts: { reprint?: boolean } = {}): Promise<PrintOutcome> {
  const reprint = !!opts.reprint;
  return run(
    'kot',
    kotId,
    reprint,
    async (s) => {
      const kot = await db.kots.get(kotId);
      if (!kot) return null;
      const blocks = kotBlocks(kot, { restaurantName: s.restaurant.name, reprint });
      const copies = Math.max(1, Math.min(3, s.printer.copiesKot || 1));
      return { pages: Array.from({ length: copies }, () => blocks), title: `KOT ${kot.kotNo}`, status: kot.printStatus };
    },
    async (c) => {
      await db.transaction('rw', db.kots, async () => {
        const kot = await db.kots.get(kotId);
        if (!kot) return;
        await db.kots.update(kotId, {
          ...(c.printStatus ? { printStatus: c.printStatus } : {}),
          ...('lastError' in c ? { lastError: c.lastError } : {}),
          printCount: kot.printCount + (c.printCountDelta ?? 0),
        });
      });
    },
  );
}

export async function printInvoice(invoiceId: string, opts: { reprint?: boolean } = {}): Promise<PrintOutcome> {
  const reprint = !!opts.reprint;
  return run(
    'invoice',
    invoiceId,
    reprint,
    async () => {
      const inv = await db.invoices.get(invoiceId);
      if (!inv) return null;
      return { pages: [invoiceBlocks(inv, { reprint })], title: inv.invoiceNo, status: inv.printStatus };
    },
    async (c) => {
      await db.transaction('rw', db.invoices, async () => {
        const inv = await db.invoices.get(invoiceId);
        if (!inv) return;
        await db.invoices.update(invoiceId, {
          ...(c.printStatus ? { printStatus: c.printStatus } : {}),
          printCount: inv.printCount + (c.printCountDelta ?? 0),
        });
      });
    },
  );
}

/** Staff answer to "Did it print?" after the browser print dialog. */
export async function confirmBrowserPrint(docType: 'kot' | 'invoice', id: string, printed: boolean): Promise<void> {
  const table = docType === 'kot' ? db.kots : db.invoices;
  await db.transaction('rw', table, async () => {
    const doc = await table.get(id);
    if (!doc) return;
    await table.update(id, {
      printStatus: printed ? 'printed' : 'failed',
      printCount: doc.printCount + (printed ? 1 : 0),
      ...(docType === 'kot' && !printed ? { lastError: 'Staff reported the slip did not print.' } : {}),
    });
  });
}

export async function testPrint(printer: PrinterSettings, restaurantName: string) {
  const outcome = await sendToPrinter([testPageBlocks(restaurantName, printer.paperWidth)], printer, 'Test print');
  await recordAttempt('test', 'test', outcome.method, outcome.status !== 'failed', false, outcome.status === 'failed' ? outcome.error : undefined);
  return outcome;
}

export async function checkPrinterStatus(printer: PrinterSettings) {
  if (printer.method !== 'native' || !nativePrintingAvailable())
    return { supported: false as const, message: 'Live printer status is only available with direct Wi-Fi printing in the Android app.' };
  if (!printer.host) return { supported: true as const, reachable: false, message: 'Printer IP address is not set.' };
  try {
    const s = await EscPosPrinter.status({ host: printer.host, port: printer.port || 9100, timeoutMs: 3000 });
    if (!s.reachable) return { supported: true as const, reachable: false, message: explainPrintError(s.error ?? 'Not reachable', printer) };
    const problems = [s.paperOut && 'paper out', s.coverOpen && 'cover open', s.offline && 'offline', s.paperNearEnd && 'paper low'].filter(Boolean);
    return {
      supported: true as const,
      reachable: true,
      message:
        s.statusByte === undefined
          ? 'Printer is reachable (it did not report paper status).'
          : problems.length
            ? `Printer reachable but reports: ${problems.join(', ')}.`
            : 'Printer is online and ready.',
      problems,
    };
  } catch (e) {
    return { supported: true as const, reachable: false, message: explainPrintError(e instanceof Error ? e.message : String(e), printer) };
  }
}

/** A print that was "printing" when the app was closed never finished: mark it failed so it can be retried. */
export async function recoverInterruptedPrints(): Promise<void> {
  await db.kots.filter((k) => k.printStatus === 'printing').modify({ printStatus: 'failed', lastError: 'Interrupted. Tap Retry.' });
  await db.invoices.filter((i) => i.printStatus === 'printing').modify({ printStatus: 'failed' });
}
