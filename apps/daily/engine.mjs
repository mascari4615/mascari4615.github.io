/**
 * 오늘의 하나 맞히기 — 순수 엔진 (TASK-KAR-202).
 *
 * 이 파일은 브라우저와 node 양쪽에서 그대로 돈다. DOM·fetch·localStorage 를 모른다.
 * 주제(포켓몬/롤/…)는 데이터 표일 뿐이라, 새 주제가 늘어도 여기는 안 바뀐다 —
 * 그게 이 게임의 설계 목표이자 완료 조건이다.
 */

/** 하루의 경계는 한국 시각. UTC 자정에 문제가 바뀌면 한국 사람은 저녁에 바뀐다. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** 1번 문제가 시작된 날 (KST). 문제 번호 = 여기서부터 며칠째. */
export const EPOCH_DAY_NUMBER = Math.floor(Date.UTC(2026, 0, 1) / DAY_MS);

export function kstDayNumber(at = new Date()) {
  return Math.floor((at.getTime() + KST_OFFSET_MS) / DAY_MS);
}

export function kstDayKey(at = new Date()) {
  return new Date(at.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 오늘 문제 번호 (1부터). 사람에게 보이는 번호이자 공유 글에 박히는 값. */
export function puzzleNumber(at = new Date()) {
  return kstDayNumber(at) - EPOCH_DAY_NUMBER + 1;
}

function hash32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 하루 하나를 고른다 — 뽑기가 아니라 **순열**이다.
 * 매일 해시로 찍으면 한 해 안에 같은 정답이 여러 번 나온다(챔피언 233명이면 흔하다).
 * 그래서 주기(= 항목 수)마다 순서를 새로 섞고 그 줄을 따라간다 → 한 주기 안에 중복 0.
 *
 * `salt` 는 모드 이름이 들어간다 — 같은 주제라도 모드가 다르면 정답이 달라야
 * 하루에 두 판을 두는 의미가 있다.
 */
export function dailyIndex(topicId, dayNumber, count, salt = '') {
  if (count <= 0) throw new Error('빈 표에서는 문제를 못 낸다');
  const cycle = Math.floor(dayNumber / count);
  // 소금이 없을 때의 씨앗 모양은 그대로 둔다 — 바꾸면 이미 두고 있던 사람의 오늘 정답이 바뀐다.
  const rand = mulberry32(hash32(salt ? `${topicId}:${salt}:${cycle}` : `${topicId}:${cycle}`));
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order[((dayNumber % count) + count) % count];
}

/** 오늘의 정답 항목. 모드가 다르면 같은 날이라도 정답이 다르다. */
export function answerOf(topic, at = new Date(), mode = '') {
  return topic.items[dailyIndex(topic.id, kstDayNumber(at), topic.items.length, mode)];
}

const norm = (v) => String(v ?? '').trim().toLowerCase();

/**
 * 속성 한 칸 비교.
 * state: exact(맞음) / near(근접·부분일치) / wrong(틀림)
 * dir:   number 일 때만 — 정답이 더 큰가(up) 작은가(down)
 */
export function compareField(field, guessValue, answerValue) {
  if (field.kind === 'number') {
    const g = Number(guessValue);
    const a = Number(answerValue);
    if (!Number.isFinite(g) || !Number.isFinite(a)) return { state: 'wrong', dir: null };
    if (g === a) return { state: 'exact', dir: null };
    const dir = a > g ? 'up' : 'down';
    const gap = Math.abs(a - g);
    const tolerance = field.near ?? (field.nearRatio ? Math.abs(a) * field.nearRatio : 0);
    return { state: tolerance > 0 && gap <= tolerance ? 'near' : 'wrong', dir };
  }

  if (field.kind === 'set') {
    const g = (guessValue ?? []).map(norm);
    const a = (answerValue ?? []).map(norm);
    const same = g.length === a.length && a.every((v) => g.includes(v));
    if (same) return { state: 'exact', dir: null };
    return { state: g.some((v) => a.includes(v)) ? 'near' : 'wrong', dir: null };
  }

  // category — 맞거나 틀리거나.
  return { state: norm(guessValue) === norm(answerValue) ? 'exact' : 'wrong', dir: null };
}

/** 추측 한 줄 = 속성 칸들. */
export function compareItem(topic, guess, answer) {
  return topic.fields.map((field) => ({
    key: field.key,
    value: guess[field.key],
    ...compareField(field, guess[field.key], answer[field.key]),
  }));
}

export function isWin(cells) {
  return cells.length > 0 && cells.every((c) => c.state === 'exact');
}

const CELL_EMOJI = { exact: '🟩', near: '🟨', wrong: '⬛' };

/** 격자 한 줄 — 정답을 흘리지 않는다. 이게 공유의 전부다. */
export function shareRow(cells) {
  return cells.map((c) => CELL_EMOJI[c.state] ?? '⬛').join('');
}

/**
 * 공유 글. 항목 이름은 절대 안 넣는다 — 넣는 순간 스포일러라 아무도 못 올린다.
 */
export function shareText({ title, puzzleNo, rows, won, maxGuesses, url }) {
  const score = won ? `${rows.length}/${maxGuesses}` : `X/${maxGuesses}`;
  return [
    `${title} #${puzzleNo} ${score}`,
    '',
    ...rows.map(shareRow),
    ...(url ? ['', url] : []),
  ].join('\n');
}

// ── 기록 ────────────────────────────────────────────────────────────────────
// 매일 다시 오게 만드는 건 문제가 아니라 *끊기면 아까운 숫자*다. 연속 기록이 그 장치다.

export function emptyStats() {
  return { played: 0, wins: 0, streak: 0, best: 0, dist: {}, lastDay: null };
}

/**
 * 한 판 끝난 결과를 기록에 반영한다. 같은 날을 두 번 넣어도 한 번만 센다(새로고침 안전).
 * 연속은 *어제* 푼 경우만 이어진다 — 하루 건너뛰면 1부터 다시.
 */
export function updateStats(stats, { won, guesses, dayNumber }) {
  const next = { ...emptyStats(), ...stats, dist: { ...(stats?.dist ?? {}) } };
  if (next.lastDay === dayNumber) return next;

  next.played += 1;
  if (won) {
    next.wins += 1;
    next.streak = next.lastDay === dayNumber - 1 ? next.streak + 1 : 1;
    next.best = Math.max(next.best, next.streak);
    next.dist[guesses] = (next.dist[guesses] ?? 0) + 1;
  } else {
    next.streak = 0;
  }
  next.lastDay = dayNumber;
  return next;
}

/** 어제까지 이어 오다 오늘을 아직 안 푼 상태면 연속은 살아 있다 (오늘이 끝나야 끊긴다). */
export function liveStreak(stats, dayNumber) {
  if (!stats?.lastDay) return 0;
  return stats.lastDay === dayNumber || stats.lastDay === dayNumber - 1 ? stats.streak : 0;
}

/** 자동완성 — 앞글자 우선, 그 다음 포함. 이미 낸 답은 뺀다. */
export function suggest(items, query, { limit = 8, exclude = [] } = {}) {
  const q = norm(query);
  if (!q) return [];
  const taken = new Set(exclude.map(norm));
  const starts = [];
  const contains = [];
  for (const item of items) {
    const name = norm(item.name);
    if (taken.has(name)) continue;
    if (name.startsWith(q)) starts.push(item);
    else if (name.includes(q)) contains.push(item);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

/** 이름으로 항목 찾기 (대소문자·공백 무시). */
export function findItem(items, name) {
  const n = norm(name);
  return items.find((item) => norm(item.name) === n) ?? null;
}
