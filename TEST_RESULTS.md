# PrepLadder Tracker reliability checks — 17 October 2026

## Automated checks

- Core tests: 725 unique lectures, 11 subjects, all nine supplied durations, 2,151,600 total seconds (597h40m), zero preset completion in a new installation, and exact check/uncheck calculations.
- Backup checks: complete export, checksum validation, malformed/corrupted backup rejection, merge reversals, unrelated-course rejection, replace, and safety restoration.
- Chrome browser checks: automatic saving, page reload, browser close/reopen, offline reload and edits, mobile width (390px) and desktop layout width.
- Reliability checks: concurrent edits in two tabs, several rapid checkbox clicks, a simulated storage failure with checkbox rollback, and refusal to overwrite newer data from a stale import.
- Retention check: saved progress remains after browser restart while offline and with the page's date advanced by 400 days. This proves there is no application-level date expiry; it is not a real 400-day endurance test.
- Upgrade check: original cached app and service worker with 59 preset checks upgrade to zero preset checks, with a safety snapshot. A second profile retains its manually checked lecture. Both work after offline reload and offline browser restart.

Tests use isolated browser profiles and do not add completed lectures to a user's installed app.

## Limits

Real months of usage, Windows/device power loss, Android physical hardware, and browser storage eviction cannot be proven by these tests. IndexedDB storage persists across normal restarts, and the app requests persistent storage. Export JSON backups regularly; clearing app/site storage or losing the device can still remove progress. Manual backup transfer is required between devices.
