import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(import.meta.dirname, '..', 'dist');
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
const server = createServer(async (req,res) => {
  try {
    const rel = new URL(req.url,'http://localhost').pathname.replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(root,rel);
    if (!file.startsWith(root+path.sep)) throw new Error('outside');
    const bytes = await readFile(file);
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});
    res.end(bytes);
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const url = process.env.TEST_URL || `http://127.0.0.1:${server.address().port}/`;
const profile = await mkdtemp(path.join(os.tmpdir(),'prepladder-browser-'));
let context;
try {
  context = await chromium.launchPersistentContext(profile,{headless:true,executablePath:process.env.CHROME_PATH || undefined,viewport:{width:1365,height:900},acceptDownloads:true});
  let page = context.pages()[0] || await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);
  await page.locator('.subject-card').first().waitFor();
  assert.equal(await page.locator('.hero-number').innerText(), '597h 40m');
  await page.evaluate(async () => {
    const core = await import('./core.js');
    const storage = await import('./storage.js');
    const db = await storage.openDatabase();
    const legacy = { ...await storage.readState(db), progress: {} };
    delete legacy.manualStartApplied;
    const lecture = legacy.lectures.find(item => !item.initialCompleted);
    await storage.writeState(db, core.setLectureCompletion(legacy, lecture.id, true));
    db.close();
  });
  await page.reload();
  await page.locator('.subject-card').first().waitFor();
  const migration = await page.evaluate(async () => {
    const core = await import('./core.js');
    const storage = await import('./storage.js');
    const db = await storage.openDatabase();
    const saved = await storage.readState(db);
    const result = { completed: core.stats(saved).completedLectures, safety: (await storage.listSafetySnapshots(db)).length };
    await storage.writeState(db, core.createInitialState(await (await fetch('./seed.json')).json()));
    db.close();
    return result;
  });
  assert.deepEqual(migration, { completed: 1, safety: 1 });
  await page.reload();
  await page.locator('.subject-card').first().waitFor();
  assert.equal(await page.locator('.subject-card').count(),11);
  assert.match(await page.locator('.hero-number').innerText(),/h \d\dm/);
  await page.locator('#theme-toggle').click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.reload();
  await page.locator('.subject-card').first().waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme),'dark');
  await page.locator('#theme-toggle').click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  const originalRemaining=await page.locator('.hero-number').innerText();
  await page.locator('.subject-card').first().click();
  await page.locator('#lecture-search').fill('Road Traffic');
  assert.equal(await page.locator('.lecture-row').count(),1);
  await page.locator('#lecture-search').fill('');
  await page.locator('[data-filter="completed"]').click();
  assert.equal(await page.locator('.lecture-row').count(),0);
  await page.locator('[data-filter="all"]').click();
  assert.equal(await page.locator('.lecture-row').count(),36);
  const checkbox=page.locator('.lecture-check:not(:checked)').first();
  const lectureId=await checkbox.getAttribute('data-lecture-id');
  await checkbox.check();
  const waitSaved = completed => page.waitForFunction(({id,completed}) => { const el=document.querySelector(`[data-lecture-id="${id}"]`); return el && !el.disabled && el.checked===completed; },{id:lectureId,completed});
  await waitSaved(true);
  await page.reload();
  assert.equal(await page.locator(`.lecture-check[data-lecture-id="${lectureId}"]`).isChecked(),true);
  await page.locator('.back-link').click();
  const reducedRemaining=await page.locator('.hero-number').innerText();
  assert.notEqual(reducedRemaining,originalRemaining);
  await page.locator('a[href="#backup"]').first().click();
  const downloadPromise=page.waitForEvent('download');
  await page.locator('[data-action="export"]').click();
  const download=await downloadPromise;
  const backupFile=path.join(profile,'exported.json');
  await download.saveAs(backupFile);
  const backup=JSON.parse(await readFile(backupFile,'utf8'));
  assert.equal(backup.state.lectures.length,725);
  assert.equal(backup.lectureStatus.filter(item => item.completed).length,1);
  assert.equal(backup.state.progress[lectureId].completed,true);
  await page.locator('.top-nav a[href="#home"]').click();
  await page.locator('.subject-card').first().click();
  await page.locator(`.lecture-check[data-lecture-id="${lectureId}"]`).uncheck();
  await waitSaved(false);
  await page.locator('.top-nav a[href="#backup"]').click();
  await page.locator('#backup-file').setInputFiles(backupFile);
  await page.locator('.import-preview').waitFor();
  await page.locator('[data-action="merge"]').click();
  await page.locator('.import-preview').waitFor({state:'hidden'});
  await page.locator('.top-nav a[href="#home"]').click();
  await page.locator('.subject-card').first().click();
  assert.equal(await page.locator(`.lecture-check[data-lecture-id="${lectureId}"]`).isChecked(),false);
  await page.locator('.top-nav a[href="#backup"]').click();
  await page.locator('#backup-file').setInputFiles(backupFile);
  await page.locator('.import-preview').waitFor();
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('[data-action="replace"]').click();
  await page.locator('.import-preview').waitFor({state:'hidden'});
  await page.locator('.top-nav a[href="#home"]').click();
  await page.locator('.subject-card').first().click();
  assert.equal(await page.locator(`.lecture-check[data-lecture-id="${lectureId}"]`).isChecked(),true);
  await page.locator('.top-nav a[href="#backup"]').click();
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('[data-action="restore-safety"]').first().click();
  await page.locator('.top-nav a[href="#home"]').click();
  await page.locator('.subject-card').first().click();
  assert.equal(await page.locator(`.lecture-check[data-lecture-id="${lectureId}"]`).isChecked(),false);
  await page.reload();
  assert.equal(await page.locator(`.lecture-check[data-lecture-id="${lectureId}"]`).isChecked(),false);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await page.locator('.lecture-check').first().waitFor();
  assert.equal(await page.locator(`.lecture-check[data-lecture-id="${lectureId}"]`).isChecked(),false);
  await page.locator(`.lecture-check[data-lecture-id="${lectureId}"]`).check();
  await waitSaved(true);
  await page.reload();
  assert.equal(await page.locator(`.lecture-check[data-lecture-id="${lectureId}"]`).isChecked(),true);
  await page.locator(`.lecture-check[data-lecture-id="${lectureId}"]`).uncheck();
  await waitSaved(false);
  await context.setOffline(false);
  await page.locator('.back-link').click();
  await page.screenshot({path:path.join(profile,'desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(profile,'mobile.png'),fullPage:true});
  for (const destination of ['#home',`#subject=${(await page.locator('.subject-card').first().getAttribute('href')).slice(9)}`,'#backup']) {
    await page.goto(url+destination);
    await page.locator('.main-content').waitFor();
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
    assert.equal(overflow,false,`Horizontal overflow on ${destination}`);
  }
  await page.goto(url+'#home');
  await page.locator('.subject-card').first().click();
  const subjectUrl = page.url();
  const other = await context.newPage();
  await other.goto(subjectUrl);
  await other.locator('.lecture-check').first().waitFor();
  await Promise.all([page.locator('.lecture-check').nth(0).check(), other.locator('.lecture-check').nth(1).check()]);
  for (const tab of [page, other]) {
    await tab.waitForFunction(() => [...document.querySelectorAll('.lecture-check')].slice(0,2).every(el => el.checked && !el.disabled));
  }
  await other.close();
  // Several clicks in one event-loop turn must all be committed.
  await page.evaluate(() => [...document.querySelectorAll('.lecture-check')].slice(2,5).forEach(el => el.click()));
  await page.waitForFunction(() => [...document.querySelectorAll('.lecture-check')].slice(0,5).every(el => el.checked && !el.disabled));
  // A storage failure must roll back the checkbox and leave durable data intact.
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(...args) {
      if (args[1] === 'readwrite') {
        IDBDatabase.prototype.transaction = original;
        throw new DOMException('Simulated full storage', 'QuotaExceededError');
      }
      return original.apply(this,args);
    };
  });
  await page.evaluate(() => document.querySelectorAll('.lecture-check')[5].click());
  await page.waitForFunction(() => document.getElementById('toast').textContent.includes('Save failed'));
  assert.equal(await page.locator('.lecture-check').nth(5).isChecked(),false);
  const integrity = await page.evaluate(async () => {
    const storage = await import('./storage.js');
    const core = await import('./core.js');
    const { createBackup } = await import('./backup.js');
    const db = await storage.openDatabase();
    const before = await storage.readState(db);
    const safety = await createBackup(before);
    const untouched = before.lectures.find(l => !core.isCompleted(l,before.progress));
    await storage.updateState(db, current => core.setLectureCompletion(current,untouched.id,true));
    let conflict;
    try { await storage.importWithSafety(db,before,safety,'Stale-tab test'); } catch(error) { conflict=error.code; }
    const result={ before:core.stats(before).completedLectures, after:core.stats(await storage.readState(db)).completedLectures, conflict };
    db.close();
    return result;
  });
  assert.deepEqual(integrity,{before:5,after:6,conflict:'STALE_STATE'});
  await page.reload();
  await page.locator('.lecture-check').first().waitFor();
  const durableChecks = await page.locator('.lecture-check:checked').count();
  assert.equal(durableChecks,6);
  await context.close(); context=null;
  context = await chromium.launchPersistentContext(profile,{headless:true,executablePath:process.env.CHROME_PATH || undefined,viewport:{width:390,height:844},acceptDownloads:true});
  await context.setOffline(true);
  // Simulated future date checks that records have no app-level expiry.
  await context.addInitScript(() => {
    const RealDate=Date;
    const future=RealDate.now()+400*24*60*60*1000;
    window.Date=class extends RealDate { constructor(...args) { super(...(args.length ? args : [future])); } static now() { return future; } };
  });
  page = context.pages()[0] || await context.newPage();
  await page.goto(url+'#home');
  await page.locator('.subject-card').first().click();
  await page.evaluate(() => window.scrollTo(0,0));
  await page.screenshot({path:path.join(profile,'mobile-subject.png'),fullPage:true});
  assert.equal(await page.locator('.lecture-check:checked').count(),durableChecks);
  assert.equal(await page.locator(`.lecture-check[data-lecture-id="${lectureId}"]`).isChecked(),true);
  assert.deepEqual(errors,[]);
  console.log('Passed: UI, backups, merge reversals, safety restore, concurrent tabs, rapid checkmarks, failed-save rollback, stale-import protection, offline browser restart, simulated 400-day retention, and mobile width.');
  console.log('Screenshots:',path.join(profile,'desktop.png'),path.join(profile,'mobile.png'),path.join(profile,'mobile-subject.png'));
} finally {
  if (context) await context.close();
  await new Promise(resolve=>server.close(resolve));
  // Keep screenshots for manual inspection only when requested via KEEP_TEST_FILES.
  if (!process.env.KEEP_TEST_FILES) await rm(profile,{recursive:true,force:true});
}
