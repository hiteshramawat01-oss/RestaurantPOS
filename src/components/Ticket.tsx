import { EditOutlined, StopOutlined } from '@ant-design/icons';
import { App, Button, Input, Modal, Tag } from 'antd';
import { useState } from 'react';
import type { Order, OrderItem } from '../db/types';
import { formatINR, formatPrice } from '../domain/money';
import { lineAmount, orderTotal } from '../domain/totals';
import { setItemNote, setItemQty, voidSentItem } from '../services/orders';
import { useActor, useSession } from '../session';
import { usePrintFlow } from '../hooks/usePrintFlow';
import { useSettings } from '../hooks/data';
import { printKot } from '../printing/printService';

const QUICK_NOTES = ['Less spicy', 'Extra spicy', 'No onion', 'No garlic', 'Jain', 'Less oil', 'Parcel', 'Serve first'];

interface Props {
  order: Order | undefined;
  items: OrderItem[];
  kotNos: Map<string, number>;
  sending: boolean;
  onSend: () => void;
  onRequestBill: () => void;
}

export default function Ticket({ order, items, kotNos, sending, onSend, onRequestBill }: Props) {
  const { message } = App.useApp();
  const actor = useActor();
  const { isOwner } = useSession();
  const [noteFor, setNoteFor] = useState<OrderItem | null>(null);
  const [noteText, setNoteText] = useState('');
  const [voidFor, setVoidFor] = useState<OrderItem | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const printFlow = usePrintFlow();
  const settings = useSettings();

  const draft = items.filter((i) => !i.kotId).sort((a, b) => a.createdAt - b.createdAt);
  const sent = items.filter((i) => i.kotId).sort((a, b) => a.createdAt - b.createdAt);
  const draftQty = draft.reduce((s, i) => s + i.qty, 0);
  const editable = order?.status === 'open';

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="ticket">
      <div className="ticket__body">
        {items.length === 0 && (
          <div className="empty">
            <div className="empty__title">No items yet</div>
            Tap dishes on the menu to add them.
          </div>
        )}

        {draft.length > 0 && (
          <>
            <div className="ticket__section">
              New items <Tag color="gold">not sent yet</Tag>
            </div>
            {draft.map((i) => (
              <div className="tline" key={i.id}>
                <div>
                  <div className="tline__name">{i.name}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {formatPrice(i.unitPrice)} each
                  </div>
                </div>
                <div className="tline__amt money">{formatINR(lineAmount(i))}</div>
                {i.note && <div className="tline__note">Note: {i.note}</div>}
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div className="stepper">
                    <button aria-label={`One less ${i.name}`} disabled={!editable} onClick={() => run(() => setItemQty(i.id, i.qty - 1))}>
                      −
                    </button>
                    <span aria-label="Quantity">{i.qty}</span>
                    <button aria-label={`One more ${i.name}`} disabled={!editable} onClick={() => run(() => setItemQty(i.id, i.qty + 1))}>
                      +
                    </button>
                  </div>
                  <Button
                    icon={<EditOutlined />}
                    disabled={!editable}
                    onClick={() => {
                      setNoteFor(i);
                      setNoteText(i.note ?? '');
                    }}
                  >
                    {i.note ? 'Edit note' : 'Note'}
                  </Button>
                </div>
              </div>
            ))}
          </>
        )}

        {sent.length > 0 && (
          <>
            <div className="ticket__section">Sent to kitchen</div>
            {sent.map((i) => (
              <div className={`tline is-sent${i.voided ? ' is-void' : ''}`} key={i.id}>
                <div>
                  <div className="tline__name">
                    {i.qty} × {i.name}
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    KOT #{kotNos.get(i.kotId!) ?? '…'}
                    {i.voided && ` · voided: ${i.voidReason}`}
                  </div>
                </div>
                <div className="tline__amt money">
                  {formatINR(lineAmount(i))}
                  {isOwner && !i.voided && editable && (
                    <div>
                      <Button
                        size="small"
                        type="text"
                        danger
                        icon={<StopOutlined />}
                        onClick={() => {
                          setVoidFor(i);
                          setVoidReason('');
                        }}
                      >
                        Void
                      </Button>
                    </div>
                  )}
                </div>
                {i.note && <div className="tline__note">Note: {i.note}</div>}
              </div>
            ))}
          </>
        )}
      </div>

      <div className="ticket__foot">
        <div className="ticket__total">
          <span>Total</span>
          <span className="money">{formatINR(orderTotal(items))}</span>
        </div>
        {editable ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <Button type="primary" className="btn-xl" block loading={sending} disabled={draftQty === 0 || sending} onClick={onSend}>
              {draftQty > 0 ? `Send to kitchen (${draftQty})` : 'Nothing new to send'}
            </Button>
            <Button size="large" block disabled={sent.length === 0 || draftQty > 0 || sending} onClick={onRequestBill}>
              Request bill
            </Button>
            {draftQty > 0 && sent.length > 0 && (
              <div className="muted" style={{ fontSize: 13, textAlign: 'center' }}>
                Send the new items before requesting the bill.
              </div>
            )}
          </div>
        ) : null}
      </div>

      <Modal
        open={!!noteFor}
        title={noteFor ? `Note for ${noteFor.name}` : ''}
        okText="Save note"
        onCancel={() => setNoteFor(null)}
        onOk={() =>
          run(async () => {
            if (noteFor) await setItemNote(noteFor.id, noteText);
            setNoteFor(null);
          })
        }
        destroyOnHidden
        centered
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {QUICK_NOTES.map((n) => (
            <Button
              key={n}
              onClick={() => setNoteText((t) => (t.toLowerCase().includes(n.toLowerCase()) ? t : t ? `${t}, ${n}` : n))}
            >
              {n}
            </Button>
          ))}
        </div>
        <Input.TextArea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          maxLength={120}
          showCount
          autoSize={{ minRows: 2, maxRows: 4 }}
          placeholder="Preparation note for the kitchen"
        />
        {noteText && (
          <Button type="link" style={{ paddingLeft: 0 }} onClick={() => setNoteText('')}>
            Clear note
          </Button>
        )}
      </Modal>

      <Modal
        open={!!voidFor}
        title={voidFor ? `Void ${voidFor.qty} × ${voidFor.name}?` : ''}
        okText="Void and print slip"
        okButtonProps={{ danger: true, disabled: !voidReason.trim() }}
        onCancel={() => setVoidFor(null)}
        onOk={() =>
          run(async () => {
            if (!voidFor) return;
            const kot = await voidSentItem(voidFor.id, voidReason, actor);
            setVoidFor(null);
            if (settings?.printer.autoPrintKot)
              await printFlow({ docType: 'kot', id: kot.id, label: `Cancel slip KOT #${kot.kotNo}`, run: () => printKot(kot.id) });
            else message.success('Item voided. Print the cancel slip from Orders → Kitchen tickets.');
          })
        }
        destroyOnHidden
        centered
      >
        <p>The kitchen gets a CANCEL / VOID slip. The item is removed from the bill and kept in the record.</p>
        <Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Reason (required)" maxLength={80} />
      </Modal>
    </div>
  );
}
