import assert from 'node:assert/strict';
import test from 'node:test';

import { noticeCuriosity, stripParticle, unusableCuriosity, worthWondering } from '../dist/index.js';

const 담는곳 = () => {
  const 안 = [];
  return { 안, wonder: (x) => 안.push(x), next: () => 안[0] ?? null, asked: () => {}, size: () => 안.length };
};

// ── 조사 떼기 ───────────────────────────────────────────────────────

test('조사를 뗀다 — 안 떼면 같은 말이 흩어져 매번 새로 궁금해한다', () => {
  assert.equal(stripParticle('회의가'), '회의');
  assert.equal(stripParticle('셰이더를'), '셰이더');
  assert.equal(stripParticle('유니티에서'), '유니티');
  assert.equal(stripParticle('친구랑'), '친구');
});

test('조사가 없으면 그대로 둔다', () => {
  assert.equal(stripParticle('셰이더'), '셰이더');
});

test('짧은 말을 조사라고 깎아 내지 않는다 — 「과자」가 「과」가 되면 안 된다', () => {
  assert.equal(stripParticle('과자'), '과자');
  assert.equal(stripParticle('도시'), '도시');
});

// ── 물어볼 만한가 ───────────────────────────────────────────────────

test('이름 붙은 것은 물어볼 만하다', () => {
  for (const w of ['셰이더', '회의', '유니티', '고양이', '끝말잇기']) {
    assert.equal(worthWondering(w), true, `${w} 는 물어볼 만하다`);
  }
});

test('활용된 서술어는 물어볼 게 아니다 — 길이로 고르면 동사만 골라진다', () => {
  for (const w of ['힘들었어', '알려주세요', '고쳤어', '지쳤어', '했다']) {
    assert.equal(worthWondering(w), false, `${w} 는 서술어다`);
  }
});

test('관형형은 규칙으로 못 가려서 손으로 막아 뒀다 — 한계를 숨기지 않는다', () => {
  assert.equal(worthWondering('만드는'), false, '목록에 있는 것은 막힌다');
  assert.equal(worthWondering('굽는'), true, '목록에 없는 관형형은 못 막는다 — 알려진 한계');
});

test('묻는 말 자체도 물어볼 게 아니다', () => {
  for (const w of ['무엇', '어때', '누구', '언제', '어디']) {
    assert.equal(worthWondering(w), false, `${w} 는 묻는 말이다`);
  }
});

test('한 글자나 너무 긴 것은 안 본다', () => {
  assert.equal(worthWondering('밥'), false);
    assert.equal(worthWondering('가'.repeat(12)), false);
});

test('숫자나 영어는 물어볼 거리가 아니다', () => {
  for (const w of ['123', 'apple', '3시간']) assert.equal(worthWondering(w), false, `${w}`);
});

// ── 실제로 줍기 ─────────────────────────────────────────────────────

test('이름 붙은 것을 줍는다 — 뽑은 개수가 아니라 쓸 만한 개수가 척도다', () => {
  const 곳 = 담는곳();
  assert.equal(noticeCuriosity('오늘 회의가 길어서 좀 지쳤어', null, 곳), '회의 — 조수님이 꺼낸 얘기');
});

test('물어볼 게 없으면 안 줍는다 — 못 쓸 걸 담느니 안 담는다', () => {
  assert.equal(noticeCuriosity('무엇을 도와드릴까요', null, 담는곳()), null);
  assert.equal(noticeCuriosity('오늘 어때?', null, 담는곳()), null);
});

test('씨앗은 짧다 — 문장을 통째로 담으면 꺼낼 때 그 문장을 읊는다', () => {
  const 씨앗 = noticeCuriosity('어제 그 셰이더 결국 못 고쳤어', null, 담는곳());
  assert.equal(씨앗.includes('어제 그'), false);
  assert.ok(씨앗.length < 30);
});

test('짧은 말에는 궁금할 게 없다', () => {
  assert.equal(noticeCuriosity('응', null, 담는곳()), null);
});

test('이미 아는 얘기는 또 궁금해하지 않는다', () => {
  assert.equal(noticeCuriosity('오늘 회의가 길었어', '회의를 자주 한다', 담는곳()), null);
});

test('앞에 나온 것부터 줍는다 — 사람은 하고 싶은 말을 앞에 둔다', () => {
  assert.match(noticeCuriosity('셰이더 때문에 유니티가 자꾸 죽어', null, 담는곳()), /셰이더/);
});

// ── 이미 쌓인 쓰레기 ────────────────────────────────────────────────

test('옛 형식은 통째로 못 쓴다 — 문장을 물고 있어 꺼내면 읊는다', () => {
  assert.equal(unusableCuriosity('조수님이 「오늘 어때?」 라고 했던 것 — 어때 에 대해 더'), true);
});

test('새 형식이라도 알맹이가 못 쓸 것이면 거른다', () => {
  assert.equal(unusableCuriosity('어때 — 조수님이 꺼낸 얘기'), true);
  assert.equal(unusableCuriosity('셰이더 — 조수님이 꺼낸 얘기'), false);
});

test('「좋아해」 「고마워」 꼴도 서술어다 — 마지막 한 글자만 보면 통째로 샌다', () => {
  for (const w of ['좋아해', '싫어해', '미안해', '고마워', '반가워']) {
    assert.equal(worthWondering(w), false, `${w} 는 서술어다`);
  }
  assert.equal(worthWondering('셰이더'), true, '이름은 그대로 남아야 한다');
  assert.equal(worthWondering('시야'), true);
});
