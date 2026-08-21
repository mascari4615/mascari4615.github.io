import assert from 'node:assert/strict';
import test from 'node:test';

import { EpisodeStore, askEnergy } from '../dist/index.js';

const spoken = (text, at = Date.now()) => ({ role: 'sensed', channel: 'web', kind: 'text', text, at });

/** 낱말 표가 못 잡는 진짜 말들 — 실제 기록에서 0점이던 것들이다. */
const missedText = [
  '오늘 회의가 길어서 좀 지쳤어',
  '엄마랑 좀 다퉜어 별거 아닌 걸로',
  '발표 준비 하나도 못 했는데 내일이야',
];

test('낱말 표가 못 잡은 말은 버리지 않고 물어볼 것으로 쌓아 둔다', () => {
  const s = new EpisodeStore({ ask: async () => null });
  s.learn(missedText.map((t) => spoken(t)));
  assert.equal(s.all.length, 0, '표로는 하나도 안 담긴다 — 이게 지금 상태다');
  assert.equal(s.밀린것, missedText.length);
});

test('두뇌가 높게 매기면 사건이 된다 — 표가 놓친 걸 건진다', async () => {
  const s = new EpisodeStore({ ask: async (texts) => texts.map(() => 6) });
  s.learn(missedText.map((t) => spoken(t)));
  assert.equal(await s.reflect(), 3);
  assert.equal(s.all.length, 3);
  assert.equal(s.all[0].energy, 6);
});

test('두뇌가 낮게 매기면 안 담는다 — 아무 말이나 사건이 되면 다음 달에 점심 얘기가 나온다', async () => {
  const s = new EpisodeStore({ ask: async (texts2) => texts2.map(() => 0) });
  s.learn(missedText.map((t) => spoken(t)));
  await s.reflect();
  assert.equal(s.all.length, 0);
});

test('짧은 말은 물어보지도 않는다 — 아무거나 물으면 그게 값이다', () => {
  const s = new EpisodeStore({ ask: async () => null });
  s.learn([spoken('응'), spoken('ㅇㅇ'), spoken('그러게 뭐')]);
  assert.equal(s.밀린것, 0);
});

test('두뇌가 죽어도 대화는 안 멈춘다 — 그리고 조용히 삼키지 않는다', async () => {
  const written = [];
  const s = new EpisodeStore({
    ask: async () => { throw new Error('두뇌 없음'); },
    log: (m) => written.push(m),
  });
  s.learn(missedText.map((t) => spoken(t)));
  assert.equal(await s.reflect(), 0);
  assert.match(written.join(' '), /실패/);
});

test('개수가 안 맞는 대답은 안 쓴다 — 어긋난 채 담으면 엉뚱한 말이 큰일이 된다', async () => {
  const written2 = [];
  const s = new EpisodeStore({ ask: async () => [9], log: (m) => written2.push(m) });
  s.learn(missedText.map((t) => spoken(t)));
  assert.equal(await s.reflect(), 0);
  assert.equal(s.all.length, 0);
  assert.match(written2.join(' '), /안 맞는다/);
});

test('한 번 물어본 것은 다시 안 묻는다 — 실패해도 무한히 되묻지 않는다', async () => {
  let callCount = 0;
  const s = new EpisodeStore({ ask: async () => { callCount += 1; return null; } });
  s.learn(missedText.map((t) => spoken(t)));
  await s.reflect();
  await s.reflect();
  assert.equal(callCount, 1, `두 번째엔 물어볼 게 없어야 한다 — 실제로 ${callCount}번 불렀다`);
});

test('물어보기가 없으면 표만 쓴다 — 아무 데도 안 걸리고 그냥 돈다', async () => {
  const s = new EpisodeStore();
  s.learn(missedText.map((t) => spoken(t)));
  assert.equal(await s.reflect(), 0);
});

// ── 두뇌에게 실제로 넘어가는 물음 ──────────────────────────────────

test('물음에 말이 번호와 함께 다 들어간다 — 하나라도 빠지면 답이 어긋난다', async () => {
  let seen = '';
  const ask = askEnergy(async (p) => { seen = p; return '5\n0\n7'; });
  const score = await ask(missedText);
  for (const text2 of missedText) assert.ok(seen.includes(text2.slice(0, 10)), `${text2} 이 물음에 없다`);
  assert.deepEqual(score, [5, 0, 7]);
});

test('두뇌가 말을 섞어 답해도 숫자만 골라낸다', async () => {
  const ask2 = askEnergy(async () => '1. 5\n2. 0\n3. 7');
  assert.deepEqual(await ask2(['가나다라', '마바사아', '자차카타']), [5, 0, 7]);
});

test('두뇌가 개수를 안 맞추면 아무것도 안 돌려준다', async () => {
  const ask3 = askEnergy(async () => '5');
  assert.equal(await ask3(missedText), null);
});

test('두뇌가 대답을 안 하면 null — 0 점으로 세지 않는다', async () => {
  const ask4 = askEnergy(async () => null);
  assert.equal(await ask4(missedText), null);
});
