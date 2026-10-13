import { LockOutlined } from '@ant-design/icons';
import { Collapse, Spin } from 'antd';
import { useSettings } from '../hooks/data';
import { useSession } from '../session';
import { APP_VERSION } from '../version';
import RestaurantSection from './settings/RestaurantSection';
import RoomsTablesSection from './settings/RoomsTablesSection';
import TaxSection from './settings/TaxSection';
import PrinterSection from './settings/PrinterSection';
import StaffSection from './settings/StaffSection';
import BackupSection from './settings/BackupSection';
import UpdatesSection from './settings/UpdatesSection';
import StorageSection from './settings/StorageSection';

export default function SettingsPage() {
  const settings = useSettings();
  const { isOwner, staff } = useSession();
  if (!settings) return <Spin style={{ display: 'block', margin: '80px auto' }} />;

  const owner = (label: string) => (isOwner ? label : <span>{label} <LockOutlined className="muted" /></span>);
  const locked = <p className="muted">Only the owner can change this. Switch user on the Tables screen.</p>;

  const items = [
    { key: 'printer', label: 'Printer', children: <PrinterSection settings={settings} editable={isOwner} /> },
    { key: 'restaurant', label: owner('Restaurant details'), children: isOwner ? <RestaurantSection settings={settings} /> : locked },
    { key: 'tables', label: owner('Rooms and tables'), children: isOwner ? <RoomsTablesSection /> : locked },
    { key: 'tax', label: owner('Taxes and invoice numbers'), children: isOwner ? <TaxSection settings={settings} /> : locked },
    { key: 'staff', label: owner('Staff and PINs'), children: isOwner ? <StaffSection settings={settings} /> : locked },
    { key: 'backup', label: 'Backup and restore', children: <BackupSection /> },
    { key: 'updates', label: 'App updates', children: <UpdatesSection /> },
    { key: 'storage', label: 'Data on this device', children: <StorageSection /> },
  ];

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <div className="page__head">
        <div>
          <h1 className="page__title">Settings</h1>
          <div className="page__sub">
            Version {APP_VERSION} · signed in as {staff?.name}
          </div>
        </div>
      </div>
      <Collapse items={items} size="large" defaultActiveKey={settings.setupComplete ? [] : ['restaurant']} style={{ background: 'var(--surface)' }} />
    </div>
  );
}
