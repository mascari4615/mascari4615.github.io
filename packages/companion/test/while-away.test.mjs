import assert from 'node:assert/strict';
import test from 'node:test';

import { whileAway, whileAwayNote } from '../dist/index.js';

const minutes = 60_000;
const time = 60 * minutes;
const glance = (at, title) => ({ role: 'sensed', channel: 'screen', text: `화면을 봤다. 지금 앞에 있는 창은 ${title}.`, at });
const person = (at, text = '왔어') => ({ role: 'sensed', channel: 'web', text, at });

// ── 모으기 ──────────────────────────────────────────────────────────

test('자리를 비운 동안 본 것을 모은다', () => {
  const es = [glance(0, '유니티'), glance(10 * minutes, '유니티'), glance(20 * minutes, '브라우저')];
  const r = whileAway(es, 0, 30 * minutes);
  assert.equal(r.mostSeen, '유니티');
  assert.equal(r.awayMs, 30 * minutes);
});

test('가장 오래 떠 있던 것을 고른다. 몇 번 쳐다봤는지가 아니다', () => {
  const es = [
    glance(0, '유니티'), glance(50 * minutes, '유니티'), // 50분 떠 있었다
    glance(51 * minutes, '가'), glance(52 * minutes, '나'), glance(53 * minutes, '다'), // 스치듯 셋
  ];
  assert.equal(whileAway(es, 0, 60 * minutes).mostSeen, '유니티');
});

test('씬 이름만 바뀐 건 같은 것으로 묶는다', () => {
  const es = [glance(0, 'WitchMendokusai - Home - Unity'), glance(30 * minutes, 'WitchMendokusai - World - Unity')];
  const r = whileAway(es, 0, 40 * minutes);
  assert.equal(r.mostSeen, 'WitchMendokusai');
  assert.equal(r.switches, 0);
});

test('몇 번 옮겨 다녔는지 센다', () => {
  const es = [glance(0, '가'), glance(minutes, '나'), glance(2 * minutes, '다')];
  assert.equal(whileAway(es, 0, 10 * minutes).switches, 2);
});

test('비운 구간 밖은 안 본다', () => {
  const es = [glance(0, '옛날것'), glance(60 * minutes, '비운동안것')];
  assert.equal(whileAway(es, 30 * minutes, 90 * minutes).mostSeen, '비운동안것');
});

test('나눈 말은 안 센다. 얘기했으면 자리를 비운 게 아니다', () => {
  assert.equal(whileAway([person(10 * minutes, '창은 가짜 어쩌고')], 0, 30 * minutes).mostSeen, null);
});

test('본 게 없으면 없다고 한다', () => {
  const r = whileAway([], 0, 30 * minutes);
  assert.equal(r.mostSeen, null);
  assert.equal(r.switches, 0);
});

test('곁눈질이 아닌 것은 창 이름이 없으니 안 센다', () => {
  const other = { role: 'sensed', channel: 'nudge', text: '먼저 말 걸 이유', at: minutes };
  assert.equal(whileAway([other], 0, 30 * minutes).mostSeen, null);
});

// ── 두뇌에 넘길 한 줄 ────────────────────────────────────────────────

test('잠깐 비운 건 안 꺼낸다', () => {
  const es = [glance(0, '유니티')];
  assert.equal(whileAwayNote(whileAway(es, 0, 5 * minutes)), '');
});

test('오래 비웠고 볼 게 있었으면 알려 준다', () => {
  const es = [glance(0, '유니티'), glance(50 * minutes, '유니티')];
  const note = whileAwayNote(whileAway(es, 0, 60 * minutes));
  assert.match(note, /유니티/);
  assert.match(note, /자리를 비운 동안/);
});

test('얼마나 비워야 꺼낼지 정할 수 있다', () => {
  const es = [glance(0, '유니티')];
  assert.notEqual(whileAwayNote(whileAway(es, 0, 10 * minutes), 5 * minutes), '');
});

test('볼 게 없었으면 아무 말도 안 얹는다', () => {
  assert.equal(whileAwayNote(whileAway([], 0, 3 * time)), '');
});

test('부산했는지 조용했는지 다르게 말한다', () => {
  const quiet = [glance(0, '유니티'), glance(50 * minutes, '유니티')];
  assert.match(whileAwayNote(whileAway(quiet, 0, 60 * minutes)), /거의 그것만/);

  const bustle = Array.from({ length: 12 }, (_, i) => glance(i * minutes, `창${i}`));
  assert.match(whileAwayNote(whileAway(bustle, 0, 60 * minutes)), /많이 옮겨 다녔다/);
});

test('감시가 아니라 곁에 있는 것이다. 지켜봤다는 티를 내지 말라고 한다', () => {
  const es = [glance(0, '유니티'), glance(50 * minutes, '유니티')];
  const note = whileAwayNote(whileAway(es, 0, 60 * minutes));
  assert.match(note, /지켜봤다는 티는 내지 마라/);
  assert.match(note, /굳이 꺼낼 필요도 없다/);
});

test('시각을 읊지 않는다. 그건 근무 기록이다', () => {
  const es = [glance(0, '유니티'), glance(50 * minutes, '유니티')];
  const note = whileAwayNote(whileAway(es, 0, 60 * minutes));
  assert.equal(/\d+시 \d+분/.test(note), false);
});
