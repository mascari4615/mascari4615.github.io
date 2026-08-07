import assert from 'node:assert/strict';
import test from 'node:test';

import { People, peopleIn, peopleNote } from '../dist/index.js';

const 사람 = (text, at = 1, channel = 'web') => ({ role: 'sensed', channel, text, at });
const 얘 = (text, at = 2) => ({ role: 'said', channel: 'web', text, at });
const 하루 = 86_400_000;

// ── 뽑아내기 ────────────────────────────────────────────────────────

test('부르는 말이 붙은 이름을 뽑는다', () => {
  assert.deepEqual(peopleIn('오늘 김 대리랑 회의했어'), ['김대리']);
  assert.deepEqual(peopleIn('민수 씨한테 물어봐야지'), ['민수씨']);
  assert.deepEqual(peopleIn('지훈이 형이 그랬어'), ['지훈이형']);
});

test('부르는 말까지 통짜로 잡는다 — 「김」으로 줄이면 김 과장과 뒤섞인다', () => {
  const 하나 = peopleIn('김 대리랑 김 과장이랑 같이 갔어');
  assert.equal(하나.includes('김대리'), true);
  assert.equal(하나.includes('김과장'), true);
  assert.equal(하나.includes('김'), false);
});

test('한 말에 같은 사람이 두 번 나와도 한 번만 센다', () => {
  assert.deepEqual(peopleIn('김 대리 말인데 김 대리가 그랬어'), ['김대리']);
});

test('사람이 아닌 게 뻔한 건 안 잡는다 — 잘못 잡는 게 못 잡는 것보다 나쁘다', () => {
  for (const 말 of ['오늘 님아', '그 씨앗', '우리 형편이', '다음 님']) {
    for (const 뽑힘 of peopleIn(말)) {
      assert.equal(['오늘', '그', '우리', '다음'].some((x) => 뽑힘.startsWith(x)), false, `${말} → ${뽑힘}`);
    }
  }
});

test('부르는 말이 없으면 안 잡는다 — 욕심내지 않는다', () => {
  assert.deepEqual(peopleIn('오늘 회의가 길었어'), []);
});

// ── 쌓기 ────────────────────────────────────────────────────────────

test('한 번 나온 사람은 아직 인정하지 않는다 — 스쳐 간 말일 수 있다', () => {
  const p = new People();
  p.learn([사람('김 대리랑 회의했어', 1)]);
  assert.equal(p.known.length, 0);
  assert.equal(p.watching.length, 1);
});

test('두 번 나오면 곁의 사람이 된다', () => {
  const p = new People();
  p.learn([사람('김 대리랑 회의했어', 1)]);
  p.learn([사람('김 대리가 또 그러네', 2)]);
  assert.deepEqual(p.known.map((x) => x.name), ['김대리']);
});

test('몇 번 나와야 인정할지 정할 수 있다', () => {
  const p = new People({ needTimes: 1 });
  p.learn([사람('김 대리랑 회의했어', 1)]);
  assert.equal(p.known.length, 1);
});

test('같은 말을 두 번 배워도 두 번 세지 않는다 — 훑을 때마다 늘면 금방 다 인정된다', () => {
  const p = new People();
  const 오간말 = [사람('김 대리랑 회의했어', 1)];
  p.learn(오간말);
  p.learn(오간말);
  p.learn(오간말);
  assert.equal(p.known.length, 0);
});

test('얘가 한 말에서는 안 줍는다 — 제가 지어낸 이름을 제가 배우면 안 된다', () => {
  const p = new People({ needTimes: 1 });
  p.learn([얘('그 박 과장 말이야', 1)]);
  assert.equal(p.known.length, 0);
});

test('화면에서 주워 온 것에서도 안 줍는다', () => {
  const p = new People({ needTimes: 1 });
  p.learn([사람('화면을 봤다. 창은 「이 대리 보고서」', 1, 'screen')]);
  assert.equal(p.known.length, 0);
});

test('최근에 나온 순으로 남긴다 — 삼 년 전 사람보다 지난주 사람이 쓸모 있다', () => {
  const p = new People();
  p.learn([사람('김 대리랑', 1), 사람('박 과장이랑', 2)]);
  p.learn([사람('김 대리 또', 100), 사람('박 과장 또', 200)]);
  assert.deepEqual(p.known.map((x) => x.name), ['박과장', '김대리']);
});

test('너무 많이 들고 있지 않는다', () => {
  const p = new People({ keep: 3, needTimes: 1 });
  for (let i = 0; i < 8; i += 1) p.learn([사람(`사람${i} 씨랑 만났어`, i)]);
  assert.ok(p.known.length <= 3);
});

test('잘못 주운 사람은 지울 수 있다', () => {
  const p = new People({ needTimes: 1 });
  p.learn([사람('김 대리랑', 1)]);
  assert.equal(p.forget('김대리'), true);
  assert.equal(p.known.length, 0);
  assert.equal(p.forget('없는사람'), false);
});

// ── 안부 물을 사람 ──────────────────────────────────────────────────

test('한동안 얘기 안 나온 사람에게 안부를 묻는다', () => {
  const p = new People();
  p.learn([사람('김 대리랑', 0), 사람('김 대리 또', 1000)]);
  assert.equal(p.whoToAskAbout(30 * 하루)?.name, '김대리');
});

test('방금 나온 사람에게는 안 묻는다 — 「아까 그 김 대리는 요즘 어때?」는 이상하다', () => {
  const p = new People();
  const 지금 = 30 * 하루;
  p.learn([사람('김 대리랑', 지금 - 2000), 사람('김 대리 또', 지금 - 1000)]);
  assert.equal(p.whoToAskAbout(지금), null);
});

test('가장 오래 안 나온 사람을 고른다', () => {
  const p = new People();
  p.learn([사람('김 대리랑', 0), 사람('김 대리 또', 1)]);
  p.learn([사람('박 과장이랑', 10 * 하루), 사람('박 과장 또', 10 * 하루 + 1)]);
  assert.equal(p.whoToAskAbout(30 * 하루)?.name, '김대리');
});

test('아직 인정 안 된 사람에게는 안부를 안 묻는다', () => {
  const p = new People();
  p.learn([사람('김 대리랑', 0)]);
  assert.equal(p.whoToAskAbout(30 * 하루), null);
});

// ── 두뇌에 넘길 한 줄 ────────────────────────────────────────────────

test('아는 사람이 없으면 아무 말도 안 얹는다', () => {
  assert.equal(peopleNote([]), '');
});

test('누구인지는 안 적는다 — 단정하면 틀렸을 때 그대로 굳는다', () => {
  const note = peopleNote([{ name: '김대리', times: 3, firstAt: 1, lastAt: 9 }]);
  assert.match(note, /김대리/);
  assert.match(note, /아는 척하지 마라/);
  assert.equal(note.includes('동료'), false);
});

test('너무 많이 늘어놓지 않는다', () => {
  const 많이 = Array.from({ length: 10 }, (_, i) => ({ name: `사람${i}`, times: 2, firstAt: 1, lastAt: i }));
  const note = peopleNote(많이, 3);
  assert.equal((note.match(/사람\d/g) ?? []).length, 3);
});

// ── 껐다 켜기 ───────────────────────────────────────────────────────

test('파일에 남겨 두면 껐다 켜도 이어진다', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'people-'));
  const path = join(dir, '사람.json');
  try {
    const 처음 = new People({ path });
    처음.learn([사람('김 대리랑', 1)]);
    처음.learn([사람('김 대리 또', 2)]);
    assert.deepEqual(new People({ path }).known.map((x) => x.name), ['김대리']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('파일이 깨져 있어도 죽지 않는다', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'people-'));
  const path = join(dir, '사람.json');
  try {
    writeFileSync(path, '깨진 파일', 'utf8');
    assert.deepEqual(new People({ path }).known, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
