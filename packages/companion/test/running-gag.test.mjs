import assert from 'node:assert/strict';
import test from 'node:test';

import { recurringThings, runningGagNote } from '../dist/index.js';

const 하루 = 86_400_000;
const 어제 = new Date(2026, 1, 9, 12).getTime();
const 오늘 = 어제 + 하루;
const 그제 = 어제 - 하루;

const 사람 = (text, at, channel = 'web') => ({ role: 'sensed', channel, text, at });
const 얘 = (text, at) => ({ role: 'said', channel: 'web', text, at });
const 닿음 = (at) => ({ role: 'sensed', channel: 'touch', text: '조수님이 나를 쿡 찔렀다.', at });

// ── 찾기 ────────────────────────────────────────────────────────────

test('여러 날에 걸쳐 자꾸 나오는 것을 찾는다', () => {
  const es = [사람('셰이더 또 안 되네', 그제), 사람('셰이더 고쳤어?', 어제), 사람('셰이더 결국 됐어', 오늘)];
  const r = recurringThings(es);
  assert.equal(r.length, 1);
  assert.equal(r[0].what, '셰이더');
  assert.equal(r[0].times, 3);
  assert.equal(r[0].days, 3);
});

test('하루에 몰아 나온 건 「우리끼리」가 아니다', () => {
  const es = [사람('셰이더', 오늘), 사람('셰이더', 오늘 + 1000), 사람('셰이더', 오늘 + 2000)];
  assert.deepEqual(recurringThings(es), []);
});

test('몇 날에 걸쳐야 할지 정할 수 있다', () => {
  const es = [사람('셰이더', 오늘), 사람('셰이더', 오늘 + 1000), 사람('셰이더', 오늘 + 2000)];
  assert.equal(recurringThings(es, { needDays: 1 }).length, 1);
});

test('몇 번은 나와야 한다 — 두 번은 우연이다', () => {
  const es = [사람('셰이더', 어제), 사람('셰이더', 오늘)];
  assert.deepEqual(recurringThings(es), []);
  assert.equal(recurringThings(es, { atLeast: 2 }).length, 1);
});

test('한 말에 같은 낱말이 두 번 나와도 한 번으로 센다', () => {
  const es = [사람('셰이더 셰이더 셰이더', 그제), 사람('셰이더', 어제), 사람('셰이더', 오늘)];
  assert.equal(recurringThings(es)[0].times, 3);
});

test('얘가 한 말은 안 센다 — 제가 자주 쓰는 낱말을 「우리끼리 그거」로 착각한다', () => {
  const es = [얘('셰이더 얘기였나', 그제), 얘('셰이더', 어제), 얘('셰이더', 오늘)];
  assert.deepEqual(recurringThings(es), []);
});

test('닿은 것은 대화가 아니다 — 안 빼면 「조수님이 나를 찔렀다」가 1등이 된다', () => {
  const es = [닿음(그제), 닿음(어제), 닿음(오늘), 닿음(오늘 + 1000)];
  assert.deepEqual(recurringThings(es), []);
});

test('화면 곁눈질도 안 센다', () => {
  const es = [
    사람('화면을 봤다. 창은 「유니티」', 그제, 'screen'),
    사람('화면을 봤다. 창은 「유니티」', 어제, 'screen'),
    사람('화면을 봤다. 창은 「유니티」', 오늘, 'screen'),
  ];
  assert.deepEqual(recurringThings(es), []);
});

test('서술어는 안 센다 — 「좋아해」가 단골 얘기가 되면 안 된다', () => {
  const es = [사람('그거 좋아해', 그제), 사람('이것도 좋아해', 어제), 사람('저것도 좋아해', 오늘)];
  assert.equal(recurringThings(es).some((x) => x.what === '좋아해'), false);
});

test('여러 날에 걸친 것을 먼저 둔다 — 오래 이어진 게 더 「우리끼리」다', () => {
  const es = [
    사람('셰이더', 그제), 사람('셰이더', 어제), 사람('셰이더', 오늘),
    사람('커피 커피', 오늘), 사람('커피', 오늘 + 1000), 사람('커피', 오늘 + 2000), 사람('커피', 어제),
  ];
  const r = recurringThings(es, { needDays: 2 });
  assert.equal(r[0].what, '셰이더');
});

test('너무 많이 들고 오지 않는다', () => {
  const es = [];
  for (const w of ['가가', '나나', '다다', '라라', '마마', '바바']) {
    for (const at of [그제, 어제, 오늘]) es.push(사람(w, at));
  }
  assert.ok(recurringThings(es, { keep: 3 }).length <= 3);
});

test('아무것도 없으면 빈손이다', () => {
  assert.deepEqual(recurringThings([]), []);
});

// ── 두뇌에 넘길 한 줄 ────────────────────────────────────────────────

test('없으면 아무 말도 안 얹는다', () => {
  assert.equal(runningGagNote([]), '');
});

test('며칠에 걸쳐 몇 번인지 같이 알려 준다', () => {
  const note = runningGagNote([{ what: '셰이더', times: 9, firstAt: 1, lastAt: 2, days: 3 }]);
  assert.match(note, /셰이더/);
  assert.match(note, /3일에 걸쳐 9번/);
});

test('농담으로 만들라고 시키지 않는다 — 자주 나온다고 웃긴 게 아니다', () => {
  const note = runningGagNote([{ what: '셰이더', times: 9, firstAt: 1, lastAt: 2, days: 3 }]);
  assert.match(note, /억지로 농담으로 만들지 마라/);
});
