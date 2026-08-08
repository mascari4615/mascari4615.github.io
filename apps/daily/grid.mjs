/**
 * 격자판 — 브라우저 껍데기 (TASK-KL-199).
 *
 * 셋째 원형. 속성판은 *하나*를 좁히고, 전부대기는 *전부*를 쏟고, 여기는 **배치**한다.
 * 규칙은 전부 engine.mjs 에 있다. 이 파일은 화면과 저장만 한다.
 */
import {
  GRID_SIZE,
  gridCellQuestionId,
  gridJudge,
  gridPuzzleOf,
  gridShareText,
  kstDayKey,
  kstDayNumber,
  liveStreak,
  practiceDate,
  puzzleNumber,
  streakLine,
  suggest,
  touchDay,
  whyNoPractice,
} from './engine.mjs';
import { countPage, countEvent } from './count.mjs';

const root = document.getElementById('app');
const topicId = root.dataset.topic;
const stamp = root.dataset.stamp || '';
const others = JSON.parse(root.dataset.others || '[]');

/** 아홉 칸에 아홉 수. 한 칸당 한 번뿐이라 「아무거나 넣어 보기」가 안 된다. */
const MAX_TRIES = 9;

const el = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function fatal(message) {
  root.querySelector('.guessbar')?.setAttribute('hidden', '');
  const box = el(`<div class="done"><h2>문제를 못 불러왔어요</h2><div class="tally">${esc(message)}</div></div>`);
  const retry = el('<button class="btn" type="button">다시 시도</button>');
  retry.addEventListener('click', () => location.reload());
  box.append(retry);
  root.querySelector('.done')?.replaceWith(box);
}

let topic;
try {
  const res = await fetch(`${root.dataset.data}?v=${stamp}`);
  if (!res.ok) throw new Error(`표를 못 받았어요 (${res.status})`);
  topic = await res.json();
} catch (err) {
  fatal(`${err.message}. 인터넷이 끊겼거나 잠깐 말썽일 수 있어요.`);
  throw err;
}

const askedDay = new URLSearchParams(location.search).get('d');
const practice = practiceDate(askedDay);
const at = practice ?? new Date();
const puzzle = gridPuzzleOf(topic, at);
if (!puzzle) {
  fatal('이 주제로는 격자판이 서지 않아요.');
  throw new Error('no grid');
}

const puzzleNo = puzzleNumber(at);
const dayKey = kstDayKey(at);
const dayNumber = kstDayNumber();
const storeKey = practice ? `daily:${topicId}:grid:p:${dayKey}` : `daily:${topicId}:grid`;
const streakKey = 'daily:streak';

const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* 사생활 모드 — 놀이는 그대로 돈다 */ }
};

const saved = read(storeKey, null);
/** `filled[r][c]` = 그 칸에 넣은 이름(없으면 null). 격자 모양이 바뀌면 처음부터. */
const state =
  saved && saved.day === dayKey && saved.id === puzzle.id
    ? saved
    : { day: dayKey, id: puzzle.id, filled: [[null, null, null], [null, null, null], [null, null, null]], tries: 0, status: 'playing' };

let streak = read(streakKey, null);

const $board = root.querySelector('.grid-board');
const $input = root.querySelector('input');
const $sug = root.querySelector('.sug');
const $left = root.querySelector('.left');
const $say = root.querySelector('.say');
const $done = root.querySelector('.done');
const $streak = root.querySelector('.streak');

root.querySelector('.no').textContent = `#${puzzleNo}`;
if ($streak) {
  const live = liveStreak(streak ?? {}, dayNumber);
  $streak.innerHTML = live > 0 ? `🔥 <b>${live}</b>일 연속` : esc(streakLine(streak, dayNumber));
}
if (practice) {
  root.querySelector('.tabs')?.insertAdjacentHTML('afterbegin', `<span class="tab practice">연습 · ${dayKey}</span>`);
  root.querySelector('.lede').textContent = `${dayKey} 의 문제입니다. 연습이라 기록에는 안 들어갑니다.`;
  for (const a of root.querySelectorAll('.tabs a.tab')) a.href = `${a.getAttribute('href')}?d=${dayKey}`;
}
const why = whyNoPractice(askedDay);
if (why) {
  const said = { bad: '날짜를 못 읽었어요', today: '오늘 문제는 아래에서 바로 풀 수 있어요', future: '아직 안 나온 날이에요', before: '첫 문제 이전이에요' }[why];
  root.querySelector('.lede')?.insertAdjacentElement('afterend', el(`<p class="warn">${esc(said)} — 오늘 판을 엽니다.</p>`));
}

/** 희귀도 — 칸의 두 조건이 곧 질문 id 라 KL-197 집계를 그대로 탄다(새 원장 X). */
const API = 'https://yawnbot.mascari4615.com';
const shares = new Map();
function loadShares(row, col) {
  const q = gridCellQuestionId(puzzle, row, col);
  if (shares.has(q)) return;
  shares.set(q, null);
  fetch(`${API}/kl/daily-list/shares?topic=${encodeURIComponent(topicId)}&q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(4000) })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (j?.shares) {
        shares.set(q, j.shares);
        paint();
      }
    })
    .catch(() => {});
}

/** 한 칸이 채워지면 그 칸의 답을 집계로 보낸다 — 다음 사람의 희귀도가 여기서 생긴다. */
function report(row, col, name) {
  if (practice) return;
  fetch(`${API}/kl/daily-list/answers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topic: topicId, q: gridCellQuestionId(puzzle, row, col), day: dayKey, names: [name] }),
    signal: AbortSignal.timeout(4000),
  }).catch(() => {});
}

let picked = { row: 0, col: 0 };

function paint() {
  const axes = `${esc(puzzle.rows[0].field ?? '')} × ${esc(puzzle.cols[0].field ?? '')}`;
  const head = `<tr><td class="corner">${axes}</td>${puzzle.cols.map((c) => `<th scope="col" title="${esc(c.label)}">${esc(c.short ?? c.label)}</th>`).join('')}</tr>`;
  const rows = puzzle.rows
    .map((r, ri) => {
      const cells = puzzle.cols
        .map((c, ci) => {
          const name = state.filled[ri][ci];
          const q = gridCellQuestionId(puzzle, ri, ci);
          const share = name ? shares.get(q)?.[name] : undefined;
          const rare = Number.isFinite(share) ? `<i>${Math.round(share * 100)}%</i>` : '';
          const on = picked.row === ri && picked.col === ci && state.status === 'playing';
          return `<td><button type="button" class="gcell${name ? ' on' : ''}${on ? ' picked' : ''}" data-r="${ri}" data-c="${ci}"
            aria-label="${esc(r.label)} ${esc(c.label)} 칸${name ? `, ${esc(name)}` : ', 비어 있음'}">${name ? `${esc(name)}${rare}` : '+'}</button></td>`;
        })
        .join('');
      return `<tr><th scope="row" title="${esc(r.label)}">${esc(r.short ?? r.label)}</th>${cells}</tr>`;
    })
    .join('');
  $board.innerHTML = `<table class="grid-table">${head}${rows}</table>`;
  const done = state.filled.flat().filter(Boolean).length;
  $left.textContent =
    state.status === 'playing'
      ? `${done}칸 채움 · ${MAX_TRIES - state.tries}수 남음`
      : `${done}칸 · ${state.tries}수`;
  write(storeKey, state);
}

function say(text, kind) {
  $say.textContent = text;
  $say.className = `say ${kind}`;
}

function submit(raw) {
  if (state.status !== 'playing') return;
  const { row, col } = picked;
  if (state.filled[row][col]) return say('이미 채운 칸이에요 — 빈 칸을 고르세요', 'off');
  const used = state.filled.flat().filter(Boolean);
  const v = gridJudge(topic, puzzle, row, col, raw, used);
  if (v.status === 'unknown') return say(`「${v.name}」 는 표에 없어요 — 이름을 확인해 주세요`, 'off');
  if (v.status === 'used') return say(`「${v.name}」 는 다른 칸에 이미 썼어요 — 한 항목은 한 칸만`, 'off');

  state.tries += 1;
  $input.value = '';
  $sug.replaceChildren();
  if (v.status === 'hit') {
    state.filled[row][col] = v.name;
    say(`⭕ ${v.name}`, 'hit');
    report(row, col, v.name);
    // 다음 빈 칸으로 저절로 옮겨 준다 — 아홉 번 손으로 고르게 하면 그게 일이 된다.
    const next = nextEmpty(row, col);
    if (next) picked = next;
  } else {
    say(`❌ ${v.name} — 이 칸 조건이 아니에요 (한 수 씀)`, 'off');
  }
  paint();
  if (state.tries >= MAX_TRIES || state.filled.flat().every(Boolean)) finish();
}

function nextEmpty(row, col) {
  for (let n = 1; n <= GRID_SIZE * GRID_SIZE; n += 1) {
    const i = (row * GRID_SIZE + col + n) % (GRID_SIZE * GRID_SIZE);
    const r = Math.floor(i / GRID_SIZE);
    const c = i % GRID_SIZE;
    if (!state.filled[r][c]) return { row: r, col: c };
  }
  return null;
}

let ended = false;
function finish() {
  if (ended) return;
  ended = true;
  state.status = 'done';
  root.querySelector('.guessbar').hidden = true;
  const filled = state.filled.map((row) => row.map(Boolean));
  const count = filled.flat().filter(Boolean).length;
  if (!practice) {
    streak = touchDay(streak, dayNumber);
    write(streakKey, streak);
  }
  paint();

  const live = liveStreak(streak ?? {}, dayNumber);
  const text = gridShareText({
    title: `${root.querySelector('.top h1').textContent.trim()}${practice ? ` ${dayKey}` : ''}`,
    puzzleNo,
    filled,
    tries: state.tries,
    maxTries: MAX_TRIES,
    url: location.origin + location.pathname + location.search,
  });

  $done.hidden = false;
  $done.replaceChildren(
    el(`<h2>${count === 9 ? '아홉 칸 다 채웠다' : `${count} / 9 채웠다`}</h2>`),
    el(`<div class="tally">${state.tries}수 · 연속 ${live}일 (최고 ${streak?.best ?? live}일)</div>`),
  );

  // 못 채운 칸은 **답 하나만** 보여 준다. 전부 쏟으면 내일 같은 축이 나왔을 때 재미가 죽는다.
  const misses = [];
  for (let r = 0; r < GRID_SIZE; r += 1) {
    for (let c = 0; c < GRID_SIZE; c += 1) {
      if (!state.filled[r][c]) misses.push(`${puzzle.rows[r].label} × ${puzzle.cols[c].label} → ${puzzle.cells[r][c][0]}`);
    }
  }
  if (misses.length) {
    $done.append(el(`<div class="missed"><b>못 채운 칸 ${misses.length}개 (답 하나씩)</b><div>${misses.map((m) => `<span class="chip">${esc(m)}</span>`).join('')}</div></div>`));
  }

  const canShare = typeof navigator.share === 'function';
  const btn = el(`<button class="btn" type="button">${canShare ? '결과 공유하기' : '결과 복사하기'}</button>`);
  btn.addEventListener('click', async () => {
    if (canShare) {
      try {
        await navigator.share({ text });
        countEvent(`daily/${topicId}/격자판/공유`);
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = '복사됐어요';
      countEvent(`daily/${topicId}/격자판/복사`);
    } catch {
      btn.textContent = '복사가 막혔어요';
    }
  });
  $done.append(btn);

  const open = others.filter((o) => {
    const s = read(`daily:${o.topic}:${o.mode}`, null);
    return !(s && s.day === dayKey && s.status !== 'playing');
  });
  const todo = [...open.filter((o) => o.topic === topicId), ...open.filter((o) => o.topic !== topicId)].slice(0, 3);
  if (todo.length) {
    $done.append(
      el(
        `<div class="more"><span>${open.length > todo.length ? '이어서 한 판 더' : '오늘 아직 안 푼 판'}</span>${todo
          .map((o) => `<a href="${esc(o.href)}">${esc(o.emoji ?? '🎯')} ${esc(o.label)}</a>`)
          .join('')}${open.length > todo.length ? '<a class="more-all" href="/daily/">전체 보기</a>' : ''}</div>`,
      ),
    );
  }
  countEvent(`daily/${topicId}/격자판/끝/${count}`);
}

// ── 입력 ────────────────────────────────────────────────────────────────────
$board.addEventListener('click', (e) => {
  const b = e.target.closest('.gcell');
  if (!b || state.status !== 'playing') return;
  picked = { row: Number(b.dataset.r), col: Number(b.dataset.c) };
  paint();
  $input.focus();
});

let hi = -1;
$input.addEventListener('input', () => {
  hi = -1;
  const list = suggest(topic.items, $input.value, { limit: 6, exclude: state.filled.flat().filter(Boolean) });
  $sug.replaceChildren(
    ...list.map((item, i) =>
      el(`<button type="button" role="option" data-name="${esc(item.name)}" aria-selected="${i === hi}">${esc(item.name)}</button>`),
    ),
  );
});
$input.addEventListener('keydown', (e) => {
  const list = [...$sug.children];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    hi = Math.max(0, Math.min(list.length - 1, hi + (e.key === 'ArrowDown' ? 1 : -1)));
    list.forEach((b, i) => b.setAttribute('aria-selected', String(i === hi)));
    return;
  }
  if (e.key !== 'Enter') return;
  e.preventDefault();
  submit(hi >= 0 && list[hi] ? list[hi].dataset.name : $input.value);
});
$sug.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) submit(b.dataset.name);
});
root.querySelector('.giveup')?.addEventListener('click', () => finish());

for (let r = 0; r < GRID_SIZE; r += 1) for (let c = 0; c < GRID_SIZE; c += 1) loadShares(r, c);
picked = nextEmpty(2, 2) ?? { row: 0, col: 0 };
paint();
if (state.status === 'done') finish();
countPage(`daily/${topicId}/격자판`);
