import type { Transaction } from 'dexie';
import { db } from '../db/db';
import type { Counter, StaffRole } from '../db/types';
import { newId } from '../lib/id';

/** The person performing an action (from the staff session). */
export interface Actor {
  id: string;
  name: string;
  role: StaffRole;
}

/** Errors with a message meant to be shown to staff as-is. */
export class PosError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'PosError';
  }
}

export function requireOwner(actor: Actor, what: string) {
  if (actor.role !== 'owner') {
    throw new PosError('NOT_AUTHORIZED', `Only the owner can ${what}. Switch user to continue.`);
  }
}

/** Increment and return a named counter. Must be called inside a rw transaction on `counters`. */
export async function nextNumber(name: Counter['name']): Promise<number> {
  const current = await db.counters.get(name);
  const value = (current?.value ?? 0) + 1;
  await db.counters.put({ name, value });
  return value;
}

export async function addAudit(action: string, detail: string, actor: Actor) {
  await db.audit.add({ id: newId(), at: Date.now(), action, detail, staffName: actor.name });
}

export type Tx = Transaction;
