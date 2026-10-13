import { useSyncExternalStore } from 'react';
import { GITHUB_OWNER, GITHUB_REPO, RELEASES_URL } from '../config';
import { isNativeApp } from '../printing/nativePrinter';
import { APP_VERSION } from '../version';

export interface UpdateCheck {
  kind: 'pwa' | 'apk';
  installed: string;
  latest?: string;
  notes: string[];
  releasedAt?: string;
  checkedAt: number;
  updateAvailable: boolean;
  downloadUrl?: string;
  error?: string;
}

/* ---------- shared state (service worker + last check) ---------- */

interface UpdateState {
  registration?: ServiceWorkerRegistration;
  needRefresh: boolean;
  applyUpdate?: () => Promise<void>;
  lastCheck?: UpdateCheck;
}

const LAST_CHECK_KEY = 'pos.lastUpdateCheck';
let state: UpdateState = { needRefresh: false, lastCheck: readLastCheck() };
const listeners = new Set<() => void>();

function readLastCheck(): UpdateCheck | undefined {
  try {
    const raw = localStorage.getItem(LAST_CHECK_KEY);
    return raw ? (JSON.parse(raw) as UpdateCheck) : undefined;
  } catch {
    return undefined;
  }
}

export function setUpdateState(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  if (patch.lastCheck) {
    try {
      localStorage.setItem(LAST_CHECK_KEY, JSON.stringify(patch.lastCheck));
    } catch {
      /* ignore */
    }
  }
  listeners.forEach((l) => l());
}

export function useUpdateState(): UpdateState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

/* ---------- version comparison ---------- */

/** Compare dotted versions ("1.10.0" > "1.9.3"). Returns 1, 0 or -1. */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.replace(/^v/i, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/* ---------- checks ---------- */

async function checkPwa(): Promise<UpdateCheck> {
  const base: UpdateCheck = { kind: 'pwa', installed: APP_VERSION, notes: [], checkedAt: Date.now(), updateAvailable: false };
  // version.json describes the release actually deployed, not the latest commit.
  const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Server answered ${res.status}`);
  const info = (await res.json()) as { version: string; releasedAt?: string; notes?: string[] };
  const newer = compareVersions(info.version, APP_VERSION) > 0;
  if (newer && state.registration) await state.registration.update().catch(() => undefined);
  return { ...base, latest: info.version, releasedAt: info.releasedAt, notes: info.notes ?? [], updateAvailable: newer };
}

async function checkApk(): Promise<UpdateCheck> {
  const base: UpdateCheck = { kind: 'apk', installed: APP_VERSION, notes: [], checkedAt: Date.now(), updateAvailable: false };
  // Public, unauthenticated read of the latest published release. No token is ever embedded.
  const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
    cache: 'no-store',
  });
  if (res.status === 404) return { ...base, error: 'No release has been published yet.' };
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  const rel = (await res.json()) as {
    tag_name: string;
    body?: string;
    published_at?: string;
    html_url: string;
    assets?: { name: string; browser_download_url: string }[];
  };
  const latest = rel.tag_name.replace(/^v/i, '');
  const apk = rel.assets?.find((a) => a.name.endsWith('.apk'));
  return {
    ...base,
    latest,
    releasedAt: rel.published_at,
    notes: (rel.body ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('- ') || l.startsWith('* '))
      .map((l) => l.slice(2)),
    updateAvailable: compareVersions(latest, APP_VERSION) > 0,
    downloadUrl: apk?.browser_download_url ?? rel.html_url ?? RELEASES_URL,
  };
}

export async function checkForUpdates(): Promise<UpdateCheck> {
  const kind = isNativeApp() ? 'apk' : 'pwa';
  let result: UpdateCheck;
  try {
    if (!navigator.onLine) throw new Error('This device is offline.');
    result = kind === 'apk' ? await checkApk() : await checkPwa();
  } catch (e) {
    result = {
      kind,
      installed: APP_VERSION,
      notes: [],
      checkedAt: Date.now(),
      updateAvailable: false,
      error: `Could not check for updates. ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  setUpdateState({ lastCheck: result });
  return result;
}
