import { PlusOutlined } from '@ant-design/icons';
import { App, Button, Input, Modal, Radio, Switch, Tag } from 'antd';
import { useState } from 'react';
import { db } from '../../db/db';
import type { AppSettings, Staff, StaffRole } from '../../db/types';
import { useStaffList } from '../../hooks/data';
import { newId } from '../../lib/id';
import { useSession } from '../../session';

export default function StaffSection({ settings }: { settings: AppSettings }) {
  const staff = useStaffList();
  const { staff: me } = useSession();
  const { message } = App.useApp();
  const [edit, setEdit] = useState<Staff | 'new' | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState<StaffRole>('staff');
  const [pin, setPin] = useState('');

  if (!staff) return null;
  const activeOwners = staff.filter((s) => s.active && s.role === 'owner');

  const open = (s: Staff | 'new') => {
    setEdit(s);
    setName(s === 'new' ? '' : s.name);
    setRole(s === 'new' ? 'staff' : s.role);
    setPin(s === 'new' ? '' : (s.pin ?? ''));
  };

  const save = async () => {
    const n = name.trim();
    if (!n) return;
    if (pin && !/^\d{4,6}$/.test(pin)) {
      message.error('PIN must be 4 to 6 digits.');
      return;
    }
    if (role === 'owner' && !pin) {
      message.error('Owners need a PIN so others cannot use owner actions.');
      return;
    }
    if (edit !== 'new' && edit?.role === 'owner' && role !== 'owner' && activeOwners.length <= 1) {
      message.error('There must be at least one owner.');
      return;
    }
    if (edit === 'new') await db.staff.add({ id: newId(), name: n, role, pin: pin || undefined, active: true });
    else if (edit) await db.staff.update(edit.id, { name: n, role, pin: pin || undefined });
    setEdit(null);
    message.success('Saved');
  };

  const toggle = async (s: Staff, on: boolean) => {
    if (!on && s.role === 'owner' && activeOwners.length <= 1) {
      message.error('There must be at least one active owner.');
      return;
    }
    if (!on && s.id === me?.id) {
      message.error('You cannot turn off your own account while signed in.');
      return;
    }
    await db.staff.update(s.id, { active: on });
  };

  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        Names appear on kitchen slips and bills. The owner role can give discounts, void items, move tables, cancel bills
        and change settings. PINs are a simple lock on this device, not strong security.
      </p>
      <div className="rowlist" style={{ marginBottom: 12 }}>
        {staff.map((s) => (
          <div className="rowlist__row" key={s.id}>
            <div className="rowlist__main" style={{ opacity: s.active ? 1 : 0.5 }}>
              <div className="rowlist__title">
                {s.name} {s.role === 'owner' && <Tag color="blue">Owner</Tag>}
              </div>
              <div className="rowlist__sub">{s.pin ? 'PIN set' : 'No PIN'}</div>
            </div>
            <Button onClick={() => open(s)}>Edit</Button>
            <Switch checked={s.active} onChange={(v) => toggle(s, v)} aria-label={`${s.name} active`} />
          </div>
        ))}
        <button className="rowlist__row is-button" onClick={() => open('new')}>
          <PlusOutlined /> Add staff member
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Switch checked={settings.requirePin} onChange={(v) => db.settings.update('app', { requirePin: v })} />
        Ask for the PIN when someone with a PIN signs in
      </div>

      <Modal open={!!edit} title={edit === 'new' ? 'Add staff member' : 'Edit staff member'} okText="Save" okButtonProps={{ disabled: !name.trim() }} onOk={save} onCancel={() => setEdit(null)} centered destroyOnHidden>
        <div style={{ display: 'grid', gap: 12 }}>
          <label>
            Name
            <Input size="large" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
          </label>
          <Radio.Group
            value={role}
            onChange={(e) => setRole(e.target.value)}
            optionType="button"
            buttonStyle="solid"
            size="large"
            options={[
              { value: 'staff', label: 'Staff' },
              { value: 'owner', label: 'Owner' },
            ]}
          />
          <label>
            PIN (4–6 digits{role === 'owner' ? ', required for owners' : ', optional'})
            <Input.Password size="large" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" />
          </label>
        </div>
      </Modal>
    </div>
  );
}
