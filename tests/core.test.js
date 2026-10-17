import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createInitialState, durationLabel, importPreview, isCompleted, mergeStates, setLectureCompletion, stats, validateState } from '../src/core.js';
import { createBackup, parseBackup } from '../src/backup.js';

const seed = JSON.parse(await readFile(new URL('../src/seed.json', import.meta.url), 'utf8'));
const fresh = () => createInitialState(seed);
const plain = object => structuredClone(object);

test('workbook extraction is complete and the nine supplied durations are included', () => {
  const s = fresh(); const totals = stats(s);
  assert.equal(s.subjects.length, 11);
  assert.equal(s.lectures.length, 725);
  assert.equal(new Set(s.lectures.map(l=>l.id)).size, 725);
  assert.equal(s.lectures.filter(l=>l.durationSource==='user-supplied').length, 9);
  assert.equal(s.lectures.filter(l=>l.durationSeconds===null).length, 0);
  assert.equal(totals.totalSeconds, 2_151_600);
  assert.equal(durationLabel(totals.totalSeconds), '597h 40m');
  assert.equal(totals.completedLectures, 59);
  assert.equal(totals.remainingLectures, 666);
  assert.equal(s.subjects.reduce((n,subject)=>n+stats(s,subject.id).totalLectures,0),725);
  assert.equal(s.subjects.reduce((n,subject)=>n+stats(s,subject.id).totalSeconds,0),2_151_600);
});

test('checking and unchecking deducts and restores exact seconds everywhere', () => {
  const before=fresh(); const lecture=before.lectures.find(l=>!l.initialCompleted);
  const base=stats(before), subBase=stats(before,lecture.subjectId);
  const checked=setLectureCompletion(before,lecture.id,true,'2026-10-17T10:00:00.000Z','device-a-1');
  assert.equal(stats(checked).remainingSeconds,base.remainingSeconds-lecture.durationSeconds);
  assert.equal(stats(checked).completedSeconds,base.completedSeconds+lecture.durationSeconds);
  assert.equal(stats(checked,lecture.subjectId).remainingSeconds,subBase.remainingSeconds-lecture.durationSeconds);
  assert.equal(stats(checked).completedLectures,base.completedLectures+1);
  const undone=setLectureCompletion(checked,lecture.id,false,'2026-10-17T10:01:00.000Z','device-a-2');
  assert.deepEqual(stats(undone),base);
  assert.equal(undone.progress[lecture.id].completed,false);
});

test('backup round trip includes all data and rejects edits', async () => {
  const s=fresh(); const backup=await createBackup(s,'2026-10-17T10:00:00.000Z');
  assert.equal(backup.state.lectures.length,725);
  assert.equal(backup.lectureStatus.length,725);
  assert.equal(backup.lectureStatus.filter(x=>x.completed).length,59);
  assert.deepEqual((await parseBackup(JSON.stringify(backup))).state,s);
  const damaged=plain(backup); damaged.state.lectures[0].title='changed';
  await assert.rejects(parseBackup(JSON.stringify(damaged)),/checksum mismatch/i);
  const mismatched=plain(backup); mismatched.lectureStatus[0].completed=!mismatched.lectureStatus[0].completed;
  await assert.rejects(parseBackup(JSON.stringify(mismatched)),/statuses do not match/i);
  await assert.rejects(parseBackup('{bad'),/valid JSON/i);
});

test('merge honors later unchecking, does not just union completed flags', () => {
  const base=fresh(); const lecture=base.lectures.find(l=>l.initialCompleted);
  const local=setLectureCompletion(base,lecture.id,false,'2026-10-17T12:00:00.000Z','local-1');
  const remote=setLectureCompletion(base,lecture.id,false,'2026-10-17T11:00:00.000Z','remote-1');
  const remoteAgain=setLectureCompletion(remote,lecture.id,true,'2026-10-17T11:30:00.000Z','remote-2');
  const merged=mergeStates(local,remoteAgain);
  assert.equal(isCompleted(lecture,merged.progress),false);
  assert.equal(importPreview(local,remoteAgain).mergeAvailable,true);
  const later=setLectureCompletion(remoteAgain,lecture.id,false,'2026-10-17T13:00:00.000Z','remote-3');
  assert.equal(isCompleted(lecture,mergeStates(remoteAgain,later).progress),false);
});

test('merge rejects unrelated or conflicting courses', () => {
  const a=fresh(); const b=plain(a); b.courseId='unrelated';
  assert.throws(()=>mergeStates(a,b),/different courses/i);
  const c=plain(a); c.lectures[0].durationSeconds++;
  assert.throws(()=>mergeStates(a,c),/data conflict/i);
  assert.equal(importPreview(a,b).mergeAvailable,false);
});

test('invalid progress and duplicate identifiers are rejected', () => {
  const a=fresh(); a.progress.unknown={completed:true,updatedAt:'2026-10-17T10:00:00.000Z',changeId:'x',completedAt:'2026-10-17T10:00:00.000Z'};
  assert.throws(()=>validateState(a),/unknown lecture/i);
  const b=fresh(); b.lectures[1].id=b.lectures[0].id;
  assert.throws(()=>validateState(b),/duplicate lecture/i);
});
