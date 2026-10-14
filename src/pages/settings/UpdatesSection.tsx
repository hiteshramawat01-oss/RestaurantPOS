import { Alert, Button } from 'antd';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { RELEASES_URL } from '../../config';
import { dateTimeOf } from '../../lib/time';
import { isNativeApp } from '../../printing/nativePrinter';
import { checkForUpdates, useUpdateState } from '../../updates/updates';
import { APP_VERSION, BUILD_CHANNEL, BUILD_NUMBER } from '../../version';

export default function UpdatesSection() {
  const { lastCheck, needRefresh, applyUpdate, live, applyLive } = useUpdateState();
  const [busy, setBusy] = useState(false);
  const native = isNativeApp();
  const installed = `${APP_VERSION}${BUILD_CHANNEL === 'test' ? ` (build ${BUILD_NUMBER})` : ''}`;

  let state: { type: 'success' | 'info' | 'warning'; text: ReactNode } | null = null;
  if (lastCheck?.error) state = { type: 'warning', text: lastCheck.error };
  else if (lastCheck && !lastCheck.updateAvailable) state = { type: 'success', text: 'The app is up to date.' };
  else if (lastCheck?.updateAvailable) {
    if (native && lastCheck.mode === 'live')
      state =
        live?.status === 'ready'
          ? { type: 'info', text: `Version ${lastCheck.latest} is downloaded. It installs when the app is next closed, or tap Restart now.` }
          : live?.status === 'error'
            ? { type: 'warning', text: `Version ${lastCheck.latest} could not be downloaded (${live.error}). It will try again by itself.` }
            : { type: 'info', text: `Downloading version ${lastCheck.latest}…` };
    else if (native)
      state = {
        type: 'info',
        text: (
          <>
            Version {lastCheck.latest} changes the Android app itself and has to be installed once by hand.{' '}
            <a href={lastCheck.downloadUrl ?? RELEASES_URL} target="_blank" rel="noreferrer">
              Download it
            </a>
            , open the file and tap Update. Your orders are kept.
          </>
        ),
      };
    else state = { type: 'info', text: needRefresh ? `Version ${lastCheck.latest} is ready. Tap Update now.` : `Downloading version ${lastCheck.latest}…` };
  }

  return (
    <div>
      <div className="psettings__current">
        <div className="psettings__what">
          <div className="psettings__label">Installed version</div>
          <div className="psettings__value">{installed}</div>
        </div>
      </div>
      <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
        Updates install by themselves when the phone is online.
        {lastCheck && ` Last checked ${dateTimeOf(lastCheck.checkedAt)}.`}
      </div>

      {state && <Alert style={{ marginTop: 12 }} type={state.type} showIcon message={state.text} />}

      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {native && live?.status === 'ready' && applyLive && (
          <Button type="primary" size="large" block onClick={() => applyLive()}>
            Restart now
          </Button>
        )}
        {!native && needRefresh && applyUpdate && (
          <Button type="primary" size="large" block onClick={() => applyUpdate()}>
            Update now
          </Button>
        )}
        <Button
          size="large"
          block
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await checkForUpdates();
            } finally {
              setBusy(false);
            }
          }}
        >
          Check for updates
        </Button>
      </div>
    </div>
  );
}
