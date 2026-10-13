import { LeftOutlined, PrinterOutlined, RightOutlined } from '@ant-design/icons';
import { App, Button, Drawer, Input, Modal, Segmented, Spin, Tag } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import ReceiptPreview from '../components/ReceiptPreview';
import type { Invoice } from '../db/types';
import { formatINR } from '../domain/money';
import { invoicePlace } from '../domain/place';
import { useSettings } from '../hooks/data';
import { usePrintFlow } from '../hooks/usePrintFlow';
import { timeOf } from '../lib/time';
import { printInvoice } from '../printing/printService';
import { invoiceBlocks } from '../printing/receipt';
import { cancelInvoice } from '../services/billing';
import { endOfDay, loadSales, startOfDay } from '../services/sales';
import { useActor, useSession } from '../session';

const STATUS_TAG: Record<Invoice['status'], { color: string; label: string }> = {
  paid: { color: 'success', label: 'Paid' },
  unpaid: { color: 'warning', label: 'Unpaid' },
  cancelled: { color: 'error', label: 'Cancelled' },
};

export default function SalesPage() {
  const [day, setDay] = useState(() => startOfDay());
  const [filter, setFilter] = useState<'all' | 'paid' | 'other'>('all');
  const [open, setOpen] = useState<Invoice | null>(null);
  const settings = useSettings();
  const data = useLiveQuery(() => loadSales(day, endOfDay(new Date(day))), [day]);
  const isToday = day === startOfDay();

  const shift = (days: number) => {
    const d = new Date(day);
    d.setDate(d.getDate() + days);
    setDay(startOfDay(d));
  };

  const dayLabel = isToday
    ? 'Today'
    : new Date(day).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  const invoices = (data?.invoices ?? [])
    .filter((i) => {
      const t = i.status === 'paid' ? i.paidAt : i.status === 'cancelled' ? i.cancelledAt : i.createdAt;
      return t !== undefined && t >= day && t < endOfDay(new Date(day));
    })
    .filter((i) => (filter === 'all' ? true : filter === 'paid' ? i.status === 'paid' : i.status !== 'paid'))
    .sort((a, b) => b.createdAt - a.createdAt);

  const s = data?.summary;

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page__title">Sales</h1>
        <div className="page__actions" style={{ alignItems: 'center' }}>
          <Button size="large" shape="circle" icon={<LeftOutlined />} aria-label="Previous day" onClick={() => shift(-1)} />
          <strong style={{ minWidth: 120, textAlign: 'center' }}>{dayLabel}</strong>
          <Button size="large" shape="circle" icon={<RightOutlined />} aria-label="Next day" disabled={isToday} onClick={() => shift(1)} />
        </div>
      </div>

      {!s ? (
        <Spin />
      ) : (
        <>
          <div className="stats">
            <div className="stats__tile is-hero">
              <div className="stats__value money">{formatINR(s.totalSales)}</div>
              <div className="stats__label">Sales (paid bills)</div>
            </div>
            <div className="stats__tile">
              <div className="stats__value">{s.completedOrders}</div>
              <div className="stats__label">Completed orders</div>
            </div>
            <div className="stats__tile">
              <div className="stats__value money">{formatINR(s.cash)}</div>
              <div className="stats__label">Cash</div>
            </div>
            <div className="stats__tile">
              <div className="stats__value money">{formatINR(s.upi)}</div>
              <div className="stats__label">UPI</div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: 12, display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div>
              <div className="muted" style={{ fontSize: 13 }}>Discounts given</div>
              <strong className="money">{formatINR(s.discounts)}</strong>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 13 }}>Tax collected</div>
              <strong className="money">{formatINR(s.taxes)}</strong>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 13 }}>Unpaid bills (not in sales)</div>
              <strong>
                {s.unpaidInvoices} · <span className="money">{formatINR(s.unpaidAmount)}</span>
              </strong>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 13 }}>Cancelled orders / invoices</div>
              <strong>
                {s.cancelledOrders} / {s.cancelledInvoices}
                {s.refundedAmount > 0 && <span className="money"> · refunded {formatINR(s.refundedAmount)}</span>}
              </strong>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 10px', flexWrap: 'wrap' }}>
            <h2 className="panel__title" style={{ margin: 0 }}>
              Invoices
            </h2>
            <Segmented
              value={filter}
              onChange={(v) => setFilter(v as typeof filter)}
              options={[
                { label: 'All', value: 'all' },
                { label: 'Paid', value: 'paid' },
                { label: 'Unpaid / cancelled', value: 'other' },
              ]}
            />
          </div>
          {invoices.length === 0 ? (
            <div className="empty panel">
              <div className="empty__title">No invoices</div>
              {isToday ? 'Bills appear here once they are finalized.' : 'Nothing was billed on this day.'}
            </div>
          ) : (
            <div className="rowlist">
              {invoices.map((i) => (
                <button key={i.id} className="rowlist__row is-button" onClick={() => setOpen(i)}>
                  <div className="rowlist__main">
                    <div className="rowlist__title">
                      {i.invoiceNo} <Tag color={STATUS_TAG[i.status].color}>{STATUS_TAG[i.status].label}</Tag>
                      {i.paymentMethod && i.status === 'paid' && <Tag>{i.paymentMethod.toUpperCase()}</Tag>}
                    </div>
                    <div className="rowlist__sub">
                      {timeOf(i.paidAt ?? i.createdAt)} · {invoicePlace(i)} · Order #{i.orderNo}
                    </div>
                  </div>
                  <div
                    className="money"
                    style={{ fontWeight: 800, textDecoration: i.status === 'cancelled' ? 'line-through' : undefined, color: i.status === 'paid' ? undefined : 'var(--ink-3)' }}
                  >
                    {formatINR(i.total)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <InvoiceDrawer invoice={open} onClose={() => setOpen(null)} width={settings?.printer.paperWidth ?? 80} />
    </div>
  );
}

function InvoiceDrawer({ invoice, onClose, width }: { invoice: Invoice | null; onClose: () => void; width: 58 | 80 }) {
  const printFlow = usePrintFlow();
  const { isOwner } = useSession();
  const actor = useActor();
  const { message } = App.useApp();
  const [refund, setRefund] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <Drawer open={!!invoice} onClose={onClose} title={invoice?.invoiceNo} size="default" placement="right">
      {invoice && (
        <>
          {invoice.status === 'cancelled' && (
            <p style={{ color: 'var(--danger)', fontWeight: 700 }}>
              Cancelled by {invoice.cancelledBy}: {invoice.cancelReason}
            </p>
          )}
          <ReceiptPreview blocks={invoiceBlocks(invoice)} width={width} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <Button
              size="large"
              icon={<PrinterOutlined />}
              onClick={() =>
                printFlow({ docType: 'invoice', id: invoice.id, label: `Bill ${invoice.invoiceNo}`, run: () => printInvoice(invoice.id, { reprint: true }) }, true)
              }
            >
              Reprint
            </Button>
            {isOwner && invoice.status === 'paid' && (
              <Button size="large" danger onClick={() => setRefund(true)}>
                Cancel / refund
              </Button>
            )}
          </div>
          <Modal
            open={refund}
            title={`Cancel paid invoice ${invoice.invoiceNo}?`}
            okText="Cancel and refund"
            okButtonProps={{ danger: true, disabled: !reason.trim() }}
            onCancel={() => setRefund(false)}
            centered
            destroyOnHidden
            onOk={async () => {
              try {
                await cancelInvoice(invoice.id, reason, actor);
                setRefund(false);
                setReason('');
                onClose();
                message.success('Invoice cancelled and removed from sales.');
              } catch (e) {
                message.error(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            <p>Use this when the money is returned to the customer. The amount is removed from sales and the record is kept.</p>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" maxLength={80} />
          </Modal>
        </>
      )}
    </Drawer>
  );
}
