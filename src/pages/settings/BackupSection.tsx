import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import { Alert, App, Button, Input, Modal } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { db } from '../../db/db';
import { dateTimeOf } from '../../lib/time';
import { backupFileName, downloadJson, exportBackup, parseBackupText, restoreBackup, type ValidationResult } from '../../services/backup';
import { useSession } from '../../session';

const LABELS: Record<string, string> = {
  orders: 'Orders',
  invoices: 'Invoices',
  menuItems: 'Dishes',
  diningTables: 'Tables',
  kots: 'Kitchen tickets',
  staff: 'Staff',
};

export default function BackupSection() {
  const { isOwner } = useSession();
  const { message } = App.useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<ValidationResult | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const lastBackup = useLiveQuery(() => db.meta.get('lastBackupAt'), []);

  const download = async () => {
    try {
      const data = await exportBackup();
      await downloadJson(data, backupFileName());
      await db.meta.put({ key: 'lastBackupAt', value: Date.now() });
      message.success('Backup file saved to Downloads');
    } catch (e) {
      message.error(`Backup failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const pick = async (file: File) => {
    const text = await file.text();
    const res = parseBackupText(text);
    setPending(res);
    setConfirmText('');
  };

  const last = typeof lastBackup?.value === 'number' ? lastBackup.value : null;
  const stale = !last || Date.now() - last > 7 * 24 * 60 * 60 * 1000;

  return (
    <div>
      <Alert
        type={stale ? 'warning' : 'info'}
        showIcon
        style={{ marginBottom: 16 }}
        message={last ? `Last backup: ${dateTimeOf(last)}` : 'No backup has been made on this device yet.'}
        description="All data lives only on this device. If the phone is lost, reset or the app is uninstalled, the data is gone unless you have a backup file. Save a backup at least once a week and copy it off the phone (Google Drive, email, computer)."
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button type="primary" size="large" icon={<DownloadOutlined />} onClick={download}>
          Download backup
        </Button>
        {isOwner && (
          <Button size="large" icon={<UploadOutlined />} onClick={() => fileRef.current?.click()}>
            Restore from backup…
          </Button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void pick(f);
          e.target.value = '';
        }}
      />

      <Modal
        open={!!pending}
        title={pending?.ok ? 'Replace all data with this backup?' : 'This file cannot be restored'}
        onCancel={() => setPending(null)}
        okText="Replace all data"
        okButtonProps={{ danger: true, disabled: !pending?.ok || confirmText.trim().toUpperCase() !== 'RESTORE', loading: busy }}
        cancelText="Cancel"
        centered
        destroyOnHidden
        footer={pending?.ok ? undefined : <Button onClick={() => setPending(null)}>Close</Button>}
        onOk={async () => {
          if (!pending?.backup) return;
          setBusy(true);
          try {
            await restoreBackup(pending.backup);
            setPending(null);
            message.success('Backup restored');
            setTimeout(() => location.reload(), 600);
          } catch (e) {
            message.error(`Restore failed. Nothing was changed. ${e instanceof Error ? e.message : ''}`);
          } finally {
            setBusy(false);
          }
        }}
      >
        {pending?.ok ? (
          <>
            <p>
              Backup from <strong>{dateTimeOf(Date.parse(pending.backup!.exportedAt))}</strong> (app {pending.backup!.appVersion}) contains:
            </p>
            <ul>
              {Object.entries(LABELS).map(([k, label]) => (
                <li key={k}>
                  {label}: {pending.counts[k] ?? 0}
                </li>
              ))}
            </ul>
            <Alert
              type="error"
              showIcon
              message="Everything currently on this device will be replaced, including today’s orders."
              action={
                <Button size="small" onClick={download}>
                  Back up current data first
                </Button>
              }
              style={{ marginBottom: 12 }}
            />
            <label>
              Type RESTORE to confirm
              <Input size="large" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoCapitalize="characters" />
            </label>
          </>
        ) : (
          <ul>
            {pending?.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}
