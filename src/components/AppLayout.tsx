import {
  AppstoreOutlined,
  FileTextOutlined,
  ProfileOutlined,
  SettingOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { NavLink, Outlet } from 'react-router-dom';
import { db } from '../db/db';
import OfflineNotice from './OfflineNotice';
import LiveUpdateBanner from '../updates/LiveUpdateBanner';

const NAV = [
  { to: '/tables', label: 'Tables', icon: <AppstoreOutlined /> },
  { to: '/orders', label: 'Orders', icon: <ProfileOutlined />, badge: 'print' as const },
  { to: '/billing', label: 'Billing', icon: <WalletOutlined />, badge: 'bill' as const },
  { to: '/menu', label: 'Menu', icon: <FileTextOutlined /> },
  { to: '/settings', label: 'Settings', icon: <SettingOutlined /> },
];

export default function AppLayout() {
  const badges = useLiveQuery(async () => {
    const bill = await db.orders.where('status').equals('billing').count();
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const print = await db.kots
      .where('createdAt')
      .above(since)
      .filter((k) => k.printStatus === 'failed' || k.printStatus === 'pending')
      .count();
    return { bill, print };
  }, []);

  return (
    <div className="shell">
      <OfflineNotice />
      <LiveUpdateBanner />
      <nav className="nav" aria-label="Main">
        {NAV.map((n) => {
          const count = n.badge ? (badges?.[n.badge] ?? 0) : 0;
          return (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav__item${isActive ? ' is-active' : ''}`}>
              {n.icon}
              <span>{n.label}</span>
              {count > 0 && (
                <span className="nav__badge" aria-label={`${count} need attention`}>
                  {count}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>
      <main className="shell__main">
        <Outlet />
      </main>
    </div>
  );
}
