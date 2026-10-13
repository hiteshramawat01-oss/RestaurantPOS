import { PlusOutlined } from '@ant-design/icons';
import { App, Button, Input, InputNumber, Modal, Switch } from 'antd';
import { useState } from 'react';
import { db } from '../../db/db';
import type { DiningTable, Room } from '../../db/types';
import { useActiveOrders, useRooms, useTables } from '../../hooks/data';
import { newId } from '../../lib/id';

export default function RoomsTablesSection() {
  const rooms = useRooms(true);
  const tables = useTables(true);
  const active = useActiveOrders();
  const { message } = App.useApp();
  const [edit, setEdit] = useState<{ table?: DiningTable; roomId: string } | null>(null);
  const [label, setLabel] = useState('');
  const [seats, setSeats] = useState<number | null>(4);
  const [roomEdit, setRoomEdit] = useState<Room | 'new' | null>(null);
  const [roomName, setRoomName] = useState('');

  if (!rooms || !tables) return null;
  const busy = new Set((active ?? []).map((a) => a.order.tableId));

  const saveTable = async () => {
    if (!edit) return;
    const l = label.trim();
    if (!l) return;
    const clash = tables.find((t) => t.label.toLowerCase() === l.toLowerCase() && t.id !== edit.table?.id);
    if (clash) {
      message.error(`Table ${l} already exists.`);
      return;
    }
    if (edit.table) await db.diningTables.update(edit.table.id, { label: l, seats: seats ?? 4 });
    else {
      const max = tables.filter((t) => t.roomId === edit.roomId).reduce((m, t) => Math.max(m, t.sortOrder), 0);
      await db.diningTables.add({ id: newId(), roomId: edit.roomId, label: l, seats: seats ?? 4, sortOrder: max + 1, active: true });
    }
    setEdit(null);
  };

  const toggleTable = async (t: DiningTable, on: boolean) => {
    if (!on && busy.has(t.id)) {
      message.error(`Table ${t.label} has an active order. Close it first.`);
      return;
    }
    await db.diningTables.update(t.id, { active: on });
  };

  const saveRoom = async () => {
    const n = roomName.trim();
    if (!n) return;
    if (roomEdit === 'new')
      await db.rooms.add({ id: newId(), name: n, sortOrder: rooms.reduce((m, r) => Math.max(m, r.sortOrder), 0) + 1, active: true });
    else if (roomEdit) await db.rooms.update(roomEdit.id, { name: n });
    setRoomEdit(null);
  };

  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        Turning a table off hides it from the Tables screen. Its past orders are kept.
      </p>
      {rooms.map((r) => {
        const rt = tables.filter((t) => t.roomId === r.id);
        return (
          <div key={r.id} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <strong style={{ fontSize: 17 }}>{r.name}</strong>
              <span className="muted">
                {rt.filter((t) => t.active).length} tables · {rt.filter((t) => t.active).reduce((s, t) => s + t.seats, 0)} seats
              </span>
              <Button
                size="small"
                type="link"
                onClick={() => {
                  setRoomEdit(r);
                  setRoomName(r.name);
                }}
              >
                Rename
              </Button>
            </div>
            <div className="rowlist">
              {rt.map((t) => (
                <div className="rowlist__row" key={t.id}>
                  <div style={{ fontSize: 20, fontWeight: 800, width: 52, opacity: t.active ? 1 : 0.4 }}>{t.label}</div>
                  <div className="rowlist__main">
                    <div className="rowlist__sub">{t.seats} seats{busy.has(t.id) ? ' · in use' : ''}</div>
                  </div>
                  <Button
                    onClick={() => {
                      setEdit({ table: t, roomId: r.id });
                      setLabel(t.label);
                      setSeats(t.seats);
                    }}
                  >
                    Edit
                  </Button>
                  <Switch checked={t.active} onChange={(v) => toggleTable(t, v)} aria-label={`Table ${t.label} in use`} />
                </div>
              ))}
              <button
                className="rowlist__row is-button"
                onClick={() => {
                  setEdit({ roomId: r.id });
                  setLabel('');
                  setSeats(4);
                }}
              >
                <PlusOutlined /> Add table to {r.name}
              </button>
            </div>
          </div>
        );
      })}
      <Button
        icon={<PlusOutlined />}
        onClick={() => {
          setRoomEdit('new');
          setRoomName('');
        }}
      >
        Add room
      </Button>

      <Modal open={!!edit} title={edit?.table ? `Edit table ${edit.table.label}` : 'Add table'} okText="Save" onOk={saveTable} onCancel={() => setEdit(null)} okButtonProps={{ disabled: !label.trim() }} centered destroyOnHidden>
        <div style={{ display: 'grid', gap: 12 }}>
          <label>
            Table number or name
            <Input size="large" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={6} placeholder="e.g. A7" />
          </label>
          <label>
            Seats
            <InputNumber size="large" min={1} max={30} value={seats} onChange={setSeats} style={{ width: '100%' }} />
          </label>
        </div>
      </Modal>
      <Modal open={!!roomEdit} title={roomEdit === 'new' ? 'Add room' : 'Rename room'} okText="Save" onOk={saveRoom} onCancel={() => setRoomEdit(null)} okButtonProps={{ disabled: !roomName.trim() }} centered destroyOnHidden>
        <Input size="large" value={roomName} onChange={(e) => setRoomName(e.target.value)} maxLength={20} placeholder="e.g. Terrace" />
      </Modal>
    </div>
  );
}
