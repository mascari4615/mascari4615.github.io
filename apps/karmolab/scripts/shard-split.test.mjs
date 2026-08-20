/**
 * 조각내기 시험 — 그날 실제로 난 사고를 그대로 박는다 (2026-08-16).
 *
 * 사고: 표에 없던 검사 하나를 중앙값으로 쳤는데 그게 제일 무거운 것(955초)이었다.
 * 그 조각이 40분 제한에 걸려 **통째로 취소**됐고, 스무 검사가 판정을 못 냈다.
 */
import assert from 'node:assert/strict';
import { splitIntoShards, unknownWeight } from './lib/shard-split.mjs';

let passed = 0;
const test = (label, fn) => { fn(); passed += 1; console.log('  OK  ' + label); };

const measured = { a: 10, b: 12, c: 13, d: 15, e: 20, f: 30, g: 60, h: 120, i: 300, j: 600 };
const gate = (n) => ({ name: n });

test('모르는 것은 중앙값이 아니라 위쪽 값으로 친다', () => {
  const median = 20;
  assert.ok(unknownWeight(measured) > median, `위쪽 값이 중앙값보다 커야 한다 (지금 ${unknownWeight(measured)})`);
  assert.equal(unknownWeight(measured), 600);
});

test('표가 비어 있어도 0 으로 치지 않는다', () => {
  assert.ok(unknownWeight({}) >= 60);
});

test('그날의 사고 — 표에 없는 무거운 검사가 한 조각을 넘기지 않는다', () => {
  /* 60개는 가볍고, 하나만 표에 없다(실제로는 955초). 예전 방식(중앙값)이면 그 하나가
     13초로 쳐져 아무 조각에나 얹혔다. */
  const gates = [...Object.keys(measured).map(gate), gate('표에없는무거운것')];
  const buckets = splitIntoShards(gates, 3, measured);
  const sums = buckets.map((b) => b.sum);
  const maxSum = Math.max(...sums);
  const minSum = Math.min(...sums);
  assert.ok(maxSum - minSum <= unknownWeight(measured), `조각 사이가 너무 벌어졌다: ${sums.join(' / ')}`);
});

test('가장 큰 조각이 이론 한계 안에 든다 (LPT 4/3)', () => {
  /* 제일 무거운 검사 하나(600초)는 어차피 한 조각에 통째로 들어간다 — 그보다 잘게는 못 나눈다.
     그래서 「고르다」가 아니라 **「할 수 있는 만큼 고르다」**를 본다:
     가장 큰 조각 ≤ max(제일 무거운 검사, 평균 × 4/3). 이게 이 담는 방식의 보장이다. */
  const buckets = splitIntoShards(Object.keys(measured).map(gate), 3, measured);
  const sums = buckets.map((b) => b.sum);
  const total = Object.values(measured).reduce((a, b) => a + b, 0);
  const limit = Math.max(Math.max(...Object.values(measured)), (total / 3) * (4 / 3));
  assert.ok(Math.max(...sums) <= limit, `한계 ${Math.round(limit)} 를 넘었다: ${sums.join(' / ')}`);
});

test('모든 검사가 정확히 한 조각에만 들어간다', () => {
  const gates = Object.keys(measured).map(gate);
  const buckets = splitIntoShards(gates, 3, measured);
  const contained = buckets.flatMap((b) => b.items);
  assert.equal(contained.length, gates.length);
  assert.equal(new Set(contained.map((c) => c.name)).size, gates.length);
});

test('조각이 하나면 전부 한 곳에', () => {
  const buckets = splitIntoShards(Object.keys(measured).map(gate), 1, measured);
  assert.equal(buckets.length, 1);
  assert.equal(buckets[0].items.length, 10);
});

console.log(`[shard-split.test] ${passed}개 통과 — 조각이 제한에 걸려 통째로 날아가는 일을 막는다`);
