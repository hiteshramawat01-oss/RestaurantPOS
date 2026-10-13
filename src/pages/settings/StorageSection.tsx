import { Alert, Button, Descriptions } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db, requestPersistentStorage, storageEstimate } from '../../db/db';

function mb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function StorageSection() {
  const [est, setEst] = useState<{ usage: number; quota: number } | null>(null);
  const persistence = useLiveQuery(() => db.meta.get('storagePersistence'), []);
  const counts = useLiveQuery(async () => ({
    orders: await db.orders.count(),
    invoices: await db.invoices.count(),
    kots: await db.kots.count(),
  }));
  useEffect(() => {
    storageEstimate().then(setEst);
  }, []);
  const p = persistence?.value as string | undefined;

  return (
    <div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="This device is the only copy of your data"
        description="Data is not synced to other phones or to the internet. A second phone running the app has its own separate data. Use backup files to move data between devices."
      />
      <Descriptions
        column={1}
        size="small"
        bordered
        items={[
          {
            key: 'p',
            label: 'Protected from automatic clean-up',
            children:
              p === 'granted' ? 'Yes' : p === 'denied' ? 'Not granted by the browser (install the app to the home screen to improve this)' : 'Not supported here',
          },
          { key: 'u', label: 'Space used', children: est ? `${mb(est.usage)} of ${mb(est.quota)} available` : '—' },
          { key: 'c', label: 'Records', children: counts ? `${counts.orders} orders, ${counts.invoices} invoices, ${counts.kots} kitchen tickets` : '—' },
        ]}
      />
      {p !== 'granted' && (
        <Button
          style={{ marginTop: 12 }}
          onClick={async () => {
            const r = await requestPersistentStorage();
            await db.meta.put({ key: 'storagePersistence', value: r });
          }}
        >
          Ask again for protected storage
        </Button>
      )}
    </div>
  );
}
