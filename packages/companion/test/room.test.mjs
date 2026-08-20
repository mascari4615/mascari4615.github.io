import assert from 'node:assert/strict';
import test from 'node:test';

import { maySpeak, whichSlot, slotTone } from '../dist/index.js';

test('창 제목으로 어떤 자리인지 가린다', () => {
  assert.equal(whichSlot('Zoom Meeting'), '통화');
  assert.equal(whichSlot('무한도전 51화 - YouTube - Chrome'), '보는중');
  assert.equal(whichSlot('room.ts - companion - Visual Studio Code'), '만드는중');
  assert.equal(whichSlot('Steam'), '노는중');
  assert.equal(whichSlot('오류 해결 - Stack Overflow'), '읽는중');
});

test('모르면 모른다고 한다 — 억지로 붙이면 엉뚱한 자리에서 입을 다문다', () => {
  assert.equal(whichSlot('알 수 없는 프로그램'), null);
  assert.equal(whichSlot(''), null);
  assert.equal(whichSlot(null), null);
});

test('끼어들면 안 되는 것이 먼저다 — 통화 중에 뜬 게임 창에 속으면 사고다', () => {
  assert.equal(whichSlot('Zoom Meeting — Steam 알림'), '통화');
});

// ── 말 걸어도 되나 ──────────────────────────────────────────────────

test('통화 중에는 먼저 말 안 건다', () => {
  const r = maySpeak('Zoom Meeting');
  assert.equal(r.된다, false);
  assert.match(r.왜, /통화/);
});

test('뭔가 보는 중에도 먼저 말 안 건다', () => {
  assert.equal(maySpeak('영화 - Netflix').된다, false);
});

test('만드는 중에는 말 걸어도 된다 — 곁에 있는 존재는 조용하기만 하면 안 된다', () => {
  assert.equal(maySpeak('main.ts - Visual Studio Code').된다, true);
});

test('모르면 말 건다 — 몸 사리면 영영 조용해진다', () => {
  const r = maySpeak('알 수 없는 창');
  assert.equal(r.된다, true);
  assert.match(r.왜, /모르겠다/);
});

test('창 제목이 없어도 말 건다 — 화면을 못 봤다고 입을 닫으면 안 된다', () => {
  assert.equal(maySpeak(null).된다, true);
});

// ── 자리에 맞는 결 ──────────────────────────────────────────────────

test('만드는 중이면 흐름을 끊지 말라고 얹는다', () => {
  assert.match(slotTone('app.ts - Visual Studio Code'), /짧게/);
});

test('통화 중에는 물어봐도 아주 짧게', () => {
  assert.match(slotTone('Zoom Meeting'), /아주 짧게/);
});

test('모르는 자리엔 아무 말도 안 얹는다 — 늘 붙으면 재료만 먹는다', () => {
  assert.equal(slotTone('알 수 없는 창'), '');
  assert.equal(slotTone(null), '');
});

// ── 실제로 오는 제목 (실측) ──────────────────────────────────────────

test('터미널도 만드는 중이다 — 실제로 오는 제목은 이쪽이 태반이었다', () => {
  assert.equal(whichSlot('claude · resume'), '만드는중');
  assert.equal(whichSlot('Windows PowerShell'), '만드는중');
});

test('브라우저 제목은 사이에 뭐가 낀다 — 앞에 붙임표를 요구하면 안 걸린다', () => {
  assert.equal(whichSlot('KarmoLab 외 페이지 1개 - 개인 - Microsoft Edge'), '읽는중');
});

test('그래도 통화가 먼저다 — 브라우저로 하는 통화가 흔하다', () => {
  assert.equal(whichSlot('Zoom Meeting - 개인 - Microsoft Edge'), '통화');
});

test('영상 보는 중이 만드는 중보다 먼저다 — 브라우저로 본다', () => {
  assert.equal(whichSlot('무한도전 - YouTube - Chrome'), '보는중');
});

test('디스코드 제목은 「#방 | 서버 - Discord」로 온다 — 붙임표를 요구하면 안 걸린다', () => {
  assert.equal(whichSlot('#ㅗ | 홈플러스 기아 - Discord'), '통화');
});
