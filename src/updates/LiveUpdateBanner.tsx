import { Button } from 'antd';
import { useState } from 'react';
import { useUpdateState } from './updates';

/**
 * Android app: a new version has been downloaded in the background. It
 * switches in by itself the next time the app is closed or put in the
 * background; staff can also restart now. Data is not affected.
 */
export default function LiveUpdateBanner() {
  const { live, applyLive } = useUpdateState();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!live || live.status !== 'ready' || !applyLive || dismissed === live.version) return null;
  return (
    <div className="banner" role="status">
      <span>Version {live.version} is ready. It installs next time the app is closed.</span>
      <Button
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await applyLive();
          } finally {
            setTimeout(() => setBusy(false), 4000);
          }
        }}
      >
        Restart now
      </Button>
      <button
        onClick={() => setDismissed(live.version)}
        aria-label="Hide"
        style={{ border: 0, background: 'transparent', color: 'inherit', fontWeight: 700, padding: 8, cursor: 'pointer' }}
      >
        Later
      </button>
    </div>
  );
}
