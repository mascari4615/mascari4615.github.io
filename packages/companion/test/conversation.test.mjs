import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AMBIENT_CHANNELS,
  DistillingMemory,
  InMemoryMemory,
  ambientOnly,
  conversationOnly,
  brainDistiller,
  dayMark,
  isConversation,
} from '../dist/index.js';

const 사람 = (text, at = 1, channel = 'web') => ({ role: 'sensed', channel, text, at });
const 화면 = (text, at = 1) => ({ role: 'sensed', channel: 'screen', text, at });
const 얘 = (text, at = 1) => ({ role: 'said', channel: 'web', text, at });

test('사람이 건넨 말은 나눈 말이다', () => {
  assert.equal(isConversation(사람('오늘 뭐 했어')), true);
});

test('화면에서 주워 온 것은 나눈 말이 아니다', () => {
  assert.equal(isConversation(화면('화면을 봤다. 창은 「동반자」')), false);
});

test('얘가 한 말은 혼잣말이어도 나눈 말이다 — 입 밖으로 낸 것이니까', () => {
  assert.equal(isConversation({ role: 'said', channel: 'screen', text: '또 그거네…', at: 1 }), true);
});

test('먼저 말 걸 이유로 스스로 만든 것도 곁에서 본 것이다', () => {
  for (const channel of AMBIENT_CHANNELS) {
    assert.equal(isConversation(사람('무엇이든', 1, channel)), false, `${channel} 은 곁에서 본 것이다`);
  }
});

test('몸을 새로 붙이면 그 통로도 곁에서 본 것으로 칠 수 있다', () => {
  const 날씨 = 사람('비가 온다', 1, 'weather');
  assert.equal(isConversation(날씨), true);
  assert.equal(isConversation(날씨, { ambient: ['weather'] }), false);
});

test('가르면 양쪽이 서로를 뺀 나머지다 — 새는 것도 겹치는 것도 없다', () => {
  const entries = [사람('안녕'), 화면('창은 유니티'), 얘('응…'), 사람('밥 먹었어', 2, 'discord')];
  const 대화 = conversationOnly(entries);
  const 곁 = ambientOnly(entries);
  assert.equal(대화.length + 곁.length, entries.length);
  assert.deepEqual(대화.map((e) => e.text), ['안녕', '응…', '밥 먹었어']);
  assert.deepEqual(곁.map((e) => e.text), ['창은 유니티']);
});

test('순서는 흐트러지지 않는다', () => {
  const entries = [사람('하나', 1), 화면('끼어듦', 2), 사람('둘', 3), 사람('셋', 4)];
  assert.deepEqual(conversationOnly(entries).map((e) => e.text), ['하나', '둘', '셋']);
});

// ── 이 가름이 실제로 고친 두 자리 ────────────────────────────────────

const 하루 = 86_400_000;
const 낮 = new Date(2026, 1, 10, 14, 0).getTime();

test('첫인사가 화면 로그를 「어제 나눈 얘기」로 집지 않는다', () => {
  const 어제 = [
    사람('셰이더 고치는 중이야', 낮 - 하루),
    화면('화면을 봤다. 지금 앞에 있는 창은 「동반자」.', 낮 - 하루 + 1),
    화면('화면을 봤다. 지금 앞에 있는 창은 「동반자」.', 낮 - 하루 + 2),
  ];
  const note = dayMark(어제, { now: () => 낮 }).note;
  assert.match(note, /셰이더/);
  assert.equal(note.includes('화면을 봤다'), false, '화면 로그를 어제 얘기로 집으면 안 된다');
});

test('화면만 쌓인 날은 만난 날로 치지 않는다 — 곁에 있었을 뿐 얘기는 안 했다', () => {
  const 어제대화 = 사람('어제 얘기', 낮 - 하루);
  const 오늘화면 = 화면('화면을 봤다. 창은 「동반자」.', 낮 - 3600_000);
  assert.equal(dayMark([어제대화, 오늘화면], { now: () => 낮 }).kind, '첫인사');
});

test('졸일 재료로 화면 로그가 아니라 나눈 말을 고른다', async () => {
  const inner = new InMemoryMemory();
  for (let i = 0; i < 40; i += 1) await inner.remember(화면(`화면을 봤다 ${i}`, i));
  await inner.remember(사람('나 마녀 게임 만들어', 100));
  await inner.remember(얘('응…', 101));
  for (let i = 0; i < 40; i += 1) await inner.remember(화면(`화면을 또 봤다 ${i}`, 200 + i));

  let 재료 = null;
  const memory = new DistillingMemory({
    inner,
    batch: 10,
    distill: async ({ fading }) => {
      재료 = fading;
      return '아는 것: 마녀 게임을 만든다.';
    },
  });
  await memory.condense();

  assert.notEqual(재료, null, '졸이기가 돌아야 한다');
  assert.equal(재료.some((e) => e.text.startsWith('화면을')), false, '화면 로그가 재료에 들어가면 안 된다');
  assert.deepEqual(재료.map((e) => e.text), ['나 마녀 게임 만들어', '응…']);
  assert.equal(memory.longTerm(), '아는 것: 마녀 게임을 만든다.');
});

test('나눈 말이 하나도 없으면 졸이지 않는다 — 없는 걸로 아는 척하지 않는다', async () => {
  const inner = new InMemoryMemory();
  for (let i = 0; i < 30; i += 1) await inner.remember(화면(`화면을 봤다 ${i}`, i));

  let 불렸나 = false;
  const memory = new DistillingMemory({
    inner,
    distill: async () => { 불렸나 = true; return '뭔가'; },
  });
  await memory.condense();

  assert.equal(불렸나, false);
  assert.equal(memory.longTerm(), null);
});

test('무엇을 재료로 쓸지는 밖에서 정할 수 있다', async () => {
  const inner = new InMemoryMemory();
  await inner.remember(사람('평범한 말', 1));
  await inner.remember(사람('★중요한 말', 2));

  let 재료 = null;
  const memory = new DistillingMemory({
    inner,
    distill: async ({ fading }) => { 재료 = fading; return '골랐다'; },
    pick: (es) => es.filter((e) => e.text.startsWith('★')),
  });
  await memory.condense();

  assert.deepEqual(재료.map((e) => e.text), ['★중요한 말']);
});

test('졸일 때 화자를 또렷이 적는다 — 누가 한 말인지 흐리면 얘 성향이 사람 것으로 적힌다', async () => {
  let prompt = null;
  const distill = brainDistiller(async (p) => { prompt = p; return '아는 것'; });
  await distill({ known: '', fading: [사람('나 게임 만들어', 1), 얘('응…', 2)] });

  assert.match(prompt, /조수님: 나 게임 만들어/);
  assert.match(prompt, /나\(동반자\): 응…/);
  assert.match(prompt, /조수님에 대한 것만/);
});
