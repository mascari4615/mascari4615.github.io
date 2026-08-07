import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  answerOf,
  compareField,
  compareItem,
  dailyIndex,
  emptyStats,
  findItem,
  liveStreak,
  touchDay,
  updateStats,
  isWin,
  kstDayKey,
  kstDayNumber,
  puzzleNumber,
  shareRow,
  shareText,
  suggest,
} from './engine.mjs';

const topic = {
  id: 'test',
  title: '시험',
  fields: [
    { key: 'gen', label: '세대', kind: 'number' },
    { key: 'types', label: '타입', kind: 'set' },
    { key: 'color', label: '색', kind: 'category' },
    { key: 'weight', label: '무게', kind: 'number', nearRatio: 0.2 },
  ],
  items: [
    { name: '가', gen: 1, types: ['풀', '독'], color: '초록', weight: 10 },
    { name: '나', gen: 2, types: ['불꽃'], color: '빨강', weight: 100 },
    { name: '다', gen: 3, types: ['독', '물'], color: '파랑', weight: 11 },
  ],
};

test('하루 경계는 한국 시각이다', () => {
  // UTC 로 8월 6일 오후 3시 = KST 8월 7일 자정 → 이미 다음 문제.
  assert.equal(kstDayKey(new Date('2026-08-06T14:59:00Z')), '2026-08-06');
  assert.equal(kstDayKey(new Date('2026-08-06T15:00:00Z')), '2026-08-07');
  assert.equal(
    kstDayNumber(new Date('2026-08-06T15:00:00Z')) - kstDayNumber(new Date('2026-08-06T14:59:00Z')),
    1,
  );
});

test('문제 번호는 1부터 하루에 하나씩 오른다', () => {
  assert.equal(puzzleNumber(new Date('2026-01-01T00:00:00+09:00')), 1);
  assert.equal(puzzleNumber(new Date('2026-01-10T23:59:00+09:00')), 10);
});

test('같은 날은 늘 같은 정답이다', () => {
  const a = answerOf(topic, new Date('2026-08-07T01:00:00+09:00'));
  const b = answerOf(topic, new Date('2026-08-07T23:00:00+09:00'));
  assert.equal(a.name, b.name);
});

test('한 주기 안에서는 정답이 겹치지 않는다', () => {
  // 이게 순열을 쓰는 이유다. 해시로 찍었으면 여기서 중복이 난다.
  const n = 233;
  const seen = new Set();
  for (let d = 0; d < n; d += 1) seen.add(dailyIndex('lol', d, n));
  assert.equal(seen.size, n);
});

test('주기가 넘어가면 순서가 새로 섞인다', () => {
  const n = 3;
  const first = [0, 1, 2].map((d) => dailyIndex('test', d, n));
  const second = [3, 4, 5].map((d) => dailyIndex('test', d, n));
  assert.notDeepEqual(first, second);
});

test('숫자는 위·아래를 알려주고, 가까우면 노랑이다', () => {
  const f = topic.fields[0];
  assert.deepEqual(compareField(f, 1, 1), { state: 'exact', dir: null });
  assert.deepEqual(compareField(f, 1, 3), { state: 'wrong', dir: 'up' });
  assert.deepEqual(compareField(f, 5, 3), { state: 'wrong', dir: 'down' });
  const w = topic.fields[3];
  assert.deepEqual(compareField(w, 90, 100), { state: 'near', dir: 'up' }); // 20% 안
  assert.deepEqual(compareField(w, 10, 100), { state: 'wrong', dir: 'up' });
});

test('여러 값 속성은 하나만 겹쳐도 노랑이다', () => {
  const f = topic.fields[1];
  assert.equal(compareField(f, ['풀', '독'], ['독', '풀']).state, 'exact'); // 순서 무관
  assert.equal(compareField(f, ['풀'], ['풀', '독']).state, 'near'); // 개수 다르면 부분일치
  assert.equal(compareField(f, ['불꽃'], ['풀', '독']).state, 'wrong');
});

test('한 줄 비교와 승리 판정', () => {
  const answer = topic.items[0];
  assert.equal(isWin(compareItem(topic, answer, answer)), true);
  assert.equal(isWin(compareItem(topic, topic.items[1], answer)), false);
});

test('공유 글에 정답 이름이 안 들어간다', () => {
  const answer = topic.items[0];
  const rows = [compareItem(topic, topic.items[1], answer), compareItem(topic, answer, answer)];
  const text = shareText({ title: '시험', puzzleNo: 7, rows, won: true, maxGuesses: 8, url: 'https://x' });
  assert.match(text, /시험 #7 2\/8/);
  assert.equal(shareRow(rows[1]), '🟩🟩🟩🟩');
  for (const item of topic.items) assert.ok(!text.includes(item.name), `${item.name} 가 샜다`);
});

test('못 맞히면 X 로 남는다', () => {
  const text = shareText({ title: '시험', puzzleNo: 1, rows: [], won: false, maxGuesses: 8 });
  assert.match(text, /X\/8/);
});

test('자동완성은 앞글자를 먼저 주고 이미 낸 답을 뺀다', () => {
  const items = [{ name: '리자몽' }, { name: '몽몽이' }, { name: '리자드' }];
  assert.deepEqual(suggest(items, '리').map((i) => i.name), ['리자몽', '리자드']);
  assert.deepEqual(suggest(items, '몽').map((i) => i.name), ['몽몽이', '리자몽']);
  assert.deepEqual(suggest(items, '리', { exclude: ['리자몽'] }).map((i) => i.name), ['리자드']);
  assert.deepEqual(suggest(items, ''), []);
});

test('모드가 다르면 같은 날에도 정답이 다르다', () => {
  // 하루 두 판을 두는 의미가 여기서 나온다.
  const at = new Date('2026-08-07T10:00:00+09:00');
  const a = answerOf(topic, at);
  const b = answerOf(topic, at, 'silhouette');
  const many = { ...topic, items: Array.from({ length: 50 }, (_, i) => ({ name: `x${i}` })) };
  assert.notEqual(answerOf(many, at).name, answerOf(many, at, 'silhouette').name);
  assert.equal(typeof a.name + typeof b.name, 'stringstring');
});

test('소금 없는 정답은 예전과 같은 값이다', () => {
  // 씨앗 모양을 바꾸면 이미 두고 있던 사람의 오늘 정답이 바뀐다 — 회귀 차단.
  assert.equal(dailyIndex('test', 100, 3), dailyIndex('test', 100, 3, ''));
});

test('연속 기록은 어제 푼 경우에만 이어진다', () => {
  let s = emptyStats();
  s = updateStats(s, { won: true, guesses: 3, dayNumber: 10 });
  assert.equal(s.streak, 1);
  s = updateStats(s, { won: true, guesses: 2, dayNumber: 11 });
  assert.equal(s.streak, 2);
  s = updateStats(s, { won: true, guesses: 5, dayNumber: 20 }); // 하루 건너뜀
  assert.equal(s.streak, 1);
  assert.equal(s.best, 2);
  assert.equal(s.played, 3);
  assert.deepEqual(s.dist, { 3: 1, 2: 1, 5: 1 });
});

test('못 맞히면 연속이 끊기고, 같은 날은 두 번 안 센다', () => {
  let s = updateStats(emptyStats(), { won: true, guesses: 1, dayNumber: 5 });
  s = updateStats(s, { won: false, guesses: 8, dayNumber: 6 });
  assert.equal(s.streak, 0);
  assert.equal(s.wins, 1);
  const again = updateStats(s, { won: false, guesses: 8, dayNumber: 6 });
  assert.equal(again.played, s.played, '새로고침으로 두 번 세면 안 된다');
});

test('오늘을 아직 안 풀었어도 어제까지의 연속은 살아 있다', () => {
  const s = updateStats(emptyStats(), { won: true, guesses: 2, dayNumber: 30 });
  assert.equal(liveStreak(s, 31), 1, '오늘이 끝나야 끊긴다');
  assert.equal(liveStreak(s, 32), 0, '하루 걸렀으면 죽었다');
});

test('연속은 판이 아니라 하루 단위다 — 아무 판이나 하나면 이어진다', () => {
  // 판마다 세면 판이 늘수록 끊기기 쉬워진다. 매일 와도 안 쌓이면 장치가 헛돈다.
  let s = touchDay(null, 10);
  assert.equal(s.streak, 1);
  s = touchDay(s, 10); // 같은 날 다른 판 — 또 세지 않는다
  assert.equal(s.streak, 1);
  assert.equal(s.days, 1);
  s = touchDay(s, 11);
  assert.equal(s.streak, 2);
  s = touchDay(s, 15); // 사흘 걸렀다
  assert.equal(s.streak, 1);
  assert.equal(s.best, 2);
});

test('졌어도 연속은 이어진다 — 온 것 자체가 기록이다', () => {
  const s = touchDay(touchDay(null, 3), 4);
  assert.equal(s.streak, 2);
  assert.equal(liveStreak(s, 5), 2, '오늘이 끝나야 끊긴다');
  assert.equal(liveStreak(s, 6), 0);
});

test('이름 찾기는 대소문자·공백을 봐주고, 없으면 null 이다', () => {
  const items = [{ name: 'Aatrox' }];
  assert.equal(findItem(items, ' aatrox ')?.name, 'Aatrox');
  assert.equal(findItem(items, '없음'), null);
});
