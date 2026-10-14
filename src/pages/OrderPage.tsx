import { ArrowLeftOutlined, CloseCircleFilled, EditOutlined, MoreOutlined, SearchOutlined } from '@ant-design/icons';
import { Alert, App, Button, Drawer, Dropdown, Input, Modal, Select, Spin } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Ticket from '../components/Ticket';
import { db } from '../db/db';
import type { MenuItem, Order } from '../db/types';
import { formatINR, formatPrice } from '../domain/money';
import { orderTotal } from '../domain/totals';
import { useActiveOrders, useSettings, useTables } from '../hooks/data';
import { usePrintFlow } from '../hooks/usePrintFlow';
import { elapsed, useNow } from '../lib/time';
import { printKot } from '../printing/printService';
import {
  addItem,
  cancelOrder,
  discardIfEmpty,
  getActiveOrderForTable,
  isActive,
  moveOrder,
  openOrderForTable,
  reopenOrder,
  requestBill,
  sendToKitchen,
  setCustomerName,
} from '../services/orders';
import { useActor, useSession } from '../session';

export default function OrderPage() {
  // Dine-in orders are opened by table (/order/:tableId);
  // takeaway orders by order id (/takeaway/:orderId).
  const { tableId = '', orderId = '' } = useParams();
  const takeaway = !!orderId;
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const actor = useActor();
  const { isOwner } = useSession();
  const settings = useSettings();
  const printFlow = usePrintFlow();
  const now = useNow();

  const table = useLiveQuery(async () => (takeaway ? null : ((await db.diningTables.get(tableId)) ?? null)), [tableId, takeaway]);
  const room = useLiveQuery(async () => (table ? db.rooms.get(table.roomId) : undefined), [table?.roomId]);
  const orderBox = useLiveQuery(async () => {
    if (!takeaway) return { order: await getActiveOrderForTable(tableId) };
    const o = await db.orders.get(orderId);
    return { order: isActive(o) ? o : undefined, closed: !!o && !isActive(o) };
  }, [tableId, orderId, takeaway]);
  const order = orderBox?.order;
  const items = useLiveQuery(async () => (order ? db.orderItems.where('orderId').equals(order.id).toArray() : []), [order?.id]) ?? [];
  const kotNos = useLiveQuery(async () => {
    if (!order) return new Map<string, number>();
    const k = await db.kots.where('orderId').equals(order.id).toArray();
    return new Map(k.map((x) => [x.id, x.kotNo]));
  }, [order?.id]) ?? new Map<string, number>();
  const categories = useLiveQuery(() => db.categories.orderBy('sortOrder').filter((c) => c.active).toArray(), []);
  const menu = useLiveQuery(() => db.menuItems.orderBy('sortOrder').filter((m) => m.active).toArray(), []);

  const [cat, setCat] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [drawer, setDrawer] = useState(false);
  const [sending, setSending] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [nameText, setNameText] = useState('');
  const [sizeFor, setSizeFor] = useState<MenuItem | null>(null);

  // Remember the order id to drop it if the waiter leaves without adding anything.
  const orderIdRef = useRef<string | undefined>(undefined);
  orderIdRef.current = order?.id;
  useEffect(() => () => {
    if (orderIdRef.current) void discardIfEmpty(orderIdRef.current);
  }, []);

  const opening = useRef<Promise<Order> | null>(null);
  const ensureOrder = async (): Promise<Order> => {
    if (order) return order;
    if (takeaway) throw new Error('This takeaway order is closed.');
    if (!opening.current) opening.current = openOrderForTable(tableId, actor).finally(() => (opening.current = null));
    return opening.current;
  };

  const activeCat = cat ?? categories?.[0]?.id ?? null;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = menu ?? [];
    if (q) return list.filter((m) => m.name.toLowerCase().includes(q));
    return list.filter((m) => m.categoryId === activeCat);
  }, [menu, query, activeCat]);

  const draftQty = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) if (!i.kotId) m.set(i.menuItemId, (m.get(i.menuItemId) ?? 0) + i.qty);
    return m;
  }, [items]);
  const newCount = items.filter((i) => !i.kotId).reduce((s, i) => s + i.qty, 0);

  if (table === undefined || orderBox === undefined || !categories || !menu)
    return <Spin style={{ display: 'block', margin: '80px auto' }} />;
  if (takeaway ? !order : !table)
    return (
      <div className="page">
        <Alert
          type={takeaway ? 'info' : 'error'}
          showIcon
          message={takeaway ? 'This takeaway order is closed.' : 'This table no longer exists.'}
          action={<Button onClick={() => navigate('/tables')}>Back to tables</Button>}
        />
      </div>
    );
  const heading = takeaway ? `Takeaway #${order!.orderNo}` : `Table ${table!.label}`;

  const add = async (m: MenuItem, variant?: string) => {
    if (m.variants?.length && !variant) {
      setSizeFor(m); // ask Half / Full first
      return;
    }
    try {
      const o = await ensureOrder();
      await addItem(o.id, m, 1, variant);
      navigator.vibrate?.(8);
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  };

  const send = async () => {
    if (!order || sending) return;
    setSending(true);
    try {
      const kot = await sendToKitchen(order.id, actor);
      setDrawer(false);
      if (settings?.printer.autoPrintKot) {
        await printFlow({ docType: 'kot', id: kot.id, label: `KOT #${kot.kotNo}`, run: () => printKot(kot.id) });
      } else {
        message.success(`KOT #${kot.kotNo} saved. Print it from Orders.`);
      }
      navigate('/tables');
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const askBill = async () => {
    if (!order) return;
    try {
      await requestBill(order.id);
      navigate(`/billing/${order.id}`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  };

  const ticket = (
    <Ticket order={order} items={items} kotNos={kotNos} sending={sending} onSend={send} onRequestBill={askBill} />
  );

  const menuActions = [
    ...(takeaway
      ? [{ key: 'name', label: order?.customerName ? 'Change customer name' : 'Add customer name' }]
      : [{ key: 'move', label: 'Move to another table', disabled: !order || !isOwner }]),
    { key: 'cancel', label: 'Cancel order', danger: true, disabled: !order || !isOwner },
  ];

  return (
    <div className="order">
      <div className="order__menu">
        <div className="order__head">
          <Button
            size="large"
            shape="circle"
            icon={<ArrowLeftOutlined />}
            aria-label="Back to tables"
            onClick={() => {
              if (newCount > 0)
                modal.confirm({
                  title: 'Leave without sending?',
                  content: `${newCount} new item(s) are saved on this table but not sent to the kitchen yet.`,
                  okText: 'Leave',
                  cancelText: 'Stay',
                  centered: true,
                  onOk: () => navigate('/tables'),
                });
              else navigate('/tables');
            }}
          />
          <div style={{ minWidth: 0 }}>
            <div className="order__table">
              {heading}{' '}
              <span className="muted" style={{ fontWeight: 600, fontSize: 16 }}>
                {takeaway ? order?.customerName ?? '' : room?.name}
              </span>
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              {takeaway
                ? `Parcel · ${elapsed(order!.createdAt, now)}`
                : order
                  ? `Order #${order.orderNo} · ${elapsed(order.createdAt, now)}`
                  : 'New order'}
            </div>
            {takeaway && !order?.customerName && (
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                style={{ padding: 0, height: 'auto' }}
                onClick={() => {
                  setNameText('');
                  setNameOpen(true);
                }}
              >
                Add name (optional)
              </Button>
            )}
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <Dropdown
              trigger={['click']}
              menu={{
                items: menuActions,
                onClick: ({ key }) => {
                  if (key === 'move') setMoveOpen(true);
                  else if (key === 'name') {
                    setNameText(order?.customerName ?? '');
                    setNameOpen(true);
                  } else setCancelOpen(true);
                },
              }}
            >
              <Button size="large" shape="circle" icon={<MoreOutlined />} aria-label="More actions" />
            </Dropdown>
          </div>
        </div>

        {order?.status === 'billing' && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message="The bill has been requested for this table."
            action={
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  onClick={async () => {
                    try {
                      await reopenOrder(order.id, actor);
                    } catch (e) {
                      message.error(e instanceof Error ? e.message : String(e));
                    }
                  }}
                >
                  Reopen
                </Button>
                <Button type="primary" onClick={() => navigate(`/billing/${order.id}`)}>
                  Go to bill
                </Button>
              </div>
            }
          />
        )}

        <Input
          size="large"
          allowClear={{ clearIcon: <CloseCircleFilled style={{ fontSize: 18 }} /> }}
          prefix={<SearchOutlined />}
          placeholder="Search dishes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          inputMode="search"
          enterKeyHint="search"
        />

        {!query && (
          <div className="cats" role="tablist" aria-label="Categories">
            {categories.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={c.id === activeCat}
                className={`cats__chip${c.id === activeCat ? ' is-active' : ''}`}
                onClick={() => setCat(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
        {query && <div style={{ height: 12 }} />}

        {shown.length === 0 ? (
          <div className="empty">
            <div className="empty__title">{query ? `No dish matches “${query}”` : 'No dishes in this category'}</div>
            {query ? 'Check the spelling or clear the search.' : 'Add dishes in the Menu section.'}
          </div>
        ) : (
          <div className="dish-grid">
            {shown.map((m) => {
              const q = draftQty.get(m.id);
              const disabled = !m.available || order?.status === 'billing';
              return (
                <button key={m.id} className="dish" disabled={disabled} onClick={() => add(m)} aria-label={`Add ${m.name}, ${priceText(m)}`}>
                  {q ? <span className="dish__qty">{q}</span> : null}
                  <span className="dish__name">
                    {m.veg !== undefined && <i className={`veg-dot${m.veg ? '' : ' is-nonveg'}`} aria-label={m.veg ? 'Veg' : 'Non-veg'} />}
                    {m.name}
                  </span>
                  <span className="dish__price">{m.available ? priceText(m) : 'Unavailable'}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <aside className="order__ticket" aria-label="Order ticket">
        <div style={{ padding: '16px 16px 0', fontWeight: 800, fontSize: 18 }}>Ticket</div>
        {ticket}
      </aside>

      {items.length > 0 && (
        <button className="cartbar" onClick={() => setDrawer(true)}>
          <span>
            <span className="cartbar__count">{newCount > 0 ? `${newCount} new` : 'All sent'}</span>
            <br />
            <span style={{ opacity: 0.85, fontSize: 13 }}>{newCount > 0 ? 'Review and send' : 'View order'}</span>
          </span>
          <span className="cartbar__total money">{formatINR(orderTotal(items))}</span>
        </button>
      )}

      <Modal
        open={!!sizeFor}
        title={sizeFor?.name}
        footer={null}
        onCancel={() => setSizeFor(null)}
        centered
        destroyOnHidden
        width={380}
      >
        <div className="sizes">
          {sizeFor?.variants?.map((v) => (
            <button
              key={v.label}
              className="sizes__btn"
              onClick={() => {
                const m = sizeFor;
                setSizeFor(null);
                void add(m, v.label);
              }}
            >
              <span className="sizes__label">{v.label}</span>
              <span className="sizes__price">{formatPrice(v.price)}</span>
            </button>
          ))}
        </div>
      </Modal>

      <Drawer
        placement="bottom"
        open={drawer}
        onClose={() => setDrawer(false)}
        size="88%"
        title={takeaway ? `${heading}${order?.customerName ? ` · ${order.customerName}` : ''}` : `${heading} · ${room?.name ?? ''}`}
        styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' } }}
      >
        {ticket}
      </Drawer>

      {order && takeaway && (
        <Modal
          open={nameOpen}
          title="Customer name"
          okText="Save name"
          onCancel={() => setNameOpen(false)}
          onOk={async () => {
            try {
              await setCustomerName(order.id, nameText);
              setNameOpen(false);
            } catch (e) {
              message.error(e instanceof Error ? e.message : String(e));
            }
          }}
          centered
          destroyOnHidden
        >
          <p className="muted">Printed on the kitchen slip and bill so the parcel goes to the right person.</p>
          <Input size="large" value={nameText} onChange={(e) => setNameText(e.target.value)} maxLength={30} placeholder="Name or phone" autoFocus />
        </Modal>
      )}

      {order && !takeaway && (
        <MoveTableModal
          open={moveOpen}
          onClose={() => setMoveOpen(false)}
          order={order}
          onMoved={(newTableId) => {
            setMoveOpen(false);
            navigate(`/order/${newTableId}`, { replace: true });
          }}
        />
      )}

      {order && (
        <CancelOrderModal
          open={cancelOpen}
          onClose={() => setCancelOpen(false)}
          onConfirm={async (reason) => {
            await cancelOrder(order.id, reason, actor);
            setCancelOpen(false);
            message.success(`Order #${order.orderNo} cancelled`);
            navigate('/tables');
          }}
        />
      )}
    </div>
  );
}

function MoveTableModal({ open, onClose, order, onMoved }: { open: boolean; onClose: () => void; order: Order; onMoved: (tableId: string) => void }) {
  const tables = useTables();
  const active = useActiveOrders();
  const rooms = useLiveQuery(() => db.rooms.toArray(), []);
  const actor = useActor();
  const { message } = App.useApp();
  const [target, setTarget] = useState<string>();
  const busy = new Set((active ?? []).map((a) => a.order.tableId));
  const free = (tables ?? []).filter((t) => !busy.has(t.id));
  const roomName = (id: string) => rooms?.find((r) => r.id === id)?.name ?? '';
  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={`Move order #${order.orderNo}`}
      okText="Move order"
      okButtonProps={{ disabled: !target }}
      centered
      destroyOnHidden
      onOk={async () => {
        if (!target) return;
        try {
          await moveOrder(order.id, target, actor);
          message.success('Order moved');
          onMoved(target);
        } catch (e) {
          message.error(e instanceof Error ? e.message : String(e));
        }
      }}
    >
      <p>Choose a free table. Kitchen tickets printed earlier still show the old table number.</p>
      <Select
        size="large"
        style={{ width: '100%' }}
        placeholder="Free table"
        value={target}
        onChange={setTarget}
        options={free.map((t) => ({ value: t.id, label: `${t.label} (${roomName(t.roomId)}, ${t.seats} seats)` }))}
        notFoundContent="No free tables"
      />
    </Modal>
  );
}

export function CancelOrderModal({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const { message } = App.useApp();
  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Cancel this order?"
      okText="Cancel order"
      cancelText="Keep order"
      okButtonProps={{ danger: true, disabled: !reason.trim(), loading: busy }}
      centered
      destroyOnHidden
      onOk={async () => {
        setBusy(true);
        try {
          await onConfirm(reason);
          setReason('');
        } catch (e) {
          message.error(e instanceof Error ? e.message : String(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>The order stays in the records, marked cancelled. It is not counted in sales.</p>
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" maxLength={80} />
    </Modal>
  );
}

/** "₹120 / ₹220" for two-size dishes, "₹320" otherwise. */
function priceText(m: MenuItem): string {
  return m.variants?.length ? m.variants.map((v) => formatPrice(v.price)).join(' / ') : formatPrice(m.price);
}
