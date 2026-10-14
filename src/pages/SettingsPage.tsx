import { Spin } from 'antd';
import { useSettings } from '../hooks/data';
import { TopBar } from '../components/AppMenu';
import PrinterSection from './settings/PrinterSection';
import UpdatesSection from './settings/UpdatesSection';

export default function SettingsPage() {
  const settings = useSettings();
  if (!settings) return <Spin style={{ display: 'block', margin: '80px auto' }} />;
  return (
    <div className="page" style={{ maxWidth: 560 }}>
      <TopBar title="Printer and updates" />
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
