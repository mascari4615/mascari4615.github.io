import assert from 'node:assert/strict';
import test from 'node:test';

import { listenGate, defaultValue } from '../assets/listen-gate.js';
import { shouldSkipText, keepReason, hadSpeech } from '../dist/index.js';

/** 소리를 이만큼 계속 들려준다. 바뀐 순간들을 돌려준다. */
const playBack = (gate, { 크기, 동안, 부터 = 0, 걸음 = 50 }) => {
  const happened = [];
  for (let t = 부터; t < 부터 + 동안; t += 걸음) {
    const r = gate.들었다(크기, t);
    if (r !== null) happened.push({ what: r, 때: t });
  }
  return { happened: happened, 끝난때: 부터 + 동안 };
};

const loud = defaultValue.문턱 + 0.03;
const quiet = 0.005;

test('조용하면 안 열린다', () => {
  const { happened: 일어난것 } = playBack(new listenGate(), { 크기: quiet, 동안: 5000 });
  assert.deepEqual(일어난것, []);
});

test('말소리가 이어지면 열린다', () => {
  const { happened: 일어난것 } = playBack(new listenGate(), { 크기: loud, 동안: 2000 });
  assert.equal(일어난것[0]?.what, '열림');
});

test('한 번 튄 잡음으로는 안 열린다 — 키보드 소리마다 열리면 못 쓴다', () => {
  const gate2 = new listenGate();
  gate2.들었다(loud, 0);
  gate2.들었다(loud, 50);
  assert.equal(gate2.들었다(quiet, 100), null);
  assert.equal(gate2.열림, false);
});

test('말 중간에 숨 쉬어도 안 닫힌다', () => {
  const gate3 = new listenGate();
  playBack(gate3, { 크기: loud, 동안: 600 });
  assert.equal(gate3.열림, true);
  playBack(gate3, { 크기: quiet, 동안: 400, 부터: 600 }); // 닫히는데(900ms)보다 짧은 숨
  assert.equal(gate3.열림, true, '400ms 숨에 끊기면 한 문장도 못 받는다');
});

test('말이 끝나고 조용하면 닫힌다', () => {
  const gate4 = new listenGate();
  playBack(gate4, { 크기: loud, 동안: 600 });
  const { happened: 일어난것 } = playBack(gate4, { 크기: quiet, 동안: 2000, 부터: 600 });
  assert.equal(일어난것.at(-1)?.what, '닫힘');
});

test('얘가 말하는 동안은 안 열린다 — 제 목소리를 제가 받아쓰면 혼자 떠든다', () => {
  const gate5 = new listenGate();
  gate5.입(true, 0);
  const { happened: 일어난것 } = playBack(gate5, { 크기: loud, 동안: 3000 });
  assert.deepEqual(일어난것, []);
});

test('얘가 말하기 시작하면 열려 있던 문도 닫는다', () => {
  const gate6 = new listenGate();
  playBack(gate6, { 크기: loud, 동안: 600 });
  assert.equal(gate6.열림, true);
  gate6.입(true, 600);
  assert.equal(gate6.들었다(loud, 650), '닫힘');
});

test('얘가 말을 마쳐도 꼬리 여운 동안은 안 연다 — 스피커 울림이 남는다', () => {
  const gate7 = new listenGate();
  gate7.입(true, 0);
  gate7.입(false, 1000);
  playBack(gate7, { 크기: loud, 동안: 500, 부터: 1000 }); // 꼬리여운(600ms) 안
  assert.equal(gate7.열림, false);
  playBack(gate7, { 크기: loud, 동안: 600, 부터: 1700 }); // 여운 지난 뒤
  assert.equal(gate7.열림, true);
});

test('켜 둔 TV 에 영영 매달리지 않는다 — 너무 길면 그냥 닫는다', () => {
  const gate8 = new listenGate();
  const { happened: 일어난것 } = playBack(gate8, { 크기: loud, 동안: 25000, step: 100 });
  assert.equal(일어난것.filter((x) => x.what === '닫힘').length >= 1, true);
});

test('설정을 바꾸면 그대로 먹는다 — 방마다 시끄러운 정도가 다르다', () => {
  const gate9 = new listenGate({ 문턱: 0.5 });
  playBack(gate9, { 크기: 0.2, 동안: 3000 });
  assert.equal(gate9.열림, false);
});

// ── 받아쓴 글을 넘길까 ────────────────────────────────────────────

test('빈 글과 한 글자는 안 넘긴다', () => {
  for (const content of ['', '   ', '아', '음', '.', null]) {
    assert.equal(shouldSkipText(content), false, `${content} 은 말이 아니다`);
  }
});

test('같은 글자만 늘어선 건 소리지 말이 아니다', () => {
  assert.equal(shouldSkipText('아아아아'), false);
});

test('왜 안 넘겼는지 말할 수 있다 — 조용히 버리면 「왜 대답을 안 하지」가 된다', () => {
  assert.equal(keepReason('오늘 뭐 했어'), null);
  assert.match(keepReason(''), /안 들렸다/);
  assert.match(keepReason('시청해주셔서 감사합니다'), /말로 안 봤다/);
});

test('받아쓰기가 조용한 데 붙이는 헛것은 안 넘긴다', () => {
  for (const content2 of ['시청해주셔서 감사합니다', '감사합니다.', 'Thank you.', '구독과 좋아요']) {
    assert.equal(shouldSkipText(content2), false, `${content2}`);
  }
});

test('진짜 말은 넘긴다', () => {
  for (const content3 of ['오늘 뭐 했어', '이거 좀 봐줘', '고마워 진짜로']) {
    assert.equal(shouldSkipText(content3), true, `${content3}`);
  }
});

// ── 말이 있던 구간인가 (글이 아니라 소리로 막는다) ─────────────────

test('말소리가 거의 없던 구간은 무슨 글이 와도 안 넘긴다 — 조용한 3초에 「안녕하세요」가 나왔다', () => {
  assert.equal(hadSpeech(0), false);
  assert.equal(hadSpeech(150), false);
  assert.match(keepReason('안녕하세요.', 100), /말소리가 거의 없던/);
});

test('실제로 말한 구간은 통과한다 — 좁게 막지 않으면 불러도 대답을 안 한다', () => {
  assert.equal(hadSpeech(1200), true);
  assert.equal(keepReason('오늘 뭐 했어', 1200), null);
});

test('창이 안 알려 주면 막지 않는다 — 버튼으로 누른 건 사람이 말한다고 알려 준 것이다', () => {
  assert.equal(hadSpeech(null), true);
  assert.equal(hadSpeech(undefined), true);
  assert.equal(keepReason('오늘 뭐 했어'), null);
});

// ── 말 도중에 끊고 들어오기 (76회차) ────────────────────────────────

/** 얘가 말하는 동안 마이크로 이만큼 돌아온다 — 메아리. */
const speakAndPlay = (gate10, size, during, since = 0, step = 50) => {
  const happened2 = [];
  for (let t = since; t < since + during; t += step) {
    const r = gate10.들었다(size, t);
    if (r !== null) happened2.push({ what: r, 때: t });
  }
  return happened2;
};

test('메아리만 들어올 때는 안 끊는다 — 안 그러면 한 마디도 못 끝내고 자기를 끊는다', () => {
  const gate11 = new listenGate();
  gate11.입(true, 0);
  const happened3 = speakAndPlay(gate11, 0.05, 5000); // 스피커 소리가 마이크로 돌아온 크기
  assert.deepEqual(happened3.filter((x) => x.what === '끼어듦'), []);
});

test('메아리보다 훨씬 큰 소리가 이어지면 끊는다 — 사람 목소리다', () => {
  const gate12 = new listenGate();
  gate12.입(true, 0);
  speakAndPlay(gate12, 0.04, 2000); // 메아리 바닥을 먼저 배운다
  const happened4 = speakAndPlay(gate12, 0.4, 1500, 2000);
  assert.equal(happened4.some((x) => x.what === '끼어듦'), true);
});

test('잠깐 튄 소리로는 안 끊는다', () => {
  const gate13 = new listenGate();
  gate13.입(true, 0);
  speakAndPlay(gate13, 0.03, 1000);
  const happened5 = speakAndPlay(gate13, 0.4, 200, 1000); // 끼어드는데(400ms)보다 짧다
  assert.deepEqual(happened5, []);
});

test('메아리 바닥을 재서 배운다 — 방마다 스피커마다 다르니 정해 두면 어디선가 틀린다', () => {
  const gate14 = new listenGate();
  assert.equal(gate14.메아리바닥, 0);
  gate14.입(true, 0);
  speakAndPlay(gate14, 0.06, 1000);
  assert.ok(gate14.메아리바닥 >= 0.05, `메아리를 배워야 한다 — 지금 ${gate14.메아리바닥}`);
  assert.ok(gate14.끼어들문턱 > 0.06, '배운 메아리보다 높아야 사람 목소리로 본다');
});

test('메아리가 너무 크면 끼어들기를 포기한다 — 켜면 자기를 끊는 얘가 된다', () => {
  const gate15 = new listenGate();
  gate15.입(true, 0);
  speakAndPlay(gate15, 0.3, 1000); // 소리 지우기가 전혀 안 먹는 방
  assert.equal(gate15.끼어들포기, true);
  const happened6 = speakAndPlay(gate15, 0.9, 3000, 1000);
  assert.deepEqual(happened6.filter((x) => x.what === '끼어듦'), []);
});

test('끼어들기를 꺼 두면 아무리 크게 말해도 안 끊는다', () => {
  const gate16 = new listenGate({ barge: false });
  gate16.입(true, 0);
  const happened7 = speakAndPlay(gate16, 0.9, 3000);
  assert.deepEqual(happened7, []);
});

test('얘가 말하는 동안 받아쓰기 문이 열리지는 않는다 — 끊는 것과 받아쓰는 것은 다르다', () => {
  const gate17 = new listenGate();
  gate17.입(true, 0);
  speakAndPlay(gate17, 0.5, 3000);
  assert.equal(gate17.열림, false);
});

test('사람이 끼어든 소리를 메아리로 배우지 않는다 — 배우면 문턱이 같이 뛰어 영영 안 걸린다', () => {
  const gate18 = new listenGate();
  gate18.입(true, 0);
  speakAndPlay(gate18, 0.04, 2000);
  const learned = gate18.메아리바닥;
  speakAndPlay(gate18, 0.4, 600, 2000); // 사람이 끼어든 구간
  assert.ok(gate18.메아리바닥 < learned * 3, `잠깐 솟은 걸 메아리로 배우면 안 된다 — ${learned} → ${gate18.메아리바닥}`);
  assert.equal(gate18.끼어들포기, false, '한 번 끼어들었다고 포기하면 안 된다');
});

test('메아리가 내내 큰 방에서는 사람 목소리도 그만큼 커야 한다 — 안 그러면 자기를 끊는다', () => {
  const gate19 = new listenGate({ cannotDo: 1 }); // 포기 말고 문턱으로만 막는지 본다
  gate19.입(true, 0);
  speakAndPlay(gate19, 0.3, 5000);
  assert.ok(gate19.끼어들문턱 > 0.3, `메아리 0.3 인 방에서 문턱이 ${gate19.끼어들문턱} 이면 제 소리에 끊긴다`);
});

test('한 번 끼어들었다고 끼어들기가 꺼지지 않는다 — 사람 목소리가 바닥을 끌어올리면 안 된다', () => {
  const gate20 = new listenGate();
  gate20.입(true, 0);
  speakAndPlay(gate20, 0.045, 3000);
  speakAndPlay(gate20, 0.45, 800, 3000); // 끼어듦
  assert.equal(gate20.끼어들포기, false, `바닥이 ${gate20.메아리바닥} 까지 끌려 올라가면 다음부터 못 끊는다`);
  // 다시 끊을 수 있어야 한다
  gate20.입(false, 3800); gate20.입(true, 6000);
  speakAndPlay(gate20, 0.045, 1000, 6000);
  const again = speakAndPlay(gate20, 0.45, 800, 7000);
  assert.equal(again.some((x) => x.what === '끼어듦'), true, '두 번째 끼어들기가 안 먹는다');
});

test('진짜 시끄러운 방이면 바닥이 곧 차올라 포기한다 — 억지로 켜면 자기를 끊는다', () => {
  const gate21 = new listenGate();
  gate21.입(true, 0);
  speakAndPlay(gate21, 0.3, 4000);
  assert.equal(gate21.끼어들포기, true, `바닥 ${gate21.메아리바닥} — 이 방에서는 켜면 안 된다`);
});
