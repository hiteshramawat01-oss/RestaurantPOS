import { ArrowDownOutlined, ArrowUpOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Form, Input, InputNumber, Modal, Radio, Select, Spin, Switch, Tag } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db/db';
import type { Category, MenuItem } from '../db/types';
import { formatPrice, paiseToRupees, rupeesToPaise } from '../domain/money';
import { newId } from '../lib/id';
import { useSession } from '../session';

interface ItemForm {
  name: string;
  categoryId: string;
  sizes: 'one' | 'two';
  price: number;
  size1Label: string;
  size1Price: number;
  size2Label: string;
  size2Price: number;
  prepNote?: string;
  available: boolean;
  active: boolean;
}

export default function MenuPage() {
  const { isOwner } = useSession();
  const { message, modal } = App.useApp();
  const categories = useLiveQuery(() => db.categories.orderBy('sortOrder').toArray(), []);
  const items = useLiveQuery(() => db.menuItems.orderBy('sortOrder').toArray(), []);
  const [catId, setCatId] = useState<string | null>(null);
  const [editing, setEditing] = useState<MenuItem | 'new' | null>(null);
  const [catEditing, setCatEditing] = useState<Category | 'new' | null>(null);
  const [form] = Form.useForm<ItemForm>();
  const [catName, setCatName] = useState('');

  if (!categories || !items) return <Spin style={{ display: 'block', margin: '80px auto' }} />;
  const current = catId ?? categories.find((c) => c.active)?.id ?? categories[0]?.id;
  const currentCat = categories.find((c) => c.id === current);
  const inCat = items.filter((i) => i.categoryId === current);
  const activeItems = inCat.filter((i) => i.active);
  const hidden = inCat.filter((i) => !i.active);

  const openItem = (it: MenuItem | 'new') => {
    setEditing(it);
    form.setFieldsValue(
      it === 'new'
        ? {
            name: '',
            categoryId: current,
            sizes: 'one',
            price: undefined as unknown as number,
            size1Label: 'Half',
            size1Price: undefined as unknown as number,
            size2Label: 'Full',
            size2Price: undefined as unknown as number,
            prepNote: '',
            available: true,
            active: true,
          }
        : {
            name: it.name,
            categoryId: it.categoryId,
            sizes: it.variants?.length ? 'two' : 'one',
            price: paiseToRupees(it.price),
            size1Label: it.variants?.[0]?.label ?? 'Half',
            size1Price: it.variants?.[0] ? paiseToRupees(it.variants[0].price) : (undefined as unknown as number),
            size2Label: it.variants?.[1]?.label ?? 'Full',
            size2Price: it.variants?.[1] ? paiseToRupees(it.variants[1].price) : (undefined as unknown as number),
            prepNote: it.prepNote ?? '',
            available: it.available,
            active: it.active,
          },
    );
  };

  const saveItem = async () => {
    const v = await form.validateFields();
    const data: Omit<MenuItem, 'id' | 'sortOrder'> = {
      name: v.name.trim(),
      categoryId: v.categoryId,
      ...(v.sizes === 'two'
        ? {
            price: rupeesToPaise(v.size1Price),
            variants: [
              { label: v.size1Label.trim() || 'Half', price: rupeesToPaise(v.size1Price) },
              { label: v.size2Label.trim() || 'Full', price: rupeesToPaise(v.size2Price) },
            ],
          }
        : { price: rupeesToPaise(v.price), variants: undefined }),
      veg: editing && editing !== 'new' ? editing.veg : undefined,
      prepNote: v.prepNote?.trim() || undefined,
      available: v.available,
      active: v.active,
    };
    if (editing === 'new') {
      const max = items.filter((i) => i.categoryId === v.categoryId).reduce((m, i) => Math.max(m, i.sortOrder), 0);
      await db.menuItems.add({ ...data, id: newId(), sortOrder: max + 1 });
      message.success(`${data.name} added`);
    } else if (editing) {
      await db.menuItems.update(editing.id, data);
      message.success('Saved. New orders use the new price; existing orders keep theirs.');
    }
    setEditing(null);
  };

  const saveCategory = async () => {
    const name = catName.trim();
    if (!name) return;
    if (catEditing === 'new') {
      const id = newId();
      await db.categories.add({ id, name, sortOrder: categories.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 1, active: true });
      setCatId(id);
    } else if (catEditing) await db.categories.update(catEditing.id, { name });
    setCatEditing(null);
  };

  const moveCategory = async (dir: -1 | 1) => {
    if (!currentCat) return;
    const idx = categories.findIndex((c) => c.id === currentCat.id);
    const other = categories[idx + dir];
    if (!other) return;
    await db.transaction('rw', db.categories, async () => {
      await db.categories.update(currentCat.id, { sortOrder: other.sortOrder });
      await db.categories.update(other.id, { sortOrder: currentCat.sortOrder });
    });
  };

  const moveItem = async (it: MenuItem, dir: -1 | 1) => {
    const idx = activeItems.findIndex((x) => x.id === it.id);
    const other = activeItems[idx + dir];
    if (!other) return;
    await db.transaction('rw', db.menuItems, async () => {
      await db.menuItems.update(it.id, { sortOrder: other.sortOrder });
      await db.menuItems.update(other.id, { sortOrder: it.sortOrder });
    });
  };

  const row = (it: MenuItem) => (
    <div className="rowlist__row" key={it.id}>
      <div className="rowlist__main">
        <div className="rowlist__title">
          {it.veg !== undefined && <i className={`veg-dot${it.veg ? '' : ' is-nonveg'}`} />}
          {it.name}
        </div>
        <div className="rowlist__sub">
          {it.variants?.length ? it.variants.map((x) => `${x.label} ${formatPrice(x.price)}`).join(' · ') : formatPrice(it.price)}
          {it.prepNote && ` · Kitchen: ${it.prepNote}`}
        </div>
      </div>
      {it.active ? (
        <>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <Switch
              checked={it.available}
              onChange={(v) => db.menuItems.update(it.id, { available: v })}
              aria-label={`${it.name} available`}
            />
            <span style={{ width: 70 }}>{it.available ? 'Available' : 'Sold out'}</span>
          </span>
          {isOwner && (
            <>
              <Button icon={<ArrowUpOutlined />} aria-label="Move up" onClick={() => moveItem(it, -1)} />
              <Button icon={<ArrowDownOutlined />} aria-label="Move down" onClick={() => moveItem(it, 1)} />
              <Button icon={<EditOutlined />} aria-label={`Edit ${it.name}`} onClick={() => openItem(it)} />
            </>
          )}
        </>
      ) : (
        isOwner && <Button onClick={() => db.menuItems.update(it.id, { active: true })}>Show on menu</Button>
      )}
    </div>
  );

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Menu</h1>
          <div className="page__sub">
            Switch a dish off when it runs out.
          </div>
        </div>
        {isOwner && (
          <div className="page__actions">
            <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => openItem('new')} disabled={!categories.length}>
              Add dish
            </Button>
          </div>
        )}
      </div>

      <div className="cats" role="tablist">
        {categories.map((c) => (
          <button key={c.id} role="tab" aria-selected={c.id === current} className={`cats__chip${c.id === current ? ' is-active' : ''}`} onClick={() => setCatId(c.id)}>
            {c.name}
            {!c.active && ' (hidden)'}
          </button>
        ))}
        {isOwner && (
          <button
            className="cats__chip"
            onClick={() => {
              setCatEditing('new');
              setCatName('');
            }}
          >
            + Category
          </button>
        )}
      </div>

      {currentCat && isOwner && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <Button
            icon={<EditOutlined />}
            onClick={() => {
              setCatEditing(currentCat);
              setCatName(currentCat.name);
            }}
          >
            Rename
          </Button>
          <Button icon={<ArrowUpOutlined />} onClick={() => moveCategory(-1)}>
            Earlier
          </Button>
          <Button icon={<ArrowDownOutlined />} onClick={() => moveCategory(1)}>
            Later
          </Button>
          <Button
            onClick={() =>
              currentCat.active
                ? modal.confirm({
                    title: `Hide “${currentCat.name}” from the order screen?`,
                    content: 'Dishes stay saved and can be shown again later.',
                    okText: 'Hide category',
                    centered: true,
                    onOk: () => db.categories.update(currentCat.id, { active: false }),
                  })
                : db.categories.update(currentCat.id, { active: true })
            }
          >
            {currentCat.active ? 'Hide category' : 'Show category'}
          </Button>
        </div>
      )}

      {activeItems.length === 0 ? (
        <div className="empty panel">
          <div className="empty__title">No dishes in {currentCat?.name ?? 'this category'}</div>
          {isOwner ? 'Use “Add dish” to create one.' : 'Ask the owner to add dishes.'}
        </div>
      ) : (
        <div className="rowlist">{activeItems.map(row)}</div>
      )}

      {hidden.length > 0 && (
        <>
          <h2 className="panel__title" style={{ marginTop: 24 }}>
            Hidden from the menu <Tag>{hidden.length}</Tag>
          </h2>
          <div className="rowlist">{hidden.map(row)}</div>
        </>
      )}

      <Modal
        open={!!editing}
        title={editing === 'new' ? 'Add dish' : 'Edit dish'}
        okText="Save"
        onOk={saveItem}
        onCancel={() => setEditing(null)}
        centered
        destroyOnHidden
        forceRender
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Enter the dish name' }]}>
            <Input size="large" maxLength={40} />
          </Form.Item>
          <Form.Item name="categoryId" label="Category">
            <Select size="large" options={categories.map((c) => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item name="sizes" label="Price">
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              size="large"
              options={[
                { value: 'one', label: 'One price' },
                { value: 'two', label: 'Two sizes (Half / Full)' },
              ]}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(a, b) => a.sizes !== b.sizes}>
            {({ getFieldValue }) =>
              getFieldValue('sizes') === 'two' ? (
                <>
                  {([1, 2] as const).map((n) => (
                    <div key={n} className="form-grid">
                      <Form.Item name={`size${n}Label`} label={`Size ${n}`} rules={[{ required: true, whitespace: true, message: 'Enter a name' }]}>
                        <Input size="large" maxLength={12} />
                      </Form.Item>
                      <Form.Item name={`size${n}Price`} label="Price (₹)" rules={[{ required: true, message: 'Enter the price' }]}>
                        <InputNumber size="large" min={0} max={100000} step={5} precision={2} inputMode="decimal" style={{ width: '100%' }} />
                      </Form.Item>
                    </div>
                  ))}
                </>
              ) : (
                <Form.Item name="price" label="Price (₹)" rules={[{ required: true, message: 'Enter the price' }]}>
                  <InputNumber size="large" min={0} max={100000} step={5} precision={2} inputMode="decimal" style={{ width: '100%' }} />
                </Form.Item>
              )
            }
          </Form.Item>
          <Form.Item name="prepNote" label="Kitchen instruction (printed on every KOT)">
            <Input size="large" maxLength={60} placeholder="e.g. Serve with green chutney" />
          </Form.Item>
          <div style={{ display: 'flex', gap: 24 }}>
            <Form.Item name="available" label="Available today" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="active" label="Shown on menu" valuePropName="checked">
              <Switch />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      <Modal
        open={!!catEditing}
        title={catEditing === 'new' ? 'New category' : 'Rename category'}
        okText="Save"
        okButtonProps={{ disabled: !catName.trim() }}
        onOk={saveCategory}
        onCancel={() => setCatEditing(null)}
        centered
        destroyOnHidden
      >
        <Input size="large" value={catName} onChange={(e) => setCatName(e.target.value)} maxLength={30} placeholder="Category name" />
      </Modal>
    </div>
  );
}
