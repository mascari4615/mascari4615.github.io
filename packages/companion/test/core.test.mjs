import assert from 'node:assert/strict';
import test from 'node:test';

import {
  Companion,
  InMemoryMemory,
  alwaysRespond,
  neverRespond,
  cooldownAttention,
  echoBrain,
  silentBrain,
} from '../dist/index.js';

/** 감각을 코어가 직접 받게 하는 최소 몸 — 말한 것을 배열에 모아둔다. */
function recordingBody(name = 'test') {
  const spoken = [];
  return {
    body: {
      name,
      sense: { name: `${name}:sense`, start() {} },
      voice: { name: `${name}:voice`, speak(u) { spoken.push(u.text); } },
    },
    spoken,
  };
}

function sensation(text, channel = 'test') {
  return { channel, kind: 'text', text, at: Date.now() };
}

test('한 바퀴: 느낀 것이 기억에 남고, 두뇌의 말이 그 몸으로 나간다', async () => {
  const { body, spoken } = recordingBody();
  const memory = new InMemoryMemory();
  const companion = new Companion({ bodies: [body], brain: echoBrain, memory, attention: alwaysRespond });

  await companion.start();
  await companion.feed(sensation('안녕'));

  assert.deepEqual(spoken, ['(echo) 안녕']);
  const entries = memory.all();
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map((e) => e.role), ['sensed', 'said']);
  assert.equal(entries[0].text, '안녕');
});

test('말을 참으면(attention) 두뇌를 아예 부르지 않는다 — 기억에는 남는다', async () => {
  const { body, spoken } = recordingBody();
  const memory = new InMemoryMemory();
  let thoughtCount = 0;
  const countingBrain = { name: 'counting', async think() { thoughtCount += 1; return '말함'; } };

  const companion = new Companion({ bodies: [body], brain: countingBrain, memory, attention: neverRespond });
  await companion.start();
  await companion.feed(sensation('듣기만 해'));

  assert.equal(thoughtCount, 0, '참기로 했으면 LLM 비용이 0 이어야 한다');
  assert.deepEqual(spoken, []);
  assert.equal(memory.all().length, 1, '들은 건 기억한다');
});

test('두뇌가 침묵을 고르면 아무 말도 나가지 않는다', async () => {
  const { body, spoken } = recordingBody();
  const memory = new InMemoryMemory();
  const companion = new Companion({ bodies: [body], brain: silentBrain, memory, attention: alwaysRespond });

  await companion.start();
  await companion.feed(sensation('...'));

  assert.deepEqual(spoken, []);
  assert.equal(memory.all().length, 1);
});

test('두뇌가 터져도 코어는 살아서 다음 감각을 계속 받는다', async () => {
  const { body, spoken } = recordingBody();
  const memory = new InMemoryMemory();
  let first = true;
  const flakyBrain = {
    name: 'flaky',
    async think() {
      if (first) { first = false; throw new Error('두뇌 터짐'); }
      return '이번엔 됨';
    },
  };
  const errors = [];
  const companion = new Companion({
    bodies: [body],
    brain: flakyBrain,
    memory,
    attention: alwaysRespond,
    onCycle: (r) => { if (r.error) errors.push(r.error.message); },
  });

  await companion.start();
  await companion.feed(sensation('첫 번째'));
  await companion.feed(sensation('두 번째'));

  assert.deepEqual(errors, ['두뇌 터짐']);
  assert.deepEqual(spoken, ['이번엔 됨']);
});

test('감각이 한꺼번에 몰려도 기억 순서가 섞이지 않는다', async () => {
  const { body } = recordingBody();
  const memory = new InMemoryMemory();
  const slowBrain = {
    name: 'slow',
    async think(input) {
      // 먼저 온 것이 더 오래 걸리게 만들어, 순서가 뒤집힐 여지를 일부러 준다.
      const delay = input.sensation.text === 'A' ? 30 : 1;
      await new Promise((r) => setTimeout(r, delay));
      return `응답:${input.sensation.text}`;
    },
  };
  const companion = new Companion({ bodies: [body], brain: slowBrain, memory, attention: alwaysRespond });

  await companion.start();
  companion.feed(sensation('A'));
  companion.feed(sensation('B'));
  await companion.drain();

  assert.deepEqual(
    memory.all().map((e) => e.text),
    ['A', '응답:A', 'B', '응답:B'],
  );
});

test('쿨다운은 방금 말했으면 참고, 시간이 지나면 다시 말한다', async () => {
  const { body, spoken } = recordingBody();
  const memory = new InMemoryMemory();
  let clock = 1_000_000;
  const now = () => clock;
  const attention = cooldownAttention({ cooldownMs: 10_000, now });
  const companion = new Companion({ bodies: [body], brain: echoBrain, memory, attention, now });

  await companion.start();
  await companion.feed(sensation('첫 마디'));
  assert.equal(spoken.length, 1, '처음엔 말한다');

  clock += 3_000;
  await companion.feed(sensation('바로 또'));
  assert.equal(spoken.length, 1, '3초 뒤엔 참아야 한다');

  clock += 20_000;
  await companion.feed(sensation('한참 뒤'));
  assert.equal(spoken.length, 2, '쿨다운이 지나면 다시 말한다');
});

test('사람이 직접 말 건 채널은 쿨다운을 건너뛴다', async () => {
  const memory = new InMemoryMemory();
  let clock = 1_000_000;
  const now = () => clock;
  const attention = cooldownAttention({ cooldownMs: 60_000, bypassChannels: ['terminal'], now });
  const talk = recordingBody('terminal');
  const tick = recordingBody('clock');
  const companion = new Companion({ bodies: [talk.body, tick.body], brain: echoBrain, memory, attention, now });

  await companion.start();
  await companion.feed(sensation('안녕', 'terminal'));
  await companion.feed(sensation('똑딱', 'clock'));
  await companion.feed(sensation('또 안녕', 'terminal'));

  assert.equal(talk.spoken.length, 2, '말 건 쪽엔 계속 대답한다');
  assert.equal(tick.spoken.length, 0, '혼잣말은 쿨다운에 걸려 참는다');
});

test('시험이 만든 감각은 기억에 안 담긴다 — 사람 상이 검사 찌꺼기로 만들어지면 안 된다', async () => {
  const { body, spoken } = recordingBody();
  const memory = new InMemoryMemory();
  const companion = new Companion({ bodies: [body], brain: echoBrain, memory, attention: alwaysRespond });
  await companion.start();

  await companion.feed({ ...sensation('스모크 12345'), 시험: true });
  // 처리는 그대로 한다 — 검사가 진짜 길을 안 밟으면 검사가 아니다.
  assert.deepEqual(spoken, ['(echo) 스모크 12345']);
  // 다만 기억에는 없어야 한다.
  assert.deepEqual(memory.all(), []);

  await companion.feed(sensation('진짜 말'));
  assert.deepEqual(memory.all().map((e) => e.text), ['진짜 말', '(echo) 진짜 말']);
});

test('줄이 둘이다 — 무거운 일이 도는 중에도 사람 말은 바로 시작한다', async () => {
  const 나온말 = [];
  const 몸 = {
    name: 'web',
    sense: { name: 'web:sense', start() {} },
    voice: { name: 'web:voice', speak(u) { 나온말.push({ text: u.text, at: Date.now() }); } },
  };
  const companion = new Companion({
    bodies: [몸],
    memory: new InMemoryMemory(),
    attention: alwaysRespond,
    interruptChannels: ['web'],
    brain: {
      name: '느린일',
      async think(input) {
        if (input.sensation.channel === 'screen') {
          await new Promise((r) => setTimeout(r, 300));
          return '(화면 봤다)';
        }
        return `(대답) ${input.sensation.text}`;
      },
    },
  });
  await companion.start();

  const 무거운것 = companion.feed({ channel: 'screen', kind: 'text', text: '화면을 봤다', at: Date.now() });
  await new Promise((r) => setTimeout(r, 50)); // 그 일이 확실히 돌기 시작한 뒤

  const 건넨때 = Date.now();
  await companion.feed({ channel: 'web', kind: 'text', text: '있어?', at: 건넨때 });
  const 기다린ms = (나온말.find((m) => m.text.includes('있어?'))?.at ?? 0) - 건넨때;

  await 무거운것;
  await companion.stop();

  // 갈라 두기 전에는 무거운 일이 끝날 때까지 통째로 기다렸다(실측 3초 중 2793ms).
  assert.ok(기다린ms >= 0 && 기다린ms < 150, `사람 말이 ${기다린ms}ms 기다렸다 — 일 줄 뒤에서 밀린 것`);
});

test('일 줄은 사람이 말하는 중에는 새 turn 을 안 연다 — 두뇌는 하나다', async () => {
  const 순서 = [];
  const 몸 = {
    name: 'web',
    sense: { name: 'web:sense', start() {} },
    voice: { name: 'web:voice', speak() {} },
  };
  const companion = new Companion({
    bodies: [몸],
    memory: new InMemoryMemory(),
    attention: alwaysRespond,
    interruptChannels: ['web'],
    brain: {
      name: '기록',
      async think(input) {
        순서.push(input.sensation.channel);
        await new Promise((r) => setTimeout(r, 30));
        return '음';
      },
    },
  });
  await companion.start();

  // 일거리 셋을 쌓아 두고 곧바로 말을 건다.
  const 일들 = [0, 1, 2].map((i) =>
    companion.feed({ channel: 'clock', kind: 'tick', text: `일 ${i}`, at: Date.now() }),
  );
  await companion.feed({ channel: 'web', kind: 'text', text: '있어?', at: Date.now() });
  await Promise.all(일들);
  await companion.stop();

  // 사람 말이 일 셋을 다 기다리지 않았어야 한다 — 맨 뒤면 안 된다.
  assert.ok(순서.indexOf('web') <= 1, `두뇌를 부른 순서: ${순서.join(' → ')}`);
});
