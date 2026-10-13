import { Alert, App, Button, Input, InputNumber, Radio, Switch } from 'antd';
import { useState } from 'react';
import { db } from '../../db/db';
import type { AppSettings, PrinterSettings } from '../../db/types';
import { nativePrintingAvailable } from '../../printing/nativePrinter';
import { checkPrinterStatus, testPrint } from '../../printing/printService';

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

export default function PrinterSection({ settings, editable }: { settings: AppSettings; editable: boolean }) {
  const { message, modal } = App.useApp();
  const [p, setP] = useState<PrinterSettings>(settings.printer);
  const [busy, setBusy] = useState<'test' | 'status' | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const native = nativePrintingAvailable();
  const dirty = JSON.stringify(p) !== JSON.stringify(settings.printer);
  const ipInvalid = p.method === 'native' && p.host !== '' && !IPV4.test(p.host);

  const save = async () => {
    if (ipInvalid) {
      message.error('Enter the printer IP address like 192.168.1.50');
      return;
    }
    await db.settings.update('app', { printer: { ...p, host: p.host.trim(), port: p.port || 9100 } });
    message.success('Printer settings saved');
  };

  const runTest = async () => {
    setBusy('test');
    try {
      const out = await testPrint(p, settings.restaurant.name);
      if (out.status === 'printed') message.success('Test page sent to the printer. Check that it came out.');
      else if (out.status === 'awaiting_confirmation')
        modal.info({ title: 'Did the test page print?', content: 'If it did not, check the Android print service setup described below.', centered: true });
      else modal.error({ title: 'Test print failed', content: out.error, centered: true });
    } finally {
      setBusy(null);
    }
  };

  const runStatus = async () => {
    setBusy('status');
    try {
      const s = await checkPrinterStatus(p);
      setStatus(s.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <Alert
        type={native ? 'success' : 'warning'}
        showIcon
        style={{ marginBottom: 16 }}
        message={native ? 'Running as the Android app: direct Wi-Fi printing is available.' : 'Running in a browser: printing goes through the Android print dialog.'}
        description={
          native
            ? 'Slips go straight to the printer over Wi-Fi (ESC/POS, usually port 9100). No print dialog.'
            : 'Browsers are not allowed to talk to network printers directly. Each slip opens the print dialog and staff confirm it printed. For one-tap printing, install the Android app (APK).'
        }
      />

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>How to print</div>
        <Radio.Group
          disabled={!editable}
          value={p.method}
          onChange={(e) => setP({ ...p, method: e.target.value })}
          optionType="button"
          buttonStyle="solid"
          size="large"
          options={[
            { value: 'native', label: 'Direct Wi-Fi (Android app)' },
            { value: 'browser', label: 'Print dialog' },
          ]}
        />
      </div>

      {p.method === 'native' && (
        <div className="form-grid">
          <label>
            Printer IP address
            <Input
              size="large"
              disabled={!editable}
              value={p.host}
              onChange={(e) => setP({ ...p, host: e.target.value.trim() })}
              placeholder="192.168.1.50"
              inputMode="decimal"
              status={ipInvalid ? 'error' : undefined}
            />
          </label>
          <label>
            Port
            <InputNumber size="large" disabled={!editable} min={1} max={65535} value={p.port} onChange={(v) => setP({ ...p, port: v ?? 9100 })} style={{ width: '100%' }} />
          </label>
        </div>
      )}

      <div style={{ margin: '16px 0' }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Paper width</div>
        <Radio.Group
          disabled={!editable}
          value={p.paperWidth}
          onChange={(e) => setP({ ...p, paperWidth: e.target.value })}
          optionType="button"
          size="large"
          options={[
            { value: 80, label: '80 mm' },
            { value: 58, label: '58 mm' },
          ]}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Switch disabled={!editable} checked={p.autoPrintKot} onChange={(v) => setP({ ...p, autoPrintKot: v })} />
        Print the kitchen slip automatically when an order is sent
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        Kitchen slip copies
        <InputNumber disabled={!editable} min={1} max={3} value={p.copiesKot} onChange={(v) => setP({ ...p, copiesKot: v ?? 1 })} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {editable && (
          <Button type="primary" size="large" disabled={!dirty} onClick={save}>
            Save printer settings
          </Button>
        )}
        <Button size="large" loading={busy === 'test'} onClick={runTest}>
          Print test page
        </Button>
        {p.method === 'native' && (
          <Button size="large" loading={busy === 'status'} onClick={runStatus}>
            Check printer
          </Button>
        )}
      </div>
      {status && <Alert style={{ marginTop: 12 }} type="info" showIcon message={status} />}
      {!editable && <p className="muted" style={{ marginTop: 12 }}>Only the owner can change printer settings.</p>}

      <details style={{ marginTop: 20 }}>
        <summary style={{ fontWeight: 700, cursor: 'pointer', padding: '8px 0' }}>Printer setup guide</summary>
        <ol style={{ paddingLeft: 20, lineHeight: 1.6 }}>
          <li>Use an 80 mm (or 58 mm) thermal receipt printer with Wi-Fi or LAN that supports ESC/POS and “raw” printing on port 9100.</li>
          <li>Connect the printer to the restaurant Wi-Fi using its own setup tool. Hold the feed button while switching it on to print its settings page with the IP address.</li>
          <li>In the Wi-Fi router, reserve that IP address for the printer (DHCP reservation) so it does not change.</li>
          <li>
            <strong>Android app (recommended):</strong> choose “Direct Wi-Fi”, enter the IP and port 9100, save, then tap “Print test page”.
          </li>
          <li>
            <strong>Browser / installed web app:</strong> install the printer maker’s Android print-service plugin (or a print-service app that supports ESC/POS network printers), enable it in Android Settings → Connected devices → Printing, then choose “Print dialog” here and run a test print. Select the thermal printer and the matching paper size in the dialog.
          </li>
          <li>The phone and the printer must be on the same Wi-Fi. The internet is not needed for printing.</li>
        </ol>
      </details>
    </div>
  );
}
