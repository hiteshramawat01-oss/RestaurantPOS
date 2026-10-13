// Fingerprint of everything that is compiled into the Android app itself
// (native code, Gradle config, Capacitor plugin versions). A web-only live
// update is only safe when the installed APK has the same fingerprint as the
// one the update was built with; otherwise a new APK must be installed.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

export function nativeId() {
  const h = createHash('sha256');
  const files = [
    ...walk(join(root, 'android/app/src/main/java')),
    join(root, 'android/app/src/main/AndroidManifest.xml'),
    join(root, 'android/app/build.gradle'),
    join(root, 'android/variables.gradle'),
    join(root, 'capacitor.config.ts'),
  ];
  for (const f of files) {
    h.update(relative(root, f).replace(/\\/g, '/'));
    h.update(readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));
  }
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const name of Object.keys(deps).sort())
    if (name.startsWith('@capacitor/') || name.startsWith('@capgo/')) h.update(`${name}@${deps[name]}`);
  return h.digest('hex').slice(0, 12);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log(nativeId());
