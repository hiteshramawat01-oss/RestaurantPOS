import { App, Button, Form, Input } from 'antd';
import { db } from '../../db/db';
import type { AppSettings, RestaurantProfile } from '../../db/types';

export default function RestaurantSection({ settings }: { settings: AppSettings }) {
  const [form] = Form.useForm<RestaurantProfile>();
  const { message } = App.useApp();
  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={settings.restaurant}
      requiredMark={false}
      onFinish={async (v) => {
        await db.settings.update('app', {
          restaurant: {
            name: v.name.trim(),
            address: (v.address ?? '').trim(),
            phone: (v.phone ?? '').trim(),
            gstin: (v.gstin ?? '').trim().toUpperCase(),
            footer: (v.footer ?? '').trim(),
          },
          setupComplete: true,
        });
        message.success('Restaurant details saved. They appear on new bills.');
      }}
    >
      <Form.Item name="name" label="Restaurant name" rules={[{ required: true, whitespace: true, message: 'Enter the restaurant name' }]}>
        <Input size="large" maxLength={32} />
      </Form.Item>
      <Form.Item name="address" label="Address (printed on bills)">
        <Input.TextArea autoSize={{ minRows: 2, maxRows: 3 }} maxLength={120} />
      </Form.Item>
      <div className="form-grid">
        <Form.Item name="phone" label="Phone">
          <Input size="large" inputMode="tel" maxLength={20} />
        </Form.Item>
        <Form.Item
          name="gstin"
          label="GSTIN (leave empty if not registered)"
          rules={[{ pattern: /^$|^[0-9A-Za-z]{15}$/, message: 'A GSTIN has 15 letters and digits' }]}
        >
          <Input size="large" maxLength={15} style={{ textTransform: 'uppercase' }} />
        </Form.Item>
      </div>
      <Form.Item name="footer" label="Message at the bottom of the bill">
        <Input size="large" maxLength={60} />
      </Form.Item>
      <Button type="primary" size="large" htmlType="submit">
        Save details
      </Button>
    </Form>
  );
}
