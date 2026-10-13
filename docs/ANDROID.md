# Android app (APK)

The APK is the same web app wrapped with [Capacitor](https://capacitorjs.com), plus a native plugin for direct Wi-Fi printing. You do not need Android Studio: GitHub Actions builds it.

## Getting an APK

- **Signed release (use this in the restaurant):** push a version tag (see README → *Making a release*). The APK is attached to the GitHub Release.
- **Test build (quick testing):** every push to `main` runs CI and publishes the APK as the **test-build** pre-release on the Releases page. Test builds are signed with a fixed test key (`android/app/test-signing.p12`, public in this repo), so a newer test build installs over an older one and keeps the data; the installed test app finds new test builds in **Settings → App updates**. Test and signed release APKs cannot replace each other: back up, uninstall, install, restore. Use signed releases for real restaurant use.

## Signing key

Android only installs an update over an existing app if both are signed with the **same key**. The release workflow signs with a key stored in GitHub secrets.

Add these four repository secrets (**Settings → Secrets and variables → Actions → New repository secret**):

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the keystore file, base64-encoded (one long line) |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias |
| `ANDROID_KEY_PASSWORD` | key password |

To create a new keystore yourself (needs a JDK on a computer):

```bash
keytool -genkeypair -v -keystore restaurant-pos-release.jks -keyalg RSA -keysize 2048 \
  -validity 10000 -alias restaurantpos
base64 -w0 restaurant-pos-release.jks > keystore-base64.txt     # macOS: base64 -i restaurant-pos-release.jks
```

**Keep the `.jks` file and passwords somewhere safe (password manager, encrypted drive).** If the key is lost, future APKs cannot update the installed app; you would have to back up, uninstall, install the new APK and restore. Never commit the keystore to the repository (`*.jks` is in `.gitignore`).

If the secrets are missing, the release workflow still runs but produces a debug APK and shows a warning.

## Building locally (optional)

Needs Android Studio (or the Android SDK) and JDK 21 on a computer.

```bash
npm install
npm run android:sync     # build web app and copy it into android/
npm run android:open     # open in Android Studio, then Run on a USB-connected phone
```

Command-line debug build: `cd android && ./gradlew assembleDebug` → `android/app/build/outputs/apk/debug/app-debug.apk`.

The APK version comes from `package.json` (`versionName`), and `versionCode` is computed from it (1.2.3 → 10203), so every release must bump the version.

## Updating the installed APK

**Automatic (most updates).** Each release (and each test build) also publishes `web-bundle.zip`: the app's screens and logic. The installed app checks this repository's GitHub releases on start and every 30 minutes while online. When a newer version exists it downloads the bundle in the background ([@capgo/capacitor-updater](https://github.com/Cap-go/capacitor-updater) in manual mode, no Capgo cloud, statistics switched off) and installs it the next time the app is closed or sent to the background. Staff can also tap **Restart now**. Data stays, because the app keeps the same internal address.

Safety checks:

- Only this repository's own releases are used, over HTTPS, without any token in the app.
- The bundle's SHA-256 must match the value written in the release notes by the workflow, or it is rejected.
- After an update starts, the app must report that it opened its database correctly within 15 seconds, or the updater switches back to the previous version.
- A bundle is used only if it was built for the same native app: the workflow records a fingerprint of the Android code, Gradle config and Capacitor plugin versions (`scripts/native-id.mjs`) and the app compares it with its own.

**Manual (when the Android part changes).** If the native fingerprint differs (new plugin, printer code, Capacitor upgrade), Settings → App updates shows **Download update**: open the APK and install it over the existing app. Data stays, because the package name and signing key are the same.

## Native printing plugin

`android/app/src/main/java/com/restaurantpos/app/EscPosPrinterPlugin.java`

- `print({ host, port, data, timeoutMs })` opens a TCP socket to the printer, writes the ESC/POS bytes (base64 from the web layer), half-closes, and resolves when the printer has accepted the data. Errors are reported as timeout / refused / unreachable / unknown host.
- `status({ host, port })` checks the connection and sends ESC/POS real-time status requests (`DLE EOT 1/2/4`) for offline, cover-open, paper-low and paper-out. Printers that do not answer are reported as reachable without details.
- Jobs run one at a time on a background thread, because most receipt printers accept only one connection.
- Target SDK 36: local network access is covered by the `INTERNET` permission. At target SDK 37+, `ACCESS_LOCAL_NETWORK` must be declared and requested.
