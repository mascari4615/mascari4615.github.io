import assert from 'node:assert/strict';
import test from 'node:test';

import { isDrying, tangentFor, tangentNote, tangentSeed } from '../dist/index.js';

const 두뇌 = (text, at = 1) => ({ role: 'said', channel: 'web', text, at });
const 표시된 = (text, at = 1) => ({ ...두뇌(text, at), via: 'brain' });
const 반사 = (text, at = 1) => ({ role: 'said', channel: 'web', text, at, via: 'reflex' });

// ── 말라 가나 ───────────────────────────────────────────────────────

test('짧은 답만 이어지면 마른 것이다', () => {
  assert.equal(isDrying([표시된('소파…'), 표시된('음…'), 표시된('고양이…')]), true);
});

test('되묻고 있으면 안 마른 것이다 — 짧아도 대화는 살아 있다', () => {
  assert.equal(isDrying([표시된('소파…'), 표시된('넌 어때?'), 표시된('음…')]), false);
});

test('길게 말하고 있으면 안 마른 것이다', () => {
  assert.equal(isDrying([
    표시된('음 그건 어제도 비슷했는데 오늘은 좀 다르네'),
    표시된('아까 그 창 계속 켜 있더라'),
    표시된('셰이더 그거 아직인가'),
  ]), false);
});

test('말이 몇 마디 없으면 판단하지 않는다 — 두 마디로 마른 대화라 부를 수 없다', () => {
  assert.equal(isDrying([표시된('음…'), 표시된('소파…')]), false);
});

test('고정 대꾸는 안 센다 — 「…어?」가 짧다고 대화가 마른 건 아니다', () => {
  assert.equal(isDrying([반사('…어?'), 반사('왜.'), 반사('…그만.')]), false);
});

test('어디서 왔는지 모르는 옛 기록도 안 센다', () => {
  assert.equal(isDrying([두뇌('소파…'), 두뇌('음…'), 두뇌('고양이…')]), false);
});

test('얼마나 짧아야 마른 것인지 정할 수 있다 — 인격마다 다르다', () => {
  const es = [표시된('그럭저럭 지냈어'), 표시된('나도 그랬는데'), 표시된('음 그러네')];
  assert.equal(isDrying(es, { shortAt: 5 }), false);
  assert.equal(isDrying(es, { shortAt: 20 }), true);
});

// ── 꺼낼 거리 ───────────────────────────────────────────────────────

test('궁금한 것이 가장 먼저다 — 조수님한테서 나온 얘기라 제일 자연스럽다', () => {
  const seed = tangentSeed({ wondering: '아까 그 게임 얘기', sawWindow: '유니티', quietPerson: '박대리' });
  assert.equal(seed.from, '궁금한 것');
});

test('궁금한 게 없으면 아까 본 것을 꺼낸다', () => {
  const seed = tangentSeed({ sawWindow: '유니티' });
  assert.equal(seed.from, '아까 본 것');
  assert.match(seed.what, /유니티/);
});

test('사람과 바람은 마지막이다 — 자칫 뜬금없다', () => {
  assert.equal(tangentSeed({ quietPerson: '박대리' }).from, '곁의 사람');
  assert.equal(tangentSeed({ wish: '오늘 한 번은 같이 놀기' }).from, '오늘 바람');
});

test('꺼낼 게 없으면 null', () => {
  assert.equal(tangentSeed({}), null);
  assert.equal(tangentSeed({ wondering: null, sawWindow: null }), null);
});

test('늘 같은 것만 꺼내지 않게 고를 수 있다', () => {
  const sources = { wondering: '하나', sawWindow: '둘' };
  assert.notEqual(tangentSeed(sources, 0).from, tangentSeed(sources, 1).from);
});

// ── 두뇌에 넘길 한 줄 ────────────────────────────────────────────────

test('답을 하지 말라는 게 아니다 — 먼저 답하고 그 다음이다', () => {
  const note = tangentNote({ from: '궁금한 것', what: '아까 그 게임' });
  assert.match(note, /물어본 것엔 답하고/);
  assert.match(note, /한 조각만/);
});

test('억지로 이어 붙이지 말라고 못 박는다 — 「그건 그렇고」는 대화가 아니다', () => {
  assert.match(tangentNote({ from: '궁금한 것', what: '뭐' }), /억지로 이어 붙이지 말고/);
});

test('꺼낼 거리가 없으면 아무 말도 안 얹는다', () => {
  assert.equal(tangentNote(null), '');
});

// ── 합쳐서 ──────────────────────────────────────────────────────────

test('마를 때만 한 줄이 나온다', () => {
  const 마름 = [표시된('소파…'), 표시된('음…'), 표시된('고양이…')];
  assert.notEqual(tangentFor(마름, { wondering: '그 게임' }), '');
});

test('안 마르면 조용하다 — 잘 굴러가는 대화에 끼어들지 않는다', () => {
  const 살아있음 = [표시된('소파…'), 표시된('넌 어때?'), 표시된('음…')];
  assert.equal(tangentFor(살아있음, { wondering: '그 게임' }), '');
});

test('말라도 꺼낼 게 없으면 조용하다', () => {
  const 마름 = [표시된('소파…'), 표시된('음…'), 표시된('고양이…')];
  assert.equal(tangentFor(마름, {}), '');
});
