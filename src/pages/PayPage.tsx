import { ArrowLeftOutlined, PrinterOutlined } from '@ant-design/icons';
import { Alert, App, Button, Input, InputNumber, Modal, Spin } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ReceiptPreview from '../components/ReceiptPreview';
import { db } from '../db/db';
import type { DiscountType, Invoice, PaymentMethod } from '../db/types';
import { formatINR, rupeesToPaise } from '../domain/money';
import { useSettings } from '../hooks/data';
import { usePrintFlow } from '../hooks/usePrintFlow';
import { printInvoice } from '../printing/printService';
import { invoiceBlocks } from '../printing/receipt';
import { cancelInvoice, confirmPayment, finalizeInvoice, previewBill } from '../services/billing';
import { requestBill } from '../services/orders';
import { useActor } from '../session';

type Disc = { type: DiscountType; value: number }; // percent, or rupees for 'amount'
const PERCENTS = [5, 10, 15, 20];

/** Collect payment: optional discount, Cash or UPI in one tap, print the bill if wanted. */
export default function PayPage() {
  const { orderId = '' } = useParams();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const actor = useActor();
  const settings = useSettings();
  const printFlow = usePrintFlow();

  const order = useLiveQuery(async () => (await db.orders.get(orderId)) ?? null, [orderId]);
  const invoice = useLiveQuery(async () => (order?.invoiceId ? ((await db.invoices.get(order.invoiceId)) ?? null) : null), [order?.invoiceId]);
  const where = useLiveQuery(async () => {
    if (!order) return { label: '', table: '', room: '' };
    if (order.type === 'takeaway')
      return { label: `Takeaway #${order.orderNo}${order.customerName ? ` · ${order.customerName}` : ''}`, table: 'Takeaway', room: '' };
    const [t, r] = await Promise.all([db.diningTables.get(order.tableId), db.rooms.get(order.roomId)]);
    return { label: `Table ${t?.label ?? '?'}${r ? ` · ${r.name}` : ''}`, table: t?.label ?? '?', room: r?.name ?? '' };
  }, [order?.id]);
  const place = where?.label ?? '';
  const itemsVersion = useLiveQuery(() => db.orderItems.where('orderId').equals(orderId).count(), [orderId]);

  const [disc, setDisc] = useState<Disc>({ type: 'none', value: 0 });
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState<number | null>(null);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewBill>> | null>(null);
  const [cash, setCash] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  const discount = { discountType: disc.type, discountValue: disc.type === 'amount' ? rupeesToPaise(disc.value) : disc.value };

  useEffect(() => {
    if (order?.status === 'open') requestBill(order.id).catch((e) => message.error(e instanceof Error ? e.message : String(e)));
  }, [order?.id, order?.status, message]);

  useEffect(() => {
    let alive = true;
    previewBill(orderId, discount).then((p) => alive && setPreview(p));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, disc.type, disc.value, itemsVersion, settings]);

  if (order === undefined || invoice === undefined || !settings) return <Spin style={{ display: 'block', margin: '80px auto' }} />;
  if (order === null)
    return (
      <div className="page">
        <Alert type="error" showIcon message="Order not found." action={<Button onClick={() => navigate('/')}>Back</Button>} />
      </div>
    );

  const err = (e: unknown) => message.error(e instanceof Error ? e.message : String(e));
  const active = invoice && invoice.status !== 'cancelled' ? invoice : null;
  const closed = order.status === 'paid' || order.status === 'cancelled';
  const toPay = active ? active.total : (preview?.total ?? 0);
  const change = cash ? rupeesToPaise(cash) - toPay : null;

  /** The bill is made (numbered and frozen) the first time it is printed or paid. */
  const ensureInvoice = async (): Promise<Invoice> => active ?? (await finalizeInvoice(order.id, discount, actor));

  const printBill = async () => {
    setBusy('print');
    try {
      const inv = await ensureInvoice();
      const again = inv.printStatus === 'printed';
      await printFlow({ docType: 'invoice', id: inv.id, label: `Bill ${inv.invoiceNo}`, run: () => printInvoice(inv.id, { reprint: again }) }, again);
    } catch (e) {
      err(e);
    } finally {
      setBusy(null);
    }
  };

  const pay = (method: PaymentMethod) =>
    modal.confirm({
      title: `${formatINR(toPay)} received by ${method === 'cash' ? 'cash' : 'UPI'}?`,
      content: 'Confirm only after the money is received. The order then leaves the home screen.',
      okText: 'Yes, received',
      cancelText: 'Not yet',
      centered: true,
      okButtonProps: { size: 'large' },
      cancelButtonProps: { size: 'large' },
      onOk: async () => {
        try {
          const inv = await ensureInvoice();
          await confirmPayment(inv.id, method, actor);
          message.success(`${place}: paid`);
          navigate('/');
        } catch (e) {
          err(e);
        }
      },
    });

  const shownInvoice: Invoice | null =
    active ??
    (closed && invoice
      ? invoice
      : preview
        ? ({
            invoiceNo: 'DRAFT',
            orderNo: order.orderNo,
            tableLabel: where?.table ?? '',
            roomName: where?.room ?? '',
            takeaway: order.type === 'takeaway',
            customerName: order.customerName,
            lines: preview.lines,
            subtotal: preview.subtotal,
            discountType: preview.discountAmount > 0 ? discount.discountType : 'none',
            discountValue: discount.discountValue,
            discountAmount: preview.discountAmount,
            taxableAmount: preview.taxableAmount,
            taxes: preview.taxes,
            roundOff: preview.roundOff,
            total: preview.total,
            status: 'unpaid',
            restaurant: settings.restaurant,
            createdAt: Date.now(),
          } as unknown as Invoice)
        : null);

  return (
    <div className="flow">
      <header className="flow__head">
        <button className="flow__back" onClick={() => navigate(`/order/${orderId}`)} aria-label="Back to the order">
          <ArrowLeftOutlined />
        </button>
        <div className="flow__heading">
          <div className="flow__title">Payment</div>
          <div className="flow__place">{place}</div>
        </div>
        <span className="flow__back-space" />
      </header>

      <div className="flow__body pay">
        {closed ? (
          <Alert type="info" showIcon message={order.status === 'paid' ? 'This order is paid.' : 'This order was cancelled.'} style={{ marginBottom: 12 }} />
        ) : (
          <>
            <div className="pay__total">
              <span>To pay</span>
              <strong>{formatINR(toPay)}</strong>
            </div>

            {!active ? (
              <div className="pay__disc">
                <div className="psettings__label">Discount</div>
                <div className="chips">
                  <Button type={disc.type === 'none' ? 'primary' : 'default'} onClick={() => setDisc({ type: 'none', value: 0 })}>
                    None
                  </Button>
                  {PERCENTS.map((p) => (
                    <Button key={p} type={disc.type === 'percent' && disc.value === p ? 'primary' : 'default'} onClick={() => setDisc({ type: 'percent', value: p })}>
                      {p}%
                    </Button>
                  ))}
                  <Button
                    type={disc.type === 'amount' ? 'primary' : 'default'}
                    onClick={() => {
                      setCustom(disc.type === 'amount' ? disc.value : null);
                      setCustomOpen(true);
                    }}
                  >
                    {disc.type === 'amount' ? `₹${disc.value} off` : '₹ amount'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="muted" style={{ marginBottom: 12 }}>
                Bill {active.invoiceNo} is made.{' '}
                <Button type="link" danger style={{ padding: 0 }} onClick={() => setCancelOpen(true)}>
                  Cancel bill to change it
                </Button>
              </div>
            )}

            <div className="pay-grid">
              <Button type="primary" className="btn-xl" onClick={() => pay('cash')}>
                Cash
              </Button>
              <Button type="primary" className="btn-xl" onClick={() => pay('upi')}>
                UPI
              </Button>
            </div>

            <div className="pay__cash">
              <InputNumber size="large" min={0} value={cash} onChange={setCash} placeholder="Cash given (to work out change)" inputMode="decimal" style={{ width: '100%' }} />
              {change !== null && (
                <div style={{ marginTop: 6, fontWeight: 700, color: change < 0 ? 'var(--danger)' : 'var(--free)' }}>
                  {change < 0 ? `Short by ${formatINR(-change)}` : `Give back ${formatINR(change)}`}
                </div>
              )}
            </div>
          </>
        )}

        <Button size="large" block icon={<PrinterOutlined />} loading={busy === 'print'} onClick={closed && invoice ? () => printFlow({ docType: 'invoice', id: invoice.id, label: `Bill ${invoice.invoiceNo}`, run: () => printInvoice(invoice.id, { reprint: true }) }, true) : printBill} style={{ margin: '16px 0' }}>
          {active?.printStatus === 'printed' || closed ? 'Print bill again' : 'Print bill'}
        </Button>

        {shownInvoice && <ReceiptPreview blocks={invoiceBlocks(shownInvoice)} width={settings.printer.paperWidth} />}
      </div>

      <Modal
        open={customOpen}
        title="Discount amount"
        okText="Apply"
        onCancel={() => setCustomOpen(false)}
        onOk={() => {
          setDisc(custom && custom > 0 ? { type: 'amount', value: custom } : { type: 'none', value: 0 });
          setCustomOpen(false);
        }}
        centered
        destroyOnHidden
      >
        <InputNumber size="large" min={0} value={custom} onChange={setCustom} prefix="₹" inputMode="decimal" style={{ width: '100%' }} autoFocus />
      </Modal>

      <Modal
        open={cancelOpen}
        title={active ? `Cancel bill ${active.invoiceNo}?` : ''}
        okText="Cancel bill"
        cancelText="Keep bill"
        okButtonProps={{ danger: true, disabled: !reason.trim() }}
        onCancel={() => setCancelOpen(false)}
        centered
        destroyOnHidden
        onOk={async () => {
          if (!active) return;
          try {
            await cancelInvoice(active.id, reason, actor);
            setCancelOpen(false);
            setReason('');
            message.success('Bill cancelled. You can change the discount or add items now.');
          } catch (e) {
            err(e);
          }
        }}
      >
        <p className="muted">The cancelled bill stays in the records and its number is not reused.</p>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" maxLength={80} />
      </Modal>
    </div>
  );
}
