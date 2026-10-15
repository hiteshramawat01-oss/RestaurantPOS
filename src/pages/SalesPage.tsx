import { LeftOutlined, PrinterOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Modal } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TopBar } from '../components/AppMenu';
import ReceiptPreview from '../components/ReceiptPreview';
import type { Invoice } from '../db/types';
import { formatINR } from '../domain/money';
import { invoicePlace } from '../domain/place';
import { useSettings } from '../hooks/data';
import { usePrintFlow } from '../hooks/usePrintFlow';
import { printInvoice } from '../printing/printService';
import { invoiceBlocks } from '../printing/receipt';
import { endOfDay, loadSales, startOfDay } from '../services/sales';

const DAY = 24 * 60 * 60 * 1000;

function dayKey(t: number) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDay(s: string | null): number {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return startOfDay();
  const t = startOfDay(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Math.min(t, startOfDay());
}

function dayTitle(from: number) {
  const today = startOfDay();
  if (from === today) return 'Today';
  // Compare calendar days, not 24h steps, so daylight-saving never matters.
  if (dayKey(from) === dayKey(today - DAY / 2)) return 'Yesterday';
  return new Date(from).toLocaleDateString('en-IN', { weekday: 'long' });
}

const itemCount = (inv: Invoice) => inv.lines.reduce((a, l) => a + l.qty, 0);

const timeOf = (t: number) => new Date(t).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

/** One day's takings: total, Cash vs UPI, and every paid bill of that day. */
export default function SalesPage() {
  const [params, setParams] = useSearchParams();
  const from = parseDay(params.get('day'));
  const to = endOfDay(new Date(from));
  const isToday = from === startOfDay();
  const settings = useSettings();
  const printFlow = usePrintFlow();
  const [open, setOpen] = useState<Invoice | null>(null);

  const data = useLiveQuery(() => loadSales(from, to), [from, to]);

  const paid = useMemo(
    () =>
      (data?.invoices ?? [])
        .filter((i) => i.status === 'paid' && i.paidAt !== undefined && i.paidAt >= from && i.paidAt < to)
        .sort((a, b) => (b.paidAt ?? 0) - (a.paidAt ?? 0)),
    [data, from, to],
  );
  const cashCount = paid.filter((i) => i.paymentMethod === 'cash').length;
  const upiCount = paid.filter((i) => i.paymentMethod === 'upi').length;
  const s = data?.summary;

  const go = (t: number) => setParams(t >= startOfDay() ? {} : { day: dayKey(t) }, { replace: true });
  // Step by calendar day (midday of the neighbouring day, then back to its midnight).
  const prev = () => go(startOfDay(new Date(from - DAY / 2)));
  const next = () => go(startOfDay(new Date(to + DAY / 2)));

  return (
    <div className="page sales">
      <TopBar title="Sales" />

      <div className="dayswitch" role="group" aria-label="Choose day">
        <button className="iconbtn" onClick={prev} aria-label="Previous day">
          <LeftOutlined />
        </button>
        <button className="dayswitch__label" onClick={() => go(startOfDay())} disabled={isToday} aria-label={isToday ? undefined : 'Back to today'}>
          <span className="dayswitch__title">{dayTitle(from)}</span>
          <span className="dayswitch__date">{new Date(from).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </button>
        <button className="iconbtn" onClick={next} disabled={isToday} aria-label="Next day">
          <RightOutlined />
        </button>
      </div>

      <section className="salesum" aria-live="polite">
        <div className="salesum__label">Total sale</div>
        <div className="salesum__total">{formatINR(s?.totalSales ?? 0)}</div>
        <div className="salesum__count">
          {paid.length} order{paid.length === 1 ? '' : 's'} paid
          {s && s.discounts > 0 ? ` · ${formatINR(s.discounts)} discount given` : ''}
        </div>
      </section>

      <div className="saletiles">
        <div className="saletile is-cash">
          <div className="saletile__label">Cash</div>
          <div className="saletile__amt">{formatINR(s?.cash ?? 0)}</div>
          <div className="saletile__count">
            {cashCount} order{cashCount === 1 ? '' : 's'}
          </div>
        </div>
        <div className="saletile is-upi">
          <div className="saletile__label">UPI</div>
          <div className="saletile__amt">{formatINR(s?.upi ?? 0)}</div>
          <div className="saletile__count">
            {upiCount} order{upiCount === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      <h2 className="sales__head">Orders paid</h2>
      {data && paid.length === 0 && <div className="empty">No paid orders {isToday ? 'yet today' : 'on this day'}.</div>}
      <div className="salelist">
        {paid.map((inv) => (
          <button key={inv.id} className="salerow" onClick={() => setOpen(inv)}>
            <span className="salerow__time">{timeOf(inv.paidAt!)}</span>
            <span className="salerow__main">
              <span className="salerow__place">{invoicePlace(inv)}</span>
              <span className="salerow__sub">
                Bill {inv.invoiceNo} · {itemCount(inv)} item{itemCount(inv) === 1 ? '' : 's'}
              </span>
            </span>
            <span className="salerow__end">
              <span className="salerow__amt">{formatINR(inv.total)}</span>
              <span className={`paychip is-${inv.paymentMethod}`}>{inv.paymentMethod === 'upi' ? 'UPI' : 'Cash'}</span>
            </span>
          </button>
        ))}
      </div>

      <Modal
        open={!!open}
        title={open ? invoicePlace(open) : ''}
        onCancel={() => setOpen(null)}
        centered
        destroyOnHidden
        footer={
          open && (
            <Button
              size="large"
              block
              icon={<PrinterOutlined />}
              onClick={() => printFlow({ docType: 'invoice', id: open.id, label: `Bill ${open.invoiceNo}`, run: () => printInvoice(open.id, { reprint: true }) }, true)}
            >
              Print bill again
            </Button>
          )
        }
      >
        {open && (
          <>
            <p style={{ marginTop: 0, color: 'var(--md-on-surface-variant)' }}>
              Paid {open.paymentMethod === 'upi' ? 'by UPI' : 'in cash'} at {timeOf(open.paidAt!)}
            </p>
            {settings && <ReceiptPreview blocks={invoiceBlocks(open)} width={settings.printer.paperWidth} />}
          </>
        )}
      </Modal>
    </div>
  );
}
