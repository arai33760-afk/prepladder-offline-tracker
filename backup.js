import { BACKUP_TYPE, SCHEMA_VERSION, isCompleted, validateState } from './core.js';

const encoder = new TextEncoder();
async function sha256(text) {
  if (!globalThis.crypto?.subtle) throw new Error('Secure browser context is required for backup verification.');
  const bytes = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(text)));
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function createBackup(state, createdAt = new Date().toISOString()) {
  validateState(state);
  const serialized = JSON.stringify(state);
  const lectureStatus = state.lectures.map(lecture => ({
    id: lecture.id,
    completed: isCompleted(lecture, state.progress),
    updatedAt: state.progress[lecture.id]?.updatedAt ?? null
  }));
  return { type: BACKUP_TYPE, schemaVersion: SCHEMA_VERSION, createdAt,
    checksumAlgorithm: 'SHA-256', checksum: await sha256(serialized), lectureStatus, state };
}
export async function parseBackup(text) {
  if (typeof text !== 'string' || text.length > 25_000_000) throw new Error('Backup is too large or unreadable.');
  let backup;
  try { backup = JSON.parse(text); } catch { throw new Error('This is not a valid JSON backup file.'); }
  if (!backup || backup.type !== BACKUP_TYPE || backup.schemaVersion !== SCHEMA_VERSION ||
      backup.checksumAlgorithm !== 'SHA-256' || !/^[a-f0-9]{64}$/.test(backup.checksum || ''))
    throw new Error('Unrecognized or unsupported backup format.');
  if (typeof backup.createdAt !== 'string' || Number.isNaN(Date.parse(backup.createdAt)))
    throw new Error('Backup creation date is invalid.');
  validateState(backup.state);
  if (!Array.isArray(backup.lectureStatus) || backup.lectureStatus.length !== backup.state.lectures.length)
    throw new Error('Backup lecture status list is incomplete.');
  const status = new Map(backup.lectureStatus.map(item => [item.id, item]));
  if (status.size !== backup.state.lectures.length || backup.state.lectures.some(lecture => {
    const item = status.get(lecture.id);
    return !item || item.completed !== isCompleted(lecture, backup.state.progress) || item.updatedAt !== (backup.state.progress[lecture.id]?.updatedAt ?? null);
  })) throw new Error('Backup lecture statuses do not match the course data.');
  const actual = await sha256(JSON.stringify(backup.state));
  if (actual !== backup.checksum) throw new Error('Backup checksum mismatch. The file may be damaged or edited.');
  return backup;
}
export function downloadBackup(backup, prefix = 'PrepLadder_Backup') {
  const date = backup.createdAt.slice(0,10);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${prefix}_${date}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
