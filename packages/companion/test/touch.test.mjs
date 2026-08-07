import assert from 'node:assert/strict';
import test from 'node:test';

import {
  Companion,
  InMemoryMemory,
  TOUCH_CHANNEL,
  TouchCount,
  alwaysRespond,
  tactfulAttention,
  isTouch,
  touchKindFromWire,
  touchKindOf,
  touchReply,
  touchSensation,
} from '../dist/index.js';

const 첫째 = () => 0;

test('닿은 것은 말이 오가는 통로로 들어오지 않는다', () => {
  const s = touchSensation('쿡', 5);
  assert.equal(s.channel, TOUCH_CHANNEL);
  assert.notEqual(s.channel, 'web');
  assert.equal(s.at, 5);
  assert.equal(isTouch(s), true);
  assert.equal(isTouch({ channel: 'web' }), false);
});

test('어떻게 닿았는지 되읽을 수 있다', () => {
  for (const kind of ['쿡', '흔듦', '쓰다듬']) {
    assert.equal(touchKindOf(touchSensation(kind)), kind);
  }
});

test('말로 들어온 것은 닿은 것이 아니다', () => {
  assert.equal(touchKindOf({ channel: 'web', text: '쿡 찔렀다' }), null);
});

test('처음 찌르면 놀란다', () => {
  assert.equal(touchReply('쿡', { times: 1, roll: 첫째 }), '…어?');
});

test('계속 찌르면 결이 옮겨 간다 — 같은 자극에 같은 소리만 내면 버튼이다', () => {
  const 처음 = touchReply('쿡', { times: 1, roll: 첫째 });
  const 몇번 = touchReply('쿡', { times: 3, roll: 첫째 });
  const 계속 = touchReply('쿡', { times: 9, roll: 첫째 });
  assert.notEqual(몇번, 처음);
  assert.notEqual(계속, 몇번);
  assert.match(계속, /그만/);
});

test('끌고 다니면 어지러워한다', () => {
  assert.match(touchReply('흔듦', { times: 1, roll: 첫째 }), /어/);
  assert.match(touchReply('흔듦', { times: 9, roll: 첫째 }), /(멀미|그만|아무 데나)/);
});

test('쓰다듬는 것은 찌르는 것과 다르게 받는다', () => {
  assert.notEqual(touchReply('쓰다듬', { times: 3, roll: 첫째 }), touchReply('쿡', { times: 3, roll: 첫째 }));
  assert.equal(touchReply('쓰다듬', { times: 3, roll: 첫째 }), '…계속해도 돼.');
});

test('바로 전에 한 대꾸를 또 하지 않는다', () => {
  const 처음 = touchReply('쿡', { times: 1, roll: 첫째 });
  assert.notEqual(touchReply('쿡', { times: 1, last: 처음, roll: 첫째 }), 처음);
});

test('고를 게 하나뿐이면 그거라도 낸다 — 입을 다무는 것보다 낫다', () => {
  const 계속 = touchReply('쓰다듬', { times: 9, roll: () => 0 });
  assert.notEqual(touchReply('쓰다듬', { times: 9, last: 계속, roll: () => 0 }), '');
});

// ── 세는 것 ─────────────────────────────────────────────────────────

test('연달아 닿으면 쌓인다', () => {
  const c = new TouchCount();
  assert.equal(c.bump(0), 1);
  assert.equal(c.bump(1000), 2);
  assert.equal(c.bump(2000), 3);
});

test('뜸해지면 처음으로 되돌린다 — 잊는 자리가 없으면 영영 귀찮아하는 상태로 굳는다', () => {
  const c = new TouchCount(60_000);
  c.bump(0);
  c.bump(1000);
  assert.equal(c.bump(120_000), 1);
});

test('얼마나 지나야 잊을지는 밖에서 정한다', () => {
  const c = new TouchCount(5000);
  c.bump(0);
  assert.equal(c.bump(10_000), 1);
});

// ── 이음매 ──────────────────────────────────────────────────────────

test('닿은 것에는 두뇌를 부르지 않는다 — 2초 뒤 문장은 반응이 아니라 답변이다', async () => {
  let thought = 0;
  const said = [];
  const 입 = { name: 'v', speak(u) { said.push(u.text); } };
  const companion = new Companion({
    bodies: [
      { name: 'web', sense: { name: 's', start() {} }, voice: 입 },
      { name: TOUCH_CHANNEL, sense: { name: '닿음', start() {} }, voice: 입 },
    ],
    brain: { name: 'spy', async think() { thought += 1; return '깊은 생각'; } },
    memory: new InMemoryMemory(),
    attention: alwaysRespond,
    reflex: (s) => {
      const kind = touchKindOf(s);
      return kind === null ? null : touchReply(kind, { times: 1, roll: 첫째 });
    },
  });
  await companion.start();
  await companion.feed(touchSensation('쿡', Date.now()));

  assert.equal(thought, 0, '두뇌를 부르면 안 된다');
  assert.deepEqual(said, ['…어?']);
});

test('닿은 것도 기억에는 남는다 — 곁에서 있었던 일이니까', async () => {
  const memory = new InMemoryMemory();
  const 입 = { name: 'v', speak() {} };
  const companion = new Companion({
    bodies: [
      { name: 'web', sense: { name: 's', start() {} }, voice: 입 },
      { name: TOUCH_CHANNEL, sense: { name: '닿음', start() {} }, voice: 입 },
    ],
    brain: { name: 'b', async think() { return '안 불림'; } },
    memory,
    attention: alwaysRespond,
    reflex: () => '…어?',
  });
  await companion.start();
  await companion.feed(touchSensation('쿡', Date.now()));

  assert.deepEqual(memory.all().map((e) => e.text), ['조수님이 나를 쿡 찔렀다.', '…어?']);
});

test('전선 위 이름은 ASCII 다 — 한글을 주소에 실으면 인코딩 관문마다 깨진다', () => {
  assert.equal(touchKindFromWire('poke'), '쿡');
  assert.equal(touchKindFromWire('drag'), '흔듦');
  assert.equal(touchKindFromWire('pet'), '쓰다듬');
});

test('모르는 이름은 받지 않는다', () => {
  assert.equal(touchKindFromWire('쿡'), null);
  assert.equal(touchKindFromWire('아무거나'), null);
  assert.equal(touchKindFromWire(''), null);
});

test('닿은 것에는 눈치를 보지 않는다 — 나를 찔렀는데 바쁘신 것 같아 참았다는 말이 안 된다', () => {
  const 눈치 = tactfulAttention({ bypassChannels: ['web', TOUCH_CHANNEL], idleMs: () => 0 });
  const 최근 = [{ role: 'said', channel: 'web', text: '방금 말함', at: Date.now() }];
  assert.equal(눈치.shouldRespond({ sensation: touchSensation('쿡'), recent: 최근 }).respond, true);
  assert.equal(
    눈치.shouldRespond({ sensation: { channel: 'screen', kind: 'text', text: '화면을 봤다', at: Date.now() }, recent: 최근 }).respond,
    false,
    '곁눈질은 여전히 눈치를 본다',
  );
});
