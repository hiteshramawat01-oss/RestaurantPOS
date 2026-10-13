import { useEffect, useState } from 'react';

/**
 * Being offline does not stop the app. This note only explains that the
 * internet is not needed; the printer depends on the local Wi-Fi, not the internet.
 */
export default function OfflineNotice() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const on = () => {
      setOnline(true);
      setDismissed(false);
    };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  if (online || dismissed) return null;
  return (
    <div className="banner is-warn" role="status">
      <span>No internet. Orders and billing keep working; the printer only needs the restaurant Wi-Fi.</span>
      <button
        onClick={() => setDismissed(true)}
        style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: 'inherit', fontWeight: 700, padding: 8, cursor: 'pointer' }}
      >
        OK
      </button>
    </div>
  );
}
