import { Spin } from 'antd';
import { useSettings } from '../hooks/data';
import PrinterSection from './settings/PrinterSection';
import UpdatesSection from './settings/UpdatesSection';

export default function SettingsPage() {
  const settings = useSettings();
  if (!settings) return <Spin style={{ display: 'block', margin: '80px auto' }} />;
  return (
    <div className="page" style={{ maxWidth: 560 }}>
      <div className="page__head">
        <h1 className="page__title">Settings</h1>
      </div>
      <section className="panel">
        <h2 className="panel__title">Printer</h2>
        <PrinterSection settings={settings} />
      </section>
      <section className="panel">
        <h2 className="panel__title">App update</h2>
        <UpdatesSection />
      </section>
    </div>
  );
}
