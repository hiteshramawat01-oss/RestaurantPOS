import { Button, Result } from 'antd';

/** Shown when IndexedDB cannot be opened (private mode, storage blocked, disk full). */
export default function StorageError({ error }: { error: string }) {
  return (
    <Result
      status="error"
      title="The app could not open its local data"
      subTitle={
        <>
          <p>
            Orders are stored on this device. Make sure the app is not running in an incognito/private tab, that site
            storage is allowed for this app, and that the device has free space. Your existing data has not been changed.
          </p>
          <p className="muted" style={{ fontSize: 12 }}>
            {error}
          </p>
        </>
      }
      extra={
        <Button type="primary" size="large" onClick={() => location.reload()}>
          Try again
        </Button>
      }
    />
  );
}
