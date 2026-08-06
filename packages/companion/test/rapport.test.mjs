import assert from 'node:assert/strict';
import test from 'node:test';

import { readRapport } from '../dist/index.js';

const 하루 = 86_400_000;
const 기준 = Date.UTC(2026, 0, 31);
const now = () => 기준;

/** 며칠에 걸쳐 하루 몇 마디씩 나눈 대화를 만든다. */
function overDays(days, perDay = 3, endsDaysAgo = 0) {
  const entries = [];
  for (let d = 0; d < days; d += 1) {
    const at = 기준 - (days - 1 - d + endsDaysAgo) * 하루;
    for (let i = 0; i < perDay; i += 1) {
      entries.push({ role: 'sensed', channel: 'web', text: `말 ${d}-${i}`, at: at + i });
      entries.push({ role: 'said', channel: 'web', text: `답 ${d}-${i}`, at: at + i + 1 });
    }
  }
  return entries;
}

test('처음 만난 사이는 조심스럽다', () => {
  const r = readRapport([], { now });
  assert.equal(r.days, 0);
  assert.match(r.note, /아직 아무것도 나눈 게 없다/);
});

test('며칠 만나면 조금 편해진다', () => {
  const 하루치 = readRapport(overDays(1), { now });
  const 열흘치 = readRapport(overDays(10), { now });
  assert.ok(열흘치.level > 하루치.level);
  assert.match(하루치.note, /서먹/);
});

test('오래 보면 툭 던져도 되는 사이가 된다', () => {
  const r = readRapport(overDays(25), { now });
  assert.ok(r.level > 0.7);
  assert.match(r.note, /오래 본 사이/);
});

test('하루에 몰아 떠든 것으로는 오래 본 사이가 안 된다', () => {
  const 하루에백번 = readRapport(overDays(1, 100), { now });
  const 스무날조금씩 = readRapport(overDays(20, 2), { now });
  assert.ok(스무날조금씩.level > 하루에백번.level, '함께 지낸 시간은 말수로 사는 게 아니다');
});

test('한참 못 보면 식는다 — 다만 없던 일이 되진 않는다', () => {
  const 어제까지 = readRapport(overDays(25), { now });
  const 한달전까지 = readRapport(overDays(25, 3, 30), { now });
  assert.ok(한달전까지.level < 어제까지.level);
  assert.ok(한달전까지.level > 0.2, '함께 지낸 시간이 사라지진 않는다');
  assert.match(한달전까지.note, /한참 못 봤다/);
});

test('사이는 사람이 건넨 말로 센다 — 얘 혼잣말로 가까워지지 않는다', () => {
  const 혼잣말만 = [];
  for (let d = 0; d < 20; d += 1) {
    혼잣말만.push({ role: 'said', channel: 'clock', text: '혼잣말', at: 기준 - d * 하루 });
  }
  const r = readRapport(혼잣말만, { now });
  assert.equal(r.days, 0);
  assert.equal(r.turns, 0);
});

test('사이 설명은 말투에만 배게 하라고 함께 일러 준다', () => {
  assert.match(readRapport(overDays(5), { now }).note, /말로 설명하지는 마라/);
});

test('언제 재도 값이 같다 — 시계를 넣을 수 있어서 시험이 흔들리지 않는다', () => {
  const entries = overDays(7);
  assert.deepEqual(readRapport(entries, { now }).level, readRapport(entries, { now }).level);
});
