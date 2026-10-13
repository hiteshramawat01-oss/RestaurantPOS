import { Button } from 'antd';
import { useState } from 'react';
import type { Staff } from '../db/types';
import { useSettings, useStaffList } from '../hooks/data';
import { useSession } from '../session';
import { APP_VERSION, BUILD_CHANNEL, BUILD_NUMBER } from '../version';

export default function SignIn() {
  const staff = useStaffList();
  const settings = useSettings();
  const { signIn } = useSession();
  const [who, setWho] = useState<Staff | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const pick = (s: Staff) => {
    if (s.pin && settings?.requirePin !== false) {
      setWho(s);
      setPin('');
      setError(false);
    } else signIn(s);
  };

  const press = (d: string) => {
    if (!who) return;
    const next = (pin + d).slice(0, who.pin!.length);
    setError(false);
    setPin(next);
    if (next.length === who.pin!.length) {
      if (next === who.pin) signIn(who);
      else {
        setError(true);
        setTimeout(() => setPin(''), 350);
      }
    }
  };

  if (who) {
    return (
      <div className="signin">
        <div className="signin__brand">{who.name}</div>
        <div className="muted" role="status" aria-live="polite">
          {error ? 'Wrong PIN. Try again.' : 'Enter your PIN'}
        </div>
        <div className="pinpad__dots" aria-hidden>
          {Array.from({ length: who.pin!.length }, (_, i) => (
            <i key={i} className={i < pin.length ? 'on' : ''} />
          ))}
        </div>
        <div className="pinpad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} onClick={() => press(d)}>
              {d}
            </button>
          ))}
          <button onClick={() => setWho(null)} style={{ fontSize: 15 }}>
            Back
          </button>
          <button onClick={() => press('0')}>0</button>
          <button onClick={() => setPin((p) => p.slice(0, -1))} style={{ fontSize: 15 }} aria-label="Delete digit">
            ⌫
          </button>
        </div>
      </div>
    );
  }

  const active = (staff ?? []).filter((s) => s.active).sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'owner' ? -1 : 1));
  return (
    <div className="signin">
      <div className="signin__brand">{settings?.restaurant.name ?? 'Restaurant POS'}</div>
      <div className="muted">Who is using the app?</div>
      <div className="signin__grid">
        {active.map((s) => (
          <button key={s.id} className="signin__who" onClick={() => pick(s)}>
            {s.name}
            <small>{s.role === 'owner' ? 'Owner' : 'Staff'}</small>
          </button>
        ))}
      </div>
      <div className="muted" style={{ marginTop: 28, fontSize: 13 }}>
        Version {APP_VERSION}
        {BUILD_CHANNEL === 'test' ? ` · test build ${BUILD_NUMBER}` : ''}
      </div>
      {active.length === 0 && staff && (
        <Button style={{ marginTop: 16 }} onClick={() => location.reload()}>
          Reload
        </Button>
      )}
    </div>
  );
}
