import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { db } from './db/db';
import type { Staff } from './db/types';
import type { Actor } from './services/common';

const KEY = 'pos.staffId';

function readStored(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function writeStored(id: string | null) {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: session lasts until reload */
  }
}

interface SessionValue {
  staff: Staff | undefined;
  actor: Actor | undefined;
  isOwner: boolean;
  loading: boolean;
  signIn: (staff: Staff) => void;
  signOut: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [staffId, setStaffId] = useState<string | null>(readStored);
  const staff = useLiveQuery(async () => (staffId ? ((await db.staff.get(staffId)) ?? null) : null), [staffId]);

  const signIn = useCallback((s: Staff) => {
    writeStored(s.id);
    setStaffId(s.id);
  }, []);
  const signOut = useCallback(() => {
    writeStored(null);
    setStaffId(null);
  }, []);

  const value = useMemo<SessionValue>(() => {
    const active = staff && staff.active ? staff : undefined;
    return {
      staff: active,
      actor: active ? { id: active.id, name: active.name, role: active.role } : undefined,
      isOwner: active?.role === 'owner',
      loading: staff === undefined && !!staffId,
      signIn,
      signOut,
    };
  }, [staff, staffId, signIn, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession outside SessionProvider');
  return ctx;
}

/** Actor for service calls. Screens using this are only rendered when signed in. */
export function useActor(): Actor {
  const { actor } = useSession();
  if (!actor) throw new Error('Not signed in');
  return actor;
}
