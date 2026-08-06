import assert from 'node:assert/strict';
import test from 'node:test';

import { Companion, InMemoryMemory, alwaysRespond } from '../dist/index.js';

/** 천천히 생각하는 두뇌 — 도중에 끊는 상황을 만들려면 시간이 필요하다. */
function slowBrain(ms = 60) {
  let aborted = false;
  return {
    name: 'slow',
    aborts: 0,
    async think(input) {
      aborted = false; // 새 생각은 새로 시작한다 — 앞의 것이 끊겼다고 이번 것까지 막히면 안 된다
      await new Promise((done) => setTimeout(done, ms));
      if (aborted) throw new Error('그만뒀다');
      return `응답:${input.sensation.text}`;
    },
    abort() {
      aborted = true;
      this.aborts += 1;
    },
  };
}

function recordingBody(name = 'web') {
  const spoken = [];
  const hushes = { count: 0 };
  return {
    spoken,
    hushes,
    body: {
      name,
      sense: { name: 's', start() {} },
      voice: {
        name: 'v',
        speak(u) { spoken.push(u.text); },
        hush() { hushes.count += 1; },
      },
    },
  };
}

const now = () => Date.now();

test('말하는 중에 말을 걸면 하던 말을 버린다', async () => {
  const { body, spoken } = recordingBody();
  const brain = slowBrain(80);
  const companion = new Companion({
    bodies: [body], brain, memory: new InMemoryMemory(),
    attention: alwaysRespond, interruptChannels: ['web'],
  });

  await companion.start();
  const first = companion.feed({ channel: 'web', kind: 'text', text: '첫 말', at: now() });
  await new Promise((r) => setTimeout(r, 20)); // 아직 생각하는 중
  const second = companion.feed({ channel: 'web', kind: 'text', text: '끼어든 말', at: now() });
  await Promise.all([first, second]);

  assert.deepEqual(spoken, ['응답:끼어든 말'], '끊긴 답은 안 나가고, 새 답만 나간다');
});

test('끊을 때 하던 소리도 멈추라고 알린다', async () => {
  const { body, hushes } = recordingBody();
  const companion = new Companion({
    bodies: [body], brain: slowBrain(80), memory: new InMemoryMemory(),
    attention: alwaysRespond, interruptChannels: ['web'],
  });

  await companion.start();
  companion.feed({ channel: 'web', kind: 'text', text: '첫 말', at: now() });
  await new Promise((r) => setTimeout(r, 20));
  await companion.feed({ channel: 'web', kind: 'text', text: '끼어든 말', at: now() });

  assert.equal(hushes.count, 1, '입을 다물라고 한 번 알렸다');
});

test('끊을 때 두뇌한테도 그만두라고 한다 — 안 그러면 뒤늦게 옛 답이 튀어나온다', async () => {
  const { body } = recordingBody();
  const brain = slowBrain(80);
  const companion = new Companion({
    bodies: [body], brain, memory: new InMemoryMemory(),
    attention: alwaysRespond, interruptChannels: ['web'],
  });

  await companion.start();
  companion.feed({ channel: 'web', kind: 'text', text: '첫 말', at: now() });
  await new Promise((r) => setTimeout(r, 20));
  await companion.feed({ channel: 'web', kind: 'text', text: '끼어든 말', at: now() });

  assert.equal(brain.aborts, 1);
});

test('끊기로 정하지 않은 채널은 하던 말을 끝까지 한다', async () => {
  const { body, spoken } = recordingBody();
  const companion = new Companion({
    bodies: [body], brain: slowBrain(60), memory: new InMemoryMemory(),
    attention: alwaysRespond, // interruptChannels 없음
  });

  await companion.start();
  const a = companion.feed({ channel: 'web', kind: 'text', text: 'A', at: now() });
  await new Promise((r) => setTimeout(r, 15));
  const b = companion.feed({ channel: 'web', kind: 'text', text: 'B', at: now() });
  await Promise.all([a, b]);

  assert.deepEqual(spoken, ['응답:A', '응답:B'], '둘 다 말한다');
});

test('끊긴 것은 사고가 아니다 — 에러로 올리지 않는다', async () => {
  const { body } = recordingBody();
  const errors = [];
  const companion = new Companion({
    bodies: [body], brain: slowBrain(80), memory: new InMemoryMemory(),
    attention: alwaysRespond, interruptChannels: ['web'],
    onCycle: (r) => { if (r.error) errors.push(r.error.message); },
  });

  await companion.start();
  companion.feed({ channel: 'web', kind: 'text', text: '첫 말', at: now() });
  await new Promise((r) => setTimeout(r, 20));
  await companion.feed({ channel: 'web', kind: 'text', text: '끼어든 말', at: now() });

  assert.deepEqual(errors, []);
});
