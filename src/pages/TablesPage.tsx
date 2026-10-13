import { SwapOutlined } from '@ant-design/icons';
import { Button, Segmented, Spin } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/db';
import type { DiningTable } from '../db/types';
import { formatPrice } from '../domain/money';
import { orderTotal } from '../domain/totals';
import { useActiveOrders, useRooms, useTables, type ActiveOrderInfo } from '../hooks/data';
import { elapsed, useNow } from '../lib/time';
import { useSession } from '../session';

type TileState = 'free' | 'busy' | 'bill';

function readFilter(): string {
  try {
    return localStorage.getItem('pos.roomFilter') ?? 'all';
  } catch {
    return 'all';
  }
}

export default function TablesPage() {
  const rooms = useRooms();
  const tables = useTables();
  const active = useActiveOrders();
  const navigate = useNavigate();
  const now = useNow();
  const { staff, signOut } = useSession();
  const [filter, setFilter] = useState(readFilter);

  const failedKotOrders = useLiveQuery(async () => {
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const k = await db.kots
      .where('createdAt')
      .above(since)
      .filter((x) => x.printStatus === 'failed')
      .toArray();
    return new Set(k.map((x) => x.orderId));
  }, []);

  const byTable = useMemo(() => {
    const m = new Map<string, ActiveOrderInfo>();
    for (const a of active ?? []) m.set(a.order.tableId, a);
    return m;
  }, [active]);

  if (!rooms || !tables || !active) return <Spin style={{ display: 'block', margin: '80px auto' }} />;

  const stateOf = (t: DiningTable): TileState => {
    const a = byTable.get(t.id);
    if (!a) return 'free';
    return a.order.status === 'billing' ? 'bill' : 'busy';
  };
  const counts = { free: 0, busy: 0, bill: 0 };
  tables.forEach((t) => counts[stateOf(t)]++);

  const shownRooms = rooms.filter((r) => filter === 'all' || r.id === filter);

  const open = (t: DiningTable) => {
    const a = byTable.get(t.id);
    if (a?.order.status === 'billing') navigate(`/billing/${a.order.id}`);
    else navigate(`/order/${t.id}`);
  };

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Tables</h1>
          <div className="page__sub">
            Signed in as <strong>{staff?.name}</strong>
          </div>
        </div>
        <div className="page__actions">
          <Button icon={<SwapOutlined />} onClick={signOut}>
            Switch user
          </Button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
        <Segmented
          size="large"
          value={filter}
          onChange={(v) => {
            setFilter(String(v));
            try {
              localStorage.setItem('pos.roomFilter', String(v));
            } catch {
              /* ignore */
            }
          }}
          options={[{ label: 'All', value: 'all' }, ...rooms.map((r) => ({ label: r.name, value: r.id }))]}
        />
        <div className="tally" aria-label="Table summary">
          <span className="tally__chip">
            <i style={{ background: 'var(--free)' }} /> {counts.free} free
          </span>
          <span className="tally__chip">
            <i style={{ background: 'var(--busy-band)' }} /> {counts.busy} occupied
          </span>
          <span className="tally__chip">
            <i style={{ background: 'var(--bill-band)' }} /> {counts.bill} bill pending
          </span>
        </div>
      </div>

      {shownRooms.map((room) => {
        const roomTables = tables.filter((t) => t.roomId === room.id);
        return (
          <section className="room" key={room.id} aria-label={room.name}>
            <div className="room__head">
              <h2 className="room__name">{room.name}</h2>
              <span className="muted">
                {roomTables.length} tables · {roomTables.reduce((s, t) => s + t.seats, 0)} seats
              </span>
            </div>
            {roomTables.length === 0 ? (
              <div className="empty panel">
                <div className="empty__title">No tables in {room.name}</div>
                Add tables in Settings → Rooms and tables.
              </div>
            ) : (
              <div className="table-grid">
                {roomTables.map((t) => {
                  const st = stateOf(t);
                  const a = byTable.get(t.id);
                  const unsent = a?.items.filter((i) => !i.kotId && !i.voided && i.qty > 0).length ?? 0;
                  const printFailed = a && failedKotOrders?.has(a.order.id);
                  const total = a ? orderTotal(a.items) : 0;
                  return (
                    <button
                      key={t.id}
                      className={`ttile is-${st}`}
                      onClick={() => open(t)}
                      aria-label={`Table ${t.label}, ${st === 'free' ? 'free' : st === 'busy' ? 'occupied' : 'bill pending'}`}
                    >
                      <span className="ttile__label">{t.label}</span>
                      <span className="ttile__seats">{t.seats} seats</span>
                      {printFailed ? <span className="ttile__flag">Print failed</span> : unsent > 0 ? <span className="ttile__flag" style={{ background: 'var(--busy)' }}>Not sent</span> : null}
                      {st === 'free' ? (
                        <span className="ttile__state">Free</span>
                      ) : (
                        <>
                          <span className="ttile__state">{st === 'bill' ? 'Bill pending' : `Order #${a!.order.orderNo}`}</span>
                          <span className="ttile__meta">
                            <span className="money">{formatPrice(total)}</span>
                            <span style={{ fontWeight: 600 }}>{elapsed(a!.order.createdAt, now)}</span>
                          </span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
