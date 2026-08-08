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

/**
 * 연습으로 열어도 되는 날인가 (`?d=YYYY-MM-DD`).
 *
 * 두 쪽 다 막아야 한다:
 * - **오늘·미래** — 열리면 오늘 답이 새어 놀이가 끝장난다.
 * - **1번 문제 이전** — 없던 날이라 문제 번호가 음수로 찍힌다 (「#-2043」).
 *
 * 규칙이라 화면이 아니라 여기 산다. 통과하면 그날 시각(정오)을 돌려준다.
 */
export function practiceDate(raw, now = new Date()) {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const at = new Date(`${raw}T12:00:00+09:00`);
  if (Number.isNaN(at.getTime())) return null;
  const day = kstDayNumber(at);
  if (day >= kstDayNumber(now)) return null;
  if (day < EPOCH_DAY_NUMBER) return null;
  return at;
}

/** 오늘의 정답 항목. 모드가 다르면 같은 날이라도 정답이 다르다. */
export function answerOf(topic, at = new Date(), mode = '') {
  return topic.items[dailyIndex(topic.id, kstDayNumber(at), topic.items.length, mode)];
}

const norm = (v) => String(v ?? '').trim().toLowerCase();

/**
 * 이름 찾기용 정규화 — 띄어쓰기와 가운뎃점을 지운다.
 * 「누누와 윌럼프」·「미스터 마임」·「라이덴 쇼군」 처럼 띄어 쓴 이름이 22개인데,
 * 사람은 대개 붙여 친다. 붙여 쳤다고 못 찾으면 그건 우리 잘못이다.
 */
const nameKey = (v) => norm(v).replace(/[\s·・‧~'’.-]/g, '');

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

/**
 * 한 줄을 말로 옮긴다 — 색과 ▲▼ 로만 알려 주면 화면 낭독기 쓰는 사람에게는 아무 말도 안 한 것이다.
 * (눈으로 보는 표와 같은 내용이어야 한다. 여기서 갈리면 두 사람이 다른 놀이를 하게 된다.)
 */
export function describeRow(fields, cells, name) {
  const parts = cells.map((c, i) => {
    const label = fields[i].label;
    const value = Array.isArray(c.value) ? c.value.join(', ') : c.value;
    if (c.state === 'exact') return `${label} ${value} 맞음`;
    if (c.dir) return `${label} ${value}, 정답은 더 ${c.dir === 'up' ? '큼' : '작음'}${c.state === 'near' ? ' (가까움)' : ''}`;
    return `${label} ${value} ${c.state === 'near' ? '일부 맞음' : '틀림'}`;
  });
  return `${name}: ${parts.join(', ')}`;
}

export function isWin(cells) {
  return cells.length > 0 && cells.every((c) => c.state === 'exact');
}

const CELL_EMOJI = { exact: '🟩', near: '🟨', wrong: '⬛' };

/**
 * 몇 번 남았는지 한 줄로.
 *
 * 예전엔 「0 / 8번째 시도」 였다 — 「0번째 시도」는 말이 안 되고, 한 수 둔 뒤의
 * 「1 / 8번째 시도」도 쓴 수인지 지금 두는 수인지 안 갈린다. 사람이 궁금한 건 **몇 번 남았나**다.
 */
export function triesLabel(used, max) {
  const left = Math.max(0, max - used);
  if (used === 0) return `${max}번 안에 맞히기`;
  if (left === 0) return `${max}번 다 썼다`;
  if (left === 1) return `${used}번 썼다 · 마지막 한 번`;
  return `${used}번 썼다 · ${left}번 남음`;
}

/** 격자 한 줄 — 정답을 흘리지 않는다. 이게 공유의 전부다. */
export function shareRow(cells) {
  return cells.map((c) => CELL_EMOJI[c.state] ?? '⬛').join('');
}

/**
 * 공유 글. 항목 이름은 절대 안 넣는다 — 넣는 순간 스포일러라 아무도 못 올린다.
 */
export function shareText({ title, puzzleNo, rows, won, maxGuesses, url, tries }) {
  // 몇 번 뒀는지는 줄 수로 세지 않는다 — 실루엣은 한 줄에 눕혀 그리므로 줄 수와 시도 수가 다르다.
  const score = won ? `${tries ?? rows.length}/${maxGuesses}` : `X/${maxGuesses}`;
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

/**
 * **사이트 전체 연속** — 그날 아무 판이나 하나 끝내면 이어진다.
 *
 * 판마다 따로 세면 판이 늘수록 연속이 끊기기 쉬워진다 (6판이면 6판을 매일 다 풀어야 한다).
 * 매일 오게 만드는 장치인데 매일 와도 안 쌓이면 장치가 헛돈다. 그래서 하루 단위로 센다.
 * 이겼는지 졌는지는 안 본다 — 온 것 자체가 연속이다.
 */
export function touchDay(streak, dayNumber) {
  const next = { days: 0, streak: 0, best: 0, lastDay: null, ...(streak ?? {}) };
  if (next.lastDay === dayNumber) return next;
  next.days += 1;
  next.streak = next.lastDay === dayNumber - 1 ? next.streak + 1 : 1;
  next.best = Math.max(next.best, next.streak);
  next.lastDay = dayNumber;
  return next;
}

/** 어제까지 이어 오다 오늘을 아직 안 푼 상태면 연속은 살아 있다 (오늘이 끝나야 끊긴다). */
export function liveStreak(stats, dayNumber) {
  if (!stats?.lastDay) return 0;
  return stats.lastDay === dayNumber || stats.lastDay === dayNumber - 1 ? stats.streak : 0;
}

/**
 * 연속 기록 한 줄 — **끊겼으면 끊겼다고 말한다.**
 *
 * 지금까지는 살아 있으면 🔥, 죽으면 그냥 사라졌다. 매일 오던 사람이 하루 걸러서 왔는데
 * 불꽃만 조용히 없어지면, 본인은 기록이 사라진 줄도 왜 사라졌는지도 모른다.
 * 자기 기록이니 자기가 알아야 한다.
 */
export function streakLine(streak, dayNumber) {
  const live = liveStreak(streak ?? {}, dayNumber);
  if (live > 0) return `🔥 ${live}일 연속`;
  const best = streak?.best ?? 0;
  if (!best) return '';
  const missed = streak?.lastDay ? dayNumber - streak.lastDay - 1 : 0;
  return `연속이 끊겼어요 (최고 ${best}일${missed > 0 ? ` · ${missed}일 걸렀다` : ''}) — 오늘 한 판이면 다시 1일`;
}

/**
 * 「그날로 못 가는 이유」 — 못 가는 것 자체는 규칙이 정하지만, **왜인지 말해 줘야** 한다.
 *
 * 지금까지는 `?d=` 가 열 수 없는 날이면 아무 말 없이 오늘 판이 열렸다. 지난 문제 목록이
 * 판마다 이 주소로 사람을 보내는 만큼, 링크가 낡거나 손으로 고쳐진 경우가 생긴다 —
 * 그때 조용히 다른 날을 풀게 두면 본인은 끝까지 모른다.
 *
 * 열 수 있으면 null. 아니면 왜인지 한 낱말로.
 */
export function whyNoPractice(raw, now = new Date()) {
  if (raw === null || raw === undefined || raw === '') return null; // 애초에 연습이 아니다
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return 'bad';
  const at = new Date(`${raw}T12:00:00+09:00`);
  if (Number.isNaN(at.getTime())) return 'bad';
  const day = kstDayNumber(at);
  if (day > kstDayNumber(now)) return 'future';
  if (day === kstDayNumber(now)) return 'today';
  if (day < EPOCH_DAY_NUMBER) return 'before';
  return null;
}

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';

/** 한글 한 덩이의 첫 자음. 한글이 아니면 그대로 둔다(영문·숫자도 섞여 찾아지게). */
function choseong(text) {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) - 0xac00;
    out += code >= 0 && code <= 11171 ? CHO[Math.floor(code / 588)] : ch;
  }
  return out;
}

/** 「ㅍㅋㅊ」처럼 첫 자음만 친 것인가. 자음 하나만 쳤을 때도 여기에 든다. */
const isChoseongQuery = (q) => q.length > 0 && [...q].every((c) => CHO.includes(c));

/**
 * 자동완성 — 앞글자 우선, 그 다음 포함. 이미 낸 답은 뺀다.
 *
 * 첫 자음만 쳐도 찾아진다 (「ㅍㅋㅊ」 → 피카츄). 고를 것이 1025개나 되는 판에서
 * 이름을 끝까지 치게 하면 그 자체가 문턱이다 — 한국어를 쓰는 사람은 대개 이렇게 친다.
 */
export function suggest(items, query, { limit = 8, exclude = [] } = {}) {
  const q = nameKey(query);
  if (!q) return [];
  const cho = isChoseongQuery(q);
  const taken = new Set(exclude.map(nameKey));
  const starts = [];
  const contains = [];
  for (const item of items) {
    const name = nameKey(item.name);
    if (taken.has(name)) continue;
    const hay = cho ? choseong(name) : name;
    if (hay.startsWith(q)) starts.push(item);
    else if (hay.includes(q)) contains.push(item);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

/** 이름으로 항목 찾기 (대소문자·공백 무시). */
export function findItem(items, name) {
  const n = nameKey(name);
  return items.find((item) => nameKey(item.name) === n) ?? null;
}

// ── 나열형 (TASK-KL-197) ────────────────────────────────────────────────────
// 「하나를 맞힌다」 옆에 「전부 대본다」를 둔다. 다른 놀이지만 **표는 그대로**다 —
// 질문도 정답도 속성표에서 파생한다. 주제를 늘릴 때 코드는 안 고친다는 약속이 여기도 걸린다.

/** 받침이 있나 — 조사를 고르려면 이게 필요하다. 없으면 「불이인」 같은 말이 나온다. */
function hasFinal(text) {
  const last = String(text ?? '').trim().slice(-1);
  const code = last.codePointAt(0) - 0xac00;
  if (code < 0 || code > 11171) return null; // 한글이 아니면 모른다 → 조사를 「(이)」로 둔다
  return code % 28 !== 0;
}

/** 조사 고르기. 한글이 아니면 두 벌 다 적는다 — 틀리게 적느니 어색한 게 낫다. */
function josa(word, withFinal, withoutFinal) {
  const f = hasFinal(word);
  if (f === null) return `${withFinal}(${withoutFinal})`;
  return f ? withFinal : withoutFinal;
}

/**
 * 「전부 대보시오」가 성립하는 크기.
 * 너무 적으면 놀이가 30초에 끝나고, 너무 많으면 끝이 안 보여 아무도 완주를 안 한다.
 */
export const LIST_MIN = 6;
export const LIST_MAX = 45;

/**
 * 표에서 질문을 **파생**한다 — 사람이 매일 손으로 쓰지 않는다.
 *
 * playfootball 은 이 자리에 사람이 쓴 `{question, answers[]}` 를 매일 하나씩 올린다.
 * 우리는 속성표가 이미 있으니 조건 하나가 곧 질문이고, 그 조건을 만족하는 항목이 곧 정답표다.
 * 그래서 새 주제를 넣으면 나열형 판도 **저절로** 생긴다.
 *
 * 답이 갈리지 않게 순서는 항상 같다(필드 순 → 값 순). 날짜는 이 목록 *위에서* 고른다.
 */
function conditionsOf(topic) {
  const out = [];
  for (const field of topic.fields ?? []) {
    const label = field.label;
    const of = (item) => {
      const v = item[field.key];
      return (Array.isArray(v) ? v : [v]).filter((x) => x !== undefined && x !== null && x !== '').map(String);
    };

    if (field.kind === 'category' || field.kind === 'set') {
      const values = [...new Set(topic.items.flatMap(of))].sort();
      for (const value of values) {
        const names = topic.items.filter((i) => of(i).map(norm).includes(norm(value))).map((i) => i.name);
        // 관형형(「…인」)과 연결형(「…이면서」) 두 벌을 여기서 만든다. 나중에 말꼬리를 잘라
        // 붙이면 「있는」→「있으면서」 같은 변형에서 반드시 어긋난다.
        out.push(
          field.kind === 'set'
            ? { id: `${field.key}=${value}`, key: field.key, attr: `${label}에 ${value}${josa(value, '이', '가')} 있는`, conj: `${label}에 ${value}${josa(value, '이', '가')} 있으면서`, names }
            : { id: `${field.key}=${value}`, key: field.key, attr: `${label}${josa(label, '이', '가')} ${value}인`, conj: `${label}${josa(label, '이', '가')} ${value}이면서`, names },
        );
      }
      continue;
    }

    if (field.kind === 'number') {
      /**
       * 숫자라고 다 물어볼 수 있는 게 아니다. **나열형은 분류 축에서만 성립한다.**
       * 「몸무게 550kg 이상인 포켓몬을 전부」는 답이 있어도 사람이 못 댄다 — 아무도 몸무게를
       * 외우고 다니지 않는다. 반대로 세대·진화 단계·성급은 숫자지만 사실상 분류다.
       * 그 둘을 가르는 표식은 **값의 가짓수**다. 적으면 분류, 많으면 정렬 축이라 여기서 뺀다.
       */
      const values = [...new Set(topic.items.map((i) => Number(i[field.key])).filter(Number.isFinite))].sort((a, b) => a - b);
      if (values.length > 12) continue;
      const unit = field.unit ?? '';
      for (const value of values) {
        const names = topic.items.filter((i) => Number(i[field.key]) === value).map((i) => i.name);
        out.push({
          id: `${field.key}=${value}`,
          key: field.key,
          attr: `${label}${josa(label, '이', '가')} ${value}${unit}인`,
          conj: `${label}${josa(label, '이', '가')} ${value}${unit}이면서`,
          names,
        });
      }
    }
  }
  return out;
}

export function listQuestions(topic, { min = LIST_MIN, max = LIST_MAX } = {}) {
  const title = topic.title;
  const conds = conditionsOf(topic);
  const fits = (names) => names.length >= min && names.length <= max && names.length < topic.items.length;

  // 조건 하나로 크기가 맞으면 그게 제일 좋은 질문이다 — 짧고 바로 이해된다.
  const single = conds.filter((c) => fits(c.names)).map((c) => ({ id: c.id, text: `${c.attr} ${title}`, answers: c.names }));
  if (single.length >= 8) return single;

  /**
   * 표가 크면 조건 하나로는 늘 넘친다 — 포켓몬 1025마리에서 「불꽃 타입」은 100마리가 넘는다.
   * 그때 **조건을 교차**한다(「1세대이면서 타입에 불꽃이 있는」). 크기를 줄이는 손잡이이자,
   * 질문이 구체적이라 오히려 더 재밌다. 다른 필드끼리만 겹친다 — 같은 필드 두 값은
   * 대개 교집합이 0이다(색이 빨강이면서 파랑인 것은 없다).
   */
  const pairs = [];
  for (let i = 0; i < conds.length; i += 1) {
    for (let j = i + 1; j < conds.length; j += 1) {
      const a = conds[i];
      const b = conds[j];
      if (a.key === b.key) continue;
      const bset = new Set(b.names.map(norm));
      const names = a.names.filter((n) => bset.has(norm(n)));
      if (!fits(names)) continue;
      pairs.push({ id: `${a.id}&${b.id}`, text: `${a.conj} ${b.attr} ${title}`, answers: names });
    }
  }
  return [...single, ...pairs];
}

/** 나열형 판이 설 수 있는 주제인가 — 실루엣이 그림을 요구하는 것과 같은 자리. */
export function hasListMode(topic) {
  return listQuestions(topic).length >= 8;
}

/** 오늘의 질문. 정답 하나를 고를 때와 같은 순열을 쓴다 — 난수 체계를 새로 만들지 않는다. */
export function listQuestionOf(topic, at = new Date(), questions = listQuestions(topic)) {
  if (questions.length === 0) return null;
  return questions[dailyIndex(topic.id, kstDayNumber(at), questions.length, 'list')];
}

/**
 * 답 한 번의 판정. 이름이 표에 아예 없는 것(unknown)과 표엔 있지만 조건 밖인 것(miss)을 가른다 —
 * 오타를 「틀렸다」로 처리하면 사람은 자기가 뭘 잘못했는지 모른다.
 */
export function listJudge(topic, question, raw, given = []) {
  const item = findItem(topic.items, raw);
  if (!item) return { status: 'unknown', name: String(raw ?? '').trim() };
  const already = given.some((n) => nameKey(n) === nameKey(item.name));
  if (already) return { status: 'dup', name: item.name };
  const hit = question.answers.some((n) => nameKey(n) === nameKey(item.name));
  return { status: hit ? 'hit' : 'miss', name: item.name };
}

/**
 * 희귀도 점수 — **남들이 덜 댄 답일수록 크다.**
 *
 * 왜 이게 있나: 맞았나 틀렸나만 보면 나열형은 「많이 아는 사람이 이긴다」로 끝나고, 한 번 풀면
 * 다시 올 이유가 없다. 남들의 답이 점수에 들어오면 *같은 문제를 다시 봐도* 볼 것이 남는다.
 *
 * `shares` = { 이름: 그 답을 낸 사람 비율(0~1) }. **없으면 null 을 준다** — 그때는 희귀도 없이
 * 개수만 센다. 집계가 붙는 날 자동으로 점수가 살아난다 (서버가 죽어도 놀이는 안 멈춘다).
 *
 * 곡선은 선형이 아니다: 절반이 댄 답과 5%만 댄 답의 차이가 선형이면 체감이 안 난다.
 */
export function listScore(question, given, shares = null) {
  const hits = given.filter((n) => question.answers.some((a) => nameKey(a) === nameKey(n)));
  const rows = hits.map((name) => {
    const share = shares ? shares[Object.keys(shares).find((k) => nameKey(k) === nameKey(name))] : undefined;
    const p = Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : null;
    return { name, share: p, points: p === null ? 10 : Math.round(10 + 190 * (1 - p) ** 2) };
  });
  return {
    rows,
    found: hits.length,
    total: question.answers.length,
    points: rows.reduce((sum, r) => sum + r.points, 0),
    rated: rows.some((r) => r.share !== null),
  };
}

/**
 * 나열형 공유 — 정답 이름은 한 글자도 안 넣는다.
 * 격자는 정답표 순서가 아니라 **찾은 순서**로 그린다 (칸 위치가 정답을 흘리면 안 된다).
 */
export function listShareText({ title, puzzleNo, score, url, seconds }) {
  const bar = `${'🟩'.repeat(Math.min(20, score.found))}${'⬜'.repeat(Math.max(0, Math.min(20, score.total) - Math.min(20, score.found)))}`;
  const head = `${title} 전부대기 #${puzzleNo} ${score.found}/${score.total}`;
  const line = [score.rated ? `${score.points}점` : null, Number.isFinite(seconds) ? `${seconds}초` : null].filter(Boolean).join(' · ');
  return [head, '', bar, ...(line ? [line] : []), ...(url ? ['', url] : [])].join('\n');
}

// ── 격자판 (TASK-KL-199) ────────────────────────────────────────────────────
// 셋째 원형. 속성판은 *하나*를 좁히고, 전부대기는 *전부*를 쏟고, 격자판은 **배치**한다.
// 새로 만들 것은 거의 없다 — 조건과 교차는 전부대기(KL-197)가 이미 만들어 둔다.

/** 한 칸이 성립하려면 답이 이만큼은 있어야 한다. 하나뿐인 칸은 「알거나 모르거나」라 재미가 없다. */
const GRID_MIN_PER_CELL = 2;
/** 반대로 이만큼보다 헐거운 칸은 「아무거나 넣으면 맞는 칸」이라 재미가 죽는다. */
const GRID_MAX_PER_CELL = 25;
/** 축 하나가 가질 값 수 = 격자 한 변. */
export const GRID_SIZE = 3;

/**
 * 오늘의 격자. 못 만들면 null (그런 주제는 판이 안 선다 — 실루엣과 같은 규칙).
 *
 * **축은 서로 다른 필드에서 뽑는다.** 같은 필드의 두 값은 교집합이 대개 0이다
 * (색이 빨강이면서 파랑인 것은 없다). 그래서 「세대 × 타입」처럼 갈래가 다른 둘을 건다.
 *
 * 아홉 칸이 **전부** 답을 가져야 한다. 한 칸이라도 비면 그 판은 못 깬다 —
 * 만들 때 확인하지 않으면 그 사실을 푸는 사람이 발견하게 된다.
 */
export function gridPuzzleOf(topic, at = new Date(), { attempts = 400 } = {}) {
  const conds = conditionsOf(topic);
  const byField = new Map();
  for (const c of conds) {
    if (!byField.has(c.key)) byField.set(c.key, []);
    byField.get(c.key).push(c);
  }
  const usable = [...byField.entries()].filter(([, list]) => list.length >= GRID_SIZE).sort((a, b) => a[0].localeCompare(b[0]));
  if (usable.length === 0) return null;

  const rand = mulberry32(hash32(`${topic.id}:grid:${kstDayNumber(at)}`));
  /**
   * 후보는 **큰 조건부터** 본다. 작은 조건끼리 걸면 아홉 칸 중 하나는 거의 반드시 비고,
   * 그러면 아무리 뒤져도 판이 안 선다 (롤이 그랬다 — 자원 12가지 중 대부분이 소수라
   * 무작위로 뽑으면 400번을 뒤져도 못 세웠다). 큰 것 여덟 안에서만 고른다.
   */
  const WIDE = 8;
  const widest = (list) => [...list].sort((a, b) => b.names.length - a.names.length).slice(0, WIDE);
  const pick = (list, n) => {
    const pool = [...list];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, n);
  };

  for (let n = 0; n < attempts; n += 1) {
    /**
     * 축 둘. **여러 값을 갖는 속성(set)은 자기 자신과도 걸 수 있다** — 「역할에 서포터가
     * 있으면서 원거리 딜러이기도 한」은 성립한다. 이걸 막으면 롤처럼 쓸 만한 속성이
     * 하나뿐인 주제는 판이 아예 안 선다.
     */
    const [fa, fbMaybe] = pick(usable, 2);
    const selfPair = topic.fields.find((f) => f.key === fa[0])?.kind === 'set' && rand() < 0.5;
    const fb = selfPair || !fbMaybe ? fa : fbMaybe;
    const rows = pick(widest(fa[1]), GRID_SIZE);
    // 같은 속성을 두 축에 걸 때는 값이 겹치면 안 된다 — 「불꽃이면서 불꽃」은 조건이 아니다.
    const colPool = widest(fb[1]).filter((c) => !rows.some((r) => r.id === c.id));
    if (colPool.length < GRID_SIZE) continue;
    const cols = pick(colPool, GRID_SIZE);
    const cells = rows.map((r) => {
      const rowSet = new Set(r.names.map(norm));
      return cols.map((c) => c.names.filter((x) => rowSet.has(norm(x))));
    });
    // 칸이 너무 넉넉하면(70마리 중 아무거나) 배치하는 재미가 없다. 좁은 판을 먼저 찾고,
    // 끝까지 못 찾으면 그때 넉넉한 판이라도 세운다 — 판이 아예 없는 것보다는 낫다.
    const tight = n < attempts / 2 ? GRID_MAX_PER_CELL : Infinity;
    if (cells.every((row) => row.every((names) => names.length >= GRID_MIN_PER_CELL && names.length <= tight))) {
      return {
        id: `${rows.map((r) => r.id).join(',')}|${cols.map((c) => c.id).join(',')}`,
        rows: rows.map((r) => ({ id: r.id, label: r.attr })),
        cols: cols.map((c) => ({ id: c.id, label: c.attr })),
        cells,
      };
    }
  }
  return null;
}

/** 격자판이 설 수 있는 주제인가. 하루치가 아니라 **여러 날**을 봐야 한다 — 오늘만 되는 판은 판이 아니다. */
export function hasGridMode(topic) {
  const day = kstDayNumber();
  for (const offset of [0, 1, 2, 3, 7]) {
    if (!gridPuzzleOf(topic, new Date((day + offset) * 86400000))) return false;
  }
  return true;
}

/**
 * 칸 하나의 판정. `hit` | `miss`(표엔 있지만 그 칸이 아님) | `unknown`(표에 없음) | `used`(다른 칸에서 이미 씀).
 *
 * **한 항목은 한 칸에만.** 안 그러면 두 조건을 다 만족하는 이름 하나로 여러 칸을 메울 수 있고,
 * 그러면 아는 것을 배치하는 놀이가 아니라 이름 하나 아는 놀이가 된다.
 */
export function gridJudge(topic, puzzle, row, col, raw, used = []) {
  const item = findItem(topic.items, raw);
  if (!item) return { status: 'unknown', name: String(raw ?? '').trim() };
  if (used.some((n) => nameKey(n) === nameKey(item.name))) return { status: 'used', name: item.name };
  const cell = puzzle.cells[row]?.[col] ?? [];
  return { status: cell.some((n) => nameKey(n) === nameKey(item.name)) ? 'hit' : 'miss', name: item.name };
}

/** 칸의 질문 id — 희귀도 집계(KL-197)를 그대로 탄다. 새 원장을 만들지 않는다. */
export function gridCellQuestionId(puzzle, row, col) {
  return `${puzzle.rows[row].id}&${puzzle.cols[col].id}`;
}

/** 격자 공유 — 채운 칸만 초록. 이름은 한 글자도 안 나간다. */
export function gridShareText({ title, puzzleNo, filled, url, tries, maxTries }) {
  const grid = filled.map((row) => row.map((ok) => (ok ? '🟩' : '⬜')).join('')).join('\n');
  const count = filled.flat().filter(Boolean).length;
  return [`${title} 격자판 #${puzzleNo} ${count}/9 (${tries}/${maxTries}수)`, '', grid, ...(url ? ['', url] : [])].join('\n');
}
