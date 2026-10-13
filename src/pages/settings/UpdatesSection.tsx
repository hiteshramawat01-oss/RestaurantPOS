import { Alert, Button, Descriptions } from 'antd';
import { useState } from 'react';
import { RELEASES_URL } from '../../config';
import { dateTimeOf } from '../../lib/time';
import { isNativeApp } from '../../printing/nativePrinter';
import { checkForUpdates, useUpdateState } from '../../updates/updates';
import { APP_VERSION, BUILD_CHANNEL, BUILD_NUMBER, BUILD_TIME } from '../../version';

export default function UpdatesSection() {
  const { lastCheck, needRefresh, applyUpdate } = useUpdateState();
  const [busy, setBusy] = useState(false);
  const native = isNativeApp();

  return (
    <div>
      <Descriptions
        column={1}
        size="small"
        bordered
        items={[
          { key: 'v', label: 'Installed version', children: `${APP_VERSION}${BUILD_CHANNEL === 'test' ? ` · test build ${BUILD_NUMBER}` : ''}${BUILD_TIME ? ` (built ${dateTimeOf(Date.parse(BUILD_TIME))})` : ''}` },
          { key: 'l', label: 'Latest release', children: lastCheck?.latest ?? '—' },
          { key: 'c', label: 'Last checked', children: lastCheck ? dateTimeOf(lastCheck.checkedAt) : 'Never' },
          { key: 't', label: 'Type', children: native ? (BUILD_CHANNEL === 'test' ? 'Android app (test build)' : 'Android app (APK)') : 'Web app (PWA)' },
        ]}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <Button
          size="large"
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
        {!native && needRefresh && applyUpdate && (
          <Button type="primary" size="large" onClick={() => applyUpdate()}>
            Update now
          </Button>
        )}
      </div>

      {lastCheck?.error && <Alert style={{ marginTop: 12 }} type="warning" showIcon message={lastCheck.error} />}
      {lastCheck && !lastCheck.error && !lastCheck.updateAvailable && (
        <Alert style={{ marginTop: 12 }} type="success" showIcon message="You have the latest version." />
      )}
      {lastCheck?.updateAvailable && (
        <Alert
          style={{ marginTop: 12 }}
          type="info"
          showIcon
          message={`Version ${lastCheck.latest} is available`}
          description={
            <>
              {lastCheck.notes.length > 0 && (
                <ul style={{ paddingLeft: 18, margin: '6px 0' }}>
                  {lastCheck.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
              {native ? (
                <p style={{ margin: 0 }}>
                  Download the new APK and install it over this one. Android keeps the app’s data when the update is signed with the same key.{' '}
                  <a href={lastCheck.downloadUrl ?? RELEASES_URL} target="_blank" rel="noreferrer">
                    Download update
                  </a>
                </p>
              ) : needRefresh ? (
                <p style={{ margin: 0 }}>The new version is downloaded. Tap “Update now”. Your data is kept.</p>
              ) : (
                <p style={{ margin: 0 }}>Downloading in the background. “Update now” appears when it is ready (usually a few seconds).</p>
              )}
            </>
          }
        />
      )}
      <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
        Updates only replace the app’s program files. Orders, bills, menu and settings stay on this device. Make a backup before
        major updates anyway.
      </p>
    </div>
  );
}
