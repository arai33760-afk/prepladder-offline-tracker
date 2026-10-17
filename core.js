export const SCHEMA_VERSION = 1;
export const BACKUP_TYPE = 'prepladder-lecture-tracker-backup';

export function assert(condition, message) { if (!condition) throw new Error(message); }
export function durationLabel(seconds) {
  if (seconds === null || seconds === undefined) return 'Duration unknown';
  const totalMinutes = Math.round(seconds / 60);
  return `${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, '0')}m`;
}
export function percent(part, whole) { return whole ? (part / whole) * 100 : 0; }
export function isCompleted(lecture, progress) {
  return progress[lecture.id]?.completed ?? Boolean(lecture.initialCompleted);
}
export function applyManualStart(state) {
  if (state.manualStartApplied) return state;
  const progress = { ...state.progress };
  for (const lecture of state.lectures) {
    if (lecture.initialCompleted && !progress[lecture.id]) {
      progress[lecture.id] = { completed: false, updatedAt: '1970-01-01T00:00:00.000Z', changeId: 'manual-start-v1', completedAt: null };
    }
  }
  return { ...state, progress, manualStartApplied: true };
}
export function createInitialState(seed) {
  const state = {
    schemaVersion: SCHEMA_VERSION,
    courseId: seed.courseId,
    subjects: seed.subjects,
    lectures: seed.lectures,
    progress: {},
    settings: { theme: 'system', dailyGoalHours: 3 },
    lastBackupAt: null,
    createdAt: new Date().toISOString()
  };
  validateState(state);
  return applyManualStart(state);
}
export function stats(state, subjectId = null) {
  let totalSeconds = 0, completedSeconds = 0, totalLectures = 0, completedLectures = 0, unknownDurations = 0;
  for (const lecture of state.lectures) {
    if (subjectId && lecture.subjectId !== subjectId) continue;
    totalLectures++;
    const done = isCompleted(lecture, state.progress);
    if (done) completedLectures++;
    if (lecture.durationSeconds === null) unknownDurations++;
    else {
      totalSeconds += lecture.durationSeconds;
      if (done) completedSeconds += lecture.durationSeconds;
    }
  }
  return {
    totalSeconds, completedSeconds, remainingSeconds: totalSeconds - completedSeconds,
    totalLectures, completedLectures, remainingLectures: totalLectures - completedLectures,
    unknownDurations,
    durationPercent: percent(completedSeconds, totalSeconds),
    lecturePercent: percent(completedLectures, totalLectures)
  };
}
export function nextTimestamp(previous, now = new Date().toISOString()) {
  return previous && now <= previous ? new Date(Date.parse(previous) + 1).toISOString() : now;
}
export function setLectureCompletion(state, lectureId, completed, now = new Date().toISOString(), changeId = crypto.randomUUID()) {
  const lecture = state.lectures.find(item => item.id === lectureId);
  assert(lecture, 'Lecture not found. No progress was changed.');
  assert(typeof completed === 'boolean', 'Completion status must be true or false.');
  const old = state.progress[lectureId];
  if (isCompleted(lecture, state.progress) === completed) return state;
  const updatedAt = nextTimestamp(old?.updatedAt, now);
  return {
    ...state,
    progress: {
      ...state.progress,
      [lectureId]: { completed, updatedAt, changeId, completedAt: completed ? updatedAt : null }
    }
  };
}
const validString = (v, max = 2000) => typeof v === 'string' && v.length > 0 && v.length <= max;
const validIso = v => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && !Number.isNaN(Date.parse(v));
export function validateState(state) {
  assert(state && typeof state === 'object' && !Array.isArray(state), 'Invalid application data.');
  assert(state.manualStartApplied === undefined || typeof state.manualStartApplied === 'boolean', 'Invalid starting-progress policy.');
  assert(state.schemaVersion === SCHEMA_VERSION, 'Unsupported data schema version.');
  assert(validString(state.courseId, 200), 'Missing course identity.');
  assert(Array.isArray(state.subjects) && state.subjects.length > 0 && state.subjects.length <= 500, 'Invalid subjects.');
  assert(Array.isArray(state.lectures) && state.lectures.length > 0 && state.lectures.length <= 20000, 'Invalid lectures.');
  const subjects = new Set();
  for (const s of state.subjects) {
    assert(typeof s.id === 'string' && /^[a-f0-9]{16}$/.test(s.id) && validString(s.name, 300) && Number.isSafeInteger(s.order), 'Invalid subject entry.');
    assert(!subjects.has(s.id), 'Duplicate subject identifier.'); subjects.add(s.id);
  }
  const lectureIds = new Set();
  for (const l of state.lectures) {
    assert(typeof l.id === 'string' && /^[a-f0-9]{24}$/.test(l.id) && subjects.has(l.subjectId) && validString(l.title, 1000), 'Invalid lecture entry.');
    assert(typeof l.number === 'string' && l.number.length <= 50 && Number.isSafeInteger(l.order), 'Invalid lecture order.');
    assert(l.durationSeconds === null || (Number.isSafeInteger(l.durationSeconds) && l.durationSeconds > 0 && l.durationSeconds <= 864000), 'Invalid lecture duration.');
    assert(l.chapter === null || (typeof l.chapter === 'string' && l.chapter.length <= 300), 'Invalid chapter.');
    assert(typeof l.initialCompleted === 'boolean', 'Invalid initial lecture status.');
    assert(!lectureIds.has(l.id), 'Duplicate lecture identifier.'); lectureIds.add(l.id);
  }
  assert(state.progress && typeof state.progress === 'object' && !Array.isArray(state.progress), 'Invalid progress records.');
  for (const [id, p] of Object.entries(state.progress)) {
    assert(lectureIds.has(id), 'Progress refers to an unknown lecture.');
    assert(p && typeof p.completed === 'boolean' && validIso(p.updatedAt) && validString(p.changeId, 200), 'Invalid lecture progress record.');
    assert(p.completedAt === null || validIso(p.completedAt), 'Invalid completion date.');
    assert(!p.completed || p.completedAt !== null, 'Completed lecture lacks completion date.');
  }
  assert(state.settings && ['system','light','dark'].includes(state.settings.theme), 'Invalid theme setting.');
  assert(Number.isFinite(state.settings.dailyGoalHours) && state.settings.dailyGoalHours > 0 && state.settings.dailyGoalHours <= 24, 'Invalid daily goal.');
  assert(state.lastBackupAt === null || validIso(state.lastBackupAt), 'Invalid last backup date.');
  assert(validIso(state.createdAt), 'Invalid creation date.');
  return state;
}
function sameLecture(a, b) {
  return a.subjectId === b.subjectId && a.title === b.title && a.number === b.number &&
    a.durationSeconds === b.durationSeconds && a.chapter === b.chapter && a.initialCompleted === b.initialCompleted;
}
function chooseProgress(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  if (a.changeId !== b.changeId) return a.changeId > b.changeId ? a : b;
  if (a.completed !== b.completed) return a.completed ? b : a;
  return a;
}
export function mergeStates(local, incoming) {
  validateState(local); validateState(incoming);
  assert(local.courseId === incoming.courseId, 'These backups belong to different courses. Merge is unavailable; use Replace only if intended.');
  const subjectMap = new Map(local.subjects.map(s => [s.id, s]));
  for (const s of incoming.subjects) {
    const old = subjectMap.get(s.id);
    assert(!old || old.name === s.name, 'Subject identity conflict. Merge was cancelled.');
    if (!old) subjectMap.set(s.id, s);
  }
  const lectureMap = new Map(local.lectures.map(l => [l.id, l]));
  for (const l of incoming.lectures) {
    const old = lectureMap.get(l.id);
    assert(!old || sameLecture(old, l), `Lecture data conflict for ${l.title}. Merge was cancelled.`);
    if (!old) lectureMap.set(l.id, l);
  }
  const progress = { ...local.progress };
  for (const [id, record] of Object.entries(incoming.progress)) progress[id] = chooseProgress(progress[id], record);
  const merged = {
    ...local,
    subjects: [...subjectMap.values()].sort((a,b) => a.order - b.order || a.name.localeCompare(b.name)),
    lectures: [...lectureMap.values()].sort((a,b) => a.order - b.order || a.id.localeCompare(b.id)),
    progress
  };
  validateState(merged);
  return merged;
}
export function importPreview(local, incoming) {
  validateState(local); validateState(incoming);
  let merged = null, mergeError = null;
  try { merged = mergeStates(local, incoming); } catch (error) { mergeError = error.message; }
  const changed = merged ? merged.lectures.filter(l => {
    const old = local.lectures.find(x => x.id === l.id);
    return !old || isCompleted(l, local.progress) !== isCompleted(l, merged.progress);
  }).length : 0;
  return { mergeAvailable: Boolean(merged), mergeError, mergeChangedLectures: changed,
    local: stats(local), incoming: stats(incoming), merged: merged ? stats(merged) : null };
}
