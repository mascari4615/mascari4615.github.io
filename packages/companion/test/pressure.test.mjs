import assert from 'node:assert/strict';
import test from 'node:test';

import { pendingThoughts, pickIngredients } from '../dist/index.js';

const material = (name, weight, text = '가'.repeat(20)) => ({ name, text, weight });

test('한 번도 안 밀렸으면 아무것도 안 얹는다', () => {
  assert.equal(new pendingThoughts().addedWeight('되묻기'), 0);
});

test('밀릴수록 세진다. 참으면 더 하고 싶어진다', () => {
  const p = new pendingThoughts({ step: 3 });
  p.write('되묻기', 'queued');
  const once = p.addedWeight('되묻기');
  p.nextTurn();
  p.write('되묻기', 'queued');
  assert.ok(p.addedWeight('되묻기') > once, '두 번 밀렸으면 더 세야 한다');
});

test('말하고 나면 풀린다. 안 그러면 한 번 실린 게 계속 1등이다', () => {
  const p = new pendingThoughts();
  p.write('되묻기', 'queued');
  p.nextTurn();
  p.write('되묻기', 'loaded');
  assert.equal(p.addedWeight('되묻기'), 0);
});

test('꺼진 재료는 안 쌓인다. 지금 자리에 없는 얘기가 나중에 튀어나오면 안 된다', () => {
  const p = new pendingThoughts();
  p.write('놀이', 'off');
  p.write('빈것', 'blank');
  assert.equal(p.addedWeight('놀이'), 0);
  assert.equal(p.addedWeight('빈것'), 0);
});

test('아무리 참아도 상한이 있다. 없으면 오래된 것이 영영 1등이라 새 것이 굶는다', () => {
  const p = new pendingThoughts({ step: 3, cap: 9 });
  for (let i = 0; i < 20; i += 1) { p.write('되묻기', 'queued'); p.nextTurn(); }
  assert.equal(p.addedWeight('되묻기'), 9);
});

test('한참 안 밀리면 잊는다. 지나간 관심이다', () => {
  const p = new pendingThoughts({ forgetTurn: 3 });
  p.write('궁금증', 'queued');
  for (let i = 0; i < 4; i += 1) p.nextTurn();
  assert.equal(p.addedWeight('궁금증'), 0);
});

test('참던 재료가 결국 실린다. 이게 이 자리를 만든 이유다', () => {
  const p = new pendingThoughts({ step: 3 });
  const list = [material('큰것', 12), material('작은것', 5)];
  const pick = () => {
    const loaded = pickIngredients(p.overlay(list), { maxChars: 25, maxLines: 1, mark: p.write });
    p.nextTurn();
    return loaded.map((x) => x.name);
  };

  assert.deepEqual(pick(), ['큰것'], '처음엔 무거운 쪽');
  const loadedNames = [pick(), pick(), pick()].flat();
  assert.ok(loadedNames.includes('작은것'), `밀리기만 하던 재료가 끝내 실려야 한다. 실제로는 ${loadedNames.join(',')}`);
});

test('덧입혀도 원본 무게는 안 바뀐다. 다음 turn 이 이전 turn 을 물려받으면 안 된다', () => {
  const p = new pendingThoughts();
  p.write('되묻기', 'queued');
  const source = [material('되묻기', 5)];
  p.overlay(source);
  assert.equal(source[0].weight, 5);
});

test('참는 게 있으면 뭐가 얼마나 참는지 말할 수 있다. 안 보이면 못 고친다', () => {
  const p = new pendingThoughts();
  assert.equal(p.summary(), '');
  p.write('되묻기', 'queued');
  assert.match(p.summary(), /되묻기/);
});
