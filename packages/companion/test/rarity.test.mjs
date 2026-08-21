import assert from 'node:assert/strict';
import test from 'node:test';

import { rarityBonus, applyRarity, pickIngredients } from '../dist/index.js';

const calc = (loadedFlag, queuedFlag, offFlag, emptyFlag) => ({ loaded: loadedFlag, queued: queuedFlag, off: offFlag, blank: emptyFlag });

test('거의 늘 꺼져 있던 재료는 켜졌을 때 크게 세진다 — 그 순간에 딱 맞는 말이다', () => {
  // 실측: 자기상 (지나감 613 · 밀림 3 · 꺼짐 610 · 빔 0)
  assert.ok(rarityBonus(calc(0, 3, 610, 0)) >= 10, `자기상 같은 재료가 안 세지면 영영 안 실린다`);
});

test('늘 켜져 있는 재료는 안 밀어준다 — 안 그러면 그냥 다 같이 세진다', () => {
  assert.equal(rarityBonus(calc(500, 20, 0, 5)), 0);
});

test('반쯤 켜지는 재료도 안 밀어준다 — 드문 게 아니다', () => {
  assert.equal(rarityBonus(calc(100, 50, 150, 0)), 0);
});

test('아직 얼마 안 돌았으면 아무 말도 안 한다 — 새 재료가 첫 turn 에 1등이면 안 된다', () => {
  assert.equal(rarityBonus(calc(0, 0, 5, 0)), 0);
  assert.equal(rarityBonus(undefined), 0);
});

test('「빔」은 드묾으로 안 센다 — 늘 빈 재료가 가장 세지면 안 된다', () => {
  // 실측: 표류 (지나감 620 · 빔 620) — 켜지긴 하는데 만들 게 없는 것이다
  assert.equal(rarityBonus(calc(0, 0, 0, 620)), 0);
});

test('꺼진 재료에는 안 얹는다 — 어차피 안 실리고 계산만 흐려진다', () => {
  const applied = applyRarity(
    [{ name: '자기상', text: '가', weight: 7, when: false }],
    () => calc(0, 3, 610, 0),
  );
  assert.equal(applied[0].weight, 7);
});

test('원본 무게는 안 바뀐다 — 다음 turn 이 이전 turn 을 물려받으면 안 된다', () => {
  const source = [{ name: '자기상', text: '가', weight: 7 }];
  applyRarity(source, () => calc(0, 3, 610, 0));
  assert.equal(source[0].weight, 7);
});

test('드물게 켜진 재료가 늘 있던 재료를 이긴다 — 이게 이 자리를 만든 이유다', () => {
  const scoreTable = { 자기상: calc(0, 3, 610, 0), mood: calc(500, 20, 0, 0) };
  const list = [
    { name: '기분', text: '가'.repeat(25), weight: 12 },
    { name: '자기상', text: '나'.repeat(25), weight: 7 },
  ];
  const plain = pickIngredients(list, { maxChars: 25, maxLines: 1 }).map((x) => x.name);
  assert.deepEqual(plain, ['기분'], '고치기 전에는 늘 있던 쪽이 이겼다');

  const withRarity = pickIngredients(applyRarity(list, (n) => scoreTable[n]), { maxChars: 25, maxLines: 1 });
  assert.deepEqual(withRarity.map((x) => x.name), ['자기상'], '조수님이 얘 얘기를 물었는데 기분이 실리면 뒤집힌 것이다');
});
