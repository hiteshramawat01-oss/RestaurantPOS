import { CheckOutlined, CloseOutlined, PlusOutlined, PrinterOutlined, WalletOutlined } from '@ant-design/icons';
import { App, Button, Drawer, Input, Modal } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { OrderItem } from '../db/types';
import { formatINR } from '../domain/money';
import type { OrderSummary } from '../domain/orderState';
import { lineAmount } from '../domain/totals';
import { usePrintFlow } from '../hooks/usePrintFlow';
import { elapsed, useNow } from '../lib/time';
import { printKot } from '../printing/printService';
import { cancelOrder, markDelivered, markNotDelivered, requestBill, voidSentItem } from '../services/orders';
import { useActor } from '../session';

const VOID_REASONS = ['Customer changed mind', 'Wrong dish', 'Not available'];

/** Bottom sheet for one order: print slip, add items, delivered, payment. */
export default function OrderSheet({ summary, onClose }: { summary: OrderSummary | null; onClose: () => void }) {
  const navigate = useNavigate();
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
    <Drawer
      open={!!s}
      onClose={onClose}
      placement="bottom"
      size="auto"
      title={
        s && (
          <div>
            <div className="osheet__title">
              {s.title} <span className="muted">{s.subtitle}</span>
            </div>
            <div className="osheet__sub">
              Order #{s.order.orderNo} · {elapsed(s.order.createdAt, now)} ·{' '}
              <span className={`osheet__stage is-${s.stage}`}>{s.stage === 'payment' ? 'Payment pending' : 'Preparing'}</span>
            </div>
          </div>
        )
      }
      styles={{ body: { paddingTop: 8 }, wrapper: { maxHeight: '92dvh' } }}
    >
      {s && (
        <>
          <ul className="osheet__lines">
            {lines.map((i) => (
              <li key={i.id} className={i.voided ? 'is-void' : ''}>
                <span className="osheet__qty">{i.qty} ×</span>
                <span className="osheet__name">
                  {i.name}
                  {i.note && <span className="osheet__note">{i.note}</span>}
                  {!i.kotId && !i.voided && <span className="osheet__note">Not sent to kitchen</span>}
                </span>
                <span className="osheet__amt">{formatINR(lineAmount(i))}</span>
                {!i.voided && i.kotId && s.order.status === 'open' ? (
                  <button
                    className="osheet__x"
                    aria-label={`Remove ${i.name}`}
                    onClick={() => {
                      setVoidFor(i);
                      setReason('');
                    }}
                  >
                    <CloseOutlined />
                  </button>
                ) : (
                  <span className="osheet__x-space" />
                )}
              </li>
            ))}
          </ul>
          <div className="osheet__total">
            <span>Total</span>
            <span>{formatINR(s.total)}</span>
          </div>

          <div className="osheet__actions">
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
                    message.success(`${s.title}: food delivered`);
                  } catch (e) {
                    err(e);
                  }
                }}
              >
                Food delivered
              </Button>
            ) : null}
            <Button
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

          <div className="osheet__links">
            {delivered && (
              <Button type="link" onClick={() => markNotDelivered(s.order.id)}>
                Not delivered yet
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
    </Drawer>
  );
}
