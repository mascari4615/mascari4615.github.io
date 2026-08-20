import assert from 'node:assert/strict';
import test from 'node:test';

import { landingNote, reactionTo, whatLanded } from '../dist/index.js';

const companion = (text, at) => ({ role: 'said', channel: 'web', text, at });
const person = (text, at) => ({ role: 'sensed', channel: 'web', text, at });
const screen = (text, at) => ({ role: 'sensed', channel: 'screen', text, at });

const seconds = 1000;
const minutes = 60 * seconds;

test('웃으면 통한 것이다', () => {
  const r = reactionTo(companion('그거 또 켜 놨네', 0), person('ㅋㅋㅋ 맞아', 5 * seconds));
  assert.equal(r.landed, true);
  assert.equal(r.why, '웃었다');
});

test('되물으면 통한 것이다 — 대화가 이어졌으니까', () => {
  const r = reactionTo(companion('어제 그 폴더 얘기 말인데', 0), person('그거 왜?', 10 * seconds));
  assert.equal(r.landed, true);
  assert.equal(r.why, '되물었다');
});

test('바로 길게 받아 주면 통한 것이다', () => {
  const r = reactionTo(companion('오늘 좀 늘어지네', 0), person('맞아 아침부터 계속 이러고 있어', 8 * seconds));
  assert.equal(r.landed, true);
  assert.equal(r.why, '바로 받아서 이어 갔다');
});

test('「응」 한 마디로 넘기면 식은 것이다', () => {
  for (const answer of ['응', 'ㅇㅇ', '그래', '음…', '넵']) {
    assert.equal(reactionTo(companion('뭐 하고 있었어', 0), person(answer, 3 * seconds)).landed, false, `${answer} 은 식은 것이다`);
  }
});

test('짧아도 웃으면 통한 것이다 — 웃음이 먼저다', () => {
  assert.equal(reactionTo(companion('아무 말', 0), person('ㅋㅋ', 3 * seconds)).landed, true);
});

test('한참 있다 딴 얘기를 하면 식은 것이다', () => {
  const r = reactionTo(companion('오늘 날씨 좋더라', 0), person('그 파일 어디 뒀지', 10 * minutes));
  assert.equal(r.landed, false);
  assert.equal(r.why, '한참 있다 딴 얘기를 했다');
});

test('빠르기 기준은 밖에서 정할 수 있다', () => {
  const said = companion('뭐 하고 있었어', 0);
  const reply = person('아침부터 계속 이러고 있어', 60 * seconds);
  assert.equal(reactionTo(said, reply), null);
  assert.equal(reactionTo(said, reply, { quickMs: 90 * seconds }).landed, true);
});

test('조용한 것은 식은 것이 아니다 — 자리를 비웠을 수도 있다', () => {
  assert.equal(reactionTo(companion('오늘 어때', 0), undefined), null);
});

test('사람이 먼저 한 말에는 반응이랄 게 없다', () => {
  assert.equal(reactionTo(person('안녕', 0), person('거기 있어?', 5 * seconds)), null);
});

test('얘가 연달아 두 마디 하면 그 사이는 재지 않는다', () => {
  assert.equal(reactionTo(companion('음…', 0), companion('아니다', 2 * seconds)), null);
});

test('애매하면 아무 쪽으로도 세지 않는다', () => {
  assert.equal(reactionTo(companion('그렇구나', 0), person('알겠다 고마워', 90 * seconds)), null);
});

// ── 훑기 ────────────────────────────────────────────────────────────

test('오간 말을 훑어 통한 것과 식은 것을 가려낸다', () => {
  const entries = [
    companion('그거 또 켜 놨네', 0), person('ㅋㅋ 맞아', 3 * seconds),
    companion('뭐 하고 있었어', 4 * seconds), person('응', 6 * seconds),
  ];
  const ls = whatLanded(entries);
  assert.deepEqual(ls.map((l) => l.landed), [true, false]);
});

test('화면에서 주워 온 것은 반응으로 치지 않는다 — 사람이 한 말이 아니다', () => {
  const entries = [companion('오늘 어때', 0), screen('화면을 봤다. 창은 「유니티」', 3 * seconds)];
  assert.deepEqual(whatLanded(entries), []);
});

// ── 두뇌에 넘길 한 줄 ────────────────────────────────────────────────

test('통한 말과 식은 말을 보여 준다', () => {
  const entries = [
    companion('그거 또 켜 놨네', 0), person('ㅋㅋ 맞아', 3 * seconds),
    companion('뭐 하고 있었어', 4 * seconds), person('응', 6 * seconds),
  ];
  const note = landingNote(entries);
  assert.match(note, /받아 준 내 말.*또 켜 놨네/);
  assert.match(note, /시들했던 내 말.*뭐 하고 있었어/);
});

test('흉내 내라고 시키지 않는다 — 규칙으로 박으면 빚어지는 게 아니라 따라 하는 것이다', () => {
  const entries = [companion('그거 또 켜 놨네', 0), person('ㅋㅋ', 3 * seconds)];
  assert.match(landingNote(entries), /흉내 내라는 게 아니다/);
});

test('잰 게 없으면 아무 말도 얹지 않는다', () => {
  assert.equal(landingNote([]), '');
  assert.equal(landingNote([companion('혼잣말', 0)]), '');
});

test('몇 개까지 보여 줄지 정할 수 있다 — 길면 인격을 덮는다', () => {
  const entries = [];
  for (let i = 0; i < 5; i += 1) {
    entries.push(companion(`말 ${i}`, i * minutes), person('ㅋㅋ', i * minutes + 3 * seconds));
  }
  const one = landingNote(entries, { howMany: 1 });
  assert.equal((one.match(/\(웃었다\)/g) ?? []).length, 1);
  assert.equal((landingNote(entries).match(/\(웃었다\)/g) ?? []).length, 2);
});

test('가장 최근 것을 보여 준다 — 옛날에 통한 건 지금 결이 아니다', () => {
  const entries = [
    companion('옛날 말', 0), person('ㅋㅋ', 3 * seconds),
    companion('요즘 말', 10 * minutes), person('ㅋㅋ', 10 * minutes + 3 * seconds),
  ];
  assert.match(landingNote(entries, { howMany: 1 }), /요즘 말/);
});

test('한참 있다 던진 물음은 되물음이 아니다 — 새로 꺼낸 얘기다', () => {
  const r = reactionTo(companion('늘어지는 중…', 0), person('오늘 어때?', 9 * minutes));
  assert.equal(r.landed, false, '받은 게 아니라 딴 얘기를 꺼낸 것이다');
});
