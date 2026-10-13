import { PrinterOutlined, ReloadOutlined } from '@ant-design/icons';
import { App, Button, Segmented, Spin, Tag } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/db';
import type { Kot, PrintStatus } from '../db/types';
import { formatINR } from '../domain/money';
import { itemCount, orderTotal } from '../domain/totals';
import { useActiveOrders, useRooms, useTables } from '../hooks/data';
import { usePrintFlow } from '../hooks/usePrintFlow';
import { elapsed, timeOf, useNow } from '../lib/time';
import { confirmBrowserPrint, printKot } from '../printing/printService';
import { kotPlace, orderPath } from '../domain/place';

export const PRINT_TAG: Record<PrintStatus, { color: string; label: string }> = {
  pending: { color: 'default', label: 'Not printed' },
  printing: { color: 'processing', label: 'Printing…' },
  printed: { color: 'success', label: 'Printed' },
  awaiting_confirmation: { color: 'warning', label: 'Confirm print' },
  failed: { color: 'error', label: 'Print failed' },
};

const KIND_TAG: Record<Kot['kind'], { color: string; label: string }> = {
  NEW: { color: 'blue', label: 'New order' },
  ADDED: { color: 'gold', label: 'Added items' },
  VOID: { color: 'red', label: 'Cancel / void' },
};

export default function OrdersPage() {
  const [tab, setTab] = useState<'active' | 'kots'>('active');
  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page__title">Orders</h1>
      </div>
      <Segmented
        size="large"
        value={tab}
        onChange={(v) => setTab(v as typeof tab)}
        options={[
          { label: 'Active orders', value: 'active' },
          { label: 'Kitchen tickets', value: 'kots' },
        ]}
        style={{ marginBottom: 16 }}
      />
      {tab === 'active' ? <ActiveOrders /> : <KitchenTickets />}
    </div>
  );
}

function ActiveOrders() {
  const active = useActiveOrders();
  const tables = useTables(true);
  const rooms = useRooms(true);
  const navigate = useNavigate();
  const now = useNow();
  if (!active || !tables || !rooms) return <Spin />;
  const visible = active.filter((a) => a.items.length > 0);
  if (visible.length === 0)
    return (
      <div className="empty panel">
        <div className="empty__title">No active orders</div>
        Start an order by tapping a table on the Tables screen.
      </div>
    );
  return (
    <div className="rowlist">
      {visible.map(({ order, items }) => {
        const t = tables.find((x) => x.id === order.tableId);
        const r = rooms.find((x) => x.id === order.roomId);
        const unsent = items.filter((i) => !i.kotId).length;
        return (
          <button
            key={order.id}
            className="rowlist__row is-button"
            onClick={() => navigate(orderPath(order))}
          >
            <div style={{ fontSize: 22, fontWeight: 800, width: 52 }}>{order.type === 'takeaway' ? `#${order.orderNo}` : t?.label}</div>
            <div className="rowlist__main">
              <div className="rowlist__title">
                Order #{order.orderNo}{' '}
                {order.status === 'billing' ? <Tag color="magenta">Bill pending</Tag> : unsent ? <Tag color="gold">{unsent} not sent</Tag> : null}
              </div>
              <div className="rowlist__sub">
                {order.type === 'takeaway' ? `Takeaway${order.customerName ? ` · ${order.customerName}` : ''}` : r?.name} · {itemCount(items)} items · {order.staffName} · {elapsed(order.createdAt, now)}
              </div>
            </div>
            <div className="money" style={{ fontWeight: 800 }}>
              {formatINR(orderTotal(items))}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function KitchenTickets() {
  const { modal } = App.useApp();
  const printFlow = usePrintFlow();
  const [showAll, setShowAll] = useState(false);
  const kots = useLiveQuery(async () => {
    const since = Date.now() - (showAll ? 7 : 1) * 24 * 60 * 60 * 1000;
    return (await db.kots.where('createdAt').above(since).reverse().sortBy('createdAt'));
  }, [showAll]);
  if (!kots) return <Spin />;

  const print = (k: Kot, reprint: boolean) =>
    printFlow(
      { docType: 'kot', id: k.id, label: `KOT #${k.kotNo}`, run: () => printKot(k.id, { reprint }) },
      reprint,
    );

  const reprint = (k: Kot) =>
    modal.confirm({
      title: `Reprint KOT #${k.kotNo}?`,
      content: 'The copy is marked “REPRINT – NOT A NEW ORDER” so the kitchen does not cook it twice.',
      okText: 'Reprint',
      centered: true,
      onOk: () => print(k, true),
    });

  return (
    <>
      {kots.length === 0 ? (
        <div className="empty panel">
          <div className="empty__title">No kitchen tickets {showAll ? 'this week' : 'in the last 24 hours'}</div>
          Tickets appear here when an order is sent to the kitchen.
        </div>
      ) : (
        <div className="rowlist">
          {kots.map((k) => {
            const tag = PRINT_TAG[k.printStatus];
            const needsPrint = k.printStatus === 'failed' || k.printStatus === 'pending';
            return (
              <div className="rowlist__row" key={k.id}>
                <div className="rowlist__main">
                  <div className="rowlist__title">
                    KOT #{k.kotNo} · {kotPlace(k)}{' '}
                    <Tag color={KIND_TAG[k.kind].color}>{KIND_TAG[k.kind].label}</Tag>
                    <Tag color={tag.color}>{tag.label}</Tag>
                  </div>
                  <div className="rowlist__sub">
                    {timeOf(k.createdAt)}{k.roomName ? ` · ${k.roomName}` : ''} · Order #{k.orderNo} · {k.staffName}
                  </div>
                  <div style={{ fontSize: 14, marginTop: 4 }}>{k.lines.map((l) => `${l.qty}× ${l.name}`).join(', ')}</div>
                  {k.lastError && k.printStatus === 'failed' && (
                    <div style={{ fontSize: 13, color: 'var(--danger)', marginTop: 2 }}>{k.lastError}</div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {needsPrint && (
                    <Button type="primary" icon={<ReloadOutlined />} onClick={() => print(k, false)}>
                      {k.printStatus === 'failed' ? 'Retry' : 'Print'}
                    </Button>
                  )}
                  {k.printStatus === 'awaiting_confirmation' && (
                    <>
                      <Button type="primary" onClick={() => confirmBrowserPrint('kot', k.id, true)}>
                        It printed
                      </Button>
                      <Button onClick={() => confirmBrowserPrint('kot', k.id, false)}>Didn’t print</Button>
                    </>
                  )}
                  {k.printStatus === 'printed' && (
                    <Button icon={<PrinterOutlined />} onClick={() => reprint(k)}>
                      Reprint
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Button type="link" onClick={() => setShowAll((v) => !v)} style={{ marginTop: 8 }}>
        {showAll ? 'Show last 24 hours only' : 'Show the last 7 days'}
      </Button>
    </>
  );
}
