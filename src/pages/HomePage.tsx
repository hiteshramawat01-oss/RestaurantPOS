import { PlusOutlined, PrinterOutlined } from '@ant-design/icons';
import { Spin } from 'antd';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AppMenu from '../components/AppMenu';
import { formatPrice } from '../domain/money';
import { hasFood, STAGE_LABEL, summarize, type OrderSummary } from '../domain/orderState';
import { useOpenOrders, useSettings } from '../hooks/data';
import { elapsed, useNow } from '../lib/time';

/**
 * Home: every order in progress as a card. Tap a card to print its kitchen
 * slip, add items, mark the food delivered or collect payment. Paid orders
 * leave this screen.
 */
export default function HomePage() {
  const data = useOpenOrders();
  const settings = useSettings();
  const navigate = useNavigate();
  const now = useNow();

  const orders = useMemo<OrderSummary[]>(() => {
    if (!data) return [];
    return data.orders
      .map((o) =>
        summarize(
          o,
          data.items.filter((i) => i.orderId === o.id),
          data.kots.filter((k) => k.orderId === o.id),
          data.tables,
          data.rooms,
        ),
      )
      .filter((s) => hasFood(s.items) || s.kots.length > 0)
      .sort((a, b) => a.order.createdAt - b.order.createdAt);
  }, [data]);

  return (
    <div className="home">
      <header className="appbar appbar--center">
        <AppMenu />
        <h1 className="appbar__title">{settings?.restaurant.name ?? ''}</h1>
        <span className="iconbtn-space" />
      </header>
      {orders.length > 0 && (
        <div className="home__section">
          {orders.length} order{orders.length === 1 ? '' : 's'} in progress
        </div>
      )}

      {!data ? (
        <Spin style={{ display: 'block', margin: '80px auto' }} />
      ) : orders.length === 0 ? (
        <div className="home__empty">
          <div className="home__empty-title">No orders right now</div>
          <div>Tap New order to take the first one.</div>
        </div>
      ) : (
        <div className="ogrid">
          {orders.map((s) => (
            <button
              key={s.order.id}
              className={`ocard is-${s.stage}`}
              onClick={() => navigate(`/order/${s.order.id}`)}
              aria-label={`${s.title}, ${STAGE_LABEL[s.stage]}`}
            >
              <div className="ocard__title">{s.title}</div>
              <div className="ocard__sub">{s.subtitle}</div>
              <div className="ocard__stage">
                <span className={`status is-${s.stage}`}>
                  {s.stage === 'partly' ? `${s.delivered} of ${s.servable} served` : STAGE_LABEL[s.stage]}
                </span>
              </div>
              <div className="ocard__money">
                {s.count} item{s.count === 1 ? '' : 's'} · {formatPrice(s.total)}
              </div>
              <div className="ocard__foot">
                <span>{elapsed(s.order.createdAt, now)}</span>
                {s.unprinted.length > 0 ? (
                  <span className="ocard__slip is-todo">
                    <PrinterOutlined /> Print slip
                  </span>
                ) : (
                  <span className="ocard__slip">
                    <PrinterOutlined /> Printed
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <button className="efab efab--lg efab--center" onClick={() => navigate('/new')}>
        <PlusOutlined />
        <span>New order</span>
      </button>

    </div>
  );
}
