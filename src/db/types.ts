/**
 * Data model for the POS. All money values are stored as integer paise
 * (1 INR = 100 paise) so that totals never suffer floating-point drift.
 */

export type ID = string;

export interface Room {
  id: ID;
  name: string; // "AC", "Non-AC"
  sortOrder: number;
  active: boolean;
}

export interface DiningTable {
  id: ID;
  roomId: ID;
  label: string; // shown on cards and slips, e.g. "A1", "5"
  seats: number;
  sortOrder: number;
  active: boolean;
}

export interface Category {
  id: ID;
  name: string;
  sortOrder: number;
  active: boolean;
}

/** A size/option with its own price, e.g. Half / Full, Plain / Butter. */
export interface MenuVariant {
  label: string;
  price: number; // paise
}

export interface MenuItem {
  id: ID;
  categoryId: ID;
  name: string;
  price: number; // paise (for two-size dishes: the first size's price)
  variants?: MenuVariant[]; // two or more sizes; staff choose one when ordering
  active: boolean; // false = deactivated (hidden everywhere except Menu screen)
  available: boolean; // false = temporarily unavailable (shown greyed out)
  prepNote?: string; // standing kitchen instruction printed on every KOT
  veg?: boolean;
  sortOrder: number;
}

export type StaffRole = 'owner' | 'staff';

export interface Staff {
  id: ID;
  name: string;
  role: StaffRole;
  pin?: string; // 4-6 digits, local convenience lock only
  active: boolean;
}

export type OrderStatus = 'open' | 'billing' | 'paid' | 'cancelled';
export type OrderType = 'dine_in' | 'takeaway';

export interface Order {
  id: ID;
  orderNo: number;
  type?: OrderType; // missing on older records = dine_in
  tableId: ID; // '' for takeaway
  roomId: ID; // '' for takeaway
  customerName?: string; // takeaway only, optional
  status: OrderStatus;
  servedAt?: number; // food delivered to the guests; cleared when new items are sent
  staffId: ID;
  staffName: string;
  guests?: number;
  createdAt: number;
  updatedAt: number;
  closedAt?: number;
  invoiceId?: ID; // current (latest non-cancelled) invoice
  cancelReason?: string;
  cancelledBy?: string;
}

export interface OrderItem {
  id: ID;
  orderId: ID;
  menuItemId: ID;
  name: string; // snapshot at time of ordering, includes the size, e.g. "Dal Fry (Half)"
  variant?: string; // size label, e.g. "Half"
  unitPrice: number; // paise snapshot
  qty: number;
  note?: string;
  kotId?: ID; // set once sent to the kitchen; line is then locked
  deliveredAt?: number; // this dish was taken to the guests
  voided?: boolean; // sent line cancelled by an owner
  voidReason?: string;
  voidKotId?: ID;
  createdAt: number;
}

export type KotKind = 'NEW' | 'ADDED' | 'VOID';

/** Where the ticket is in the kitchen. Missing on old records = 'served'. */
export type KitchenStatus = 'new' | 'preparing' | 'ready' | 'served';

export type PrintStatus =
  | 'pending' // not attempted yet
  | 'printing'
  | 'printed' // delivered to printer (native) or confirmed by staff (browser)
  | 'awaiting_confirmation' // browser dialog opened, staff must confirm
  | 'failed';

export interface KotLine {
  name: string;
  qty: number;
  note?: string;
}

export interface Kot {
  id: ID;
  kotNo: number;
  orderId: ID;
  orderNo: number;
  tableLabel: string;
  roomName: string;
  takeaway?: boolean;
  customerName?: string;
  kind: KotKind;
  lines: KotLine[];
  staffName: string;
  createdAt: number;
  printStatus: PrintStatus;
  printCount: number; // successful prints (reprints increase this)
  lastError?: string;
  kitchenStatus?: KitchenStatus;
  statusAt?: number; // when kitchenStatus last changed
}

export type PrintDocType = 'kot' | 'invoice' | 'test';

export interface PrintAttempt {
  id: ID;
  docType: PrintDocType;
  docId: ID;
  at: number;
  method: PrinterMethod;
  ok: boolean;
  reprint: boolean;
  error?: string;
}

export type DiscountType = 'none' | 'percent' | 'amount';

export interface InvoiceLine {
  name: string;
  qty: number;
  unitPrice: number;
  amount: number;
}

export interface InvoiceTax {
  name: string;
  ratePercent: number;
  amount: number;
}

export type InvoiceStatus = 'unpaid' | 'paid' | 'cancelled';
export type PaymentMethod = 'cash' | 'upi';

export interface Invoice {
  id: ID;
  invoiceNo: string; // unique
  seq: number;
  orderId: ID;
  orderNo: number;
  tableLabel: string;
  roomName: string;
  takeaway?: boolean;
  customerName?: string;
  lines: InvoiceLine[];
  subtotal: number;
  discountType: DiscountType;
  discountValue: number; // percent (e.g. 10) or paise
  discountAmount: number;
  taxableAmount: number;
  taxes: InvoiceTax[];
  roundOff: number;
  total: number;
  status: InvoiceStatus;
  restaurant: RestaurantProfile; // snapshot for faithful reprints
  staffName: string;
  createdAt: number;
  paidAt?: number;
  paymentMethod?: PaymentMethod;
  cancelledAt?: number;
  cancelReason?: string;
  cancelledBy?: string;
  printStatus: PrintStatus;
  printCount: number;
}

export interface Payment {
  id: ID;
  invoiceId: ID;
  orderId: ID;
  method: PaymentMethod;
  amount: number;
  at: number;
  staffName: string;
}

export interface TaxRate {
  id: ID;
  name: string; // "CGST", "SGST", "Service charge"
  ratePercent: number;
  enabled: boolean;
}

export interface RestaurantProfile {
  name: string;
  address: string;
  phone: string;
  gstin: string;
  footer: string;
}

export type PrinterMethod = 'native' | 'browser';
export type PaperWidth = 58 | 80;

export interface PrinterSettings {
  method: PrinterMethod;
  host: string;
  port: number;
  paperWidth: PaperWidth;
  autoPrintKot: boolean;
  copiesKot: number;
}

export interface AppSettings {
  key: 'app';
  restaurant: RestaurantProfile;
  taxes: TaxRate[];
  roundToRupee: boolean;
  invoicePrefix: string;
  printer: PrinterSettings;
  requirePin: boolean;
  setupComplete: boolean;
}

export interface Counter {
  name: 'order' | 'kot' | 'invoice';
  value: number;
}

export interface Meta {
  key: string;
  value: unknown;
}

export interface AuditEntry {
  id: ID;
  at: number;
  action: string;
  detail: string;
  staffName: string;
}
