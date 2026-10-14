import { Segmented, Spin, Tag } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/db';
import type { Kot } from '../db/types';
import { kotPlace } from '../domain/place';
import { elapsed, timeOf, useNow } from '../lib/time';
import { kitchenStatusOf } from '../services/orders';
import { startOfDay } from '../services/sales';
import { KIND_TAG, PRINT_TAG, STATUS_LABEL } from './kitchenLabels';

type View = 'active' | 'served';

function readView(): View {
  try {
    return localStorage.getItem('pos.kitchenView') === 'served' ? 'served' : 'active';
  } catch {
    return 'active';
  }
}

/**
 * Home screen: the kitchen tickets. Open tickets are listed oldest first so
 * the kitchen works through them in order. Tap one to print it or change
 * its status.
 */
export default function KitchenPage() {
  const navigate = useNavigate();
  const now = useNow();
  const [view, setView] = useState<View>(readView);

  const data = useLiveQuery(async () => {
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const kots = await db.kots.where('createdAt').above(since).toArray();
    const orderIds = [...new Set(kots.map((k) => k.orderId))];
    const orders = orderIds.length ? await db.orders.bulkGet(orderIds) : [];
    const cancelled = new Set(orders.filter((o) => o?.status === 'cancelled').map((o) => o!.id));
    return { kots, cancelled };
  }, []);

  if (!data) return <Spin style={{ display: 'block', margin: '80px auto' }} />;

  const active = data.kots.filter((k) => kitchenStatusOf(k) !== 'served').sort((a, b) => a.createdAt - b.createdAt);
  const today = startOfDay();
  const served = data.kots
    .filter((k) => kitchenStatusOf(k) === 'served' && k.createdAt >= today)
    .sort((a, b) => b.createdAt - a.createdAt);
  const list = view === 'active' ? active : served;

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page__title">Kitchen</h1>
      </div>
      <Segmented
        size="large"
        value={view}
        onChange={(v) => {
          setView(v as View);
          try {
            localStorage.setItem('pos.kitchenView', String(v));
          } catch {
            /* ignore */
          }
        }}
        options={[
          { label: `Open (${active.length})`, value: 'active' },
          { label: `Served today (${served.length})`, value: 'served' },
        ]}
        style={{ marginBottom: 16 }}
      />

      {list.length === 0 ? (
        <div className="empty panel">
          <div className="empty__title">{view === 'active' ? 'No open kitchen tickets' : 'Nothing served yet today'}</div>
          {view === 'active' ? 'Tickets appear here when an order is sent to the kitchen from Tables.' : 'Tickets move here when marked Served.'}
        </div>
      ) : (
        <div className="kgrid">
          {list.map((k) => (
            <KotCard key={k.id} kot={k} now={now} cancelled={data.cancelled.has(k.orderId)} onOpen={() => navigate(`/kitchen/${k.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}

function KotCard({ kot, now, cancelled, onOpen }: { kot: Kot; now: number; cancelled: boolean; onOpen: () => void }) {
  const status = kitchenStatusOf(kot);
  const print = PRINT_TAG[kot.printStatus];
  return (
    <button className={`kcard is-${status}${kot.kind === 'VOID' ? ' is-void' : ''}`} onClick={onOpen} aria-label={`KOT ${kot.kotNo}, ${kotPlace(kot)}, ${STATUS_LABEL[status]}`}>
      <div className="kcard__head">
        <span className="kcard__no">KOT #{kot.kotNo}</span>
        <span className={`kstatus is-${status}`}>{STATUS_LABEL[status]}</span>
      </div>
      <div className="kcard__place">{kotPlace(kot)}{kot.roomName ? ` · ${kot.roomName}` : ''}</div>
      <div className="kcard__meta">
        {kot.kind !== 'NEW' && <Tag color={KIND_TAG[kot.kind].color}>{KIND_TAG[kot.kind].label}</Tag>}
        {cancelled && <Tag color="red">Order cancelled</Tag>}
        <span>
          {timeOf(kot.createdAt)} · {elapsed(kot.createdAt, now)}
        </span>
      </div>
      <ul className="kcard__lines">
        {kot.lines.map((l, i) => (
          <li key={i}>
            <strong>{l.qty} ×</strong> {l.name}
            {l.note && <div className="kcard__note">{l.note}</div>}
          </li>
        ))}
      </ul>
      <div className="kcard__foot">
        <Tag color={print.color}>{print.label}</Tag>
        <span className="kcard__open">Open</span>
      </div>
    </button>
  );
}
