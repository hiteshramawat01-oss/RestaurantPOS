import { Spin, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { formatINR } from '../domain/money';
import { itemCount, orderTotal } from '../domain/totals';
import { useActiveOrders, useRooms, useTables } from '../hooks/data';
import { elapsed, useNow } from '../lib/time';

export default function BillingListPage() {
  const active = useActiveOrders();
  const tables = useTables(true);
  const rooms = useRooms(true);
  const navigate = useNavigate();
  const now = useNow();
  if (!active || !tables || !rooms) return <Spin style={{ display: 'block', margin: '80px auto' }} />;

  const withItems = active.filter((a) => a.items.some((i) => !i.voided));
  const pending = withItems.filter((a) => a.order.status === 'billing');
  const open = withItems.filter((a) => a.order.status === 'open');

  const row = ({ order, items }: (typeof active)[number]) => {
    const t = tables.find((x) => x.id === order.tableId);
    const r = rooms.find((x) => x.id === order.roomId);
    return (
      <button key={order.id} className="rowlist__row is-button" onClick={() => navigate(`/billing/${order.id}`)}>
        <div style={{ fontSize: 22, fontWeight: 800, width: 52 }}>{t?.label}</div>
        <div className="rowlist__main">
          <div className="rowlist__title">
            Order #{order.orderNo} {order.invoiceId && <Tag color="magenta">Invoice issued</Tag>}
          </div>
          <div className="rowlist__sub">
            {r?.name} · {itemCount(items)} items · {elapsed(order.createdAt, now)}
          </div>
        </div>
        <div className="money" style={{ fontWeight: 800, fontSize: 17 }}>
          {formatINR(orderTotal(items))}
        </div>
      </button>
    );
  };

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page__title">Billing</h1>
      </div>
      <h2 className="panel__title">Bill pending</h2>
      {pending.length ? (
        <div className="rowlist">{pending.map(row)}</div>
      ) : (
        <div className="empty panel">
          <div className="empty__title">No bills waiting</div>
          Tables appear here after “Request bill” on the order screen.
        </div>
      )}
      {open.length > 0 && (
        <>
          <h2 className="panel__title" style={{ marginTop: 24 }}>
            Other open orders
          </h2>
          <div className="rowlist">{open.map(row)}</div>
        </>
      )}
    </div>
  );
}
