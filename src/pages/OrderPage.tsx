import { CheckOutlined, CloseOutlined, PlusOutlined, PrinterOutlined, WalletOutlined } from '@ant-design/icons';
import { App, Button, Input, Modal, Spin } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { OrderItem } from '../db/types';
import { formatINR } from '../domain/money';
import { STAGE_LABEL, summarize, type OrderSummary } from '../domain/orderState';
import { useOpenOrders } from '../hooks/data';
import { TaskBar } from '../components/AppMenu';
import { lineAmount } from '../domain/totals';
import { usePrintFlow } from '../hooks/usePrintFlow';
import { elapsed, useNow } from '../lib/time';
import { printKot } from '../printing/printService';
import { cancelOrder, markDelivered, markNotDelivered, requestBill, setItemDelivered, voidSentItem } from '../services/orders';
import { useActor } from '../session';

const VOID_REASONS = ['Customer changed mind', 'Wrong dish', 'Not available'];

/** Full page for one order: serve dish by dish, print slip, add items, payment. */
export default function OrderPage() {
  const { orderId = '' } = useParams();
  const navigate = useNavigate();
  const data = useOpenOrders();
  const summary: OrderSummary | null = useMemo(() => {
    const o = data?.orders.find((x) => x.id === orderId);
    if (!data || !o) return null;
    return summarize(
      o,
      data.items.filter((i) => i.orderId === o.id),
      data.kots.filter((k) => k.orderId === o.id),
      data.tables,
      data.rooms,
    );
  }, [data, orderId]);
  const onClose = () => navigate('/');
  const { message, modal } = App.useApp();
  const printFlow = usePrintFlow();
  const actor = useActor();
  const now = useNow();
  const [busy, setBusy] = useState<string | null>(null);
  const [voidFor, setVoidFor] = useState<OrderItem | null>(null);
  const [reason, setReason] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const err = (e: unknown) => message.error(e instanceof Error ? e.message : String(e));
  const s = summary;
  const lines = s ? [...s.items].sort((a, b) => a.createdAt - b.createdAt) : [];

  const printSlip = async () => {
    if (!s) return;
    setBusy('print');
    try {
      if (s.unprinted.length) {
        for (const k of s.unprinted)
          if (!(await printFlow({ docType: 'kot', id: k.id, label: `Kitchen slip KOT #${k.kotNo}`, run: () => printKot(k.id) }))) break;
      } else {
        await new Promise<void>((resolve) =>
          modal.confirm({
            title: 'Print the kitchen slip again?',
            content: 'The copy says “REPRINT – NOT A NEW ORDER” so the kitchen does not cook it twice.',
            okText: 'Print again',
            centered: true,
            onOk: async () => {
              for (const k of s.kots)
                await printFlow({ docType: 'kot', id: k.id, label: `KOT #${k.kotNo}`, run: () => printKot(k.id, { reprint: true }) }, true);
              resolve();
            },
            onCancel: () => resolve(),
          }),
        );
      }
    } finally {
      setBusy(null);
    }
  };

  const collect = async () => {
    if (!s) return;
    setBusy('pay');
    try {
      if (s.order.status === 'open') await requestBill(s.order.id);
      onClose();
      navigate(`/pay/${s.order.id}`);
    } catch (e) {
      err(e);
    } finally {
      setBusy(null);
    }
  };

  const delivered = !!s?.order.servedAt;

  return (
    <div className="flow">
      <TaskBar
        title={s ? `${s.title} · ${s.subtitle}` : 'Order'}
        sub={s ? `Order #${s.order.orderNo} · ${elapsed(s.order.createdAt, now)}` : undefined}
        onBack={onClose}
        backLabel="Back to orders"
      />
      {s && (
        <div style={{ marginBottom: 8 }}>
          <span className={`status is-${s.stage}`}>
            {s.stage === 'partly' ? `${s.delivered} of ${s.servable} served` : STAGE_LABEL[s.stage]}
          </span>
        </div>
      )}
      {!data && <Spin style={{ display: 'block', margin: '80px auto' }} />}
      {data && !s && (
        <div className="flow__body">
          <div className="empty">
            <div className="empty__title">This order is closed</div>
            <Button size="large" onClick={onClose}>
              Back to orders
            </Button>
          </div>
        </div>
      )}
      <div className="flow__body">
      {s && (
        <>
          {s.order.status === 'open' && s.servable > 0 && (
            <p className="muted" style={{ margin: '0 0 4px' }}>
              Tick each dish when it reaches the table.
            </p>
          )}
          <ul className="olist">
            {lines.map((i) => (
              <li key={i.id} className={`${i.voided ? 'is-void' : ''}${i.deliveredAt ? ' is-served' : ''}`}>
                {i.kotId && !i.voided && s.order.status !== 'paid' ? (
                  <button
                    className={`tick${i.deliveredAt ? ' is-on' : ''}`}
                    aria-pressed={!!i.deliveredAt}
                    aria-label={i.deliveredAt ? `${i.name} served. Tap to undo` : `Mark ${i.name} served`}
                    onClick={async () => {
                      try {
                        await setItemDelivered(i.id, !i.deliveredAt);
                      } catch (e) {
                        err(e);
                      }
                    }}
                  >
                    <CheckOutlined />
                  </button>
                ) : (
                  <span className="iconbtn-space" />
                )}
                <span className="olist__qty">{i.qty} ×</span>
                <span className="olist__name">
                  {i.name}
                  {i.note && <span className="olist__note">{i.note}</span>}
                  {!i.kotId && !i.voided && <span className="olist__note">Not sent to kitchen</span>}
                </span>
                <span className="olist__amt">{formatINR(lineAmount(i))}</span>
                {!i.voided && i.kotId && s.order.status === 'open' ? (
                  <button
                    className="iconbtn iconbtn--sm"
                    aria-label={`Remove ${i.name}`}
                    onClick={() => {
                      setVoidFor(i);
                      setReason('');
                    }}
                  >
                    <CloseOutlined />
                  </button>
                ) : (
                  <span className="iconbtn-space" />
                )}
              </li>
            ))}
          </ul>
          <div className="ototal">
            <span>Total</span>
            <span>{formatINR(s.total)}</span>
          </div>

          <div className="oactions">
            <Button
              size="large"
              className="btn-xl"
              type={s.unprinted.length ? 'primary' : 'default'}
              icon={<PrinterOutlined />}
              loading={busy === 'print'}
              onClick={printSlip}
            >
              {s.unprinted.length ? 'Print kitchen slip' : 'Print slip again'}
            </Button>
            <Button
              size="large"
              className="btn-xl"
              icon={<PlusOutlined />}
              onClick={() => {
                onClose();
                navigate(`/order/${s.order.id}/add`);
              }}
            >
              Add items
            </Button>
            {!delivered ? (
              <Button
                size="large"
                className="btn-xl"
                icon={<CheckOutlined />}
                onClick={async () => {
                  try {
                    await markDelivered(s.order.id);
                    message.success(`${s.title}: all food served`);
                  } catch (e) {
                    err(e);
                  }
                }}
              >
                All food served
              </Button>
            ) : null}
            <Button
              block
              rootClassName="is-wide"
              size="large"
              className="btn-xl"
              type={delivered || s.unprinted.length === 0 ? 'primary' : 'default'}
              icon={<WalletOutlined />}
              loading={busy === 'pay'}
              onClick={collect}
            >
              Collect payment · {formatINR(s.total)}
            </Button>
          </div>

          <div className="olinks">
            {delivered && (
              <Button type="link" onClick={() => markNotDelivered(s.order.id)}>
                Undo all served
              </Button>
            )}
            <Button
              type="link"
              danger
              onClick={() => {
                setCancelReason('');
                setCancelOpen(true);
              }}
            >
              Cancel order
            </Button>
          </div>
        </>
      )}

      <Modal
        open={!!voidFor}
        title={voidFor ? `Remove ${voidFor.qty} × ${voidFor.name}?` : ''}
        okText="Remove"
        okButtonProps={{ danger: true, disabled: !reason.trim() }}
        onCancel={() => setVoidFor(null)}
        centered
        destroyOnHidden
        onOk={async () => {
          if (!voidFor) return;
          try {
            const k = await voidSentItem(voidFor.id, reason, actor);
            setVoidFor(null);
            message.success(`Removed. Print the cancel slip (KOT #${k.kotNo}) for the kitchen.`);
          } catch (e) {
            err(e);
          }
        }}
      >
        <p className="muted">It comes off the bill and a cancel slip is ready to print for the kitchen.</p>
        <div className="chips">
          {VOID_REASONS.map((r) => (
            <Button key={r} type={reason === r ? 'primary' : 'default'} onClick={() => setReason(r)}>
              {r}
            </Button>
          ))}
        </div>
        <Input style={{ marginTop: 10 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Or type a reason" maxLength={80} />
      </Modal>

      <Modal
        open={cancelOpen}
        title="Cancel this whole order?"
        okText="Cancel order"
        cancelText="Keep order"
        okButtonProps={{ danger: true, disabled: !cancelReason.trim() }}
        onCancel={() => setCancelOpen(false)}
        centered
        destroyOnHidden
        onOk={async () => {
          if (!s) return;
          try {
            await cancelOrder(s.order.id, cancelReason, actor);
            setCancelOpen(false);
            onClose();
            message.success(`${s.title} cancelled`);
          } catch (e) {
            err(e);
          }
        }}
      >
        <p className="muted">The order is removed from the screen and kept in the records as cancelled.</p>
        <div className="chips">
          {['Customer left', 'Wrong order', 'Test'].map((r) => (
            <Button key={r} type={cancelReason === r ? 'primary' : 'default'} onClick={() => setCancelReason(r)}>
              {r}
            </Button>
          ))}
        </div>
        <Input style={{ marginTop: 10 }} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Or type a reason" maxLength={80} />
      </Modal>
      </div>
    </div>
  );
}
