import { Button } from 'antd';
import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { setUpdateState } from './updates';

/**
 * Registers the service worker (offline app files) and shows a banner when a
 * new version has been downloaded. Updating only swaps app files; the local
 * database (orders, invoices, menu) is never touched by an update.
 */
export default function PwaUpdater() {
  const [busy, setBusy] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      setUpdateState({ registration });
      // Look for a new deployment every hour while the app is open and online.
      setInterval(() => {
        if (navigator.onLine) registration.update().catch(() => undefined);
      }, 60 * 60 * 1000);
    },
  });

  useEffect(() => {
    setUpdateState({ needRefresh, applyUpdate: () => updateServiceWorker(true) });
  }, [needRefresh, updateServiceWorker]);

  if (!needRefresh) return null;
  return (
    <div className="banner" role="status">
      <span>A new version of the app is ready. Your data stays as it is.</span>
      <Button
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await updateServiceWorker(true);
          } finally {
            // If the page did not reload (update failed), let staff try again.
            setTimeout(() => setBusy(false), 4000);
          }
        }}
      >
        Update now
      </Button>
    </div>
  );
}
