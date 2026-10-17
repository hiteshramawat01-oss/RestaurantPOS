import { CheckCircleFilled, PrinterOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import { Alert, App, Button } from 'antd';
import { useEffect, useState } from 'react';
import { db } from '../../db/db';
import type { AppSettings, PrinterSettings } from '../../db/types';
import { nativePrintingAvailable, type BtDevice } from '../../printing/nativePrinter';
import { isBluetooth, openBluetoothSettings, pairedBluetoothPrinters, testPrint } from '../../printing/printService';

/**
 * The restaurant has one printer: a 58 mm Bluetooth bill printer
 * (Helett BillQuick-Go). So this is just: which printer, and a test print.
 */
export default function PrinterSection({ settings }: { settings: AppSettings }) {
  const { message } = App.useApp();
  const native = nativePrintingAvailable();
  const printer = settings.printer;
  const chosen = isBluetooth(printer) && !!printer.btAddress;

  const [picking, setPicking] = useState(false);
  const [list, setList] = useState<BtDevice[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const showList = native && (!chosen || picking);

  const save = (patch: Partial<PrinterSettings>) =>
    db.settings.update('app', { printer: { ...printer, ...patch, method: native ? 'native' : 'browser' } });

  const choose = async (d: BtDevice) => {
    await save({ connection: 'bluetooth', btAddress: d.address, btName: d.name, paperWidth: 58 });
    setPicking(false);
    setStatus(null);
    message.success(`${d.name} selected`);
  };

  const load = async () => {
    setLoading(true);
    setListError('');
    try {
      const devices = await pairedBluetoothPrinters();
      setList(devices);
      // Only one printer paired: use it straight away.
      const printers = devices.filter((d) => d.printer);
      if (!chosen && printers.length === 1) await choose(printers[0]);
    } catch (e) {
      setList(null);
      setListError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (showList && list === null && !loading && !listError) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showList]);

  const runTest = async () => {
    setTesting(true);
    try {
      const out = await testPrint(settings.printer, settings.restaurant.name);
      if (out.status === 'printed') setStatus({ ok: true, text: 'Test page sent. Check that it came out of the printer.' });
      else if (out.status === 'awaiting_confirmation') setStatus({ ok: true, text: 'Print dialog opened. Choose your printer there.' });
      else setStatus({ ok: false, text: out.error });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="psettings">
      {!native && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="The Bluetooth printer works in the installed Android app."
          description="In a web browser, slips print through the phone's print dialog."
        />
      )}

      {native && (
        <div className="psettings__current" style={{ marginTop: 0 }}>
          <PrinterOutlined className="psettings__icon" />
          <div className="psettings__what">
            <div className="psettings__value">{chosen ? printer.btName : 'No printer chosen'}</div>
            <div className="psettings__label">{chosen ? 'Bluetooth · 58 mm' : 'Tap your printer below'}</div>
          </div>
          {chosen && !picking && (
            <Button type="text" onClick={() => setPicking(true)}>
              Change
            </Button>
          )}
        </div>
      )}

      {showList && (
        <>
          <div className="psettings__head">
            <span>Paired with this phone</span>
            <Button type="text" icon={<ReloadOutlined />} loading={loading} onClick={load}>
              Refresh
            </Button>
          </div>

          {listError && <Alert style={{ marginBottom: 8 }} type="error" showIcon message={listError} />}

          {list && (
            <div className="rowlist">
              {list.length === 0 ? (
                <div className="rowlist__row">
                  <div className="rowlist__main">
                    <div className="rowlist__title">Nothing paired yet</div>
                    <div className="rowlist__sub">Pair the printer first (see below).</div>
                  </div>
                </div>
              ) : (
                list.map((d) => {
                  const selected = chosen && d.address === printer.btAddress;
                  return (
                    <button key={d.address} className="rowlist__row is-button" onClick={() => choose(d)} aria-pressed={selected}>
                      <PrinterOutlined style={{ fontSize: 20, opacity: d.printer ? 1 : 0.4 }} />
                      <div className="rowlist__main">
                        <div className="rowlist__title">{d.name}</div>
                        <div className="rowlist__sub">{d.printer ? 'Printer' : 'Other device'}</div>
                      </div>
                      {selected ? (
                        <CheckCircleFilled style={{ fontSize: 22, color: 'var(--free)' }} aria-label="Selected" />
                      ) : (
                        <span style={{ color: 'var(--md-primary)', fontWeight: 500 }}>Use</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}

          <div className="psettings__help">
            <div className="psettings__help-title">Printer not in the list?</div>
            <ol>
              <li>Switch the printer on.</li>
              <li>Open Bluetooth settings and tap BillQuick-Go to pair. PIN: 0000.</li>
              <li>Come back here and tap Refresh.</li>
            </ol>
            <Button size="large" block icon={<SettingOutlined />} onClick={() => void openBluetoothSettings()}>
              Open Bluetooth settings
            </Button>
          </div>
        </>
      )}

      <Button
        type={chosen || !native ? 'primary' : 'default'}
        size="large"
        block
        icon={<PrinterOutlined />}
        loading={testing}
        onClick={runTest}
        disabled={native && !chosen}
        style={{ marginTop: 16 }}
      >
        Print test page
      </Button>
      {status && <Alert style={{ marginTop: 12 }} type={status.ok ? 'success' : 'warning'} showIcon message={status.text} />}
    </div>
  );
}
