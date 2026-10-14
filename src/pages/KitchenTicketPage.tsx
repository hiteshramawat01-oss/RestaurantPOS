import { ArrowLeftOutlined, PrinterOutlined } from '@ant-design/icons';
import { Alert, App, Button, Spin, Tag } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ReceiptPreview from '../components/ReceiptPreview';
import { db } from '../db/db';
import type { KitchenStatus } from '../db/types';
import { kotPlace, orderPath } from '../domain/place';
import { useSettings } from '../hooks/data';
import { usePrintFlow } from '../hooks/usePrintFlow';
import { elapsed, timeOf, useNow } from '../lib/time';
import { confirmBrowserPrint, printKot } from '../printing/printService';
import { kotBlocks } from '../printing/receipt';
import { KITCHEN_STATUSES, kitchenStatusOf, setKitchenStatus } from '../services/orders';
import { KIND_TAG, STATUS_LABEL } from './kitchenLabels';

/** One kitchen ticket: print or reprint it, and move it through New → Preparing → Ready → Served. */
export default function KitchenTicketPage() {
  const { kotId = '' } = useParams();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const printFlow = usePrintFlow();
  const settings = useSettings();
  const now = useNow();
  const [printing, setPrinting] = useState(false);
  const [showSlip, setShowSlip] = useState(false);

  const kot = useLiveQuery(async () => (await db.kots.get(kotId)) ?? null, [kotId]);
  const order = useLiveQuery(async () => (kot ? ((await db.orders.get(kot.orderId)) ?? null) : undefined), [kot?.orderId]);

  if (kot === undefined) return <Spin style={{ display: 'block', margin: '80px auto' }} />;
  if (kot === null)
    return (
      <div className="page">
        <Alert type="error" showIcon message="Kitchen ticket not found." action={<Button onClick={() => navigate('/kitchen')}>Back</Button>} />
      </div>
    );

  const status = kitchenStatusOf(kot);
  const printed = kot.printStatus === 'printed';

  const print = async () => {
    const run = async () => {
      setPrinting(true);
      try {
        await printFlow({ docType: 'kot', id: kot.id, label: `KOT #${kot.kotNo}`, run: () => printKot(kot.id, { reprint: printed }) }, printed);
      } finally {
        setPrinting(false);
      }
    };
    if (printed)
      modal.confirm({
        title: `Print KOT #${kot.kotNo} again?`,
        content: 'The copy is marked “REPRINT – NOT A NEW ORDER” so the kitchen does not cook it twice.',
        okText: 'Reprint',
        centered: true,
        onOk: run,
      });
    else await run();
  };

  const setStatus = async (s: KitchenStatus) => {
    if (s === status) return;
    try {
      await setKitchenStatus(kot.id, s);
      if (s === 'served') {
        message.success(`KOT #${kot.kotNo} served`);
        navigate('/kitchen');
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="page" style={{ maxWidth: 620 }}>
      <div className="page__head">
        <Button size="large" shape="circle" icon={<ArrowLeftOutlined />} aria-label="Back to kitchen tickets" onClick={() => navigate('/kitchen')} />
        <div style={{ minWidth: 0 }}>
          <h1 className="page__title">KOT #{kot.kotNo}</h1>
          <div className="page__sub">
            {kotPlace(kot)}
            {kot.roomName ? ` · ${kot.roomName}` : ''} · {timeOf(kot.createdAt)} ({elapsed(kot.createdAt, now)})
          </div>
        </div>
      </div>

      {(kot.kind !== 'NEW' || order?.status === 'cancelled') && (
        <div style={{ marginBottom: 12 }}>
          {kot.kind !== 'NEW' && <Tag color={KIND_TAG[kot.kind].color}>{KIND_TAG[kot.kind].label}</Tag>}
          {order?.status === 'cancelled' && <Tag color="red">Order cancelled</Tag>}
        </div>
      )}

      <section className="panel">
        <ul className="kdetail__lines">
          {kot.lines.map((l, i) => (
            <li key={i}>
              <span className="kdetail__qty">{l.qty} ×</span>
              <span>
                {l.name}
                {l.note && <div className="kcard__note">{l.note}</div>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2 className="panel__title">Status</h2>
        <div className="kstatus-pick" role="radiogroup" aria-label="Ticket status">
          {KITCHEN_STATUSES.map((s) => (
            <button key={s} role="radio" aria-checked={s === status} className={`kstatus-pick__btn is-${s}${s === status ? ' is-on' : ''}`} onClick={() => setStatus(s)}>
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2 className="panel__title">Print</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {kot.printStatus === 'printed'
            ? `Printed${kot.printCount > 1 ? ` ${kot.printCount} times` : ''}.`
            : kot.printStatus === 'failed'
              ? `Not printed: ${kot.lastError ?? 'the printer did not respond.'}`
              : kot.printStatus === 'awaiting_confirmation'
                ? 'Waiting for you to confirm the last print.'
                : 'Not printed yet.'}
        </p>
        {kot.printStatus === 'awaiting_confirmation' ? (
          <div className="pay-grid">
            <Button type="primary" className="btn-xl" onClick={() => confirmBrowserPrint('kot', kot.id, true)}>
              It printed
            </Button>
            <Button className="btn-xl" onClick={() => confirmBrowserPrint('kot', kot.id, false)}>
              Didn’t print
            </Button>
          </div>
        ) : (
          <Button type={printed ? 'default' : 'primary'} className="btn-xl" block icon={<PrinterOutlined />} loading={printing} onClick={print}>
            {printed ? 'Print again' : kot.printStatus === 'failed' ? 'Try printing again' : 'Print ticket'}
          </Button>
        )}
        <Button type="link" style={{ paddingLeft: 0, marginTop: 6 }} onClick={() => setShowSlip((v) => !v)}>
          {showSlip ? 'Hide slip' : 'See how the slip looks'}
        </Button>
        {showSlip && <ReceiptPreview blocks={kotBlocks(kot, { restaurantName: settings?.restaurant.name ?? '' })} width={settings?.printer.paperWidth ?? 80} />}
      </section>

      {order && (order.status === 'open' || order.status === 'billing') && (
        <Button size="large" block style={{ marginTop: 16 }} onClick={() => navigate(orderPath(order))}>
          Open the order
        </Button>
      )}
    </div>
  );
}
