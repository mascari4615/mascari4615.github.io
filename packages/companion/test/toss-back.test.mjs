import assert from 'node:assert/strict';
import test from 'node:test';

import { tossBackNote, 되물은비율, 묻는말인가 } from '../dist/index.js';

const 사람 = (text) => ({ role: 'sensed', channel: 'web', text, at: 1 });
const 얘 = (text) => ({ role: 'said', channel: 'web', text, at: 2 });

test('묻는 말을 가린다', () => {
  assert.equal(묻는말인가('오늘 어땠어?'), true);
  assert.equal(묻는말인가('그건 뭔데'), true);
  assert.equal(묻는말인가('그렇구나.'), false);
  assert.equal(묻는말인가(''), false);
});

// 식어 가는 대화 — 사람 말이 점점 짧아진다.
const 식는대화 = [
  사람('오늘 회사에서 발표를 했는데 준비를 많이 했거든'), 얘('오'),
  사람('근데 생각보다 반응이 별로였어'), 얘('그렇구나'),
  사람('응'), 얘('음…'),
];

test('대화가 식어 가면 공을 돌려주라고 한다', () => {
  const note = tossBackNote({ recent: 식는대화, 방금: '응' });
  assert.match(note, /공을 돌려줘라/);
  assert.match(note, /하던 얘기를 이어 가라/);
});

test('새 주제를 꺼내라는 게 아니다 — 그건 딴소리다', () => {
  assert.match(tossBackNote({ recent: 식는대화, 방금: '응' }), /새 주제를 꺼내라는 게 아니라/);
});

test('물음에 물음으로 답하지 않는다 — 그건 회피다', () => {
  assert.equal(tossBackNote({ recent: 식는대화, 방금: '너는 어떻게 생각해?' }), '');
});

test('방금 되물었으면 또 안 묻는다 — 두 번 이어 물으면 취조다', () => {
  const 방금물음 = [...식는대화.slice(0, -1), 얘('그래서 어떻게 됐어?')];
  assert.equal(tossBackNote({ recent: 방금물음, 방금: '응' }), '');
});

test('말이 몇 마디 안 오갔으면 그냥 둔다 — 처음부터 되물으면 낯설다', () => {
  assert.equal(tossBackNote({ recent: [사람('안녕'), 얘('응')], 방금: '안녕' }), '');
});

test('대화가 살아 있으면 안 얹는다 — 매번 되물으면 취조다', () => {
  const 살아있는대화 = [
    사람('오늘 좀 힘들었어'), 얘('무슨 일 있었어'),
    사람('발표가 있었는데 준비한 만큼 안 나왔어'), 얘('아쉽겠다'),
    사람('그래도 다음엔 더 잘할 수 있을 것 같아서 괜찮아'), 얘('그런 마음이면 됐지'),
  ];
  assert.equal(tossBackNote({ recent: 살아있는대화, 방금: '그래도 다음엔 더 잘할 수 있을 것 같아서 괜찮아' }), '');
});

test('화면 곁눈질은 대화로 안 센다', () => {
  const 화면섞임 = [
    { role: 'sensed', channel: 'screen', text: '화면을 봤다', at: 1 },
    { role: 'said', channel: 'screen', text: '뭐 보는 중이네', at: 2 },
  ];
  assert.equal(tossBackNote({ recent: 화면섞임, 방금: '응' }), '');
});

test('몇 번 중 몇 번 되물었는지 센다 — 얹어 놓고 됐다고 하지 않으려고', () => {
  const r = 되물은비율([얘('그렇구나'), 얘('그래서 어떻게 됐어?'), 사람('응')]);
  assert.equal(r.전체, 2);
  assert.equal(r.되물음, 1);
});

// ── 입 앞 관문으로 옮기기 ────────────────────────────────────────────

test('공을 돌려줄 자리인데 안 돌려줬으면 잡는다', async () => {
  const { 안돌려줬나 } = await import('../dist/index.js');
  assert.notEqual(안돌려줬나('그렇구나.', true), null);
  assert.equal(안돌려줬나('그래서 어떻게 됐어?', true), null);
});

test('돌려줄 자리가 아니면 안 잡는다 — 아무 때나 되물으면 취조다', async () => {
  const { 안돌려줬나 } = await import('../dist/index.js');
  assert.equal(안돌려줬나('그렇구나.', false), null);
});

test('다시 시킬 땐 그 한 가지만 말한다 — 재료로는 묻혔다', async () => {
  const { tossBackRetryNote } = await import('../dist/index.js');
  const note = tossBackRetryNote();
  assert.match(note, /되물어라/);
  assert.match(note, /새 주제를 꺼내지 말고/);
});
