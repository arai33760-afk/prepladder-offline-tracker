# PrepLadder Lecture Tracker

A complete offline-first lecture checklist for the supplied PrepLadder workbook. The app contains **725 lectures in 11 subjects**, totaling **597h 40m**. Every lecture starts unchecked: **0 completed**, **725 remaining**, and **597h 40m remaining**. The nine missing durations were filled from the user's supplied table. See [DATA_AUDIT.md](DATA_AUDIT.md).

## Use it

Open a subject from the dashboard and tick or untick a lecture. The subject and overall remaining hours are recalculated from integer seconds and saved to IndexedDB after every change. A save failure restores the previous screen state and reports the error. Search and status filters help find lectures. Sort subject cards by workbook order, name, progress, or remaining hours.

The **Backup & transfer** screen exports a complete, checksummed JSON file. To move progress to another device, export there, transfer the file, and import it here. Review the comparison first:

- **Merge progress** keeps the later per-lecture change, including a later *uncheck*. Ties use change IDs deterministically. Merge requires the same course and identical metadata for matching lectures.
- **Replace existing data** restores the file exactly after a confirmation prompt.

Before either import, the app downloads a safety backup and atomically stores a safety snapshot alongside the new data. You can restore recent safety snapshots from the Backup & transfer screen. If device clocks are wrong, a newer change can be chosen incorrectly; set both clocks correctly or use Replace after reviewing the backup.

**Important:** Local progress is lost if you clear this site's storage or uninstall the PWA and its data. Keep regular JSON backups outside the app. Devices do not sync automatically while offline; exchange a backup file.

## Install on Android and Windows

### First publish once over HTTPS

The installable PWA needs an HTTPS address (or localhost for testing). The free, simple route is GitHub Pages:

1. Create a **public** GitHub repository, such as `prepladder-offline-tracker`.
2. Upload the **contents inside `dist/`** to the root of its `main` branch. `index.html`, `sw.js`, `seed.json`, and the `icons/` folder must all be present at the published root. Do not upload only the enclosing `dist` folder.
3. In repository **Settings → Pages**, choose **Deploy from a branch → main → /(root)** and save.
4. Open the HTTPS Pages URL shown there. For a project repository, it normally has the form `https://USERNAME.github.io/prepladder-offline-tracker/`.

Official setup reference: [GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site). HTTPS or localhost is required for PWA installation: [MDN installability guide](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

GitHub Pages serves the static application files. The site contains the lecture titles, durations, and original workbook checkmarks as source metadata, so those seed details are public if you choose a public host. **Later progress and backups stay on your devices** unless you explicitly share a backup. Never upload exported backup JSON files to the repository.

### Android Chrome

Open the HTTPS site in Chrome while online. Use **⋮ → Install app** (or **Add to Home screen**) and follow the prompt. Open the installed app once while online, then test it in airplane mode. Export a backup from your other device and import it here if needed.

Official reference: [Chrome Android web apps](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=en).

### Windows Chrome or Edge

Open the same HTTPS site while online. In Chrome, use the address bar install icon or **⋮ → Cast, save, and share → Install page as app**. In Edge, use the address bar **App available** icon and select **Install**. Open once while online and test with the network disconnected.

Official references: [Chrome desktop web apps](https://support.google.com/chrome/answer/9658361?hl=en) and [Microsoft Edge PWAs](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/ux).

Installation needs an initial online visit to cache the app. Daily lecture tracking, local persistence, search, statistics, and backup import/export operate offline after the service worker has installed. The static host is not an account, database, or recurring app service. It is needed only for initial installation and optional updates.

## Local preview and development

Runtime app code has **no third-party JavaScript dependencies**, external fonts, accounts, or APIs. Node.js 20+ is used only to build or serve a local preview.

```powershell
npm test
npm run build
npm run serve
```

Open `http://127.0.0.1:4173/` on the Windows machine. Browser installation from `file://` is unsupported, and a plain HTTP address on another device is not an installable PWA. The prebuilt `dist/` folder is already included; rebuilding is optional.

The optional browser test uses Playwright and Chrome: `npm run test:browser` after installing Playwright or setting `PLAYWRIGHT_PATH` to an existing Playwright package and `CHROME_PATH` to Chrome. The core tests use Node's built-in test runner.

## Data and implementation

- `src/seed.json` is the complete audited dataset. `durationSeconds` is an integer for every lecture. `initialCompleted` reflects the workbook's checkmarks. Nine records have `durationSource: "user-supplied"`.
- `source/PrepLadder_Subject_Checklist.xlsx` is a copy of the supplied source workbook. `scripts/extract_source.py` can regenerate the seed and audit report with Python plus `openpyxl`; it applies the nine documented supplemental durations. The source workbook itself is never edited.
- `src/core.js` owns calculations, validation, per-lecture updates, and merge rules.
- `src/storage.js` stores data and safety snapshots in IndexedDB transactions and requests persistent storage where supported.
- `src/backup.js` creates and validates SHA-256 checksummed, schema-versioned JSON backups.
- `src/sw.js` precaches the complete app. `scripts/build.mjs` stamps its cache version from the asset contents and copies deployable files into `dist/`.
- `tests/core.test.js` and `tests/browser.mjs` test source counts, exact math, backup handling, merge reversals, persistence, offline reload, and responsive width.

There is no chapter column or chapter heading structure in the workbook, so lectures appear in original worksheet order. The UI supports chapter sections if future structured data supplies chapter names. Additional Excel file import is intentionally not part of this version; importing unchecked new workbooks safely requires a separate source-matching workflow. JSON backup transfer is fully supported.

## Updates

Back up progress before publishing an update. Keep the same HTTPS URL and course/lecture IDs. A new service worker cache is created by the build. The app does not overwrite existing IndexedDB data with a changed seed, so edits to the course dataset require a planned data migration or a reviewed backup replacement.

The clean-start update removes only inherited workbook checkmarks on existing installs, saves a safety snapshot first, and keeps all explicit user changes. Default unchecked records use an epoch timestamp so they cannot override real study progress during merges. A deliberately imported or restored backup retains its recorded statuses.

Updates download fresh assets, then refresh open tracker tabs. Current versions wait for pending saves and backup previews before reloading. Older cached versions are also refreshed automatically when the new worker installs. The build includes the worker itself in its version hash. Reopen the app online to receive updates; offline use keeps the installed version.

## Saving and reliability

Progress has no expiry date. Each checkbox change reads and updates the latest IndexedDB record in one transaction, with strict disk durability requested where supported. Rapid clicks are queued. Open tabs notify each other after saves; an older tab cannot replace newer progress during a backup import. Failed saves show an error and restore the displayed checkbox to its saved state.

This does not guarantee permanent storage: clearing browser/app data, losing the device, disk failure, or browser storage eviction can remove local records. Persistent-storage permission is requested where available, but the browser decides whether to grant it. Keep periodic JSON backups outside the app, especially before browser/device cleanup. A safety snapshot in the same browser is not a substitute for an exported backup.

`npm run test:update` tests an actual cached original release upgrading to the current version, including a profile with manually recorded progress. It requires this repository's Git history plus the same Playwright/Chrome setup as the browser tests. See `TEST_RESULTS.md` for tested behavior and limits.
