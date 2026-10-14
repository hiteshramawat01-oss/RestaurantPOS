import { ArrowLeftOutlined, PrinterOutlined } from '@ant-design/icons';
import { Alert, App, Button, Divider, Input, InputNumber, Modal, Segmented, Spin, Tag } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ReceiptPreview from '../components/ReceiptPreview';
import { db } from '../db/db';
import type { DiscountType, Invoice, PaymentMethod } from '../db/types';
import { formatINR, rupeesToPaise } from '../domain/money';
import { useSettings } from '../hooks/data';
import { usePrintFlow } from '../hooks/usePrintFlow';
import { dateTimeOf } from '../lib/time';
import { printInvoice } from '../printing/printService';
import { invoiceBlocks } from '../printing/receipt';
import { cancelInvoice, confirmPayment, finalizeInvoice, previewBill } from '../services/billing';
import { reopenOrder, requestBill } from '../services/orders';
import { useActor, useSession } from '../session';
import { PRINT_TAG } from './kitchenLabels';

export default function BillingPage() {
  const { orderId = '' } = useParams();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const actor = useActor();
  const { isOwner } = useSession();
  const settings = useSettings();
  const printFlow = usePrintFlow();

  const order = useLiveQuery(async () => (await db.orders.get(orderId)) ?? null, [orderId]);
  const invoice = useLiveQuery(async () => (order?.invoiceId ? ((await db.invoices.get(order.invoiceId)) ?? null) : null), [order?.invoiceId]);
  const table = useLiveQuery(async () => (order ? db.diningTables.get(order.tableId) : undefined), [order?.tableId]);
  const room = useLiveQuery(async () => (order ? db.rooms.get(order.roomId) : undefined), [order?.roomId]);
  const itemsVersion = useLiveQuery(async () => db.orderItems.where('orderId').equals(orderId).toArray(), [orderId]);

  const [discountType, setDiscountType] = useState<DiscountType>('none');
  const [discountValue, setDiscountValue] = useState<number | null>(null);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewBill>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [cashReceived, setCashReceived] = useState<number | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const discountPaiseOrPct = discountType === 'amount' ? rupeesToPaise(discountValue ?? 0) : (discountValue ?? 0);

  useEffect(() => {
    let alive = true;
    previewBill(orderId, { discountType, discountValue: discountPaiseOrPct }).then((p) => alive && setPreview(p));
    return () => {
      alive = false;
    };
  }, [orderId, discountType, discountPaiseOrPct, itemsVersion, settings]);

  if (order === undefined || invoice === undefined || !settings) return <Spin style={{ display: 'block', margin: '80px auto' }} />;
  if (order === null)
    return (
      <div className="page">
        <Alert type="error" showIcon message="Order not found." action={<Button onClick={() => navigate('/billing')}>Back</Button>} />
      </div>
    );

  const takeaway = order.type === 'takeaway';
  const orderEditPath = takeaway ? `/takeaway/${order.id}` : `/order/${order.tableId}`;
  const err = (e: unknown) => message.error(e instanceof Error ? e.message : String(e));
  const activeInvoice = invoice && invoice.status !== 'cancelled' ? invoice : null;

  const doPrint = (inv: Invoice, reprint: boolean) =>
    printFlow({ docType: 'invoice', id: inv.id, label: `Bill ${inv.invoiceNo}`, run: () => printInvoice(inv.id, { reprint }) }, reprint);

  const finalize = async () => {
    setBusy(true);
    try {
      const inv = await finalizeInvoice(order.id, { discountType, discountValue: discountPaiseOrPct }, actor);
      await doPrint(inv, false);
    } catch (e) {
      err(e);
    } finally {
      setBusy(false);
    }
  };

  const pay = (method: PaymentMethod) => {
    if (!activeInvoice) return;
    modal.confirm({
      title: `${formatINR(activeInvoice.total)} received by ${method === 'cash' ? 'cash' : 'UPI'}?`,
      content: 'Only confirm after the money is received. This closes the order and frees the table.',
      okText: 'Yes, payment received',
      cancelText: 'Not yet',
      centered: true,
      okButtonProps: { size: 'large' },
      cancelButtonProps: { size: 'large' },
      onOk: async () => {
        try {
          await confirmPayment(activeInvoice.id, method, actor);
          message.success(takeaway ? `Paid. Takeaway #${order.orderNo} is closed.` : `Paid. Table ${table?.label ?? ''} is free.`);
          navigate('/tables');
        } catch (e) {
          err(e);
        }
      },
    });
  };

  const header = (
    <div className="page__head">
      <Button size="large" shape="circle" icon={<ArrowLeftOutlined />} aria-label="Back" onClick={() => navigate('/billing')} />
      <div>
        <h1 className="page__title">
          {takeaway ? `Takeaway #${order.orderNo}${order.customerName ? ` · ${order.customerName}` : ''}` : `Table ${table?.label ?? invoice?.tableLabel} · Order #${order.orderNo}`}
        </h1>
        <div className="page__sub">
          {order.status === 'paid' ? 'Paid' : order.status === 'cancelled' ? 'Cancelled' : order.status === 'billing' ? 'Bill pending' : 'Open order'}
        </div>
      </div>
    </div>
  );

  /* ---------- Paid / cancelled order ---------- */
  if (order.status === 'paid' || order.status === 'cancelled') {
    return (
      <div className="page" style={{ maxWidth: 640 }}>
        {header}
        {order.status === 'cancelled' && <Alert type="warning" showIcon message={`Cancelled: ${order.cancelReason ?? ''}`} style={{ marginBottom: 12 }} />}
        {invoice && (
          <>
            <ReceiptPreview blocks={invoiceBlocks(invoice)} width={settings.printer.paperWidth} />
            <Button size="large" icon={<PrinterOutlined />} style={{ marginTop: 12 }} onClick={() => doPrint(invoice, true)}>
              Reprint bill
            </Button>
          </>
        )}
      </div>
    );
  }

  /* ---------- Open order: needs "Request bill" first ---------- */
  if (order.status === 'open') {
    const unsent = (itemsVersion ?? []).some((i) => !i.kotId && !i.voided);
    return (
      <div className="page" style={{ maxWidth: 640 }}>
        {header}
        <div className="panel">
          <p style={{ marginTop: 0 }}>
            Running total <strong className="money">{formatINR(preview?.subtotal ?? 0)}</strong>
          </p>
          {unsent && <Alert type="warning" showIcon message="Some items have not been sent to the kitchen yet." style={{ marginBottom: 12 }} />}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button
              type="primary"
              size="large"
              disabled={unsent}
              onClick={async () => {
                try {
                  await requestBill(order.id);
                } catch (e) {
                  err(e);
                }
              }}
            >
              Request bill
            </Button>
            <Button size="large" onClick={() => navigate(orderEditPath)}>
              Open order
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- Bill pending ---------- */
  const draftInvoice = preview
    ? ({
        invoiceNo: 'DRAFT',
        orderNo: order.orderNo,
        tableLabel: takeaway ? 'Takeaway' : (table?.label ?? ''),
        roomName: room?.name ?? '',
        takeaway,
        customerName: order.customerName,
        lines: preview.lines,
        subtotal: preview.subtotal,
        discountType: preview.discountAmount > 0 ? discountType : 'none',
        discountValue: discountValue ?? 0,
        discountAmount: preview.discountAmount,
        taxableAmount: preview.taxableAmount,
        taxes: preview.taxes,
        roundOff: preview.roundOff,
        total: preview.total,
        status: 'unpaid',
        restaurant: settings.restaurant,
        createdAt: Date.now(),
      } as unknown as Invoice)
    : null;

  const change = activeInvoice && cashReceived ? rupeesToPaise(cashReceived) - activeInvoice.total : null;

  return (
    <div className="page">
      {header}
      <div className="bill-layout">
        <div className="bill-layout__receipt">
          {activeInvoice ? (
            <ReceiptPreview blocks={invoiceBlocks(activeInvoice)} width={settings.printer.paperWidth} />
          ) : draftInvoice ? (
            <ReceiptPreview blocks={invoiceBlocks(draftInvoice)} width={settings.printer.paperWidth} />
          ) : (
            <Spin />
          )}
        </div>

        <div className="bill-layout__actions">
          {!activeInvoice && (
            <div className="panel">
              <h2 className="panel__title">Discount</h2>
              {isOwner ? (
              <Segmented
                block
                size="large"
                value={discountType}
                onChange={(v) => {
                  setDiscountType(v as DiscountType);
                  setDiscountValue(null);
                }}
                options={[
                  { label: 'None', value: 'none' },
                  { label: 'Percent', value: 'percent' },
                  { label: 'Amount ₹', value: 'amount' },
                ]}
              />
              ) : (
                <div className="muted">Only the owner can give discounts. Switch user to add one.</div>
              )}
              {isOwner && discountType !== 'none' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  {discountType === 'percent' &&
                    [5, 10, 15, 20].map((p) => (
                      <Button key={p} size="large" type={discountValue === p ? 'primary' : 'default'} onClick={() => setDiscountValue(p)}>
                        {p}%
                      </Button>
                    ))}
                  <InputNumber
                    size="large"
                    min={0}
                    max={discountType === 'percent' ? 100 : undefined}
                    value={discountValue}
                    onChange={(v) => setDiscountValue(v)}
                    placeholder={discountType === 'percent' ? 'Other %' : 'Amount in ₹'}
                    inputMode="decimal"
                    style={{ width: 140 }}
                  />
                </div>
              )}
              <Divider />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
                <span>To pay</span>
                <span className="money">{formatINR(preview?.total ?? 0)}</span>
              </div>
              <Button type="primary" className="btn-xl" block loading={busy} onClick={finalize} disabled={!preview || preview.lines.length === 0}>
                Finalize and print bill
              </Button>
              <Button
                size="large"
                block
                style={{ marginTop: 8 }}
                onClick={async () => {
                  try {
                    await reopenOrder(order.id, actor);
                    navigate(orderEditPath);
                  } catch (e) {
                    err(e);
                  }
                }}
              >
                Reopen order to add items
              </Button>
            </div>
          )}

          {activeInvoice && (
            <div className="panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 17 }}>{activeInvoice.invoiceNo}</div>
                  <div className="muted" style={{ fontSize: 13 }}>{dateTimeOf(activeInvoice.createdAt)}</div>
                </div>
                <Tag color={PRINT_TAG[activeInvoice.printStatus].color}>{PRINT_TAG[activeInvoice.printStatus].label}</Tag>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 26, fontWeight: 800, margin: '14px 0' }}>
                <span>To pay</span>
                <span className="money">{formatINR(activeInvoice.total)}</span>
              </div>

              <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
                Cash received (optional, to work out change)
              </div>
              <InputNumber size="large" min={0} value={cashReceived} onChange={setCashReceived} placeholder="₹" inputMode="decimal" style={{ width: '100%' }} />
              {change !== null && (
                <div style={{ marginTop: 6, fontWeight: 700, color: change < 0 ? 'var(--danger)' : 'var(--free)' }}>
                  {change < 0 ? `Short by ${formatINR(-change)}` : `Return ${formatINR(change)}`}
                </div>
              )}

              <div className="pay-grid" style={{ marginTop: 14 }}>
                <Button type="primary" className="btn-xl" onClick={() => pay('cash')}>
                  Paid by cash
                </Button>
                <Button type="primary" className="btn-xl" onClick={() => pay('upi')}>
                  Paid by UPI
                </Button>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <Button
                  size="large"
                  icon={<PrinterOutlined />}
                  onClick={() => doPrint(activeInvoice, activeInvoice.printStatus === 'printed')}
                >
                  {activeInvoice.printStatus === 'printed' ? 'Reprint bill' : 'Print bill'}
                </Button>
                {isOwner && (
                  <Button size="large" danger onClick={() => setCancelOpen(true)}>
                    Cancel invoice
                  </Button>
                )}
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>
                This invoice is final. To change items or discount, cancel it and make a new one.
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={cancelOpen}
        title={activeInvoice ? `Cancel invoice ${activeInvoice.invoiceNo}?` : ''}
        okText="Cancel invoice"
        cancelText="Keep invoice"
        okButtonProps={{ danger: true, disabled: !cancelReason.trim() }}
        onCancel={() => setCancelOpen(false)}
        centered
        destroyOnHidden
        onOk={async () => {
          if (!activeInvoice) return;
          try {
            await cancelInvoice(activeInvoice.id, cancelReason, actor);
            setCancelOpen(false);
            setCancelReason('');
            message.success('Invoice cancelled. You can now correct the order and bill again.');
          } catch (e) {
            err(e);
          }
        }}
      >
        <p>The invoice stays in the records marked “cancelled” and its number is not reused.</p>
        <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason (required)" maxLength={80} />
      </Modal>
    </div>
  );
}
