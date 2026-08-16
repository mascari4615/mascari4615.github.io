/**
 * 조각내기 시험 — 그날 실제로 난 사고를 그대로 박는다 (2026-08-16).
 *
 * 사고: 표에 없던 검사 하나를 중앙값으로 쳤는데 그게 제일 무거운 것(955초)이었다.
 * 그 조각이 40분 제한에 걸려 **통째로 취소**됐고, 스무 검사가 판정을 못 냈다.
 */
import assert from 'node:assert/strict';
import { 조각내기, 모르는것무게 } from './lib/shard-split.mjs';

let 통과 = 0;
const 본다 = (이름, fn) => { fn(); 통과 += 1; console.log('  OK  ' + 이름); };

const 잰것 = { a: 10, b: 12, c: 13, d: 15, e: 20, f: 30, g: 60, h: 120, i: 300, j: 600 };
const 검사 = (n) => ({ name: n });

본다('모르는 것은 중앙값이 아니라 위쪽 값으로 친다', () => {
  const 중앙값 = 20;
  assert.ok(모르는것무게(잰것) > 중앙값, `위쪽 값이 중앙값보다 커야 한다 (지금 ${모르는것무게(잰것)})`);
  assert.equal(모르는것무게(잰것), 600);
});

본다('표가 비어 있어도 0 으로 치지 않는다', () => {
  assert.ok(모르는것무게({}) >= 60);
});

본다('그날의 사고 — 표에 없는 무거운 검사가 한 조각을 넘기지 않는다', () => {
  /* 60개는 가볍고, 하나만 표에 없다(실제로는 955초). 예전 방식(중앙값)이면 그 하나가
     13초로 쳐져 아무 조각에나 얹혔다. */
  const 검사들 = [...Object.keys(잰것).map(검사), 검사('표에없는무거운것')];
  const 바구니 = 조각내기(검사들, 3, 잰것);
  const 합들 = 바구니.map((b) => b.합);
  const 최대 = Math.max(...합들);
  const 최소 = Math.min(...합들);
  assert.ok(최대 - 최소 <= 모르는것무게(잰것), `조각 사이가 너무 벌어졌다: ${합들.join(' / ')}`);
});

본다('가장 큰 조각이 이론 한계 안에 든다 (LPT 4/3)', () => {
  /* 제일 무거운 검사 하나(600초)는 어차피 한 조각에 통째로 들어간다 — 그보다 잘게는 못 나눈다.
     그래서 「고르다」가 아니라 **「할 수 있는 만큼 고르다」**를 본다:
     가장 큰 조각 ≤ max(제일 무거운 검사, 평균 × 4/3). 이게 이 담는 방식의 보장이다. */
  const 바구니 = 조각내기(Object.keys(잰것).map(검사), 3, 잰것);
  const 합들 = 바구니.map((b) => b.합);
  const 전체 = Object.values(잰것).reduce((a, b) => a + b, 0);
  const 한계 = Math.max(Math.max(...Object.values(잰것)), (전체 / 3) * (4 / 3));
  assert.ok(Math.max(...합들) <= 한계, `한계 ${Math.round(한계)} 를 넘었다: ${합들.join(' / ')}`);
});

본다('모든 검사가 정확히 한 조각에만 들어간다', () => {
  const 검사들 = Object.keys(잰것).map(검사);
  const 바구니 = 조각내기(검사들, 3, 잰것);
  const 담긴것 = 바구니.flatMap((b) => b.것);
  assert.equal(담긴것.length, 검사들.length);
  assert.equal(new Set(담긴것.map((c) => c.name)).size, 검사들.length);
});

본다('조각이 하나면 전부 한 곳에', () => {
  const 바구니 = 조각내기(Object.keys(잰것).map(검사), 1, 잰것);
  assert.equal(바구니.length, 1);
  assert.equal(바구니[0].것.length, 10);
});

console.log(`[shard-split.test] ${통과}개 통과 — 조각이 제한에 걸려 통째로 날아가는 일을 막는다`);
