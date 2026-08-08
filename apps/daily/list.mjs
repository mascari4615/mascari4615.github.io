/**
 * 전부대기 — 브라우저 껍데기 (TASK-KL-197).
 *
 * 「하나를 맞힌다」(app.mjs) 옆에 「조건에 드는 것을 전부 대본다」를 둔다.
 * 규칙은 전부 engine.mjs 에 있다. 여기는 화면과 저장만 한다.
 *
 * 왜 파일이 따로인가: 판이 다르면 화면이 다르다. app.mjs 는 추측 한 줄씩 표를 쌓는 물건이고
 * 여기는 90초 동안 답을 쏟아 넣는 물건이다. 한 파일에 모드 세 개를 두면 그 안에서 갈린다.
 */
import {
  kstDayKey,
  kstDayNumber,
  listJudge,
  listQuestionOf,
  listScore,
  listShareText,
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

/** 한 판의 길이. 짧으면 아는 것도 못 적고, 길면 지루하다. */
const SECONDS = 90;

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
const question = listQuestionOf(topic, at);
if (!question) {
  fatal('이 주제로는 전부대기 판이 서지 않아요.');
  throw new Error('no question');
}

const puzzleNo = puzzleNumber(at);
const dayKey = kstDayKey(at);
const dayNumber = kstDayNumber();
const storeKey = practice ? `daily:${topicId}:list:p:${dayKey}` : `daily:${topicId}:list`;
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
const state = saved && saved.day === dayKey && saved.q === question.id
  ? saved
  : { day: dayKey, q: question.id, given: [], left: SECONDS, status: 'ready' };
let streak = read(streakKey, null);

const $q = root.querySelector('.question');
const $input = root.querySelector('input');
const $sug = root.querySelector('.sug');
const $found = root.querySelector('.found');
const $bar = root.querySelector('.bar span');
const $tally = root.querySelector('.tally-live');
const $clock = root.querySelector('.clock');
const $done = root.querySelector('.done');
const $say = root.querySelector('.say');
const $streak = root.querySelector('.streak');

$q.textContent = `${question.text}을(를) 전부 대보세요`;
if ($streak) $streak.innerHTML = liveStreak(streak ?? {}, dayNumber) > 0 ? `🔥 <b>${liveStreak(streak ?? {}, dayNumber)}</b>일 연속` : esc(streakLine(streak, dayNumber));

root.querySelector('.no').textContent = `#${puzzleNo}`;
if (practice) {
  // 판을 바꿔도 날이 안 바뀌어야 한다 — 지난 날을 풀다 「속성」을 누른 순간 오늘 판으로 튕기면
  // 본인은 왜 문제가 달라졌는지 모른다 (app.mjs 와 같은 규칙).
  root.querySelector('.tabs')?.insertAdjacentHTML('afterbegin', `<span class="tab practice">연습 · ${dayKey}</span>`);
  root.querySelector('.lede').textContent = `${dayKey} 의 문제입니다. 연습이라 기록에는 안 들어갑니다.`;
  for (const a of root.querySelectorAll('.tabs a.tab')) a.href = `${a.getAttribute('href')}?d=${dayKey}`;
}

// 연습으로 못 여는 날이면 왜인지 말한다 — 조용히 오늘 판을 열면 본인은 끝까지 모른다.
const why = whyNoPractice(askedDay);
if (why) {
  const said = { bad: '날짜를 못 읽었어요', today: '오늘 문제는 아래에서 바로 풀 수 있어요', future: '아직 안 나온 날이에요', before: '첫 문제 이전이에요' }[why];
  root.querySelector('.lede')?.insertAdjacentElement('afterend', el(`<p class="warn">${esc(said)} — 오늘 판을 엽니다.</p>`));
}

/**
 * 군중의 답 — 어제까지 이 문제에 사람들이 무엇을 냈는가.
 *
 * **없으면 없는 대로 논다.** 서버가 죽었든 아직 아무도 안 풀었든, 점수는 개수로 매겨지고
 * 집계가 붙는 순간 희귀도가 살아난다. 놀이의 생사를 노트북 한 대에 걸지 않는다.
 */
const API = 'https://yawnbot.mascari4615.com';
let shares = null;
fetch(`${API}/api/daily-list/shares?topic=${encodeURIComponent(topicId)}&q=${encodeURIComponent(question.id)}`, { signal: AbortSignal.timeout(4000) })
  .then((r) => (r.ok ? r.json() : null))
  .then((j) => {
    if (j?.shares && typeof j.shares === 'object') shares = j.shares;
  })
  .catch(() => {});

function report() {
  if (practice || !state.given.length) return; // 연습은 남의 통계를 흔들지 않는다
  fetch(`${API}/api/daily-list/answers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topic: topicId, q: question.id, day: dayKey, names: state.given }),
    signal: AbortSignal.timeout(4000),
  }).catch(() => {});
}

function paint() {
  const score = listScore(question, state.given, shares);
  $bar.style.width = `${Math.round((score.found / score.total) * 100)}%`;
  $tally.textContent = `${score.found} / ${score.total}${score.rated ? ` · ${score.points}점` : ''}`;
  $found.replaceChildren(
    ...state.given.map((name) => {
      const hit = question.answers.some((a) => a === name);
      const row = score.rows.find((r) => r.name === name);
      const share = row && row.share !== null ? `<i>${Math.round(row.share * 100)}%</i>` : '';
      return el(`<span class="chip ${hit ? 'hit' : 'off'}">${esc(name)}${hit ? share : ''}</span>`);
    }),
  );
  write(storeKey, state);
}

let timer = null;
function tick() {
  state.left -= 1;
  $clock.textContent = `${Math.max(0, state.left)}초`;
  $clock.classList.toggle('urgent', state.left <= 10);
  if (state.left <= 0) finish();
  else write(storeKey, state);
}

function start() {
  // 새로고침으로 돌아온 사람도 여기로 들어온다 — 시계가 이미 돌고 있으면 두 번 걸지 않는다.
  if (ended || timer) return;
  state.status = 'playing';
  $clock.hidden = false;
  timer = setInterval(tick, 1000);
  countEvent(`daily/${topicId}/전부대기/시작`);
}

function say(text, kind) {
  $say.textContent = text;
  $say.className = `say ${kind}`;
}

function submit(raw) {
  if (ended) return;
  start();
  const v = listJudge(topic, question, raw, state.given);
  if (v.status === 'unknown') return say(`「${v.name}」 는 표에 없어요 — 이름을 확인해 주세요`, 'off');
  if (v.status === 'dup') return say(`「${v.name}」 는 이미 냈어요`, 'off');
  state.given.push(v.name);
  say(v.status === 'hit' ? `⭕ ${v.name}` : `❌ ${v.name} — 조건 밖`, v.status === 'hit' ? 'hit' : 'off');
  $input.value = '';
  $sug.replaceChildren();
  paint();
  if (question.answers.every((a) => state.given.includes(a))) finish();
}

/**
 * 끝을 두 번 그리지 않게 막는 표식. **저장된 상태(`status`)로 막으면 안 된다** —
 * 새로고침해서 돌아온 사람은 이미 `done` 인 채로 들어오므로, 그걸로 막으면 결과 화면이
 * 아예 안 그려진다 (90초짜리 판에서 진행이 증발한 것처럼 보인다).
 */
let ended = false;
function finish() {
  if (ended) return;
  ended = true;
  state.status = 'done';
  clearInterval(timer);
  $clock.hidden = true;
  root.querySelector('.guessbar').hidden = true;
  const seconds = SECONDS - Math.max(0, state.left);
  const score = listScore(question, state.given, shares);
  if (!practice) {
    streak = touchDay(streak, dayNumber);
    write(streakKey, streak);
  }
  write(storeKey, state);
  report();

  const live = liveStreak(streak ?? {}, dayNumber);
  const text = listShareText({
    title: `${root.querySelector('.top h1').textContent.trim()}${practice ? ` ${dayKey}` : ''}`,
    puzzleNo,
    score,
    seconds,
    url: location.origin + location.pathname + location.search,
  });

  const missed = question.answers.filter((a) => !state.given.includes(a));
  $done.hidden = false;
  $done.replaceChildren(
    el(`<h2>${score.found} / ${score.total} 찾았다</h2>`),
    // 연속 표기는 다른 판과 **같은 말**로 적는다 — 여기만 다르게 적으면 같은 사이트로 안 읽힌다.
    el(`<div class="tally">${esc(question.text)} · ${seconds}초${score.rated ? ` · ${score.points}점` : ''} · 연속 ${live}일 (최고 ${streak?.best ?? live}일)</div>`),
    el(`<div class="missed"><b>놓친 것 ${missed.length}개</b><div>${missed.map((n) => `<span class="chip">${esc(n)}</span>`).join('')}</div></div>`),
  );

  const canShare = typeof navigator.share === 'function';
  const btn = el(`<button class="btn" type="button">${canShare ? '결과 공유하기' : '결과 복사하기'}</button>`);
  btn.addEventListener('click', async () => {
    if (canShare) {
      try {
        await navigator.share({ text });
        countEvent(`daily/${topicId}/전부대기/공유`);
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = '복사됐어요';
      countEvent(`daily/${topicId}/전부대기/복사`);
    } catch {
      btn.textContent = '복사가 막혔어요';
    }
  });
  $done.append(btn);

  /**
   * 끝낸 사람을 그냥 보내지 않는다 — 오늘 아직 안 푼 판을 건넨다.
   * 이미 끝낸 판은 안 건넨다(다 푼 것을 또 누르게 하는 게 이 자리의 가장 흔한 낭비다).
   * 가까운 것부터: 같은 주제의 다른 판 → 나머지. 셋만 — 여섯을 쏟으면 아무것도 안 고른다.
   */
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
    for (const a of $done.querySelectorAll('.more a')) {
      const href = a.getAttribute('href');
      const kind = a.classList.contains('more-all') ? '전체' : href.includes(`/${topicId}/`) ? '같은주제' : '다른주제';
      a.addEventListener('pointerdown', () => countEvent(`daily/${topicId}/전부대기/다음판/${kind}`));
    }
  }
  countEvent(`daily/${topicId}/전부대기/끝/${score.found}`);
}

// ── 입력 ────────────────────────────────────────────────────────────────────
let picked = -1;
function paintSug(list) {
  $sug.replaceChildren(
    ...list.map((item, i) =>
      el(`<button type="button" role="option" data-name="${esc(item.name)}" aria-selected="${i === picked}">${esc(item.name)}</button>`),
    ),
  );
}
$input.addEventListener('input', () => {
  picked = -1;
  paintSug(suggest(topic.items, $input.value, { limit: 6, exclude: state.given }));
});
$input.addEventListener('keydown', (e) => {
  const list = [...$sug.children];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    picked = Math.max(0, Math.min(list.length - 1, picked + (e.key === 'ArrowDown' ? 1 : -1)));
    list.forEach((b, i) => b.setAttribute('aria-selected', String(i === picked)));
    return;
  }
  if (e.key !== 'Enter') return;
  e.preventDefault();
  // 고른 것이 있으면 그것, 없으면 친 그대로 — 이름을 다 아는 사람이 목록을 거치게 하면 느리다.
  submit(picked >= 0 && list[picked] ? list[picked].dataset.name : $input.value);
});
$sug.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) submit(b.dataset.name);
});
root.querySelector('.giveup')?.addEventListener('click', () => finish());

$clock.textContent = `${state.left}초`;
paint();
if (state.status === 'done') finish();
else if (state.status === 'playing') start();
countPage(`daily/${topicId}/전부대기`);
