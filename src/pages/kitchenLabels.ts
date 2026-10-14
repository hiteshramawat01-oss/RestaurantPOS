import type { KitchenStatus, Kot, PrintStatus } from '../db/types';

export const PRINT_TAG: Record<PrintStatus, { color: string; label: string }> = {
  pending: { color: 'default', label: 'Not printed' },
  printing: { color: 'processing', label: 'Printing…' },
  printed: { color: 'success', label: 'Printed' },
  awaiting_confirmation: { color: 'warning', label: 'Confirm print' },
  failed: { color: 'error', label: 'Print failed' },
};

export const KIND_TAG: Record<Kot['kind'], { color: string; label: string }> = {
  NEW: { color: 'blue', label: 'New order' },
  ADDED: { color: 'gold', label: 'Added items' },
  VOID: { color: 'red', label: 'Cancel / void' },
};

export const STATUS_LABEL: Record<KitchenStatus, string> = {
  new: 'New',
  preparing: 'Preparing',
  ready: 'Ready',
  served: 'Served',
};
