import { CheckOutlined, CloseCircleFilled, CloseOutlined, EditOutlined, PrinterOutlined, SearchOutlined } from '@ant-design/icons';
import { TaskBar } from '../components/AppMenu';
import { App, Button, Input, Modal, Spin } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../db/db';
import type { Kot, MenuItem } from '../db/types';
import { formatINR, formatPrice } from '../domain/money';
import { orderTotal } from '../domain/totals';
import { usePrintFlow } from '../hooks/usePrintFlow';
import { printKot } from '../printing/printService';
import { isActive, placeOrder, type CartLine, type OrderTarget } from '../services/orders';
import { useActor } from '../session';

/* ---------- cart ---------- */

interface Line extends CartLine {
  key: string;
  name: string; // with size, e.g. "Dal Makhni (Half)"
  unitPrice: number;
}

interface Draft {
  target: OrderTarget | null;
  place: string; // "Table 3 · AC"
  lines: Line[];
  at: number;
}

type Step = 'where' | 'dishes' | 'review' | 'done';
const QUICK_NOTES = ['Less spicy', 'Extra spicy', 'No onion', 'No garlic', 'Jain', 'Less oil', 'Parcel'];
const DRAFT_MAX_AGE = 6 * 60 * 60 * 1000;

function draftKey(orderId?: string) {
  return `pos.draft.${orderId ?? 'new'}`;
}
function loadDraft(orderId?: string): Draft | null {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey(orderId)) ?? 'null') as Draft | null;
    return d && Date.now() - d.at < DRAFT_MAX_AGE && d.lines.length ? d : null;
  } catch {
    return null;
  }
}
function saveDraft(orderId: string | undefined, d: Draft | null) {
  try {
    if (d && d.lines.length) localStorage.setItem(draftKey(orderId), JSON.stringify(d));
    else localStorage.removeItem(draftKey(orderId));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Taking an order, one clear step at a time:
 * 1 Where (AC / Non-AC table, or takeaway) → 2 Dishes → 3 Review → placed.
 * With /order/:orderId/add it adds items to an existing order (starts at Dishes).
 */
export default function NewOrderPage() {
  const { orderId } = useParams();
  const adding = !!orderId;
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const actor = useActor();
  const printFlow = usePrintFlow();

  const existing = useLiveQuery(async () => (orderId ? ((await db.orders.get(orderId)) ?? null) : null), [orderId]);
  const existingPlace = useLiveQuery(async () => {
    if (!existing) return '';
    if (existing.type === 'takeaway') return `Takeaway #${existing.orderNo}${existing.customerName ? ` · ${existing.customerName}` : ''}`;
    const [t, r] = await Promise.all([db.diningTables.get(existing.tableId), db.rooms.get(existing.roomId)]);
    return `Table ${t?.label ?? '?'}${r ? ` · ${r.name}` : ''}`;
  }, [existing?.id]);

  const restored = useMemo(() => loadDraft(orderId), [orderId]);
  const [step, setStep] = useState<Step>(adding ? 'dishes' : restored?.target ? 'dishes' : 'where');
  const [target, setTarget] = useState<OrderTarget | null>(adding ? { kind: 'existing', orderId: orderId! } : (restored?.target ?? null));
  const [place, setPlace] = useState(restored?.place ?? '');
  const [lines, setLines] = useState<Line[]>(restored?.lines ?? []);
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<{ kot: Kot; place: string } | null>(null);
  const [printed, setPrinted] = useState(false);

  useEffect(() => {
    if (restored) message.info('Continuing the order you started earlier.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step !== 'done') saveDraft(orderId, { target, place, lines, at: Date.now() });
  }, [orderId, target, place, lines, step]);

  const placeLabel = adding ? (existingPlace ?? '') : place;
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const total = orderTotal(lines.map((l) => ({ ...l, id: l.key, orderId: '', createdAt: 0 })));

  const leave = () => {
    if (lines.length === 0 || step === 'done') {
      saveDraft(orderId, null);
      navigate('/');
      return;
    }
    modal.confirm({
      title: 'Leave without placing the order?',
      content: 'The dishes you picked will be removed.',
      okText: 'Leave',
      cancelText: 'Stay',
      okButtonProps: { danger: true },
      centered: true,
      onOk: () => {
        saveDraft(orderId, null);
        navigate('/');
      },
    });
  };

  const back = () => {
    if (step === 'review') setStep('dishes');
    else if (step === 'dishes' && !adding) setStep('where');
    else leave();
  };

  const add = (m: MenuItem, variant?: string) => {
    const v = m.variants?.find((x) => x.label === variant);
    const key = `${m.id}|${variant ?? ''}`;
    setLines((ls) => {
      const i = ls.findIndex((l) => l.key === key);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { key, menuItemId: m.id, variant, qty: 1, name: v ? `${m.name} (${v.label})` : m.name, unitPrice: v ? v.price : m.price }];
    });
    navigator.vibrate?.(8);
  };

  const place_ = async () => {
    if (!target || placing) return;
    setPlacing(true);
    try {
      const { kot } = await placeOrder(target, lines, actor);
      saveDraft(orderId, null);
      setPlaced({ kot, place: placeLabel || place });
      setStep('done');
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setPlacing(false);
    }
  };

  if (adding && existing === undefined) return <Spin style={{ display: 'block', margin: '80px auto' }} />;
  if (adding && (!existing || !isActive(existing)) && step !== 'done')
    return (
      <div className="page">
        <p>This order is already closed.</p>
        <Button onClick={() => navigate('/')}>Back to orders</Button>
      </div>
    );

  const steps: { id: Step; label: string }[] = adding
    ? [
        { id: 'dishes', label: 'Dishes' },
        { id: 'review', label: 'Review' },
      ]
    : [
        { id: 'where', label: 'Where' },
        { id: 'dishes', label: 'Dishes' },
        { id: 'review', label: 'Review' },
      ];
  const stepIndex = step === 'done' ? steps.length : steps.findIndex((s) => s.id === step);

  return (
    <div className="flow">
      <TaskBar
        title={adding ? 'Add items' : 'New order'}
        sub={placeLabel && step !== 'where' ? placeLabel : undefined}
        onBack={step !== 'done' ? back : undefined}
        backLabel="Back"
        trailing={
          step !== 'done' ? (
            <button className="iconbtn" onClick={leave} aria-label="Close">
              <CloseOutlined />
            </button>
          ) : (
            <span className="iconbtn-space" />
          )
        }
      />

      <ol className="flow__steps" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s.id} className={i < stepIndex ? 'is-done' : i === stepIndex ? 'is-on' : ''}>
            <span className="flow__dot">{i < stepIndex ? <CheckOutlined /> : i + 1}</span>
            <span>{s.label}</span>
          </li>
        ))}
      </ol>

      {step === 'where' && (
        <StepWhere
          onPick={(t, label) => {
            setTarget(t);
            setPlace(label);
            setStep('dishes');
          }}
          onExisting={(id) => {
            saveDraft(undefined, null);
            navigate(`/order/${id}/add`, { replace: true });
          }}
        />
      )}

      {step === 'dishes' && <StepDishes lines={lines} onAdd={add} count={count} total={total} onNext={() => setStep('review')} />}

      {step === 'review' && (
        <StepReview
          lines={lines}
          setLines={setLines}
          total={total}
          placing={placing}
          actionLabel={adding ? 'Add to order' : 'Place order'}
          onMore={() => setStep('dishes')}
          onPlace={place_}
        />
      )}

      {step === 'done' && placed && (
        <div className="flow__done">
          <div className="flow__tick">
            <CheckOutlined />
          </div>
          <div className="flow__done-title">{adding ? 'Items added' : 'Order placed'}</div>
          <div className="flow__done-sub">
            {placed.place} · KOT #{placed.kot.kotNo}
          </div>
          <div className="flow__done-actions">
            <Button
              type={printed ? 'default' : 'primary'}
              className="btn-xl"
              block
              icon={printed ? <CheckOutlined /> : <PrinterOutlined />}
              onClick={async () => {
                const ok = await printFlow(
                  { docType: 'kot', id: placed.kot.id, label: `Kitchen slip KOT #${placed.kot.kotNo}`, run: () => printKot(placed.kot.id, { reprint: printed }) },
                  printed,
                );
                if (ok) setPrinted(true);
              }}
            >
              {printed ? 'Printed · print again' : 'Print kitchen slip'}
            </Button>
            <Button className="btn-xl" block onClick={() => navigate('/')}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Step 1: where ---------- */

type Area = { kind: 'room'; roomId: string; name: string } | { kind: 'takeaway' };

function StepWhere({ onPick, onExisting }: { onPick: (t: OrderTarget, label: string) => void; onExisting: (orderId: string) => void }) {
  const { modal } = App.useApp();
  const rooms = useLiveQuery(() => db.rooms.orderBy('sortOrder').filter((r) => r.active).toArray(), []);
  const tables = useLiveQuery(() => db.diningTables.orderBy('sortOrder').filter((t) => t.active).toArray(), []);
  const busy = useLiveQuery(async () => {
    const orders = await db.orders.where('status').anyOf('open', 'billing').toArray();
    const items = orders.length ? await db.orderItems.where('orderId').anyOf(orders.map((o) => o.id)).toArray() : [];
    const m = new Map<string, { orderId: string; total: number }>();
    for (const o of orders)
      if (o.type !== 'takeaway') m.set(o.tableId, { orderId: o.id, total: orderTotal(items.filter((i) => i.orderId === o.id)) });
    return m;
  }, []);
  const [area, setArea] = useState<Area | null>(null);
  const [name, setName] = useState('');

  if (!rooms || !tables || !busy) return <Spin style={{ display: 'block', margin: '60px auto' }} />;
  const current: Area = area ?? (rooms[0] ? { kind: 'room', roomId: rooms[0].id, name: rooms[0].name } : { kind: 'takeaway' });

  return (
    <div className="flow__body">
      <h2 className="flow__q">Where is this order for?</h2>
      <div className="areas" role="radiogroup">
        {rooms.map((r) => {
          const on = current.kind === 'room' && current.roomId === r.id;
          const free = tables.filter((t) => t.roomId === r.id && !busy.has(t.id)).length;
          return (
            <button key={r.id} role="radio" aria-checked={on} className={`area${on ? ' is-on' : ''}`} onClick={() => setArea({ kind: 'room', roomId: r.id, name: r.name })}>
              <span className="area__name">{r.name}</span>
              <span className="area__sub">{free} free</span>
            </button>
          );
        })}
        <button role="radio" aria-checked={current.kind === 'takeaway'} className={`area${current.kind === 'takeaway' ? ' is-on' : ''}`} onClick={() => setArea({ kind: 'takeaway' })}>
          <span className="area__name">Takeaway</span>
          <span className="area__sub">Parcel</span>
        </button>
      </div>

      {current.kind === 'room' ? (
        <>
          <h3 className="flow__q2">Choose the table</h3>
          <div className="tpick">
            {tables
              .filter((t) => t.roomId === current.roomId)
              .map((t) => {
                const b = busy.get(t.id);
                return (
                  <button
                    key={t.id}
                    className={`tpick__t${b ? ' is-busy' : ''}`}
                    onClick={() => {
                      if (!b) onPick({ kind: 'table', tableId: t.id }, `Table ${t.label} · ${current.name}`);
                      else
                        modal.confirm({
                          title: `Table ${t.label} already has an order`,
                          content: 'Add more items to that order?',
                          okText: 'Add items',
                          cancelText: 'Pick another table',
                          centered: true,
                          onOk: () => onExisting(b.orderId),
                        });
                    }}
                    aria-label={`Table ${t.label}${b ? ', has an order' : ', free'}`}
                  >
                    <span className="tpick__no">{t.label}</span>
                    <span className="tpick__state">{b ? formatPrice(b.total) : 'Free'}</span>
                  </button>
                );
              })}
          </div>
        </>
      ) : (
        <div className="flow__takeaway">
          <h3 className="flow__q2">Customer name or phone</h3>
          <Input size="large" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="Optional" autoFocus />
          <p className="muted" style={{ fontSize: 13 }}>
            Printed on the kitchen slip and bill so the parcel goes to the right person.
          </p>
          <Button
            type="primary"
            className="btn-xl"
            block
            onClick={() => onPick({ kind: 'takeaway', customerName: name.trim() || undefined }, `Takeaway${name.trim() ? ` · ${name.trim()}` : ''}`)}
          >
            Continue
          </Button>
        </div>
      )}
    </div>
  );
}

/* ---------- Step 2: dishes ---------- */

function StepDishes({ lines, onAdd, count, total, onNext }: { lines: Line[]; onAdd: (m: MenuItem, v?: string) => void; count: number; total: number; onNext: () => void }) {
  const categories = useLiveQuery(() => db.categories.orderBy('sortOrder').filter((c) => c.active).toArray(), []);
  const menu = useLiveQuery(() => db.menuItems.orderBy('sortOrder').filter((m) => m.active).toArray(), []);
  const [cat, setCat] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sizeFor, setSizeFor] = useState<MenuItem | null>(null);

  const qtyOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) m.set(l.menuItemId, (m.get(l.menuItemId) ?? 0) + l.qty);
    return m;
  }, [lines]);

  if (!categories || !menu) return <Spin style={{ display: 'block', margin: '60px auto' }} />;
  const activeCat = cat ?? categories[0]?.id;
  const q = query.trim().toLowerCase();
  const shown = q ? menu.filter((m) => m.name.toLowerCase().includes(q)) : menu.filter((m) => m.categoryId === activeCat);
  const priceText = (m: MenuItem) => (m.variants?.length ? m.variants.map((v) => formatPrice(v.price)).join(' / ') : formatPrice(m.price));

  return (
    <div className="flow__body flow__body--dishes">
      <div className="flow__sticky">
        <Input
          className="searchbar"
          allowClear={{ clearIcon: <CloseCircleFilled style={{ fontSize: 20 }} /> }}
          prefix={<SearchOutlined />}
          placeholder="Search dishes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          inputMode="search"
        />
        {!q && (
          <div className="cats" role="tablist" aria-label="Categories">
            {categories.map((c) => (
              <button key={c.id} role="tab" aria-selected={c.id === activeCat} className={`cats__chip${c.id === activeCat ? ' is-active' : ''}`} onClick={() => setCat(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="empty">
          <div className="empty__title">No dish matches “{query}”</div>
          Check the spelling or clear the search.
        </div>
      ) : (
        <div className="dish-grid">
          {shown.map((m) => {
            const n = qtyOf.get(m.id);
            return (
              <button
                key={m.id}
                className={`dish${n ? ' is-picked' : ''}`}
                disabled={!m.available}
                onClick={() => (m.variants?.length ? setSizeFor(m) : onAdd(m))}
                aria-label={`Add ${m.name}, ${priceText(m)}`}
              >
                {n ? <span className="dish__qty">{n}</span> : null}
                <span className="dish__name">{m.name}</span>
                <span className="dish__price">{m.available ? priceText(m) : 'Not available'}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flow__bar">
        <div className="flow__bar-info">
          <strong>{count ? `${count} item${count === 1 ? '' : 's'}` : 'Tap dishes to add'}</strong>
          {count > 0 && <span>{formatINR(total)}</span>}
        </div>
        <Button type="primary" size="large" className="flow__bar-btn" disabled={!count} onClick={onNext}>
          Review
        </Button>
      </div>

      <Modal open={!!sizeFor} title={sizeFor?.name} footer={null} onCancel={() => setSizeFor(null)} centered destroyOnHidden width={380}>
        <div className="sizes">
          {sizeFor?.variants?.map((v) => (
            <button
              key={v.label}
              className="sizes__btn"
              onClick={() => {
                onAdd(sizeFor, v.label);
                setSizeFor(null);
              }}
            >
              <span className="sizes__label">{v.label}</span>
              <span className="sizes__price">{formatPrice(v.price)}</span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

/* ---------- Step 3: review ---------- */

function StepReview({
  lines,
  setLines,
  total,
  placing,
  actionLabel,
  onMore,
  onPlace,
}: {
  lines: Line[];
  setLines: (f: (ls: Line[]) => Line[]) => void;
  total: number;
  placing: boolean;
  actionLabel: string;
  onMore: () => void;
  onPlace: () => void;
}) {
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const setQty = (key: string, qty: number) => setLines((ls) => (qty <= 0 ? ls.filter((l) => l.key !== key) : ls.map((l) => (l.key === key ? { ...l, qty } : l))));
  const setNote = (key: string, note: string) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, note } : l)));

  if (lines.length === 0)
    return (
      <div className="flow__body">
        <div className="empty">
          <div className="empty__title">No dishes yet</div>
          <Button type="primary" size="large" onClick={onMore}>
            Choose dishes
          </Button>
        </div>
      </div>
    );

  return (
    <div className="flow__body">
      <h2 className="flow__q">Check the order</h2>
      <ul className="review">
        {lines.map((l) => (
          <li key={l.key} className="review__line">
            <div className="review__top">
              <div>
                <div className="review__name">{l.name}</div>
                <div className="review__each">{formatPrice(l.unitPrice)} each</div>
              </div>
              <div className="review__amt">{formatINR(l.qty * l.unitPrice)}</div>
            </div>
            <div className="review__ctrl">
              <div className="stepper">
                <button aria-label={`One less ${l.name}`} onClick={() => setQty(l.key, l.qty - 1)}>
                  −
                </button>
                <span aria-label="Quantity">{l.qty}</span>
                <button aria-label={`One more ${l.name}`} onClick={() => setQty(l.key, l.qty + 1)}>
                  +
                </button>
              </div>
              <Button icon={<EditOutlined />} onClick={() => setNoteFor(noteFor === l.key ? null : l.key)}>
                {l.note ? 'Edit note' : 'Add note'}
              </Button>
            </div>
            {l.note && noteFor !== l.key && <div className="review__note">Note: {l.note}</div>}
            {noteFor === l.key && (
              <div className="review__notes">
                <div className="chips">
                  {QUICK_NOTES.map((n) => {
                    const has = (l.note ?? '').toLowerCase().includes(n.toLowerCase());
                    return (
                      <Button
                        key={n}
                        type={has ? 'primary' : 'default'}
                        onClick={() => {
                          const parts = (l.note ?? '').split(',').map((x) => x.trim()).filter(Boolean);
                          setNote(l.key, (has ? parts.filter((p) => p.toLowerCase() !== n.toLowerCase()) : [...parts, n]).join(', '));
                        }}
                      >
                        {n}
                      </Button>
                    );
                  })}
                </div>
                <Input style={{ marginTop: 8 }} value={l.note ?? ''} onChange={(e) => setNote(l.key, e.target.value)} placeholder="Or type a note for the kitchen" maxLength={120} />
                <Button type="link" style={{ paddingLeft: 0 }} onClick={() => setNoteFor(null)}>
                  Done
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <Button type="link" onClick={onMore} style={{ paddingLeft: 0 }}>
        + Add more dishes
      </Button>

      <div className="flow__bar">
        <div className="flow__bar-info">
          <strong>Total</strong>
          <span>{formatINR(total)}</span>
        </div>
        <Button type="primary" size="large" className="flow__bar-btn" loading={placing} onClick={onPlace}>
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}
