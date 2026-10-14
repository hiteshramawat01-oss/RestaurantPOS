import { CheckCircleFilled, PrinterOutlined, SearchOutlined } from '@ant-design/icons';
import { Alert, App, Button, Input, Segmented } from 'antd';
import { useState } from 'react';
import { db } from '../../db/db';
import type { AppSettings, PaperWidth, PrinterSettings } from '../../db/types';
import { nativePrintingAvailable } from '../../printing/nativePrinter';
import { checkPrinterStatus, findPrinters, testPrint, type FoundPrinter } from '../../printing/printService';

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

      <Button size="large" block icon={<PrinterOutlined />} loading={testing} onClick={runTest} disabled={native && !printer.host} style={{ marginTop: 20 }}>
        Print test page
      </Button>
      {status && <Alert style={{ marginTop: 12 }} type={status.ok ? 'success' : 'warning'} showIcon message={status.text} />}
    </div>
  );
}
