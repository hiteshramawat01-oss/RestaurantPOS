import { FileTextOutlined, HomeOutlined, MenuOutlined, SettingOutlined } from '@ant-design/icons';
import { Drawer } from 'antd';
import { useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSettings } from '../hooks/data';
import { APP_VERSION } from '../version';

const LINKS = [
  { to: '/', label: 'Orders', icon: <HomeOutlined /> },
  { to: '/menu', label: 'Dishes and prices', icon: <FileTextOutlined /> },
  { to: '/settings', label: 'Printer and updates', icon: <SettingOutlined /> },
];

/** Round "App Menu" button that opens the side menu. */
export default function AppMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const settings = useSettings();
  return (
    <>
      <button className="appmenu-btn" onClick={() => setOpen(true)} aria-label="Open app menu">
        <MenuOutlined />
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} placement="left" size={300} title={settings?.restaurant.name ?? 'Menu'}>
        <nav className="appmenu">
          {LINKS.map((l) => (
            <button
              key={l.to}
              className={`appmenu__item${pathname === l.to ? ' is-on' : ''}`}
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
        <div className="muted" style={{ fontSize: 13, marginTop: 24 }}>
          Version {APP_VERSION}
        </div>
      </Drawer>
    </>
  );
}

/** Header for inner screens: app menu, title, optional action on the right. */
export function TopBar({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <header className="topbar">
      <AppMenu />
      <h1 className="topbar__title">{title}</h1>
      <div className="topbar__right">{right}</div>
    </header>
  );
}
