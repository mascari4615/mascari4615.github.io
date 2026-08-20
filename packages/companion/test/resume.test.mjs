import assert from 'node:assert/strict';
import test from 'node:test';

import { awaySay, readResume, resumeNote } from '../dist/index.js';

const minutes = 60_000;
const time = 60 * minutes;
const person = (at, text = '오늘 뭐 했어', channel = 'web') => ({ role: 'sensed', channel, text, at });
const companion = (at, text = '응…') => ({ role: 'said', channel: 'web', text, at, via: 'brain' });
const reflex = (at, text = '응?') => ({ role: 'said', channel: 'web', text, at, via: 'reflex' });

// ── 얼마나 끊겼나 ───────────────────────────────────────────────────

test('아무것도 없으면 처음이다', () => {
  assert.equal(readResume([], 0).gap, '처음');
});

test('방금까지 얘기했으면 이어지는 것이다', () => {
  assert.equal(readResume([person(0)], 60_000).gap, '이어짐');
});

test('한참 비었으면 잠깐 끊긴 것이다', () => {
  assert.equal(readResume([person(0)], 30 * minutes).gap, '잠깐 끊김');
});

test('밤새 비었으면 오래 끊긴 것이다', () => {
  assert.equal(readResume([person(0)], 10 * time).gap, '오래 끊김');
});

test('경계는 밖에서 정할 수 있다', () => {
  assert.equal(readResume([person(0)], 5 * minutes, { sameBreathMs: 10 * minutes }).gap, '이어짐');
  assert.equal(readResume([person(0)], 30 * minutes, { longGapMs: 20 * minutes }).gap, '오래 끊김');
});

test('얼마나 끊겼는지 잰다', () => {
  assert.equal(readResume([person(0)], 30 * minutes).awayMs, 30 * minutes);
});

test('파일 순서를 믿지 않고 가장 늦은 것을 본다 — 옛 기록을 들여오면 섞인다', () => {
  const mixed = [person(10 * time), person(0), person(5 * time)];
  assert.equal(readResume(mixed, 10 * time + minutes).gap, '이어짐');
});

test('화면 곁눈질은 「얘기했다」로 안 친다 — 곁에 있었을 뿐이다', () => {
  const es = [person(0), person(9 * time, '화면을 봤다', 'screen')];
  assert.equal(readResume(es, 10 * time).gap, '오래 끊김');
});

// ── 물어 놓고 끊긴 것 ───────────────────────────────────────────────

test('얘가 물어 놓고 답을 못 받은 채 끊겼으면 그걸 안다 — 가장 어색한 자리다', () => {
  const es = [person(0), companion(minutes, '그거 어떻게 됐어?')];
  assert.match(readResume(es, 10 * time).leftHanging, /어떻게 됐어/);
});

test('답을 받았으면 매달린 게 없다', () => {
  const es = [companion(0, '그거 어떻게 됐어?'), person(minutes, '아직')];
  assert.equal(readResume(es, 10 * time).leftHanging, null);
});

test('물음이 아니면 매달린 게 아니다', () => {
  assert.equal(readResume([person(0), companion(minutes, '그렇구나…')], 10 * time).leftHanging, null);
});

test('그 자리에서 튀어나온 대꾸는 매달린 물음이 아니다 — 「응?」은 물음이 아니다', () => {
  assert.equal(readResume([person(0), reflex(minutes, '응?')], 10 * time).leftHanging, null);
});

// ── 사람 말로 ───────────────────────────────────────────────────────

test('얼마나 됐는지 사람 말로 바꾼다', () => {
  assert.equal(awaySay(30 * minutes), '30분');
  assert.equal(awaySay(3 * time), '3시간');
  assert.equal(awaySay(48 * time), '2일');
});

test('아주 짧아도 0분이라고 하지 않는다', () => {
  assert.equal(awaySay(1000), '1분');
});

// ── 두뇌에 넘길 한 줄 ────────────────────────────────────────────────

test('이어지는 중이면 아무 말도 안 얹는다', () => {
  assert.equal(resumeNote(readResume([person(0)], 60_000)), '');
});

test('처음이면 아무 말도 안 얹는다 — 끊긴 게 아니라 시작이다', () => {
  assert.equal(resumeNote(readResume([], 0)), '');
});

test('오래 끊겼으면 그렇다고 알려 준다', () => {
  const note = resumeNote(readResume([person(0)], 10 * time));
  assert.match(note, /10시간/);
  assert.match(note, /다시 켜졌다/);
});

test('무슨 말을 하라고 시키지 않는다 — 15회차에서 시켰다가 인사가 더 부실해졌다', () => {
  const note = resumeNote(readResume([person(0)], 10 * time));
  assert.match(note, /넘겨도 된다/);
  assert.match(note, /억지스럽다/);
});

test('잠깐 끊긴 건 굳이 짚을 필요 없다고 한다', () => {
  assert.match(resumeNote(readResume([person(0)], 30 * minutes)), /굳이 짚을 필요는 없다/);
});

test('물어 놓고 끊긴 게 있으면 그것도 알려 준다', () => {
  const es = [person(0), companion(minutes, '그거 어떻게 됐어?')];
  assert.match(resumeNote(readResume(es, 10 * time)), /답을 못 들었다/);
});

test('끊김은 켜지기 전까지의 기억으로 재야 한다 — 방금 들어온 말이 섞이면 늘 이어짐이 된다', () => {
  const onAt = 10 * time;
  const memory = [person(0), person(onAt + 1000, '왔어')]; // 방금 들어온 말이 이미 들어 있다
  assert.equal(readResume(memory, onAt).gap, '이어짐', '통째로 넘기면 이렇게 된다');
  assert.equal(readResume(memory.filter((e) => e.at < onAt), onAt).gap, '오래 끊김');
});
