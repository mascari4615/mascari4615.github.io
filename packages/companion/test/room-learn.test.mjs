import assert from 'node:assert/strict';
import test from 'node:test';

import { learnSlot, askSlot, brief, whichSlot, slotTone } from '../dist/index.js';

/** 78회차에 실제로 떠 있던 창들 — 표가 모르던 것들이다. */
const unknownWindow = ['설정', 'NVIDIA GeForce Overlay', 'Windows 입력 환경'];

test('표가 아는 창은 안 물어본다 — 물어보는 값이 헛되이 든다', () => {
  const learning = new learnSlot({ ask: async () => null });
  assert.equal(learning.read('claude · resume'), '만드는중');
  assert.equal(learning.pending, 0);
});

test('얘는 자기 창을 알아본다 — 그건 말 걸기 가장 좋은 때다', () => {
  assert.equal(whichSlot('동반자'), '나를보는중');
  assert.match(slotTone('동반자'), /말 걸기 가장 좋은/);
});

test('표가 모르는 창은 물어볼 것으로 담는다 — 모른다고 버리면 영영 모른다', () => {
  const learning2 = new learnSlot({ ask: async () => null });
  for (const t of unknownWindow) assert.equal(learning2.read(t), null);
  assert.equal(learning2.pending, unknownWindow.length);
});

test('물어보기가 없으면 담지도 않는다 — 아무도 안 볼 목록을 키우지 않는다', () => {
  const learning3 = new learnSlot();
  learning3.read('NVIDIA GeForce Overlay');
  assert.equal(learning3.pending, 0);
});

test('한 번 배우면 그 뒤로는 표처럼 쓴다', async () => {
  const learning4 = new learnSlot({ ask: async (ts) => ts.map(() => '노는중') });
  learning4.read('Overwatch');
  assert.equal(await learning4.reflect(), 1);
  assert.equal(learning4.read('Overwatch'), '노는중');
  assert.equal(learning4.pending, 0, '배운 걸 또 물으면 안 된다');
});

test('모른다고 답한 것도 적어 둔다 — 안 적으면 같은 창을 영원히 다시 묻는다', async () => {
  let callCount = 0;
  const learning5 = new learnSlot({ ask: async (ts) => { callCount += 1; return ts.map(() => null); } });
  learning5.read('Windows 입력 환경');
  await learning5.reflect();
  learning5.read('Windows 입력 환경');
  await learning5.reflect();
  assert.equal(callCount, 1, `두 번째엔 물어볼 게 없어야 한다 — 실제로 ${callCount}번 불렀다`);
});

test('표가 두뇌를 이긴다 — 우리 창은 우리가 안다', async () => {
  const learning6 = new learnSlot({ ask: async (ts) => ts.map(() => '통화') });
  await learning6.reflect();
  assert.equal(learning6.read('동반자'), '나를보는중');
});

test('개수가 안 맞는 대답은 통째로 버린다 — 어긋나면 엉뚱한 창이 「통화」가 되어 입을 닫는다', async () => {
  const written = [];
  const learning7 = new learnSlot({ ask: async () => ['노는중'], log: (m) => written.push(m) });
  for (const t of unknownWindow) learning7.read(t);
  assert.equal(await learning7.reflect(), 0);
  assert.equal(learning7.knownCount, 0);
  assert.match(written.join(' '), /안 맞는다/);
});

test('두뇌가 죽어도 상황 파악이 멈추지 않는다 — 그리고 조용히 삼키지 않는다', async () => {
  const written2 = [];
  const learning8 = new learnSlot({ ask: async () => { throw new Error('두뇌 없음'); }, log: (m) => written2.push(m) });
  learning8.read('설정');
  assert.equal(await learning8.reflect(), 0);
  assert.match(written2.join(' '), /못 물어봤다/);
});

// ── 바뀌는 부분 떼어 내기 ──────────────────────────────────────────

test('노래가 바뀔 때마다 새로 묻지 않는다 — 그러면 물어보는 값이 영영 안 준다', () => {
  const a = 'Bad Taste ft. Kasane Teto | YouTube Music 외 페이지 1개 - 개인 - Microsoft Edge';
  const b = '다른 노래 | YouTube Music 외 페이지 1개 - 개인 - Microsoft Edge';
  assert.equal(brief(a), brief(b), `${brief(a)} vs ${brief(b)}`);
});

test('아예 다른 프로그램은 다른 것으로 본다', () => {
  assert.notEqual(brief('무언가 - Photoshop'), brief('무언가 - Blender'));
});

// ── 두뇌에게 넘어가는 물음 ────────────────────────────────────────

test('물음에 창 제목이 다 들어간다', async () => {
  let seen = '';
  const ask = askSlot(async (p) => { seen = p; return '모름\n모름\n모름'; });
  const answer = await ask(unknownWindow);
  for (const t of unknownWindow) assert.ok(seen.includes(t), `${t} 이 물음에 없다`);
  assert.deepEqual(answer, [null, null, null]);
});

test('두뇌가 낱말로 답하면 갈래로 읽는다', async () => {
  const ask2 = askSlot(async () => '노는중\n만드는중\n모름');
  assert.deepEqual(await ask2(unknownWindow), ['노는중', '만드는중', null]);
});

test('두뇌가 개수를 안 맞추면 아무것도 안 돌려준다', async () => {
  const ask3 = askSlot(async () => '노는중');
  assert.equal(await ask3(unknownWindow), null);
});

test('배운 자리를 그대로 한 줄로 풀 수 있다 — 제목인 척 되돌리면 조용히 빈 말이 된다', async () => {
  const { bySlotTone } = await import('../dist/index.js');
  assert.equal(slotTone('노는중'), '', 'slot 이름은 창 제목이 아니다');
  assert.match(bySlotTone('노는중'), /노는 중/);
  assert.equal(bySlotTone(null), '');
});
