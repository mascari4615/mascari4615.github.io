import assert from 'node:assert/strict';
import test from 'node:test';

import { 밀린생각, pickIngredients } from '../dist/index.js';

const 재료 = (name, weight, text = '가'.repeat(20)) => ({ name, text, weight });

test('한 번도 안 밀렸으면 아무것도 안 얹는다', () => {
  assert.equal(new 밀린생각().더할무게('되묻기'), 0);
});

test('밀릴수록 세진다 — 참으면 더 하고 싶어진다', () => {
  const p = new 밀린생각({ 계단: 3 });
  p.적기('되묻기', '밀림');
  const 한번 = p.더할무게('되묻기');
  p.다음턴();
  p.적기('되묻기', '밀림');
  assert.ok(p.더할무게('되묻기') > 한번, '두 번 밀렸으면 더 세야 한다');
});

test('말하고 나면 풀린다 — 안 그러면 한 번 실린 게 계속 1등이다', () => {
  const p = new 밀린생각();
  p.적기('되묻기', '밀림');
  p.다음턴();
  p.적기('되묻기', '실림');
  assert.equal(p.더할무게('되묻기'), 0);
});

test('꺼진 재료는 안 쌓인다 — 지금 자리에 없는 얘기가 나중에 튀어나오면 안 된다', () => {
  const p = new 밀린생각();
  p.적기('놀이', '꺼짐');
  p.적기('빈것', '빔');
  assert.equal(p.더할무게('놀이'), 0);
  assert.equal(p.더할무게('빈것'), 0);
});

test('아무리 참아도 상한이 있다 — 없으면 오래된 것이 영영 1등이라 새 것이 굶는다', () => {
  const p = new 밀린생각({ 계단: 3, 상한: 9 });
  for (let i = 0; i < 20; i += 1) { p.적기('되묻기', '밀림'); p.다음턴(); }
  assert.equal(p.더할무게('되묻기'), 9);
});

test('한참 안 밀리면 잊는다 — 지나간 관심이다', () => {
  const p = new 밀린생각({ 잊는턴: 3 });
  p.적기('궁금증', '밀림');
  for (let i = 0; i < 4; i += 1) p.다음턴();
  assert.equal(p.더할무게('궁금증'), 0);
});

test('참던 재료가 결국 실린다 — 이게 이 자리를 만든 이유다', () => {
  const p = new 밀린생각({ 계단: 3 });
  const 목록 = [재료('큰것', 12), 재료('작은것', 5)];
  const 뽑기 = () => {
    const 실린것 = pickIngredients(p.덧입히기(목록), { maxChars: 25, maxLines: 1, mark: p.적기 });
    p.다음턴();
    return 실린것.map((x) => x.name);
  };

  assert.deepEqual(뽑기(), ['큰것'], '처음엔 무거운 쪽');
  const 실린이름들 = [뽑기(), 뽑기(), 뽑기()].flat();
  assert.ok(실린이름들.includes('작은것'), `밀리기만 하던 재료가 끝내 실려야 한다 — 실제로는 ${실린이름들.join(',')}`);
});

test('덧입혀도 원본 무게는 안 바뀐다 — 다음 turn 이 이전 turn 을 물려받으면 안 된다', () => {
  const p = new 밀린생각();
  p.적기('되묻기', '밀림');
  const 원본 = [재료('되묻기', 5)];
  p.덧입히기(원본);
  assert.equal(원본[0].weight, 5);
});

test('참는 게 있으면 뭐가 얼마나 참는지 말할 수 있다 — 안 보이면 못 고친다', () => {
  const p = new 밀린생각();
  assert.equal(p.요약(), '');
  p.적기('되묻기', '밀림');
  assert.match(p.요약(), /되묻기/);
});
