# Manual test checklist (Android)

Run this on the real phone/tablet and printer before using the app with customers, and again after big updates. Tick each item.

## 1. Install

- [ ] APK installs from the Releases page (or the web app installs from Chrome via **Install app**).
- [ ] App icon and name “Restaurant POS” appear on the home screen; it opens full screen without the browser bar.
- [ ] Sign in as Owner with PIN 1234, then change the PIN in Settings → Staff and PINs.
- [ ] Settings → Restaurant details: enter name, address, phone; save.

## 2. Printer

- [ ] Printer IP reserved in the router.
- [ ] Settings → Printer → (APK) Direct Wi-Fi, IP, port 9100 → **Print test page** prints; all 48 (or 32) columns fit on one line; bold, tall and inverted text look right; the paper is cut.
- [ ] **Check printer** reports “online and ready”. Open the cover / remove paper and check again: the problem is reported (if the model supports status).
- [ ] Turn the printer off, send a KOT: the app shows “did not print” with the reason, the table shows **Print failed**, the Orders badge shows 1. Turn it on, tap **Retry** in Orders → prints once.
- [ ] Web app only: the print dialog shows the thermal printer, the slip prints at the right width, and answering “No” to “Did it print?” marks it failed.

## 3. Taking orders

- [ ] Tap a free table → add dishes by tapping, search a dish, change quantities, add a note (“Less spicy”).
- [ ] Leave the order screen without sending: the app warns; the items are still there when you come back.
- [ ] **Send to kitchen** → one KOT prints with **NEW ORDER**, table, room, KOT number, order number, time, staff name, items, quantities and notes, and **no prices**.
- [ ] Double-tap **Send to kitchen** quickly: only one ticket prints.
- [ ] Add more items to the same table → **ADDED ITEMS** slip contains only the new items.
- [ ] Owner: void a sent item with a reason → **CANCEL / VOID** slip prints; the item is struck through and removed from the total.
- [ ] Owner: move an order to a free table; the old table becomes free.
- [ ] Mark a dish **Sold out** in Menu: it cannot be added.
- [ ] Reprint a KOT from Orders → Kitchen tickets: it says **REPRINT – NOT A NEW ORDER**.

## 4. Billing

- [ ] **Request bill** → table shows **Bill pending**.
- [ ] As staff, discounts are not offered; as Owner, apply 10% → total updates.
- [ ] Settings → Taxes: enable your applicable rates; the bill shows them after the discount.
- [ ] **Finalize and print bill** → bill prints with invoice number, items, quantity × rate, totals, round-off, “Payment due”.
- [ ] Enter cash received → change is shown. **Paid by cash** → confirm → table becomes free.
- [ ] Owner: cancel an unpaid invoice with a reason → a new invoice gets the next number; the cancelled one stays in Sales marked Cancelled.
- [ ] Owner: refund a paid invoice in Sales → it leaves the sales total.

## 5. Sales

- [ ] Totals match the bills printed today; cash + UPI = total sales.
- [ ] Unpaid and cancelled bills are listed separately and not counted as sales.
- [ ] Open an old invoice → **Reprint** prints “DUPLICATE COPY”.

## 6. Offline and data safety

- [ ] Turn on **airplane mode**, then turn Wi-Fi back on (no internet on the router, or unplug the router's internet cable): open the app, take an order, print the KOT, bill it, view Sales.
- [ ] Fully close the app (swipe away) and reopen: everything is still there.
- [ ] Restart the phone: everything is still there.
- [ ] Settings → Backup → **Download backup** → save the file to Drive or another device.
- [ ] Restore that backup (type RESTORE): data matches. Try restoring a random .json file: it is rejected and nothing changes.

## 7. Updates

- [ ] Settings → App updates → **Check for updates** shows installed and latest version and the last check time.
- [ ] After a new release: the web app shows **Update now**; the APK offers **Download update**. After updating, all orders, invoices and settings are still there.

## 8. Daily use comfort

- [ ] All buttons are easy to hit with a thumb; text is readable at arm's length and in bright light.
- [ ] Rotate the tablet: layouts adapt (order screen shows menu and ticket side by side on tablets).
