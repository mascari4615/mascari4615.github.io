import assert from 'node:assert/strict';
import test from 'node:test';

import { Watching, shortTitle, watchNote } from '../dist/index.js';

const 분 = 60_000;

// ── 쌓기 ────────────────────────────────────────────────────────────

test('본 것을 시간과 함께 쌓는다', () => {
  const w = new Watching();
  w.saw('유니티', 0);
  assert.equal(w.now.title, '유니티');
  assert.equal(w.now.at, 0);
});

test('이어지는 같은 것은 안 쌓는다 — 안 묶으면 몇 번 쳐다봤는지를 세게 된다', () => {
  const w = new Watching();
  for (let i = 0; i < 10; i += 1) w.saw('유니티', i * 2 * 분);
  assert.equal(w.recent.length, 1);
  assert.equal(w.now.at, 0, '처음 본 때가 남아야 얼마나 붙들었는지 안다');
});

test('다른 것으로 바뀌면 새로 쌓는다', () => {
  const w = new Watching();
  w.saw('유니티', 0);
  w.saw('브라우저', 5 * 분);
  w.saw('유니티', 6 * 분);
  assert.equal(w.recent.length, 3);
});

test('빈 제목은 안 쌓는다', () => {
  const w = new Watching();
  w.saw('   ', 0);
  assert.equal(w.now, null);
});

test('너무 많이 들고 있지 않는다', () => {
  const w = new Watching({ keep: 5 });
  for (let i = 0; i < 20; i += 1) w.saw(`창 ${i}`, i * 분);
  assert.equal(w.recent.length, 5);
});

// ── 붙들고 있음 ─────────────────────────────────────────────────────

test('얼마나 붙들고 있는지 잰다', () => {
  const w = new Watching();
  w.saw('유니티', 0);
  assert.equal(w.heldFor(30 * 분), 30 * 분);
});

test('오래 붙들면 붙들고 있는 것으로 본다', () => {
  const w = new Watching({ stuckAfterMs: 40 * 분 });
  w.saw('유니티', 0);
  assert.equal(w.isStuck(30 * 분), false);
  assert.equal(w.isStuck(41 * 분), true);
});

test('바꾸면 다시 처음부터 센다', () => {
  const w = new Watching({ stuckAfterMs: 40 * 분 });
  w.saw('유니티', 0);
  w.saw('브라우저', 50 * 분);
  assert.equal(w.isStuck(60 * 분), false);
});

test('본 게 없으면 붙들 것도 없다', () => {
  assert.equal(new Watching().isStuck(999 * 분), false);
  assert.equal(new Watching().heldFor(999 * 분), 0);
});

// ── 왔다갔다 ────────────────────────────────────────────────────────

test('두 창을 되풀이해 오가면 왔다갔다다', () => {
  const w = new Watching({ flipWindowMs: 10 * 분, flipsAtLeast: 4 });
  const 순서 = ['유니티', '브라우저', '유니티', '브라우저', '유니티'];
  순서.forEach((t, i) => w.saw(t, i * 분));
  assert.equal(w.isFlipping(5 * 분), true);
});

test('서로 다른 것을 죽 훑는 건 왔다갔다가 아니다 — 그냥 이것저것 보는 것이다', () => {
  const w = new Watching({ flipWindowMs: 10 * 분, flipsAtLeast: 4 });
  ['가', '나', '다', '라', '마'].forEach((t, i) => w.saw(t, i * 분));
  assert.equal(w.isFlipping(5 * 분), false);
});

test('몇 번 안 오갔으면 왔다갔다가 아니다', () => {
  const w = new Watching({ flipWindowMs: 10 * 분, flipsAtLeast: 4 });
  w.saw('유니티', 0);
  w.saw('브라우저', 분);
  assert.equal(w.isFlipping(2 * 분), false);
});

test('오래전 일은 왔다갔다로 안 센다', () => {
  const w = new Watching({ flipWindowMs: 10 * 분, flipsAtLeast: 4 });
  ['유니티', '브라우저', '유니티', '브라우저'].forEach((t, i) => w.saw(t, i * 분));
  assert.equal(w.isFlipping(60 * 분), false);
});

// ── 이름 다듬기 ─────────────────────────────────────────────────────

test('창 제목에서 부를 만한 이름만 남긴다', () => {
  assert.equal(shortTitle('WitchMendokusai - Stage_Home - Unity 6000'), 'WitchMendokusai');
  assert.equal(shortTitle('보고서.docx — Word'), '보고서.docx');
});

test('너무 길면 자른다', () => {
  assert.ok(shortTitle('가'.repeat(80), 10).length <= 11);
});

test('가를 데가 없으면 통째로 쓴다', () => {
  assert.equal(shortTitle('메모장'), '메모장');
});

// ── 두뇌에 넘길 한 줄 ────────────────────────────────────────────────

test('아무 일 없으면 조용하다', () => {
  const w = new Watching({ stuckAfterMs: 40 * 분 });
  w.saw('유니티', 0);
  assert.equal(watchNote(w, 5 * 분), '');
});

test('오래 붙들고 있으면 알려 주되 함부로 끊지 말라고 한다', () => {
  const w = new Watching({ stuckAfterMs: 40 * 분 });
  w.saw('WitchMendokusai - Unity', 0);
  const note = watchNote(w, 50 * 분);
  assert.match(note, /WitchMendokusai/);
  assert.match(note, /50분째/);
  assert.match(note, /함부로 끊지 마라/);
});

test('왔다갔다는 붙들고 있는 것과 다르게 말한다 — 몰두한 사람한테 막혔냐고 하면 방해다', () => {
  const w = new Watching({ flipWindowMs: 10 * 분, flipsAtLeast: 4, stuckAfterMs: 40 * 분 });
  ['유니티', '브라우저', '유니티', '브라우저', '유니티'].forEach((t, i) => w.saw(t, i * 분));
  const note = watchNote(w, 5 * 분);
  assert.match(note, /왔다갔다/);
  assert.equal(note.includes('붙들고'), false);
});

test('아는 척하지 말라고 한다', () => {
  const w = new Watching({ flipWindowMs: 10 * 분, flipsAtLeast: 4 });
  ['가', '나', '가', '나', '가'].forEach((t, i) => w.saw(t, i * 분));
  assert.match(watchNote(w, 5 * 분), /아는 척은 하지 마라/);
});

test('본 게 없으면 아무 말도 안 얹는다', () => {
  assert.equal(watchNote(new Watching(), 999 * 분), '');
});

test('씬 이름만 바뀐 건 같은 것으로 본다 — 안 그러면 두 시간을 붙들어도 안 잡힌다', () => {
  const w = new Watching({ stuckAfterMs: 40 * 분 });
  w.saw('WitchMendokusai - Stage_Home - Unity', 0);
  w.saw('WitchMendokusai - World - Unity', 20 * 분);
  w.saw('WitchMendokusai - Arena - Unity', 40 * 분);
  assert.equal(w.recent.length, 1, '같은 것으로 묶여야 한다');
  assert.equal(w.isStuck(50 * 분), true);
});

test('왔다갔다도 같은 기준으로 센다 — 묶는 기준과 세는 기준이 다르면 안 된다', () => {
  const w = new Watching({ flipWindowMs: 10 * 분, flipsAtLeast: 4 });
  const 순서 = ['유니티 - A - Unity', '브라우저 - 탭1', '유니티 - B - Unity', '브라우저 - 탭2', '유니티 - C - Unity'];
  순서.forEach((t, i) => w.saw(t, i * 분));
  assert.equal(w.isFlipping(5 * 분), true);
});
