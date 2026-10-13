import { describe, expect, it } from 'vitest';
import { canLiveUpdate, isNewer, parseRelease } from './updates';

const sha = 'a'.repeat(64);
const release = {
  tag_name: 'test-build',
  html_url: 'https://github.com/o/r/releases/tag/test-build',
  published_at: '2026-10-13T14:00:00Z',
  body: [
    'Test build of the latest code.',
    '',
    'Version: 1.2.0',
    'Build number: 7',
    'Native: 93b4d375c28b',
    `Bundle SHA-256: ${sha.toUpperCase()}`,
    '',
    '- Takeaway orders',
    '- Faster billing',
  ].join('\n'),
  assets: [
    { name: 'restaurant-pos-test.apk', browser_download_url: 'https://x/app.apk' },
    { name: 'web-bundle.zip', browser_download_url: 'https://x/web-bundle.zip' },
  ],
};

describe('live updates', () => {
  it('reads version, build, native fingerprint and bundle from the release notes', () => {
    const info = parseRelease(release);
    expect(info).toMatchObject({
      version: '1.2.0',
      build: 7,
      nativeId: '93b4d375c28b',
      bundleSha256: sha,
      bundleUrl: 'https://x/web-bundle.zip',
      apkUrl: 'https://x/app.apk',
      notes: ['Takeaway orders', 'Faster billing'],
    });
  });

  it('test builds compare build numbers, releases compare versions', () => {
    expect(isNewer({ version: '1.1.1', build: 5 }, 'test', '1.1.1', 4)).toBe(true);
    expect(isNewer({ version: '1.1.1', build: 4 }, 'test', '1.1.1', 4)).toBe(false);
    expect(isNewer({ version: '1.2.0', build: 0 }, 'release', '1.1.9', 0)).toBe(true);
    expect(isNewer({ version: '1.1.0', build: 0 }, 'release', '1.1.0', 0)).toBe(false);
  });

  it('installs by itself only when the APK matches and the bundle has a checksum', () => {
    const info = parseRelease(release);
    expect(canLiveUpdate(info, '93b4d375c28b')).toBe(true);
    expect(canLiveUpdate(info, 'different123')).toBe(false); // native code changed: new APK needed
    expect(canLiveUpdate({ ...info, bundleSha256: '' }, '93b4d375c28b')).toBe(false);
    expect(canLiveUpdate({ ...info, bundleUrl: undefined }, '93b4d375c28b')).toBe(false);
  });

  it('falls back to the tag when the notes have no version line', () => {
    expect(parseRelease({ tag_name: 'v2.0.0', html_url: 'u', body: '' }).version).toBe('2.0.0');
  });
});
