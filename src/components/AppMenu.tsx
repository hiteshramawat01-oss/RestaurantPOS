import { BarChartOutlined, FileTextOutlined, HomeOutlined, MenuOutlined, SettingOutlined } from '@ant-design/icons';
import { Drawer } from 'antd';
import { useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSettings } from '../hooks/data';
import { APP_VERSION } from '../version';

const LINKS = [
  { to: '/', label: 'Orders', icon: <HomeOutlined /> },
  { to: '/sales', label: 'Sales', icon: <BarChartOutlined /> },
  { to: '/menu', label: 'Dishes and prices', icon: <FileTextOutlined /> },
  { to: '/settings', label: 'Printer and updates', icon: <SettingOutlined /> },
];

/** Navigation icon (48dp) that opens the modal navigation drawer. */
export default function AppMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const settings = useSettings();
  return (
    <>
      <button className="iconbtn" onClick={() => setOpen(true)} aria-label="Open app menu">
        <MenuOutlined />
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        placement="left"
        size="min(360px, 85vw)"
        closable={false}
        rootClassName="navdrawer"
      >
        <div className="navdrawer__headline">{settings?.restaurant.name ?? ''}</div>
        <nav>
          {LINKS.map((l) => (
            <button
              key={l.to}
              className={`navdrawer__item${pathname === l.to ? ' is-on' : ''}`}
              aria-current={pathname === l.to ? 'page' : undefined}
              onClick={() => {
                setOpen(false);
                navigate(l.to);
              }}
            >
              {l.icon}
              <span>{l.label}</span>
            </button>
          ))}
        </nav>
        <div className="navdrawer__foot">Version {APP_VERSION}</div>
      </Drawer>
    </>
  );
}

/** Small top app bar (64dp): navigation icon, title, optional trailing actions. */
export function TopBar({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <header className="appbar">
      <AppMenu />
      <h1 className="appbar__title">{title}</h1>
      {right && <div className="appbar__actions">{right}</div>}
    </header>
  );
}

/** Top app bar for full-screen tasks: back arrow, title + subtitle, optional trailing icon. */
export function TaskBar({ title, sub, onBack, backLabel, trailing }: { title: string; sub?: ReactNode; onBack?: () => void; backLabel: string; trailing?: ReactNode }) {
  return (
    <header className="appbar">
      {onBack ? (
        <button className="iconbtn" onClick={onBack} aria-label={backLabel}>
          <BackIcon />
        </button>
      ) : (
        <span className="iconbtn-space" />
      )}
      <div className="appbar__titles">
        <h1 className="appbar__title">{title}</h1>
        {sub && <div className="appbar__sub">{sub}</div>}
      </div>
      {trailing}
    </header>
  );
}

function BackIcon() {
  // Material "arrow_back" (24dp)
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" style={{ position: 'relative' }}>
      <path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
    </svg>
  );
}
