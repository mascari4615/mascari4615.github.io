import assert from 'node:assert/strict';
import test from 'node:test';

import { SelfImage, asksAboutSelf, selfMoments } from '../dist/index.js';

const 사람 = (text, at = 1, channel = 'web') => ({ role: 'sensed', channel, text, at });
const 얘 = (text, at = 2) => ({ role: 'said', channel: 'web', text, at });

// ── 자기를 묻는 자리 ────────────────────────────────────────────────

test('얘에 대한 물음을 알아본다', () => {
  for (const q of ['너 뭐 좋아해?', '넌 어떤 게 싫어', '욘은 누구야?', '너 이런 거 할 줄 알아?']) {
    assert.equal(asksAboutSelf(q), true, `${q} 는 얘에 대한 물음이다`);
  }
});

test('조수님 얘기는 자기를 묻는 게 아니다', () => {
  for (const q of ['오늘 회의가 길었어', '이 파일 어디 뒀지?', '내일 뭐 하지']) {
    assert.equal(asksAboutSelf(q), false, `${q} 는 얘 얘기가 아니다`);
  }
});

test('「너」가 들어가도 물음이 아니면 안 센다', () => {
  assert.equal(asksAboutSelf('너무 피곤하다'), false);
});

// ── 자기를 말한 자리 뽑기 ───────────────────────────────────────────

test('물음과 그때 한 답을 짝지어 뽑는다', () => {
  const 뽑힌것 = selfMoments([사람('너 뭐 좋아해?', 1), 얘('…조용한 거. 시끄러운 건 좀.', 2)]);
  assert.equal(뽑힌것.length, 1);
  assert.equal(뽑힌것[0].asked, '너 뭐 좋아해?');
  assert.equal(뽑힌것[0].answered, '…조용한 거. 시끄러운 건 좀.');
});

test('호응이나 회피는 자기를 말한 게 아니다 — 「응」으로 노트를 채우면 안 된다', () => {
  for (const 답 of ['응', '…어', '음…', '그래', '글쎄…', '…모르겠어']) {
    assert.deepEqual(selfMoments([사람('너 괜찮아?', 1), 얘(답, 2)]), [], `${답} 은 자기 얘기가 아니다`);
  }
});

test('짧아도 알맹이가 있으면 센다 — 길이로 재면 이 얘한테는 영영 안 쌓인다', () => {
  const 뽑힌것 = selfMoments([사람('너 뭐 좋아해?', 1), 얘('소파…', 2)]);
  assert.equal(뽑힌것.length, 1);
  assert.equal(뽑힌것[0].answered, '소파…');
});

test('묻지 않은 자리의 말은 안 센다 — 놀이 잡담이 쏟아진다', () => {
  const 놀이 = [사람('바나나', 1), 얘('「석」로 시작해야지. 내가 이겼다.', 2)];
  assert.deepEqual(selfMoments(놀이), []);
});

test('화면에서 주워 온 것은 물음이 아니다', () => {
  const es = [사람('화면을 봤다. 너 앞에 있는 창은 「동반자」.', 1, 'screen'), 얘('…또 그거네.', 2)];
  assert.deepEqual(selfMoments(es), []);
});

test('답이 아니라 다른 사람 말이 오면 안 센다', () => {
  assert.deepEqual(selfMoments([사람('너 뭐 좋아해?', 1), 사람('아니 됐어', 2)]), []);
});

// ── 쌓기 ────────────────────────────────────────────────────────────

test('물어본 것들이 쌓인다', () => {
  const s = new SelfImage();
  s.learn([사람('너 뭐 좋아해?', 1), 얘('…조용한 거.', 2)]);
  s.learn([사람('넌 뭐가 싫어?', 3), 얘('…시끄러운 거.', 4)]);
  assert.equal(s.all.length, 2);
});

test('같은 물음은 옛 답을 지킨다 — 새것으로 덮으면 흔들림을 따라가는 것이다', () => {
  const s = new SelfImage();
  s.learn([사람('너 뭐 좋아해?', 1), 얘('…조용한 거.', 2)]);
  s.learn([사람('너 뭐 좋아해?', 3), 얘('…음악? 잘 모르겠는데.', 4)]);
  assert.equal(s.all.length, 1);
  assert.equal(s.all[0].answered, '…조용한 거.');
});

test('물음표나 띄어쓰기가 달라도 같은 물음으로 본다', () => {
  const s = new SelfImage();
  s.learn([사람('너 뭐 좋아해?', 1), 얘('…조용한 거.', 2)]);
  s.learn([사람('너 뭐 좋아해', 3), 얘('…딴 말.', 4)]);
  assert.equal(s.all.length, 1);
});

test('너무 많이 들고 있지 않는다 — 스무 줄이면 인격이 아니라 서류다', () => {
  const s = new SelfImage({ keep: 3 });
  for (let i = 0; i < 8; i += 1) s.learn([사람(`너 ${i}번은 어때?`, i * 2), 얘(`…${i}번 답이야.`, i * 2 + 1)]);
  assert.equal(s.all.length, 3);
  assert.match(s.all[2].answered, /7번/, '가장 최근 것이 남는다');
});

test('배운 게 없으면 0 을 돌려준다', () => {
  const s = new SelfImage();
  assert.equal(s.learn([사람('오늘 힘들었어', 1), 얘('…그랬구나.', 2)]), 0);
});

test('잘못 쌓인 건 지울 수 있다', () => {
  const s = new SelfImage();
  s.learn([사람('너 뭐 좋아해?', 1), 얘('…라면 좋아하는데.', 2)]);
  assert.equal(s.forget('라면'), true);
  assert.equal(s.all.length, 0);
  assert.equal(s.forget('없는말'), false);
});

// ── 두뇌에 넘길 한 줄 ────────────────────────────────────────────────

test('아무것도 없으면 아무 말도 안 얹는다', () => {
  assert.equal(new SelfImage().note(), '');
});

test('그때 한 말을 그대로 보여 준다 — 요약하면 그걸 보고 또 새로 지어낸다', () => {
  const s = new SelfImage();
  s.learn([사람('너 뭐 좋아해?', 1), 얘('…조용한 거. 시끄러운 건 좀.', 2)]);
  const note = s.note();
  assert.match(note, /조용한 거/);
  assert.match(note, /다르게 지어내지 마라/);
});

test('토씨까지 똑같이 읊으라고 하지는 않는다 — 그건 녹음기다', () => {
  const s = new SelfImage();
  s.learn([사람('너 뭐 좋아해?', 1), 얘('…조용한 거.', 2)]);
  assert.match(s.note(), /토씨까지 똑같이 읊으라는 건 아니다/);
});

// ── 껐다 켜기 ───────────────────────────────────────────────────────

test('파일에 남겨 두면 껐다 켜도 이어진다', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'self-'));
  const path = join(dir, '나.json');
  try {
    const 처음 = new SelfImage({ path });
    처음.learn([사람('너 뭐 좋아해?', 1), 얘('…조용한 거.', 2)]);
    const 다시 = new SelfImage({ path });
    assert.equal(다시.all.length, 1);
    assert.equal(다시.all[0].answered, '…조용한 거.');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('파일이 깨져 있어도 죽지 않는다 — 자기를 잊을지언정 멈추지는 않는다', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'self-'));
  const path = join(dir, '나.json');
  try {
    writeFileSync(path, '{{{깨진 파일', 'utf8');
    assert.deepEqual(new SelfImage({ path }).all, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
