# Install PrepLadder Offline Tracker

After GitHub Pages finishes publishing, open **https://arai33760-afk.github.io/prepladder-offline-tracker/**. Keep this same address on both devices. The app starts with the 59 lectures already checked in the supplied workbook. Progress you later make on one device stays on that device until you transfer a JSON backup.

## Android with Chrome

1. Open the link in Chrome while online.
2. Tap Chrome's **⋮** menu, then **Install app** or **Add to Home screen**.
3. Open the installed app once while online so its files are cached.
4. On the **Backup & transfer** screen, import a JSON backup from your laptop if you have newer progress there.

The directly installable Android APK is also available as a separate local deliverable. It bundles the same lecture tracker and does not need an initial website visit.

## Windows with Chrome or Edge

1. Open the same link while online.
2. In Chrome, use the install icon in the address bar or **⋮ → Cast, save, and share → Install page as app**. In Edge, use the **App available** icon or **⋯ → Apps → Install this site as an app**.
3. Open the installed app once while online.
4. Import a JSON backup if you need to transfer newer progress from Android.

## Offline use and backups

After the first successful visit and service-worker installation, disconnect the network and reopen the app to confirm it works offline. Checking a lecture saves to IndexedDB and immediately recalculates remaining hours. Use **Backup & transfer → Export Backup** regularly and keep the JSON file outside the app. To move progress, send the JSON file to the other device, open **Import Backup**, review the preview, then choose **Merge progress** or **Replace existing data**. Clearing browser data or uninstalling the PWA/APK can erase local progress.

The site files and initial lecture data are public on GitHub Pages. Later completion changes and JSON backups stay local unless you explicitly share them. Do not upload personal backup JSON files to this repository.
