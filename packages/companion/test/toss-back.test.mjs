import assert from 'node:assert/strict';
import test from 'node:test';

import { tossBackNote, followUpRatio, isQuestion } from '../dist/index.js';

const person = (text) => ({ role: 'sensed', channel: 'web', text, at: 1 });
const companion = (text) => ({ role: 'said', channel: 'web', text, at: 2 });

test('묻는 말을 가린다', () => {
  assert.equal(isQuestion('오늘 어땠어?'), true);
  assert.equal(isQuestion('그건 뭔데'), true);
  assert.equal(isQuestion('그렇구나.'), false);
  assert.equal(isQuestion(''), false);
});

// 식어 가는 대화 — 사람 말이 점점 짧아진다.
const coolingTalk = [
  person('오늘 회사에서 발표를 했는데 준비를 많이 했거든'), companion('오'),
  person('근데 생각보다 반응이 별로였어'), companion('그렇구나'),
  person('응'), companion('음…'),
];

test('대화가 식어 가면 공을 돌려주라고 한다', () => {
  const note = tossBackNote({ recent: coolingTalk, justNow: '응' });
  assert.match(note, /공을 돌려줘라/);
  assert.match(note, /하던 얘기를 이어 가라/);
});

test('새 주제를 꺼내라는 게 아니다 — 그건 딴소리다', () => {
  assert.match(tossBackNote({ recent: coolingTalk, justNow: '응' }), /새 주제를 꺼내라는 게 아니라/);
});

test('물음에 물음으로 답하지 않는다 — 그건 회피다', () => {
  assert.equal(tossBackNote({ recent: coolingTalk, justNow: '너는 어떻게 생각해?' }), '');
});

test('방금 되물었으면 또 안 묻는다 — 두 번 이어 물으면 취조다', () => {
  const justAsked = [...coolingTalk.slice(0, -1), companion('그래서 어떻게 됐어?')];
  assert.equal(tossBackNote({ recent: justAsked, justNow: '응' }), '');
});

test('말이 몇 마디 안 오갔으면 그냥 둔다 — 처음부터 되물으면 낯설다', () => {
  assert.equal(tossBackNote({ recent: [person('안녕'), companion('응')], justNow: '안녕' }), '');
});

test('대화가 살아 있으면 안 얹는다 — 매번 되물으면 취조다', () => {
  const liveTalk = [
    person('오늘 좀 힘들었어'), companion('무슨 일 있었어'),
    person('발표가 있었는데 준비한 만큼 안 나왔어'), companion('아쉽겠다'),
    person('그래도 다음엔 더 잘할 수 있을 것 같아서 괜찮아'), companion('그런 마음이면 됐지'),
  ];
  assert.equal(tossBackNote({ recent: liveTalk, justNow: '그래도 다음엔 더 잘할 수 있을 것 같아서 괜찮아' }), '');
});

test('화면 곁눈질은 대화로 안 센다', () => {
  const screenMixed = [
    { role: 'sensed', channel: 'screen', text: '화면을 봤다', at: 1 },
    { role: 'said', channel: 'screen', text: '뭐 보는 중이네', at: 2 },
  ];
  assert.equal(tossBackNote({ recent: screenMixed, justNow: '응' }), '');
});

test('몇 번 중 몇 번 되물었는지 센다 — 얹어 놓고 됐다고 하지 않으려고', () => {
  const r = followUpRatio([companion('그렇구나'), companion('그래서 어떻게 됐어?'), person('응')]);
  assert.equal(r.전체, 2);
  assert.equal(r.followUp, 1);
});

// ── 입 앞 관문으로 옮기기 ────────────────────────────────────────────

test('공을 돌려줄 자리인데 안 돌려줬으면 잡는다', async () => {
  const { notReturned } = await import('../dist/index.js');
  assert.notEqual(notReturned('그렇구나.', true), null);
  assert.equal(notReturned('그래서 어떻게 됐어?', true), null);
});

test('돌려줄 자리가 아니면 안 잡는다 — 아무 때나 되물으면 취조다', async () => {
  const { notReturned } = await import('../dist/index.js');
  assert.equal(notReturned('그렇구나.', false), null);
});

test('다시 시킬 땐 그 한 가지만 말한다 — 재료로는 묻혔다', async () => {
  const { tossBackRetryNote } = await import('../dist/index.js');
  const note = tossBackRetryNote();
  assert.match(note, /되물어라/);
  assert.match(note, /새 주제를 꺼내지 말고/);
});

// ── 왜 안 하는지 말한다 ──────────────────────────────────────────────

test('안 하는 이유를 갈래마다 다르게 말한다 — 「빔」만 보이면 못 고친다', async () => {
  const { skipReason } = await import('../dist/index.js');
  assert.match(skipReason({ recent: [person('안녕'), companion('응')], justNow: '안녕' }), /몇 마디 안 오갔다/);
  assert.match(skipReason({ recent: coolingTalk, justNow: '너는?' }), /물어본 turn/);
  assert.match(skipReason({ recent: [...coolingTalk.slice(0, -1), companion('어떻게 됐어?')], justNow: '응' }), /방금 되물었다/);
});

test('돌려줄 자리면 이유가 없다', async () => {
  const { skipReason } = await import('../dist/index.js');
  assert.equal(skipReason({ recent: coolingTalk, justNow: '응' }), null);
});

test('이유에 숫자가 들어간다 — 「안 식었다」만으로는 얼마나 모자란지 모른다', async () => {
  const { skipReason } = await import('../dist/index.js');
  const live = [
    person('오늘 좀 힘들었어'), companion('무슨 일'),
    person('발표가 있었는데 준비한 만큼 안 나왔어'), companion('아쉽겠다'),
    person('그래도 다음엔 더 잘할 수 있을 것 같아서 괜찮아'), companion('그런 마음이면 됐지'),
  ];
  assert.match(skipReason({ recent: live, justNow: '그래도 다음엔 괜찮아' }), /\d+자/);
});

test('얘 말이 하나만 있어도 센다 — 판단하는 그 순간 지금 할 말은 아직 기억에 없다', async () => {
  const { skipReason } = await import('../dist/index.js');
  const oneShort = [
    person('오늘 회사에서 발표를 했는데 준비를 많이 했거든'), companion('오'),
    person('응'),
  ];
  assert.equal(skipReason({ recent: oneShort, justNow: '응' }), null);
});
