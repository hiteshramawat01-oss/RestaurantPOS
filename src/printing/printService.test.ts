import { beforeEach, describe, expect, it, vi } from 'vitest';

const printMock = vi.fn();
vi.mock('./nativePrinter', () => ({
  EscPosPrinter: { print: (...a: unknown[]) => printMock(...a), status: vi.fn() },
  nativePrintingAvailable: () => true,
  isNativeApp: () => true,
}));

import { db } from '../db/db';
import { addItem, openOrderForTable, sendToKitchen } from '../services/orders';
import { firstTable, menuItem, resetDb, waiter } from '../test/helpers';
import { printKot } from './printService';
import { compareVersions } from '../updates/updates';

async function setupKot() {
  await db.settings.update('app', {
    printer: { method: 'native', host: '192.168.1.50', port: 9100, paperWidth: 80, autoPrintKot: true, copiesKot: 1 },
  });
  const t = await firstTable();
  const o = await openOrderForTable(t.id, waiter);
  await addItem(o.id, await menuItem('Dal Makhani'));
  return sendToKitchen(o.id, waiter);
}

beforeEach(async () => {
  printMock.mockReset();
  await resetDb();
});

describe('KOT printing (direct Wi-Fi)', () => {
  it('marks the ticket printed only after the printer accepted the data', async () => {
    printMock.mockResolvedValue({ bytesSent: 300 });
    const kot = await setupKot();
    expect((await db.kots.get(kot.id))?.printStatus).toBe('pending');
    const out = await printKot(kot.id);
    expect(out.status).toBe('printed');
    const after = await db.kots.get(kot.id);
    expect(after?.printStatus).toBe('printed');
    expect(after?.printCount).toBe(1);
    expect(printMock).toHaveBeenCalledWith(expect.objectContaining({ host: '192.168.1.50', port: 9100 }));
    expect(await db.printAttempts.count()).toBe(1);
  });

  it('records failures with a readable reason and allows retry', async () => {
    printMock.mockRejectedValueOnce(new Error('Connection timed out (192.168.1.50:9100)'));
    const kot = await setupKot();
    const out = await printKot(kot.id);
    expect(out.status).toBe('failed');
    const failed = await db.kots.get(kot.id);
    expect(failed?.printStatus).toBe('failed');
    expect(failed?.lastError).toMatch(/did not respond/);

    printMock.mockResolvedValueOnce({ bytesSent: 300 });
    expect((await printKot(kot.id)).status).toBe('printed');
  });

  it('does not print a ticket twice by accident', async () => {
    printMock.mockImplementation(() => new Promise((r) => setTimeout(() => r({ bytesSent: 1 }), 20)));
    const kot = await setupKot();
    const [a, b] = await Promise.all([printKot(kot.id), printKot(kot.id)]);
    expect([a.status, b.status].sort()).toEqual(['printed', 'skipped']);
    expect(printMock).toHaveBeenCalledTimes(1);
    const again = await printKot(kot.id);
    expect(again.status).toBe('skipped');
    expect(printMock).toHaveBeenCalledTimes(1);
  });

  it('reprints only on explicit request, and marks them REPRINT', async () => {
    printMock.mockResolvedValue({ bytesSent: 1 });
    const kot = await setupKot();
    await printKot(kot.id);
    const out = await printKot(kot.id, { reprint: true });
    expect(out.status).toBe('printed');
    const sent = atob(printMock.mock.calls[1][0].data as string);
    expect(sent).toContain('REPRINT');
    expect((await db.kots.get(kot.id))?.printCount).toBe(2);
  });

  it('prints the configured number of copies', async () => {
    printMock.mockResolvedValue({ bytesSent: 1 });
    const kot = await setupKot();
    await db.settings.update('app', { 'printer.copiesKot': 2 } as never);
    await printKot(kot.id);
    const sent = atob(printMock.mock.calls[0][0].data as string);
    expect(sent.split('KOT #1').length - 1).toBe(2);
  });
});

describe('version comparison', () => {
  it('compares numerically, not as text', () => {
    expect(compareVersions('1.10.0', '1.9.3')).toBe(1);
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
  });
});
