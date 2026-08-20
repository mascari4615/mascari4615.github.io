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

const person = (text, at = 1, channel = 'web') => ({ role: 'sensed', channel, text, at });
const screen = (text, at = 1) => ({ role: 'sensed', channel: 'screen', text, at });
const companion = (text, at = 1) => ({ role: 'said', channel: 'web', text, at });

test('사람이 건넨 말은 나눈 말이다', () => {
  assert.equal(isConversation(person('오늘 뭐 했어')), true);
});

test('화면에서 주워 온 것은 나눈 말이 아니다', () => {
  assert.equal(isConversation(screen('화면을 봤다. 창은 「동반자」')), false);
});

test('얘가 한 말은 혼잣말이어도 나눈 말이다 — 입 밖으로 낸 것이니까', () => {
  assert.equal(isConversation({ role: 'said', channel: 'screen', text: '또 그거네…', at: 1 }), true);
});

test('먼저 말 걸 이유로 스스로 만든 것도 곁에서 본 것이다', () => {
  for (const channel of AMBIENT_CHANNELS) {
    assert.equal(isConversation(person('무엇이든', 1, channel)), false, `${channel} 은 곁에서 본 것이다`);
  }
});

test('몸을 새로 붙이면 그 통로도 곁에서 본 것으로 칠 수 있다', () => {
  const weather = person('비가 온다', 1, 'weather');
  assert.equal(isConversation(weather), true);
  assert.equal(isConversation(weather, { ambient: ['weather'] }), false);
});

test('가르면 양쪽이 서로를 뺀 나머지다 — 새는 것도 겹치는 것도 없다', () => {
  const entries = [person('안녕'), screen('창은 유니티'), companion('응…'), person('밥 먹었어', 2, 'discord')];
  const conversation = conversationOnly(entries);
  const beside = ambientOnly(entries);
  assert.equal(conversation.length + beside.length, entries.length);
  assert.deepEqual(conversation.map((e) => e.text), ['안녕', '응…', '밥 먹었어']);
  assert.deepEqual(beside.map((e) => e.text), ['창은 유니티']);
});

test('순서는 흐트러지지 않는다', () => {
  const entries = [person('하나', 1), screen('끼어듦', 2), person('둘', 3), person('셋', 4)];
  assert.deepEqual(conversationOnly(entries).map((e) => e.text), ['하나', '둘', '셋']);
});

// ── 이 가름이 실제로 고친 두 자리 ────────────────────────────────────

const day = 86_400_000;
const daytime = new Date(2026, 1, 10, 14, 0).getTime();

test('첫인사가 화면 로그를 「어제 나눈 얘기」로 집지 않는다', () => {
  const yesterday = [
    person('셰이더 고치는 중이야', daytime - day),
    screen('화면을 봤다. 지금 앞에 있는 창은 「동반자」.', daytime - day + 1),
    screen('화면을 봤다. 지금 앞에 있는 창은 「동반자」.', daytime - day + 2),
  ];
  const note = dayMark(yesterday, { now: () => daytime }).note;
  assert.match(note, /셰이더/);
  assert.equal(note.includes('화면을 봤다'), false, '화면 로그를 어제 얘기로 집으면 안 된다');
});

test('화면만 쌓인 날은 만난 날로 치지 않는다 — 곁에 있었을 뿐 얘기는 안 했다', () => {
  const yesterdayTalk = person('어제 얘기', daytime - day);
  const todayScreen = screen('화면을 봤다. 창은 「동반자」.', daytime - 3600_000);
  assert.equal(dayMark([yesterdayTalk, todayScreen], { now: () => daytime }).kind, '첫인사');
});

test('졸일 재료로 화면 로그가 아니라 나눈 말을 고른다', async () => {
  const inner = new InMemoryMemory();
  for (let i = 0; i < 40; i += 1) await inner.remember(screen(`화면을 봤다 ${i}`, i));
  await inner.remember(person('나 마녀 게임 만들어', 100));
  await inner.remember(companion('응…', 101));
  for (let i = 0; i < 40; i += 1) await inner.remember(screen(`화면을 또 봤다 ${i}`, 200 + i));

  let material = null;
  const memory = new DistillingMemory({
    inner,
    batch: 10,
    distill: async ({ fading }) => {
      material = fading;
      return '아는 것: 마녀 게임을 만든다.';
    },
  });
  await memory.condense();

  assert.notEqual(material, null, '졸이기가 돌아야 한다');
  assert.equal(material.some((e) => e.text.startsWith('화면을')), false, '화면 로그가 재료에 들어가면 안 된다');
  assert.deepEqual(material.map((e) => e.text), ['나 마녀 게임 만들어', '응…']);
  assert.equal(memory.longTerm(), '아는 것: 마녀 게임을 만든다.');
});

test('나눈 말이 하나도 없으면 졸이지 않는다 — 없는 걸로 아는 척하지 않는다', async () => {
  const inner = new InMemoryMemory();
  for (let i = 0; i < 30; i += 1) await inner.remember(screen(`화면을 봤다 ${i}`, i));

  let wasCalled = false;
  const memory = new DistillingMemory({
    inner,
    distill: async () => { wasCalled = true; return '뭔가'; },
  });
  await memory.condense();

  assert.equal(wasCalled, false);
  assert.equal(memory.longTerm(), null);
});

test('무엇을 재료로 쓸지는 밖에서 정할 수 있다', async () => {
  const inner = new InMemoryMemory();
  await inner.remember(person('평범한 말', 1));
  await inner.remember(person('★중요한 말', 2));

  let material2 = null;
  const memory = new DistillingMemory({
    inner,
    distill: async ({ fading }) => { material2 = fading; return '골랐다'; },
    pick: (es) => es.filter((e) => e.text.startsWith('★')),
  });
  await memory.condense();

  assert.deepEqual(material2.map((e) => e.text), ['★중요한 말']);
});

test('졸일 때 화자를 또렷이 적는다 — 누가 한 말인지 흐리면 얘 성향이 사람 것으로 적힌다', async () => {
  let prompt = null;
  const distill = brainDistiller(async (p) => { prompt = p; return '아는 것'; });
  await distill({ known: '', fading: [person('나 게임 만들어', 1), companion('응…', 2)] });

  assert.match(prompt, /조수님: 나 게임 만들어/);
  assert.match(prompt, /나\(동반자\): 응…/);
  assert.match(prompt, /조수님에 대한 것만/);
});
