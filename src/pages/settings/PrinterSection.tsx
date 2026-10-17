import { CheckCircleFilled, PrinterOutlined, ReloadOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons';
import { Alert, App, Button, Input, Segmented } from 'antd';
import { useEffect, useState } from 'react';
import { db } from '../../db/db';
import type { AppSettings, PaperWidth, PrinterSettings } from '../../db/types';
import { nativePrintingAvailable, type BtDevice } from '../../printing/nativePrinter';
import { checkPrinterStatus, findPrinters, isBluetooth, openBluetoothSettings, pairedBluetoothPrinters, testPrint, type FoundPrinter } from '../../printing/printService';

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

/**
 * Printer settings, kept to the essentials: find the printer on the phone's
 * Wi-Fi and tap it, choose the paper width, print a test page. Everything
 * saves as soon as it changes.
 */
export default function PrinterSection({ settings }: { settings: AppSettings }) {
  const { message } = App.useApp();
  const native = nativePrintingAvailable();
  const printer = settings.printer;

  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<FoundPrinter[] | null>(null);
  const [network, setNetwork] = useState('');
  const [searchError, setSearchError] = useState('');
  const [manual, setManual] = useState(false);
  const [ip, setIp] = useState(printer.host);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [name, setName] = useState(settings.restaurant.name);
  const bt = isBluetooth(printer);
  const [btList, setBtList] = useState<BtDevice[] | null>(null);
  const [btLoading, setBtLoading] = useState(false);
  const [btError, setBtError] = useState('');

  const save = (patch: Partial<PrinterSettings>) =>
    db.settings.update('app', { printer: { ...printer, ...patch, method: native ? 'native' : 'browser' } });

  const search = async () => {
    setSearching(true);
    setSearchError('');
    setStatus(null);
    try {
      const r = await findPrinters(printer.port || 9100);
      setFound(r.printers);
      setNetwork(r.network);
      // Only one printer on the network: choose it straight away.
      if (r.printers.length === 1 && r.printers[0].host !== printer.host) {
        await save({ host: r.printers[0].host, port: r.printers[0].port });
        message.success(`Printer ${r.printers[0].host} selected`);
      }
    } catch (e) {
      setFound(null);
      setSearchError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  };

  const choose = async (p: FoundPrinter) => {
    await save({ host: p.host, port: p.port });
    setStatus(null);
    message.success(`Printer ${p.host} selected`);
  };

  const loadPaired = async () => {
    setBtLoading(true);
    setBtError('');
    try {
      setBtList(await pairedBluetoothPrinters());
    } catch (e) {
      setBtList(null);
      setBtError(e instanceof Error ? e.message : String(e));
    } finally {
      setBtLoading(false);
    }
  };

  // Show the paired list straight away on the Bluetooth tab.
  useEffect(() => {
    if (native && bt && btList === null && !btLoading && !btError) void loadPaired();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [native, bt]);

  const chooseBt = async (d: BtDevice) => {
    // Portable Bluetooth bill printers are almost always 58 mm.
    const paper: PaperWidth = printer.btAddress ? printer.paperWidth : 58;
    await save({ connection: 'bluetooth', btAddress: d.address, btName: d.name, paperWidth: paper });
    setStatus(null);
    message.success(`${d.name} selected${paper !== printer.paperWidth ? ' · paper set to 58 mm' : ''}`);
  };

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

  const check = async () => {
    const s = await checkPrinterStatus(settings.printer);
    setStatus({ ok: 'reachable' in s ? !!s.reachable && !(s.problems?.length) : false, text: s.message });
  };

  return (
    <div className="psettings">
      {!native && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Open the installed Android app to connect to the Wi-Fi printer."
          description="In a web browser, slips print through the phone's print dialog."
        />
      )}

      {native && (
        <div className="psettings__field" style={{ marginTop: 0 }}>
          <div className="psettings__label">How is the printer connected?</div>
          <Segmented
            size="large"
            block
            value={bt ? 'bluetooth' : 'wifi'}
            onChange={(v) => {
              setStatus(null);
              void save({ connection: v as 'wifi' | 'bluetooth' });
            }}
            options={[
              { label: 'Bluetooth', value: 'bluetooth' },
              { label: 'Wi-Fi', value: 'wifi' },
            ]}
          />
        </div>
      )}

      {native && bt && (
        <>
          <div className="psettings__current">
            <PrinterOutlined className="psettings__icon" />
            <div className="psettings__what">
              <div className="psettings__label">Selected printer</div>
              <div className="psettings__value">{printer.btName || 'Not chosen yet'}</div>
            </div>
            {printer.btAddress && <Button onClick={check}>Check</Button>}
          </div>

          <div className="psettings__head">
            <span>Paired with this phone</span>
            <Button type="text" icon={<ReloadOutlined />} loading={btLoading} onClick={loadPaired} aria-label="Refresh list">
              Refresh
            </Button>
          </div>

          {btError && <Alert style={{ marginTop: 4 }} type="error" showIcon message={btError} />}

          {btList && (
            <div className="rowlist">
              {btList.length === 0 ? (
                <div className="rowlist__row">
                  <div className="rowlist__main">
                    <div className="rowlist__title">No paired devices yet</div>
                    <div className="rowlist__sub">Pair the printer first (see below).</div>
                  </div>
                </div>
              ) : (
                btList.map((d) => {
                  const selected = d.address === printer.btAddress;
                  return (
                    <button key={d.address} className="rowlist__row is-button" onClick={() => chooseBt(d)} aria-pressed={selected}>
                      <PrinterOutlined style={{ fontSize: 20, opacity: d.printer ? 1 : 0.4 }} />
                      <div className="rowlist__main">
                        <div className="rowlist__title">{d.name}</div>
                        <div className="rowlist__sub">{d.printer ? 'Printer' : 'Other device'} · {d.address}</div>
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
              <li>Open Bluetooth settings, tap the printer to pair it. If it asks for a PIN, try 0000 or 1234.</li>
              <li>Come back here and tap Refresh.</li>
            </ol>
            <Button size="large" block icon={<SettingOutlined />} onClick={() => void openBluetoothSettings()}>
              Open Bluetooth settings
            </Button>
          </div>
        </>
      )}

      {native && !bt && (
        <>
          <div className="psettings__current">
            <PrinterOutlined className="psettings__icon" />
            <div className="psettings__what">
              <div className="psettings__label">Selected printer</div>
              <div className="psettings__value">{printer.host || 'Not chosen yet'}</div>
            </div>
            {printer.host && <Button onClick={check}>Check</Button>}
          </div>

          <Button
            type="primary"
            size="large"
            block
            icon={<SearchOutlined />}
            loading={searching}
            onClick={search}
            style={{ marginTop: 12 }}
          >
            {searching ? 'Searching the Wi-Fi…' : 'Find printers'}
          </Button>
          <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            The phone and the printer must be on the same Wi-Fi. Searching takes a few seconds.
          </div>

          {searchError && <Alert style={{ marginTop: 12 }} type="error" showIcon message={searchError} />}

          {found && (
            <div className="rowlist" style={{ marginTop: 12 }}>
              {found.length === 0 ? (
                <div className="rowlist__row">
                  <div className="rowlist__main">
                    <div className="rowlist__title">No printer found on {network}</div>
                    <div className="rowlist__sub">
                      Check the printer is on and joined to this Wi-Fi, then search again, or enter its IP address below.
                    </div>
                  </div>
                </div>
              ) : (
                found.map((p) => {
                  const selected = p.host === printer.host;
                  return (
                    <button key={p.host} className="rowlist__row is-button" onClick={() => choose(p)} aria-pressed={selected}>
                      <PrinterOutlined style={{ fontSize: 20 }} />
                      <div className="rowlist__main">
                        <div className="rowlist__title">{p.host}</div>
                        <div className="rowlist__sub">Network printer · port {p.port}</div>
                      </div>
                      {selected ? (
                        <CheckCircleFilled style={{ fontSize: 22, color: 'var(--free)' }} aria-label="Selected" />
                      ) : (
                        <span style={{ color: 'var(--indigo)', fontWeight: 700 }}>Use</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}

          {!manual ? (
            <Button type="link" style={{ paddingLeft: 0, marginTop: 4 }} onClick={() => setManual(true)}>
              Enter IP address yourself
            </Button>
          ) : (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Input
                size="large"
                value={ip}
                onChange={(e) => setIp(e.target.value.trim())}
                placeholder="192.168.1.50"
                inputMode="decimal"
                status={ip && !IPV4.test(ip) ? 'error' : undefined}
              />
              <Button
                size="large"
                disabled={!IPV4.test(ip)}
                onClick={async () => {
                  await save({ host: ip });
                  setManual(false);
                  message.success(`Printer ${ip} selected`);
                }}
              >
                Use
              </Button>
            </div>
          )}
        </>
      )}

      <div className="psettings__field">
        <div className="psettings__label">Paper width</div>
        <Segmented
          size="large"
          value={printer.paperWidth}
          onChange={(v) => save({ paperWidth: v as PaperWidth })}
          options={[
            { label: '80 mm', value: 80 },
            { label: '58 mm', value: 58 },
          ]}
        />
      </div>

      <div className="psettings__field">
        <div className="psettings__label">Name at the top of slips and bills</div>
        <Input
          size="large"
          value={name}
          maxLength={32}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const n = name.trim() || 'Restaurant';
            setName(n);
            if (n !== settings.restaurant.name) void db.settings.update('app', { restaurant: { ...settings.restaurant, name: n } });
          }}
        />
      </div>

      <Button size="large" block icon={<PrinterOutlined />} loading={testing} onClick={runTest} disabled={native && (bt ? !printer.btAddress : !printer.host)} style={{ marginTop: 20 }}>
        Print test page
      </Button>
      {status && <Alert style={{ marginTop: 12 }} type={status.ok ? 'success' : 'warning'} showIcon message={status.text} />}
    </div>
  );
}
