import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, App, Button, Input, InputNumber, Switch } from 'antd';
import { useState } from 'react';
import { db } from '../../db/db';
import type { AppSettings, TaxRate } from '../../db/types';
import { newId } from '../../lib/id';
import { formatInvoiceNo } from '../../services/billing';

export default function TaxSection({ settings }: { settings: AppSettings }) {
  const { message, modal } = App.useApp();
  const [taxes, setTaxes] = useState<TaxRate[]>(settings.taxes);
  const [round, setRound] = useState(settings.roundToRupee);
  const [prefix, setPrefix] = useState(settings.invoicePrefix);

  const patch = (id: string, p: Partial<TaxRate>) => setTaxes((t) => t.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const save = async () => {
    const clean = taxes.filter((t) => t.name.trim()).map((t) => ({ ...t, name: t.name.trim(), ratePercent: Math.max(0, Math.min(100, t.ratePercent || 0)) }));
    const doSave = async () => {
      await db.settings.update('app', { taxes: clean, roundToRupee: round, invoicePrefix: prefix.trim() });
      message.success('Saved. Applies to bills finalized from now on.');
    };
    if (prefix.trim() !== settings.invoicePrefix)
      modal.confirm({
        title: 'Change the invoice prefix?',
        content: `New invoices will look like ${formatInvoiceNo(prefix.trim(), 1)}. Numbering continues from the current count, so numbers stay unique.`,
        okText: 'Change prefix',
        centered: true,
        onOk: doSave,
      });
    else await doSave();
  };

  return (
    <div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Check which taxes apply to your restaurant (for example GST) with your accountant. The app only applies the rates you switch on here and does not decide GST compliance."
      />
      <div className="rowlist" style={{ marginBottom: 12 }}>
        {taxes.map((t) => (
          <div className="rowlist__row" key={t.id} style={{ flexWrap: 'wrap' }}>
            <Input value={t.name} onChange={(e) => patch(t.id, { name: e.target.value })} style={{ flex: '1 1 140px' }} placeholder="Tax name" maxLength={20} />
            <InputNumber value={t.ratePercent} min={0} max={100} step={0.5} onChange={(v) => patch(t.id, { ratePercent: v ?? 0 })} addonAfter="%" style={{ width: 130 }} />
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Switch checked={t.enabled} onChange={(v) => patch(t.id, { enabled: v })} aria-label={`Charge ${t.name}`} />
              {t.enabled ? 'Charged' : 'Off'}
            </span>
            <Button icon={<DeleteOutlined />} aria-label="Remove tax" onClick={() => setTaxes((x) => x.filter((y) => y.id !== t.id))} />
          </div>
        ))}
        <button className="rowlist__row is-button" onClick={() => setTaxes((x) => [...x, { id: newId(), name: '', ratePercent: 0, enabled: false }])}>
          <PlusOutlined /> Add tax or service charge
        </button>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>Taxes are calculated on the amount after discount.</p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' }}>
        <Switch checked={round} onChange={setRound} /> Round the bill total to the nearest rupee
      </div>

      <label style={{ display: 'block', marginBottom: 16 }}>
        Invoice number prefix
        <Input size="large" value={prefix} onChange={(e) => setPrefix(e.target.value.replace(/\s/g, ''))} maxLength={10} style={{ maxWidth: 220, display: 'block' }} />
        <span className="muted" style={{ fontSize: 13 }}>
          Format: {formatInvoiceNo(prefix, 1)}, {formatInvoiceNo(prefix, 2)}, …
        </span>
      </label>

      <Button type="primary" size="large" onClick={save}>
        Save tax and invoice settings
      </Button>
    </div>
  );
}
