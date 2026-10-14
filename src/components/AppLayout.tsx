import { Outlet } from 'react-router-dom';
import LiveUpdateBanner from '../updates/LiveUpdateBanner';
import OfflineNotice from './OfflineNotice';

/** App frame: notices on top, the current screen below. No bottom bar; screens have their own header. */
export default function AppLayout() {
  return (
    <div className="shell">
      <OfflineNotice />
      <LiveUpdateBanner />
      <main className="shell__main">
        <Outlet />
      </main>
    </div>
  );
}
