import assert from 'node:assert/strict';
import test from 'node:test';

import { Playing, canFollow, invitesPlay, judge, pickWord, play, startWordChain, 아는말, 한수처럼생겼나 } from '../dist/index.js';

const 첫째 = () => 0;
const 판 = (used, next) => ({ used, next, turn: '조수님', winner: null });

// ── 규칙 ────────────────────────────────────────────────────────────

test('앞말의 끝 글자로 시작해야 한다', () => {
  assert.equal(judge(판(['사과'], '과'), '과일').ok, true);
  assert.equal(judge(판(['사과'], '과'), '바다').ok, false);
});

test('두음법칙을 봐준다 — 이걸 빼면 놀이가 억지스러워진다', () => {
  assert.equal(judge(판(['유리'], '리'), '이불').ok, true);
  assert.equal(judge(판(['오리'], '리'), '리본').ok, true);
  assert.deepEqual(canFollow('려'), ['려', '여']);
  assert.deepEqual(canFollow('가'), ['가']);
});

test('한 글자는 안 된다', () => {
  assert.match(judge(startWordChain(), '밥').why, /한 글자/);
});

test('한글이 아니면 안 된다', () => {
  for (const w of ['apple', '사과1', '사 과', '🍎']) {
    assert.equal(judge(startWordChain(), w).ok, false, `${w} 는 안 된다`);
  }
});

test('아까 나온 말은 또 못 쓴다', () => {
  assert.match(judge(판(['사과', '과일'], '일'), '사과').why, /아까 나왔/);
});

test('첫 수는 아무 말이나 된다', () => {
  assert.equal(judge(startWordChain(), '아무거나').ok, true);
});

// ── 한 수 두기 ──────────────────────────────────────────────────────

test('맞는 말을 내면 판이 이어지고 차례가 넘어간다', () => {
  const { chain } = play(startWordChain(), '사과', '조수님');
  assert.deepEqual(chain.used, ['사과']);
  assert.equal(chain.next, '과');
  assert.equal(chain.turn, '나');
  assert.equal(chain.winner, null);
});

test('규칙을 어기면 낸 쪽이 진다 — 무르는 놀이에는 긴장이 없다', () => {
  const { chain } = play(판(['사과'], '과'), '바다', '조수님');
  assert.equal(chain.winner, '나');
  assert.deepEqual(chain.used, ['사과'], '판은 그대로다');
});

test('얘가 어겨도 얘가 진다 — 똑같이 적용된다', () => {
  const { chain } = play(판(['사과'], '과'), '바다', '나');
  assert.equal(chain.winner, '조수님');
});

test('끝난 판에는 더 못 둔다', () => {
  const 끝난판 = { used: ['사과'], next: '과', turn: '나', winner: '나' };
  assert.match(play(끝난판, '과일', '조수님').judged.why, /이미 끝났/);
});

// ── 얘가 낼 말 고르기 ───────────────────────────────────────────────

test('낼 수 있는 말만 고른다', () => {
  const 골랐다 = pickWord(판(['사과'], '과'), ['바다', '과일', '사과'], 첫째);
  assert.equal(골랐다, '과일');
});

test('낼 말이 없으면 null — 그러면 진다', () => {
  assert.equal(pickWord(판(['사과'], '과'), ['바다', '하늘'], 첫째), null);
});

// ── 대화에 끼워 넣기 ────────────────────────────────────────────────

test('걸어오지 않으면 놀이가 나서지 않는다 — 놀이가 대화를 가로채면 안 된다', () => {
  const p = new Playing();
  assert.equal(p.hear('오늘 좀 힘들었어'), null);
  assert.equal(p.on, false);
});

test('끝말잇기 하자고 하면 얘가 먼저 낸다 — 먼저 하라고 미루는 건 같이 노는 게 아니다', () => {
  const p = new Playing({ words: ['사과', '과일'], roll: 첫째 });
  const r = p.hear('끝말잇기 하자');
  assert.equal(r.playing, true);
  assert.match(r.say, /사과/);
  assert.equal(p.on, true);
});

test('노는 중에는 아무 말이나 다 한 수다', () => {
  const p = new Playing({ words: ['사과', '일기'], roll: 첫째 });
  p.hear('끝말잇기 하자');
  const r = p.hear('과일');
  assert.match(r.say, /일기/);
  assert.deepEqual(p.used, ['사과', '과일', '일기']);
});

test('조수님이 규칙을 어기면 얘가 이긴다', () => {
  const p = new Playing({ words: ['사과'], roll: 첫째 });
  p.hear('끝말잇기 하자');
  const r = p.hear('바다');
  assert.match(r.say, /내가 이겼다/);
  assert.equal(p.on, false, '이기면 판이 끝난다');
});

test('얘가 낼 말이 떨어지면 순순히 진다 — 안 지는 상대와 하는 놀이는 놀이가 아니다', () => {
  const p = new Playing({ words: ['사과'], roll: 첫째 });
  p.hear('끝말잇기 하자');
  const r = p.hear('과자');
  assert.match(r.say, /내가 졌다/);
  assert.equal(p.on, false);
});

test('그만하자면 그만둔다 — 빠져나올 수 없는 놀이는 덫이다', () => {
  for (const 말 of ['그만', '그만하자', '안 해', '됐어', '항복']) {
    const p = new Playing({ words: ['사과', '과일'], roll: 첫째 });
    p.hear('끝말잇기 하자');
    const r = p.hear(말);
    assert.equal(r.playing, false, `${말} 하면 그만둬야 한다`);
    assert.equal(p.on, false);
  }
});

test('오래 논 판은 그만둘 때 다르게 말한다', () => {
  const p = new Playing({ words: ['사과', '과일', '일기', '기차', '차표', '표지', '지도'], roll: 첫째 });
  p.hear('끝말잇기 하자');
  for (const w of ['과일', '기차', '표지']) p.hear(w);
  assert.match(p.hear('그만').say, /재밌었어/);
});

test('아는 말이 하나도 없으면 시작도 안 한다', () => {
  const p = new Playing({ words: [] });
  const r = p.hear('끝말잇기 하자');
  assert.equal(r.playing, false);
  assert.equal(p.on, false);
});

test('판을 접으면 그 다음 말은 평범한 대화로 돌아간다', () => {
  const p = new Playing({ words: ['사과', '과일'], roll: 첫째 });
  p.hear('끝말잇기 하자');
  p.stop();
  assert.equal(p.hear('과일'), null);
});

test('놀이를 걸어오는 말인지 밖에서도 볼 수 있다', () => {
  assert.equal(invitesPlay('우리 끝말잇기 할래?'), true);
  assert.equal(invitesPlay('오늘 뭐 했어'), false);
});

test('놀이가 끝난 뒤 다시 걸면 새 판이 열린다', () => {
  const p = new Playing({ words: ['사과', '과일'], roll: 첫째 });
  p.hear('끝말잇기 하자');
  p.hear('그만');
  const r = p.hear('끝말잇기 하자');
  assert.equal(r.playing, true);
  assert.deepEqual(p.used, ['사과'], '지난 판은 안 남는다');
});

test('얘가 아는 말 목록 자체가 규칙을 지킨다 — 사전에 없는 말로 이기면 재미가 없다', () => {
  assert.equal(new Set(아는말).size, 아는말.length, '같은 말이 두 번 들어 있으면 안 된다');
  for (const w of 아는말) {
    assert.equal(judge(startWordChain(), w).ok, true, `「${w}」 는 낼 수 없는 말이다`);
  }
});

test('아는 말이 충분해서 몇 수는 주고받는다 — 한 수 만에 끝나면 놀이가 아니라 버튼이다', () => {
  const p = new Playing({ roll: () => 0.5 });
  p.hear('끝말잇기 하자');
  let 수 = 0;
  while (p.on && 수 < 12) {
    const 끝 = p.used[p.used.length - 1].slice(-1);
    const 이을것 = 아는말.find((w) => w[0] === 끝 && p.used.includes(w) === false);
    if (이을것 === undefined) break;
    p.hear(이을것);
    수 += 1;
  }
  assert.ok(수 >= 4, `네 수는 주고받아야 한다 (실제 ${수}수)`);
});

test('놀이 중에도 문장은 대화로 흘려보낸다 — 판을 열어 둔 걸 잊었다고 이겼다고 하면 안 된다', () => {
  const p = new Playing({ words: ['사과', '과일'], roll: 첫째 });
  p.hear('끝말잇기 하자');
  assert.equal(p.hear('나 방금 그 버그 드디어 고쳤어!'), null, '문장은 한 수가 아니다');
  assert.equal(p.on, true, '판은 그대로 열려 있다');
});

test('틀린 수는 그래도 한 수다 — 안 그러면 규칙 없는 놀이가 된다', () => {
  const p = new Playing({ words: ['사과'], roll: 첫째 });
  p.hear('끝말잇기 하자');
  assert.match(p.hear('apple').say, /내가 이겼다/);
});

test('한 수처럼 생겼는지 가릴 수 있다', () => {
  for (const w of ['과일', 'apple', '가']) assert.equal(한수처럼생겼나(w), true, `${w} 는 한 수다`);
  for (const w of ['나 오늘 힘들었어', '뭐해?', '과일.', '아주아주긴낱말이라면']) {
    assert.equal(한수처럼생겼나(w), false, `${w} 는 한 수가 아니다`);
  }
});
