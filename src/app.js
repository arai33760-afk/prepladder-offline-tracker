import { applyManualStart, createInitialState, durationLabel, importPreview, isCompleted, mergeStates, percent, setLectureCompletion, stats, validateState } from './core.js';
import { openDatabase, readState, writeState, installInitialState, importWithSafety, listSafetySnapshots, requestPersistentStorage } from './storage.js';
import { createBackup, downloadBackup, parseBackup } from './backup.js';

const app = document.getElementById('app');
const fileInput = document.getElementById('backup-file');
const toastNode = document.getElementById('toast');
let db, state, pendingBackup = null, safetySnapshots = [], busy = false, installPrompt = null;
let subjectSort = 'source', lectureFilter = 'all', search = '';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = n => n.toLocaleString('en-US');
const pct = n => `${n.toFixed(1)}%`;
const when = iso => iso ? new Date(iso).toLocaleString() : 'Never';
const dateKey = iso => new Date(iso).toLocaleDateString('en-CA');
const currentDateKey = () => new Date().toLocaleDateString('en-CA');
const card = (label, value, sub = '', cls = '') => `<div class="stat-card ${cls}"><div class="stat-label">${label}</div><div class="stat-value">${value}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div>`;
function notify(message, error = false) {
  toastNode.textContent = message;
  toastNode.classList.toggle('error', error);
  toastNode.classList.add('show');
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toastNode.classList.remove('show'), 5200);
}
function route() {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash === 'backup') return { page: 'backup' };
  if (hash.startsWith('subject=')) return { page: 'subject', id: hash.slice(8) };
  return { page: 'home' };
}
function setTheme() {
  document.documentElement.dataset.theme = state.settings.theme;
  document.getElementById('theme-toggle').textContent = state.settings.theme === 'dark' ? '☀' : '◐';
}
function progressBar(value) { return `<div class="progress-track"><div class="progress-fill" style="width:${Math.min(100, Math.max(0, value))}%"></div></div>`; }
function subjectCards() {
  const items = state.subjects.map(subject => ({ subject, data: stats(state, subject.id) }));
  if (subjectSort === 'alphabetical') items.sort((a,b) => a.subject.name.localeCompare(b.subject.name));
  else if (subjectSort === 'progress') items.sort((a,b) => a.data.durationPercent - b.data.durationPercent || a.subject.name.localeCompare(b.subject.name));
  else if (subjectSort === 'remaining') items.sort((a,b) => b.data.remainingSeconds - a.data.remainingSeconds || a.subject.name.localeCompare(b.subject.name));
  else items.sort((a,b) => a.subject.order - b.subject.order);
  return items.map(({subject, data}) => `<a class="subject-card" href="#subject=${encodeURIComponent(subject.id)}" aria-label="Open ${escape(subject.name)}">
    <div class="subject-card-top"><div class="subject-icon" aria-hidden="true">${escape(subject.name.slice(0,2).toUpperCase())}</div><span class="subject-arrow" aria-hidden="true">↗</span></div>
    <h3>${escape(subject.name)}</h3>
    <div class="subject-remaining">${durationLabel(data.remainingSeconds)} <span>remaining</span></div>
    ${progressBar(data.durationPercent)}
    <div class="subject-progress"><strong>${pct(data.durationPercent)}</strong> by duration <span>${data.completedLectures}/${data.totalLectures} lectures</span></div>
    <div class="subject-metrics"><span>Total <strong>${durationLabel(data.totalSeconds)}</strong></span><span>Completed <strong>${durationLabel(data.completedSeconds)}</strong></span><span>Remaining <strong>${data.remainingLectures} lectures</strong></span></div>
  </a>`).join('');
}
function renderHome() {
  const data = stats(state);
  const recent = Object.entries(state.progress).filter(([,p]) => p.completed && p.completedAt).sort((a,b) => b[1].completedAt.localeCompare(a[1].completedAt)).slice(0,5);
  const lectureById = new Map(state.lectures.map(l => [l.id,l]));
  const today = currentDateKey();
  const todayItems = Object.entries(state.progress).filter(([,p]) => p.completed && p.completedAt && dateKey(p.completedAt) === today).map(([id]) => lectureById.get(id)).filter(Boolean);
  const todaySeconds = todayItems.reduce((n,l) => n + (l.durationSeconds || 0), 0);
  const days = Math.ceil(data.remainingSeconds / (state.settings.dailyGoalHours * 3600));
  return `<div class="page-intro"><div><div class="eyebrow">YOUR STUDY OVERVIEW</div><h1>Make every lecture count.</h1><p>Your remaining hours change as soon as you save a lecture.</p></div><a href="#backup" class="button button-outline">↥&nbsp; Export / import backup</a></div>
  <section class="hero-grid" aria-label="Overall progress">
    <div class="remaining-hero"><div class="hero-kicker">TOTAL REMAINING HOURS</div><div class="hero-number">${durationLabel(data.remainingSeconds)}</div><p>Across ${num(data.remainingLectures)} unfinished lectures</p><div class="hero-line"></div><div class="hero-bottom"><span>Completed <strong>${durationLabel(data.completedSeconds)}</strong></span><span>Total <strong>${durationLabel(data.totalSeconds)}</strong></span></div></div>
    <div class="ring-card"><div class="ring" role="img" aria-label="${pct(data.durationPercent)} completed by duration" style="--angle:${Math.min(360, data.durationPercent * 3.6)}deg"><div class="ring-inner"><strong>${pct(data.durationPercent)}</strong><span>by duration</span></div></div><div class="ring-copy"><strong>Overall completion</strong><span>${pct(data.lecturePercent)} by lecture count</span></div></div>
  </section>
  <section class="stats-grid" aria-label="Course statistics">
    ${card('Completed hours', durationLabel(data.completedSeconds), 'Watched lecture duration')}
    ${card('Total course hours', durationLabel(data.totalSeconds), `All ${num(data.totalLectures)} lectures`)}
    ${card('Completed lectures', num(data.completedLectures), 'Already watched')}
    ${card('Remaining lectures', num(data.remainingLectures), 'Still to watch')}
    ${card('Completion by duration', pct(data.durationPercent), 'Primary progress measure')}
    ${card('Completion by count', pct(data.lecturePercent), 'Of all lectures')}
  </section>
  <section class="daily-panel"><div><div class="eyebrow">TODAY</div><h2>${todayItems.length} lectures · ${durationLabel(todaySeconds)}</h2><p>Completed today on this device or imported with timestamps.</p></div><div class="goal-box"><label for="daily-goal">Daily lecture goal</label><div><input id="daily-goal" type="number" min="0.25" max="24" step="0.25" value="${state.settings.dailyGoalHours}"><span>hours / day</span></div><small>About ${num(days)} study days remaining at this goal</small></div></section>
  <section class="subjects-section"><div class="section-heading"><div><div class="eyebrow">SUBJECTS</div><h2>Study by subject</h2><p>${state.subjects.length} subjects from your workbook</p></div><label class="sort-label">Sort by <select id="subject-sort"><option value="source" ${subjectSort==='source'?'selected':''}>Workbook order</option><option value="alphabetical" ${subjectSort==='alphabetical'?'selected':''}>A–Z</option><option value="progress" ${subjectSort==='progress'?'selected':''}>Lowest progress</option><option value="remaining" ${subjectSort==='remaining'?'selected':''}>Most hours remaining</option></select></label></div><div class="subject-grid">${subjectCards()}</div></section>
  ${recent.length ? `<section class="recent-section"><div class="section-heading"><div><div class="eyebrow">RECENT ACTIVITY</div><h2>Recently completed</h2></div></div><div class="recent-list">${recent.map(([id,p]) => { const l=lectureById.get(id); if (!l) return ''; const s=state.subjects.find(x=>x.id===l.subjectId); return `<div><span><strong>${escape(l.title)}</strong><small>${escape(s?.name || '')}</small></span><span>${durationLabel(l.durationSeconds)}<small>${when(p.completedAt)}</small></span></div>`; }).join('')}</div></section>` : ''}
  <div class="source-note">Source: ${escape('PrepLadder_Subject_Checklist.xlsx')} plus nine supplied durations. Every lecture starts unchecked. Mark your own progress as you study.</div>`;
}
function lectureRow(l) {
  const done = isCompleted(l, state.progress);
  return `<label class="lecture-row ${done?'done':''}" for="lecture-${escape(l.id)}"><input id="lecture-${escape(l.id)}" class="lecture-check" data-lecture-id="${escape(l.id)}" type="checkbox" ${done?'checked':''} ${busy?'disabled':''}><span class="lecture-number">${escape(l.number || '—')}</span><span class="lecture-main"><strong>${escape(l.title)}</strong><small>${done?'Completed':'Remaining'}</small></span><span class="lecture-duration">${durationLabel(l.durationSeconds)}</span></label>`;
}
function renderSubject(id) {
  const subject = state.subjects.find(s => s.id === id);
  if (!subject) return `<div class="empty-state"><h1>Subject not found</h1><a href="#home" class="button">Back to dashboard</a></div>`;
  const data = stats(state, id);
  let lectures = state.lectures.filter(l => l.subjectId === id);
  const query = search.trim().toLowerCase();
  if (query) lectures = lectures.filter(l => l.title.toLowerCase().includes(query) || (l.chapter || '').toLowerCase().includes(query));
  if (lectureFilter !== 'all') lectures = lectures.filter(l => isCompleted(l,state.progress) === (lectureFilter === 'completed'));
  const hasChapters = state.lectures.some(l => l.subjectId === id && l.chapter);
  let list;
  if (hasChapters) {
    const groups = new Map();
    for (const l of lectures) { const key = l.chapter || 'Other lectures'; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(l); }
    list = [...groups].map(([chapter, items]) => `<details class="chapter" open><summary>${escape(chapter)} <span>${items.length} lectures</span></summary><div>${items.map(lectureRow).join('')}</div></details>`).join('');
  } else list = lectures.map(lectureRow).join('');
  return `<a class="back-link" href="#home">← Dashboard</a><div class="subject-title"><div><div class="eyebrow">SUBJECT CHECKLIST</div><h1>${escape(subject.name)}</h1><p>Follow the workbook order. Every change saves automatically.</p></div><div class="subject-percentage">${pct(data.durationPercent)}<small>by duration</small></div></div>
  <section class="subject-summary">${card('Remaining hours', durationLabel(data.remainingSeconds),'Priority','highlight')}${card('Completed hours',durationLabel(data.completedSeconds))}${card('Total hours',durationLabel(data.totalSeconds))}${card('Completed lectures',num(data.completedLectures))}${card('Remaining lectures',num(data.remainingLectures))}${card('Total lectures',num(data.totalLectures))}</section>
  <div class="subject-progress-wide">${progressBar(data.durationPercent)}<span>${pct(data.durationPercent)} of lecture hours complete · ${pct(data.lecturePercent)} of lectures complete</span></div>
  <section class="checklist-section"><div class="section-heading"><div><div class="eyebrow">LECTURES</div><h2>Lecture checklist</h2><p>${lectures.length} shown of ${data.totalLectures}</p></div></div>
  <div class="toolbar"><label class="search-box"><span aria-hidden="true">⌕</span><input id="lecture-search" type="search" placeholder="Search lecture titles" value="${escape(search)}" autocomplete="off"></label><div class="segmented" role="group" aria-label="Lecture status filter"><button data-filter="all" class="${lectureFilter==='all'?'active':''}" type="button">All</button><button data-filter="remaining" class="${lectureFilter==='remaining'?'active':''}" type="button">Remaining</button><button data-filter="completed" class="${lectureFilter==='completed'?'active':''}" type="button">Completed</button></div></div>
  ${hasChapters ? '<div class="chapter-controls"><button type="button" data-action="expand">Expand chapters</button><button type="button" data-action="collapse">Collapse chapters</button></div>' : ''}
  <div id="lecture-list" class="lecture-list">${list || '<div class="empty-state">No lectures match this search or filter.</div>'}</div></section>`;
}
function renderBackup() {
  const preview = pendingBackup ? importPreview(state, pendingBackup.state) : null;
  return `<a class="back-link" href="#home">← Dashboard</a><div class="page-intro"><div><div class="eyebrow">DATA SAFETY</div><h1>Backup & transfer</h1><p>Move progress between phone and laptop with a JSON backup file.</p></div></div>
  <div class="backup-grid"><section class="panel"><div class="panel-icon">↥</div><h2>Export backup</h2><p>Download the complete course, every lecture, completion status, and update timestamp.</p><button type="button" class="button button-primary" data-action="export">Export Backup</button><div class="backup-date">Last backup: <strong>${when(state.lastBackupAt)}</strong></div></section>
  <section class="panel"><div class="panel-icon">↧</div><h2>Import backup</h2><p>Select a backup from your other device. Review it before merging or replacing data.</p><button type="button" class="button button-outline" data-action="choose-import">Import Backup</button><div class="backup-date">Accepted file: PrepLadder_Backup_YYYY-MM-DD.json</div></section></div>
  ${pendingBackup ? `<section class="import-preview panel"><div class="eyebrow">REVIEW BEFORE IMPORT</div><h2>Backup from ${when(pendingBackup.createdAt)}</h2><div class="compare-grid"><div><strong>Current device</strong><span>${preview.local.completedLectures}/${preview.local.totalLectures} lectures complete</span><span>${durationLabel(preview.local.remainingSeconds)} remaining</span></div><div><strong>Selected backup</strong><span>${preview.incoming.completedLectures}/${preview.incoming.totalLectures} lectures complete</span><span>${durationLabel(preview.incoming.remainingSeconds)} remaining</span></div></div><p>${preview.mergeAvailable ? `Merge would change ${preview.mergeChangedLectures} lecture statuses on this device. It compares each lecture's saved update time, including unchecking a lecture.` : escape(preview.mergeError)}</p><div class="preview-actions"><button type="button" class="button button-primary" data-action="merge" ${preview.mergeAvailable?'':'disabled'}>Merge progress</button><button type="button" class="button button-danger" data-action="replace">Replace existing data</button><button type="button" class="button button-plain" data-action="cancel-import">Cancel</button></div><small>A safety snapshot is saved locally and downloaded before either import.</small></section>` : ''}
  <section class="panel safety-panel"><div><div class="eyebrow">RECOVERY</div><h2>Safety snapshots</h2><p>Saved automatically before each import. Restore one if an import was unintended.</p></div>${safetySnapshots.length ? `<div class="snapshot-list">${safetySnapshots.slice(0,10).map(s => `<div><span><strong>${escape(s.reason)}</strong><small>${when(s.createdAt)}</small></span><button type="button" data-action="restore-safety" data-snapshot-id="${escape(s.id)}">Restore</button></div>`).join('')}</div>` : '<p class="muted">No safety snapshots yet.</p>'}</section>
  <div class="offline-note"><strong>How transfer works</strong><p>Export on one device, move the JSON file, then import it on the other. Offline devices cannot sync until you exchange a file. Clearing browser data or uninstalling the app can erase local progress, so keep backups outside the app.</p></div>`;
}
function render() {
  setTheme();
  const r = route();
  app.innerHTML = r.page === 'backup' ? renderBackup() : r.page === 'subject' ? renderSubject(r.id) : renderHome();
  document.getElementById('nav-home').classList.toggle('active', r.page === 'home' || r.page === 'subject');
  document.getElementById('nav-backup').classList.toggle('active', r.page === 'backup');
  document.getElementById('connection-status').textContent = navigator.onLine ? '● Saved locally' : '● Offline ready';
}
async function commit(next) {
  if (busy) return;
  busy = true;
  try { await writeState(db, next); state = next; busy = false; render(); }
  catch (error) { busy = false; notify(`Save failed: ${error.message}`, true); render(); }
}
async function exportCurrent() {
  if (busy) return;
  busy = true;
  try {
    const at = new Date().toISOString();
    const next = { ...state, lastBackupAt: at };
    const backup = await createBackup(next, at);
    downloadBackup(backup);
    await writeState(db, next);
    state = next; render(); notify('Backup downloaded. Keep it in a safe place.');
  } catch (error) { notify(`Backup failed: ${error.message}`, true); }
  finally { busy = false; }
}
async function importSelected(mode) {
  if (!pendingBackup || busy) return;
  if (mode === 'replace' && !confirm('Replace all current course data and progress with this backup? A safety backup will be saved and downloaded first.')) return;
  busy = true;
  try {
    const next = mode === 'merge' ? mergeStates(state, pendingBackup.state) : { ...pendingBackup.state, manualStartApplied: true };
    validateState(next);
    const safety = await createBackup(state);
    downloadBackup(safety, 'PrepLadder_Safety_Before_Import');
    await importWithSafety(db, next, safety, mode === 'merge' ? 'Before merge' : 'Before replace');
    state = next;
    pendingBackup = null;
    safetySnapshots = await listSafetySnapshots(db);
    render(); notify(`${mode === 'merge' ? 'Merged' : 'Restored'} backup successfully.`);
  } catch (error) { notify(`Import stopped: ${error.message}`, true); }
  finally { busy = false; }
}
async function restoreSafety(id) {
  const snapshot = safetySnapshots.find(s => s.id === id);
  if (!snapshot || busy || !confirm(`Restore the safety snapshot from ${when(snapshot.createdAt)}? Your current data will be saved first.`)) return;
  busy = true;
  try {
    const restored = { ...(await parseBackup(JSON.stringify(snapshot.backup))).state, manualStartApplied: true };
    const safety = await createBackup(state);
    downloadBackup(safety, 'PrepLadder_Safety_Before_Restore');
    await importWithSafety(db, restored, safety, 'Before safety restore');
    state = restored; safetySnapshots = await listSafetySnapshots(db);
    render(); notify('Safety snapshot restored.');
  } catch (error) { notify(`Restore stopped: ${error.message}`, true); }
  finally { busy = false; }
}
app.addEventListener('click', async event => {
  const filter = event.target.closest('[data-filter]');
  if (filter) { lectureFilter = filter.dataset.filter; render(); return; }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'export') await exportCurrent();
  if (action === 'choose-import') fileInput.click();
  if (action === 'cancel-import') { pendingBackup = null; render(); }
  if (action === 'merge' || action === 'replace') await importSelected(action);
  if (action === 'restore-safety') await restoreSafety(button.dataset.snapshotId);
  if (action === 'expand' || action === 'collapse') app.querySelectorAll('details.chapter').forEach(d => { d.open = action === 'expand'; });
});
app.addEventListener('change', async event => {
  const target = event.target;
  if (target.matches('.lecture-check')) {
    if (busy) { target.checked = !target.checked; return; }
    const next = setLectureCompletion(state, target.dataset.lectureId, target.checked);
    target.disabled = true;
    await commit(next);
  } else if (target.id === 'subject-sort') { subjectSort = target.value; render(); }
  else if (target.id === 'daily-goal') {
    const goal = Number(target.value);
    if (!Number.isFinite(goal) || goal < 0.25 || goal > 24) { notify('Choose a daily goal between 0.25 and 24 hours.', true); render(); return; }
    await commit({ ...state, settings: { ...state.settings, dailyGoalHours: goal } });
  }
});
app.addEventListener('input', event => {
  if (event.target.id !== 'lecture-search') return;
  const start = event.target.selectionStart, end = event.target.selectionEnd;
  search = event.target.value;
  render();
  const input = document.getElementById('lecture-search');
  input.focus();
  input.setSelectionRange(start,end);
});
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file) return;
  try {
    if (file.size > 25_000_000) throw new Error('Backup exceeds the 25 MB limit.');
    pendingBackup = await parseBackup(await file.text());
    location.hash = 'backup'; render(); notify('Backup validated. Review the comparison before importing.');
  } catch (error) { pendingBackup = null; render(); notify(`Import failed: ${error.message}`, true); }
});
document.getElementById('theme-toggle').addEventListener('click', async () => {
  if (!state || busy) return;
  await commit({ ...state, settings: { ...state.settings, theme: state.settings.theme === 'dark' ? 'light' : 'dark' } });
});
window.addEventListener('hashchange', () => { search = ''; lectureFilter = 'all'; if (state) render(); window.scrollTo(0,0); });
window.addEventListener('online', () => state && render());
window.addEventListener('offline', () => state && render());
const installButton = document.getElementById('install-button');
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; installButton.hidden = false; });
installButton.addEventListener('click', async () => {
  if (!installPrompt) return;
  await installPrompt.prompt();
  installPrompt = null;
  installButton.hidden = true;
});
window.addEventListener('appinstalled', () => { installPrompt = null; installButton.hidden = true; });

async function start() {
  try {
    const response = await fetch('./seed.json');
    if (!response.ok) throw new Error('Lecture dataset could not be loaded.');
    const seed = await response.json();
    db = await openDatabase();
    state = await readState(db);
    if (!state) state = await installInitialState(db, createInitialState(seed));
    const manualState = applyManualStart(state);
    if (manualState !== state) {
      await importWithSafety(db, manualState, await createBackup(state), 'Before removing preset workbook checkmarks');
      state = manualState;
    }
    safetySnapshots = await listSafetySnapshots(db);
    render();
    requestPersistentStorage().catch(() => {});
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(error => notify(`Offline installation failed: ${error.message}`, true));
  } catch (error) {
    app.innerHTML = `<div class="fatal"><h1>Your saved progress was not changed</h1><p>${escape(error.message)}</p><p>Reload after checking browser storage. If you have a backup, keep it safe.</p></div>`;
  }
}
start();
