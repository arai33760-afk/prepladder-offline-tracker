import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(import.meta.dirname, '..');
const files = ['index.html','styles.css','app.js','core.js','storage.js','backup.js','seed.json','manifest.webmanifest','sw.js','icons/icon-192.png','icons/icon-512.png'];
const old = new Map(files.map(file => [file, execFileSync('git', ['show', `efb3288:${file}`], { cwd: root })]));
const current = new Map(await Promise.all(files.map(async file => [file, await readFile(path.join(root, 'dist', file))])));
let content = old;
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.webmanifest':'application/manifest+json', '.png':'image/png' };
const server = createServer((req, res) => {
  const file = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (!content.has(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)], 'Cache-Control': file === 'sw.js' ? 'no-cache' : 'public, max-age=3600' });
  res.end(content.get(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const profiles = [];
const sessions = [];
const options = { headless:true, executablePath:process.env.CHROME_PATH || undefined };
try {
  for (const manual of [false, true]) {
    const profile = await mkdtemp(path.join(os.tmpdir(), 'prepladder-upgrade-'));
    profiles.push(profile);
    const context = await chromium.launchPersistentContext(profile, options);
    const page = context.pages()[0];
    sessions.push({ context, page, profile, manual });
    page.on('pageerror', error => console.log('PAGE ERROR', error.message));
    await page.goto(url);
    await page.locator('.subject-card').first().waitFor();
    assert.equal(await page.locator('.hero-number').innerText(), '551h 34m');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.locator('.subject-card').first().waitFor();
    if (manual) {
      await page.locator('.subject-card').first().click();
      const checkbox = page.locator('.lecture-check').first();
      await checkbox.check();
      await page.waitForFunction(() => !document.querySelector('.lecture-check').disabled);
      await page.locator('.back-link').click();
    }
  }
  content = current;
  for (const session of sessions) {
    const { page, context, manual } = session;
    // Begin from a genuinely cached old app and its old worker, not injected legacy data.
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await page.getByText('Every lecture starts unchecked.', { exact:false }).waitFor({ timeout:30000 });
    const result = await page.evaluate(async () => {
      const { openDatabase, readState, listSafetySnapshots } = await import('./storage.js');
      const { stats } = await import('./core.js');
      const db = await openDatabase();
      const state = await readState(db);
      const totals = stats(state);
      const snapshots = await listSafetySnapshots(db);
      db.close();
      return { completed:totals.completedLectures, snapshots:snapshots.length, medicine:stats(state, state.subjects.find(s => s.name === 'Internal Medicine').id).completedLectures };
    });
    assert.deepEqual(result, { completed:manual ? 1 : 0, snapshots:1, medicine:0 });
    if (!manual) assert.equal(await page.locator('.hero-number').innerText(), '597h 40m');
    const beforeOffline = await page.locator('.hero-number').innerText();
    await context.setOffline(true);
    await page.reload();
    await page.locator('.subject-card').first().waitFor();
    assert.equal(await page.locator('.hero-number').innerText(), beforeOffline);
    await context.close();
    session.context = null;
    const reopened = await chromium.launchPersistentContext(session.profile, options);
    session.context = reopened;
    await reopened.setOffline(true);
    const reopenedPage = reopened.pages()[0];
    await reopenedPage.goto(url);
    await reopenedPage.locator('.subject-card').first().waitFor();
    assert.equal(await reopenedPage.locator('.hero-number').innerText(), beforeOffline);
  }
  console.log('Actual cached old-to-new upgrade passed: preset checks removed, manual progress retained, safety snapshot saved, offline reload and offline browser restart preserved data.');
} finally {
  for (const session of sessions) if (session.context) await session.context.close();
  await new Promise(resolve => server.close(resolve));
  for (const profile of profiles) {
    assert.ok(path.resolve(profile).startsWith(path.resolve(os.tmpdir()) + path.sep + 'prepladder-upgrade-'));
    await rm(profile, { recursive:true, force:true, maxRetries:3, retryDelay:200 }).catch(error => console.log('Test profile cleanup:', error.code));
  }
}
