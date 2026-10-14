import { App as AntApp, ConfigProvider, Spin } from 'antd';
import enGB from 'antd/locale/en_GB';
import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { db, requestPersistentStorage } from './db/db';
import { recoverInterruptedPrints } from './printing/printService';
import { theme } from './theme';
import AppLayout from './components/AppLayout';
import TablesPage from './pages/TablesPage';
import OrderPage from './pages/OrderPage';
import KitchenPage from './pages/KitchenPage';
import KitchenTicketPage from './pages/KitchenTicketPage';
import BillingListPage from './pages/BillingListPage';
import BillingPage from './pages/BillingPage';
import MenuPage from './pages/MenuPage';
import SettingsPage from './pages/SettingsPage';
import StorageError from './pages/StorageError';
import PwaUpdater from './updates/PwaUpdater';
import { isNativeApp } from './printing/nativePrinter';
import { startNativeAutoUpdates } from './updates/updates';

type BootState = { phase: 'loading' } | { phase: 'ready' } | { phase: 'error'; error: string };

function useBoot(): BootState {
  const [state, setState] = useState<BootState>({ phase: 'loading' });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await db.open();
        await recoverInterruptedPrints();
        // The database opened fine: confirm this app version works (else the updater rolls back) and look for updates.
        void startNativeAutoUpdates();
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
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/kitchen" replace />} />
        <Route path="/tables" element={<TablesPage />} />
        <Route path="/order/:tableId" element={<OrderPage />} />
        <Route path="/takeaway/:orderId" element={<OrderPage />} />
        <Route path="/kitchen" element={<KitchenPage />} />
        <Route path="/kitchen/:kotId" element={<KitchenTicketPage />} />
        <Route path="/orders" element={<Navigate to="/kitchen" replace />} />
        <Route path="/billing" element={<BillingListPage />} />
        <Route path="/billing/:orderId" element={<BillingPage />} />
        <Route path="/menu" element={<MenuPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/kitchen" replace />} />
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
          <HashRouter>
            <Routed />
          </HashRouter>
        )}
      </AntApp>
    </ConfigProvider>
  );
}
