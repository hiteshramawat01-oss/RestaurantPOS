import { useSyncExternalStore } from 'react';
import { GITHUB_OWNER, GITHUB_REPO, RELEASES_URL } from '../config';
import { isNativeApp } from '../printing/nativePrinter';
import { APP_VERSION, BUILD_CHANNEL, BUILD_NUMBER, NATIVE_ID } from '../version';

export interface UpdateCheck {
  kind: 'pwa' | 'apk';
  installed: string;
  latest?: string;
  notes: string[];
  releasedAt?: string;
  checkedAt: number;
  updateAvailable: boolean;
  downloadUrl?: string;
  mode?: 'live' | 'apk'; // Android: installs by itself, or needs a new APK
  error?: string;
}

export interface LiveUpdateState {
  status: 'downloading' | 'ready' | 'error';
  version: string;
  error?: string;
}

/* ---------- shared state (service worker + last check) ---------- */

interface UpdateState {
  registration?: ServiceWorkerRegistration;
  needRefresh: boolean;
  applyUpdate?: () => Promise<void>;
  lastCheck?: UpdateCheck;
  live?: LiveUpdateState;
  applyLive?: () => Promise<void>;
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

/* ---------- Android app: releases + live updates ---------- */

/**
 * What a GitHub release says about itself. The CI and release workflows write
 * these lines into the release notes:
 *   Version: 1.2.0 / Build number: 7 / Native: <fingerprint> / Bundle SHA-256: <hex>
 */
export interface ReleaseInfo {
  version: string;
  build: number;
  nativeId: string;
  bundleSha256: string;
  bundleUrl?: string;
  apkUrl?: string;
  pageUrl: string;
  notes: string[];
  publishedAt?: string;
}

export function parseRelease(rel: {
  tag_name?: string;
  body?: string;
  published_at?: string;
  html_url: string;
  assets?: { name: string; browser_download_url: string }[];
}): ReleaseInfo {
  const body = rel.body ?? '';
  const field = (name: string) => new RegExp(`^${name}: *(\\S+)`, 'm').exec(body)?.[1] ?? '';
  return {
    version: field('Version') || (rel.tag_name ?? '').replace(/^v/i, ''),
    build: Number(field('Build number')) || 0,
    nativeId: field('Native'),
    bundleSha256: field('Bundle SHA-256').toLowerCase(),
    bundleUrl: rel.assets?.find((a) => a.name === 'web-bundle.zip')?.browser_download_url,
    apkUrl: rel.assets?.find((a) => a.name.endsWith('.apk'))?.browser_download_url,
    pageUrl: rel.html_url,
    notes: body
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('- ') || l.startsWith('* '))
      .map((l) => l.slice(2)),
    publishedAt: rel.published_at,
  };
}

/** Is the release newer than what is running? Test builds compare CI build numbers. */
export function isNewer(info: Pick<ReleaseInfo, 'version' | 'build'>, channel = BUILD_CHANNEL, version = APP_VERSION, build = BUILD_NUMBER): boolean {
  if (channel === 'test') return info.build > build;
  return compareVersions(info.version, version) > 0;
}

/** A web-only update is safe only if it was built for the same native app (APK). */
export function canLiveUpdate(info: Pick<ReleaseInfo, 'nativeId' | 'bundleUrl' | 'bundleSha256'>, nativeId = NATIVE_ID): boolean {
  return !!nativeId && info.nativeId === nativeId && !!info.bundleUrl && /^[0-9a-f]{64}$/.test(info.bundleSha256);
}

async function fetchRelease(): Promise<ReleaseInfo | null> {
  // Public, unauthenticated read of this repository's releases. No token is embedded in the app.
  const path = BUILD_CHANNEL === 'test' ? 'releases/tags/test-build' : 'releases/latest';
  const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/${path}`, {
    headers: { Accept: 'application/vnd.github+json' },
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  return parseRelease(await res.json());
}

const label = (info: Pick<ReleaseInfo, 'version' | 'build'>) =>
  BUILD_CHANNEL === 'test' ? `${info.version} (test build ${info.build})` : info.version;

let liveJob: Promise<void> | null = null;

/** Download a web bundle and queue it; it switches in when the app next goes to the background. */
async function stageLiveUpdate(info: ReleaseInfo): Promise<void> {
  if (liveJob) return liveJob;
  liveJob = (async () => {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
    const bundleVersion = `${info.version}+${info.build}`;
    try {
      setUpdateState({ live: { status: 'downloading', version: label(info) } });
      const { bundles } = await CapacitorUpdater.list();
      let bundle = bundles.find((b) => b.version === bundleVersion && b.status === 'success');
      if (!bundle)
        bundle = await CapacitorUpdater.download({ url: info.bundleUrl!, version: bundleVersion, checksum: info.bundleSha256 });
      await CapacitorUpdater.next({ id: bundle.id });
      const id = bundle.id;
      setUpdateState({
        live: { status: 'ready', version: label(info) },
        applyLive: async () => {
          await CapacitorUpdater.set({ id }); // reloads the app with the new version
        },
      });
    } catch (e) {
      setUpdateState({ live: { status: 'error', version: label(info), error: e instanceof Error ? e.message : String(e) } });
    } finally {
      liveJob = null;
    }
  })();
  return liveJob;
}

async function checkApk(): Promise<UpdateCheck> {
  const installed = BUILD_CHANNEL === 'test' ? `${APP_VERSION} (test build ${BUILD_NUMBER})` : APP_VERSION;
  const base: UpdateCheck = { kind: 'apk', installed, notes: [], checkedAt: Date.now(), updateAvailable: false };
  const info = await fetchRelease();
  if (!info) return { ...base, error: BUILD_CHANNEL === 'test' ? 'No test build is published right now.' : 'No release has been published yet.' };
  const result: UpdateCheck = {
    ...base,
    latest: label(info),
    releasedAt: info.publishedAt,
    notes: info.notes,
    updateAvailable: isNewer(info),
    downloadUrl: info.apkUrl ?? info.pageUrl ?? RELEASES_URL,
  };
  if (!result.updateAvailable) return result;
  if (canLiveUpdate(info)) {
    result.mode = 'live';
    void stageLiveUpdate(info);
  } else result.mode = 'apk';
  return result;
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

/**
 * Android app only: tell the updater this version started correctly (otherwise
 * it rolls back to the previous one), then check for updates now and every
 * 30 minutes while online. Updates download silently and switch in the next
 * time the app is closed or sent to the background, so an order in progress
 * is never interrupted.
 */
export async function startNativeAutoUpdates(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
    await CapacitorUpdater.notifyAppReady();
  } catch {
    /* updater not available in this build */
  }
  const run = () => {
    if (navigator.onLine) void checkForUpdates();
  };
  setTimeout(run, 8000);
  setInterval(run, 30 * 60 * 1000);
  window.addEventListener('online', run);
}
