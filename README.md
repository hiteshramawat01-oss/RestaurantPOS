# Restaurant POS

An offline point-of-sale app for a small restaurant: tables, order taking, kitchen order tickets (KOT), billing, daily sales, menu and settings. It runs on one Android phone or tablet, stores everything on the device, and prints to a Wi-Fi thermal receipt printer.

- No cloud, no server, no subscription. After the first install it works without internet.
- Two ways to install: an **Android app (APK)** with one-tap Wi-Fi printing (recommended), or a **web app (PWA)** installed from Chrome that prints through the Android print dialog.

## Contents

1. [What it does](#what-it-does)
2. [Quick start for development](#quick-start-for-development)
3. [Install on Android](#install-on-android)
4. [Printer setup](#printer-setup)
5. [Deploying and releasing updates](#deploying-and-releasing-updates)
6. [Backup and restore](#backup-and-restore)
7. [Project structure](#project-structure)
8. [Testing](#testing)
9. [Known limitations and untested hardware](#known-limitations-and-untested-hardware)

---

## What it does

| Section | What staff do there |
| --- | --- |
| **Tables** | See AC and Non-AC tables as Free / Occupied / Bill pending, with running total and time since the order started. Tap a table to start or continue its order. Start a **takeaway** (parcel) order with **New takeaway**; takeaway orders have no table, any number can be open, and an optional customer name prints on the slip and bill. |
| **Orders** | Active orders, and every kitchen ticket with its print status (Printed, Print failed, Confirm print). Retry or reprint here. |
| **Billing** | Bill-pending tables. Apply a discount (owner), finalize the invoice, print it, and record Cash or UPI payment. |
| **Menu** | Dishes by category. Anyone can mark a dish sold out; the owner edits names, prices and kitchen instructions. |
| **Settings** | Printer (find printers on the phone's Wi-Fi, paper width, name on slips, test print) and App update. |

Order flow: **Tap table → tap dishes → Send to kitchen** (KOT prints) → add more later (a separate **ADDED ITEMS** slip prints with only the new dishes) → **Request bill** → **Finalize and print bill** → **Paid by cash / UPI** (table becomes free).

Safety built in:

- One active order per table, even with double taps.
- Each dish line is sent to the kitchen exactly once; a second tap on *Send* cannot create a duplicate ticket.
- Lines already sent are locked. Cancelling them needs the owner, a reason, and prints a **CANCEL / VOID** slip.
- A slip is marked *Printed* only when the printer accepted it (APK) or a staff member confirmed it came out (print dialog). Reprints say **REPRINT – NOT A NEW ORDER**.
- Invoices are frozen once finalized. Corrections are done by the owner cancelling the invoice (with a reason, kept on record) and issuing a new one. Invoice numbers are unique and never reused.
- An order closes only after staff confirm payment.
- No tax is charged until the owner switches on the rates that apply (Settings → Taxes). The app does not decide GST compliance.

There is no sign-in: the app opens straight to the tables (AC 1–5, Non-AC 1–8).

---

## Quick start for development

Requirements on the computer: Node.js 22 or newer and Git.

```bash
git clone https://github.com/hiteshramawat01-oss/RestaurantPOS.git
cd RestaurantPOS
npm install
npm run dev          # http://localhost:5173 and http://<computer-ip>:5173 on the Wi-Fi
```

Other commands:

```bash
npm test             # unit tests (Vitest)
npm run typecheck    # TypeScript
npm run build        # production build into dist/
npm run preview      # serve the production build (offline/service worker behaviour)
```

**Testing on a phone during development:** connect the phone to the same Wi-Fi as the computer and open `http://<computer-ip>:5173` in Chrome (the dev server prints the address). Everything works except installing as an app and offline caching, which need HTTPS (use the deployed GitHub Pages version or the APK for those). Nothing needs to be installed on the phone.

---

## Install on Android

### Option A — Android app (APK), recommended

Direct one-tap printing to the Wi-Fi printer only works in the APK. See [docs/ANDROID.md](docs/ANDROID.md) for building and signing.

1. On the phone, open the latest release: <https://github.com/hiteshramawat01-oss/RestaurantPOS/releases/latest>
2. Download `restaurant-pos-X.Y.Z.apk`.
3. Open it. Android asks to allow installing from this source (Chrome or Files) — allow it, then tap **Install**.
4. Open **Restaurant POS**, sign in as Owner, go to **Settings → Printer**, choose **Direct Wi-Fi**, enter the printer IP, and tap **Print test page**.

### Option B — Web app (PWA) from Chrome

1. On the phone, open <https://hiteshramawat01-oss.github.io/RestaurantPOS/> in **Chrome** (while online).
2. Chrome menu (⋮) → **Install app** (or **Add to Home screen**).
3. Open it from the home screen. It now works offline.
4. Printing uses the Android print dialog; set up a print service first (see [Printer setup](#printer-setup)).

The APK and the web app each keep their **own separate data**. Pick one per device. To move data between them, use backup and restore.

---

## Printer setup

**Recommended printer:** an 80 mm thermal receipt printer with Wi-Fi or Ethernet that supports **ESC/POS** and **raw TCP printing on port 9100** (most Epson TM-series compatibles do; check the spec sheet for “ESC/POS” and “port 9100 / RAW / JetDirect”). 58 mm printers are supported too.

1. Connect the printer to the restaurant Wi-Fi with its own setup tool or web page.
2. Print the printer's self-test page (usually: hold the FEED button while switching on) to see its IP address.
3. In the Wi-Fi router, reserve that IP for the printer (DHCP reservation / static lease) so it never changes.
4. In the app: **Settings → Printer**
   - **APK:** method **Direct Wi-Fi**, IP (e.g. `192.168.1.50`), port `9100`, paper width, then **Print test page** and **Check printer**.
   - **Web app:** install the printer maker's Android print-service plugin (or a print-service app that supports ESC/POS network printers), enable it in Android **Settings → Connected devices → Connection preferences → Printing**, choose **Print dialog** in the app, and run a test print. In the dialog, select the thermal printer and a matching paper size.
5. The phone and printer must be on the same Wi-Fi. Internet is not needed for printing.

How printing works and why:

- Browsers are not allowed to open network connections to printers, so a web app can only use the system print dialog. The app cannot see whether the paper came out, so it asks staff to confirm (“Did KOT #12 print?”).
- The APK contains a small native Android plugin (`android/app/src/main/java/com/restaurantpos/app/EscPosPrinterPlugin.java`) that sends ESC/POS bytes straight to `IP:9100`. A ticket is marked *Printed* when the printer has accepted the data. **Check printer** asks the printer for its status (paper out, cover open) when the model supports it.
- Kitchen slips never contain prices or payment details.

---

## Deploying and releasing updates

The code lives on GitHub. Two GitHub Actions workflows do the work:

- **CI** (`.github/workflows/ci.yml`) on every push: type-check, tests, web build, and a debug APK you can download from the run's **Artifacts**.
- **Release** (`.github/workflows/release.yml`) when a version tag is pushed: tests → deploys the web app to **GitHub Pages** (free hosting) → builds a **signed APK** → publishes a **GitHub Release** with the APK and notes from `CHANGELOG.md`.

### One-time GitHub setup

1. **Turn on GitHub Pages:** repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Add the APK signing key** as repository secrets (**Settings → Secrets and variables → Actions → New repository secret**): `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. See [docs/ANDROID.md](docs/ANDROID.md#signing-key). Keep the keystore file safe: every future update must be signed with it.

### Making a release

```bash
# 1. Describe the changes at the top of CHANGELOG.md under a new "## X.Y.Z" heading
# 2. Bump the version, commit and tag (patch / minor / major)
npm version patch
# 3. Push the commit and the tag
git push --follow-tags
```

The Release workflow refuses to run if the tag does not match `package.json`.

### How installed apps update

- **Web app:** each release publishes `version.json` (version, date, notes). **Settings → App updates → Check for updates** compares it with the installed version; the service worker downloads the new files in the background and a banner offers **Update now**. The app also checks hourly while online. Updates replace only program files; IndexedDB data (orders, bills, menu, settings) is never cleared.
- **APK:** the app checks the latest published GitHub Release (public, no token in the app) on start and every 30 minutes. Normal updates install themselves: the new screens download in the background, are verified by SHA-256, and switch in the next time the app is closed (with automatic rollback if they fail to start). Only updates that change the Android part itself need a new APK, which you install over the old one; the app tells you when. Details in [docs/ANDROID.md](docs/ANDROID.md#updating-the-installed-apk).

Both check *published releases*, not the latest commit.

---

## Backup and restore

All data lives only on the device. It is **not** synced anywhere. If the phone is lost, reset, or the app is uninstalled, the data is gone unless there is a backup.

- **Back up:** Settings → Backup and restore → **Download backup**. In the web app this saves a `.json` file to Downloads; in the APK it opens the Android share sheet so you can save it to Google Drive, WhatsApp, email or Files. Do this at least weekly and keep a copy off the phone. The screen shows when the last backup was made.
- **Restore (owner only):** **Restore from backup…** → pick the file. The app checks the file first (right app, not from a newer version, no missing tables, no broken or duplicate records, no duplicate invoice numbers) and shows what it contains. You must type `RESTORE` to confirm. The restore replaces all data in a single step: if anything fails, nothing changes.
- Moving to a new phone: back up on the old one, install the app on the new one, restore.

---

## Project structure

```
RestaurantPOS/
├── .github/workflows/        CI and release (Pages + APK + GitHub Release)
├── android/                  Capacitor Android project
│   └── app/src/main/java/com/restaurantpos/app/
│       ├── MainActivity.java         registers the printer plugin
│       └── EscPosPrinterPlugin.java  raw TCP ESC/POS printing + status
├── docs/
│   ├── ANDROID.md            APK build, signing key, updates
│   └── TESTING.md            manual Android test checklist
├── public/icons/             app icons
├── src/
│   ├── db/                   Dexie (IndexedDB) schema, migrations, seed data, types
│   ├── domain/               money and bill calculations (pure, tested)
│   ├── services/             orders, KOT, billing, sales, backup (transactions, tested)
│   ├── printing/             receipt layout, ESC/POS encoder, HTML print, native bridge, print service
│   ├── updates/              version check and service-worker update prompt
│   ├── pages/                Tables, Order, Orders, Billing, Sales, Menu, Settings (+ settings/*)
│   ├── components/           layout/navigation, order ticket, receipt preview
│   ├── hooks/ lib/           live queries, print flow, time helpers, ids
│   ├── session.tsx           signed-in staff member
│   ├── theme.ts styles/      Ant Design theme and SCSS
│   └── App.tsx main.tsx      boot (open DB, storage persistence), routes
├── capacitor.config.ts
├── vite.config.ts            PWA manifest, service worker, version.json, tests
└── CHANGELOG.md              release notes (shown in the app)
```

Stack: React 19, TypeScript, Vite, Ant Design 6, SCSS, Dexie 4 (IndexedDB), vite-plugin-pwa (Workbox), Vitest, Capacitor 8.

Data notes: money is stored as integer paise; the schema is versioned (`src/db/db.ts`) with upgrade functions and is never cleared on update; the app asks the browser for persistent storage.

---

## Testing

```bash
npm test
```

62 automated tests cover order totals, quantity changes, discounts and taxes, invoice totals and rounding, order/KOT/invoice numbering, adding items to an existing order (ADDED tickets), duplicate-submission and duplicate-print protection, voids, table moves, payment and cancellation workflows, database persistence across reopen, schema migration from v1, backup/restore validation and round-trip, sales calculations, and KOT/invoice slip layout and ESC/POS encoding.

The manual checklist for a real phone and printer is in [docs/TESTING.md](docs/TESTING.md).

---

## Known limitations and untested hardware

- **Not tested with a physical printer.** The ESC/POS output, the native TCP plugin and the browser print path were verified in code and automated tests only. Before going live, run the printer section of [docs/TESTING.md](docs/TESTING.md) with your printer.
- **The APK has not been run on a device yet.** It is built by GitHub Actions; the Android build itself could not be run in the environment used to write this code. Check the first CI/Release run.
- **Printing from the web app** depends on an Android print service for your printer and always shows a dialog. Some thermal printers have no Android print service; use the APK for those.
- Slips print plain ASCII. Hindi or other non-Latin dish names print as `?` on most thermal printers; use English names for dishes.
- Moving an order to another table does not reprint earlier kitchen slips (they still show the old table).
- One device is the source of truth. Two phones do not share orders. Cloud sync/backup is not part of this version.
- PINs are a convenience lock on a shared device, not strong security.
- If the APK's `targetSdkVersion` is raised to 37 or higher, Android's local network permission must be added before printing will work (see the note in `AndroidManifest.xml`).
- Taxes: the app applies the rates you configure on the post-discount amount. Confirm rates and invoice requirements with your accountant.
