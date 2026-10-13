import { App as AntApp, ConfigProvider, Spin } from 'antd';
import enGB from 'antd/locale/en_GB';
import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { db, requestPersistentStorage } from './db/db';
import { recoverInterruptedPrints } from './printing/printService';
import { SessionProvider, useSession } from './session';
import { theme } from './theme';
import AppLayout from './components/AppLayout';
import SignIn from './pages/SignIn';
import TablesPage from './pages/TablesPage';
import OrderPage from './pages/OrderPage';
import OrdersPage from './pages/OrdersPage';
import BillingListPage from './pages/BillingListPage';
import BillingPage from './pages/BillingPage';
import SalesPage from './pages/SalesPage';
import MenuPage from './pages/MenuPage';
import SettingsPage from './pages/SettingsPage';
import StorageError from './pages/StorageError';
import PwaUpdater from './updates/PwaUpdater';
import { isNativeApp } from './printing/nativePrinter';

type BootState = { phase: 'loading' } | { phase: 'ready' } | { phase: 'error'; error: string };

function useBoot(): BootState {
  const [state, setState] = useState<BootState>({ phase: 'loading' });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await db.open();
        await recoverInterruptedPrints();
        const persist = await requestPersistentStorage();
        await db.meta.put({ key: 'storagePersistence', value: persist });
        if (!cancelled) setState({ phase: 'ready' });
      } catch (e) {
        if (!cancelled) setState({ phase: 'error', error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

function Routed() {
  const { staff, loading } = useSession();
  if (loading) return <FullSpin />;
  if (!staff) return <SignIn />;
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/tables" replace />} />
        <Route path="/tables" element={<TablesPage />} />
        <Route path="/order/:tableId" element={<OrderPage />} />
        <Route path="/takeaway/:orderId" element={<OrderPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/billing" element={<BillingListPage />} />
        <Route path="/billing/:orderId" element={<BillingPage />} />
        <Route path="/sales" element={<SalesPage />} />
        <Route path="/menu" element={<MenuPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/tables" replace />} />
      </Route>
    </Routes>
  );
}

function FullSpin() {
  return (
    <div style={{ height: '100dvh', display: 'grid', placeItems: 'center' }}>
      <Spin size="large" />
    </div>
  );
}

export default function AppRoot() {
  const boot = useBoot();
  return (
    <ConfigProvider theme={theme} locale={enGB}>
      <AntApp>
        {boot.phase === 'loading' && <FullSpin />}
        {boot.phase === 'error' && <StorageError error={boot.error} />}
        {/* Registered before sign-in so the app is cached for offline use on first visit. */}
        {boot.phase !== 'loading' && !isNativeApp() && <PwaUpdater />}
        {boot.phase === 'ready' && (
          <SessionProvider>
            <HashRouter>
              <Routed />
            </HashRouter>
          </SessionProvider>
        )}
      </AntApp>
    </ConfigProvider>
  );
}
