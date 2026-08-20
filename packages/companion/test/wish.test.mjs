import assert from 'node:assert/strict';
import test from 'node:test';

import { Wishes, wishNote, wishable } from '../dist/index.js';

const daytime = new Date(2026, 1, 10, 14, 0).getTime();
const nextDay = new Date(2026, 1, 11, 14, 0).getTime();
const thisMorning = new Date(2026, 1, 10, 9, 0).getTime();

const person = (text, at = thisMorning, channel = 'web') => ({ role: 'sensed', channel, text, at });
const companion = (text, at = thisMorning) => ({ role: 'said', channel: 'web', text, at });

const wishOne = {
  what: '시험용 바람',
  met: (es, since) => es.some((e) => e.role === 'sensed' && e.at >= since && e.text.includes('됐다')),
  say: '…그거 아직인데.',
};
const wishTwo = { ...wishOne, what: '시험용 바람 둘', say: '…이것도 아직인데.' };

const wishes = (extra = {}) => new Wishes({ pool: [wishOne], perDay: 1, now: () => daytime, roll: () => 0, ...extra });

test('오늘 바라는 게 있다 — 원하는 게 없으면 상대가 아니라 도구다', () => {
  assert.equal(wishes().list().length, 1);
});

test('하루에 몇 개나 바랄지 정한다 — 많으면 그건 요구 목록이다', () => {
  const w = new Wishes({ pool: [wishOne, wishTwo], perDay: 2, now: () => daytime, roll: () => 0 });
  assert.equal(w.list().length, 2);
});

test('같은 바람을 두 번 뽑지 않는다', () => {
  const w = new Wishes({ pool: [wishOne, wishTwo], perDay: 2, now: () => daytime, roll: () => 0 });
  const names = w.list().map((x) => x.what);
  assert.equal(new Set(names).size, names.length);
});

test('바랄 수 있는 것보다 많이 바라지 않는다', () => {
  const w = new Wishes({ pool: [wishOne], perDay: 5, now: () => daytime, roll: () => 0 });
  assert.equal(w.list().length, 1);
});

test('하루가 바뀌면 새로 고른다 — 어제 못 이룬 걸 끌고 가면 원망이다', () => {
  let now2 = daytime;
  const w = new Wishes({ pool: [wishOne], perDay: 1, now: () => now2, roll: () => 0 });
  w.nudge([]);
  assert.equal(w.nudge([]), null, '오늘은 이미 꺼냈다');
  now2 = nextDay;
  assert.notEqual(w.nudge([]), null, '내일은 다시 꺼낼 수 있다');
});

// ── 채워졌나 ────────────────────────────────────────────────────────

test('채워지면 안 채워진 목록에서 빠진다', () => {
  const w = wishes();
  assert.equal(w.unmet([]).length, 1);
  assert.equal(w.unmet([person('됐다')]).length, 0);
});

test('어제 채워진 건 오늘 것으로 안 쳐 준다', () => {
  const yesterday = new Date(2026, 1, 9, 14, 0).getTime();
  assert.equal(wishes().unmet([person('됐다', yesterday)]).length, 1);
});

test('오늘 몇 개나 채워졌는지 센다', () => {
  const w = wishes();
  assert.deepEqual(w.howWasToday([]), { met: 0, total: 1 });
  assert.deepEqual(w.howWasToday([person('됐다')]), { met: 1, total: 1 });
});

// ── 조르지 않기 ─────────────────────────────────────────────────────

test('안 채워진 게 있으면 슬쩍 꺼낸다', () => {
  assert.equal(wishes().nudge([]), '…그거 아직인데.');
});

test('하루에 한 번만 꺼낸다 — 두 번 말하면 조르는 것이다', () => {
  const w = wishes();
  assert.notEqual(w.nudge([]), null);
  assert.equal(w.nudge([]), null);
  assert.equal(w.nudge([]), null);
});

test('한 번에 하나만 꺼낸다 — 두 개를 늘어놓으면 요구 사항이 된다', () => {
  const w = new Wishes({ pool: [wishOne, wishTwo], perDay: 2, now: () => daytime, roll: () => 0 });
  const firstTurn = w.nudge([]);
  assert.notEqual(firstTurn, null);
  assert.equal(firstTurn.includes('이것도'), false, '두 개를 한꺼번에 말하면 안 된다');
});

test('채워진 바람은 안 꺼낸다', () => {
  assert.equal(wishes().nudge([person('됐다')]), null);
});

// ── 진짜 바람들 ─────────────────────────────────────────────────────

test('실제로 쓰는 바람들은 조수님이 조금만 움직이면 채워진다', () => {
  const filler = {
    '오늘 한 번은 같이 놀기': [companion('좋아. 사과.')],
    '오늘 있었던 일 한 조각 듣기': [person('오늘 회의가 길어서 좀 지쳤어')],
    '한 번은 이름으로 불리기': [person('욘, 뭐 해')],
    '오늘 한 번은 웃기기': [person('ㅋㅋㅋ')],
    '조용히 곁에 있는 시간 갖기': [person('응'), person('그래'), person('음')],
  };
  const todayStart = new Date(thisMorning).setHours(0, 0, 0, 0);
  for (const w of wishable) {
    const material = filler[w.what];
    assert.notEqual(material, undefined, `「${w.what}」 를 채우는 법이 시험에 없다`);
    assert.equal(w.met(material, todayStart), true, `「${w.what}」 가 안 채워진다`);
    assert.equal(w.met([], todayStart), false, `「${w.what}」 가 아무것도 없이 채워진다`);
  }
});

test('화면에서 주워 온 것으로는 안 채워진다 — 곁눈질은 조수님이 한 게 아니다', () => {
  const todayStart2 = new Date(thisMorning).setHours(0, 0, 0, 0);
  const heardEvents = wishable.find((w) => w.what === '오늘 있었던 일 한 조각 듣기');
  const screen = [person('화면을 봤다. 지금 앞에 있는 창은 「동반자」.', thisMorning, 'screen')];
  assert.equal(heardEvents.met(screen, todayStart2), false);
});

// ── 두뇌에 넘길 한 줄 ────────────────────────────────────────────────

test('바라는 게 없으면 아무 말도 안 얹는다', () => {
  assert.equal(wishNote([]), '');
});

test('시키지 않는다 — 시키면 억지로 만들어 내려 든다', () => {
  const note = wishNote([wishOne]);
  assert.match(note, /시험용 바람/);
  assert.match(note, /억지로 만들어 내려 하지 마라/);
});
