/**
 * 오늘의 하나 맞히기 — 브라우저 껍데기 (TASK-KAR-202).
 * 규칙은 전부 engine.mjs 에 있다. 여기는 화면과 저장만 한다.
 *
 * 모드는 둘이다. 속성(classic) 은 표를 보여 주며 좁히고, 실루엣(silhouette) 은
 * 까맣게 칠한 그림이 틀릴 때마다 조금씩 밝아진다. 정답은 모드마다 다르다 —
 * 같은 주제라도 하루에 두 판이 되는 이유다.
 */
import {
  answerOf,
  compareItem,
  emptyStats,
  findItem,
  isWin,
  kstDayKey,
  kstDayNumber,
  liveStreak,
  touchDay,
  puzzleNumber,
  shareRow,
  shareText,
  suggest,
  updateStats,
} from './engine.mjs';

const root = document.getElementById('app');
const topicId = root.dataset.topic;
const mode = root.dataset.mode || 'classic';
const stamp = root.dataset.stamp || '';
const others = JSON.parse(root.dataset.others || '[]');

/**
 * 표를 못 받으면 지금까지는 **아무 말 없는 빈 화면**이 됐다. 낯선 사람은 그걸 「고장난 사이트」로
 * 읽고 그냥 닫는다. 무슨 일이 났는지 말하고 다시 시도할 길을 준다.
 */
function fatal(message) {
  root.querySelector('.rows')?.replaceChildren();
  root.querySelector('.guessbar')?.setAttribute('hidden', '');
  const box = document.createElement('div');
  box.className = 'done';
  box.innerHTML = `<h2>문제를 못 불러왔어요</h2><div class="tally">${message}</div>`;
  const retry = document.createElement('button');
  retry.className = 'btn';
  retry.type = 'button';
  retry.textContent = '다시 시도';
  retry.addEventListener('click', () => location.reload());
  box.append(retry);
  root.querySelector('.done')?.replaceWith(box);
}

// 표 주소는 페이지가 알려 준다 — 속성판(/daily/<주제>/)과 실루엣판(/daily/<주제>/silhouette/)의 깊이가 다르다.
let topic;
try {
  const res = await fetch(`${root.dataset.data}?v=${stamp}`);
  if (!res.ok) throw new Error(`서버가 ${res.status} 로 답했어요`);
  topic = await res.json();
  if (!topic?.items?.length) throw new Error('표가 비어 있어요');
} catch (err) {
  fatal(`${err.message}. 인터넷이 끊겼거나 잠깐 말썽일 수 있어요.`);
  throw err;
}
const answer = answerOf(topic, new Date(), mode === 'classic' ? '' : mode);
const maxGuesses = mode === 'silhouette' ? 6 : topic.maxGuesses ?? 8;
const puzzleNo = puzzleNumber();
const dayKey = kstDayKey();
const dayNumber = kstDayNumber();
const storeKey = `daily:${topicId}:${mode}`;
const statsKey = `daily:${topicId}:${mode}:stats`;
// 연속은 판별이 아니라 **사이트 전체** 하루 단위다 — 판이 늘어도 끊기지 않는다.
const streakKey = 'daily:streak';

const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 사생활 모드 */ }
};

/** 저장은 오늘 것만 의미가 있다 — 날이 바뀌면 통째로 버린다. */
const saved = read(storeKey, null);
const state = saved && saved.day === dayKey ? saved : { day: dayKey, guesses: [], status: 'playing' };
let stats = read(statsKey, emptyStats());
let streak = read(streakKey, null);

const el = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (v) => (Array.isArray(v) ? v.join('·') : typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(1)) : v);

const $rows = root.querySelector('.rows');
const $input = root.querySelector('input');
const $sug = root.querySelector('.sug');
const $left = root.querySelector('.left');
const $done = root.querySelector('.done');
const $streak = root.querySelector('.streak');
const $shot = root.querySelector('.shot');

root.querySelector('.no').textContent = `#${puzzleNo}`;

function renderStreak() {
  const live = liveStreak(streak ?? {}, dayNumber);
  $streak.innerHTML = live > 0 ? `🔥 <b>${live}</b>일 연속` : '';
}

// ── 실루엣: 틀릴수록 밝아진다 ──────────────────────────────────────────────
function paintShot() {
  if (!$shot) return;
  const done = state.status !== 'playing';
  const left = Math.max(0, maxGuesses - state.guesses.length);
  const step = done ? 0 : left / maxGuesses;
  const img = $shot.querySelector('img');
  img.style.filter = done ? 'none' : `brightness(${(1 - step) * 0.85}) blur(${step * 7}px) contrast(${1 + step})`;
}

/**
 * 실루엣 판은 **그림이 전부**다. 그림이 아직 안 왔거나 끝내 못 오면, 지금까지는
 * 까만 상자만 남아 「원래 이런 놀이인가?」와 구분이 안 됐다 — 못 푸는 판인 줄도 모른다.
 * 오는 중이면 오는 중이라 말하고, 못 오면 못 온다고 말한다.
 */
function watchShot() {
  if (!$shot) return;
  const img = $shot.querySelector('img');
  const say = (text, bad = false) => {
    let note = $shot.querySelector('.shot-note');
    if (!note) {
      note = document.createElement('div');
      note.className = 'shot-note';
      $shot.append(note);
    }
    note.textContent = text;
    note.classList.toggle('bad', bad);
  };
  const clear = () => $shot.querySelector('.shot-note')?.remove();

  if (img.complete && img.naturalWidth > 0) return;
  say('그림 받는 중…');
  img.addEventListener('load', clear, { once: true });
  img.addEventListener(
    'error',
    () => {
      say('그림을 못 받았어요 — 이 판은 그림이 있어야 풀려요. 새로고침해 보세요.', true);
      $shot.classList.add('broken');
    },
    { once: true },
  );
}

function markOf(field, cell) {
  if (cell.state === 'exact') return '';
  if (field.kind === 'number') return cell.dir === 'up' ? '▲' : '▼';
  return cell.state === 'near' ? '≈' : '';
}

function renderRow(guess) {
  const cells = compareItem(topic, guess, answer);
  const img = guess.img ? `<img src="${esc(guess.img)}" alt="" loading="lazy">` : '';

  if (mode === 'silhouette') {
    // 속성은 안 보여 준다 — 그림만 보고 맞히는 게 이 모드의 전부다.
    const hit = guess.name === answer.name;
    $rows.prepend(
      el(`<div class="row solo ${hit ? 'ok' : 'no'}"><div class="who">${img}<span>${esc(guess.name)}</span></div><span class="verdict">${hit ? '정답' : '아님'}</span></div>`),
    );
    return cells;
  }

  const html = topic.fields
    .map((field, i) => {
      const cell = cells[i];
      const unit = field.unit && typeof cell.value === 'number' ? field.unit : '';
      return `<div class="cell ${cell.state}"><span class="k">${esc(field.label)}</span><span class="v">${esc(fmt(cell.value))}${unit}<span class="mark">${markOf(field, cell)}</span></span></div>`;
    })
    .join('');
  $rows.prepend(
    el(`<div class="row"><div class="who">${img}<span>${esc(guess.name)}</span></div><div class="cells" style="--cols:${topic.fields.length}">${html}</div></div>`),
  );
  return cells;
}

function untilNextKst() {
  const ms = 86400000 - ((Date.now() + 9 * 3600 * 1000) % 86400000);
  return `${Math.floor(ms / 3600000)}시간 ${Math.floor((ms % 3600000) / 60000)}분 ${Math.floor((ms % 60000) / 1000)}초`;
}

function shareRows() {
  if (mode === 'silhouette') {
    // 실루엣은 칸이 없다 — 몇 번 만에 갔는지만 남긴다.
    return state.guesses.map((name, i) => [{ state: i === state.guesses.length - 1 && state.status === 'won' ? 'exact' : 'wrong' }]);
  }
  return state.guesses.map((name) => compareItem(topic, findItem(topic.items, name), answer));
}

function finish() {
  const won = state.status === 'won';
  const rows = shareRows();
  const live = liveStreak(streak ?? {}, dayNumber);
  const text = shareText({
    title: `${topic.emoji ?? ''} ${topic.title}${mode === 'silhouette' ? ' 실루엣' : ''}`.trim(),
    puzzleNo,
    rows,
    won,
    maxGuesses,
    url: location.origin + location.pathname,
  }).replace('\n\n', live > 1 ? `\n🔥 ${live}일 연속\n\n` : '\n\n');

  $done.innerHTML = '';
  $done.append(
    el(`<h2>${won ? `${state.guesses.length}번 만에 맞혔다` : '오늘은 실패'}</h2>`),
    el(`<div class="ans">${answer.img ? `<img src="${esc(answer.img)}" alt="">` : ''}<b>${esc(answer.name)}</b></div>`),
    el(`<div class="grid">${rows.map(shareRow).join('<br>')}</div>`),
    el(`<div class="tally">${stats.played}판 · ${Math.round((stats.wins / Math.max(1, stats.played)) * 100)}% 맞힘 · 연속 ${live}일 (최고 ${streak?.best ?? live}일)</div>`),
  );

  const btn = el('<button class="btn" type="button">결과 복사하기</button>');
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = '복사됨! 아무 데나 붙여넣기';
    } catch {
      btn.textContent = '복사 실패 — 길게 눌러 직접 복사';
    }
  });
  $done.append(btn);

  // 끝난 사람을 그냥 보내지 않는다 — 오늘 아직 안 푼 판을 바로 건넨다.
  const todo = others.filter((o) => {
    const s = read(`daily:${o.topic}:${o.mode}`, null);
    return !(s && s.day === dayKey && s.status !== 'playing');
  });
  if (todo.length) {
    $done.append(
      el(
        `<div class="more"><span>오늘 아직 안 푼 판</span>${todo
          .map((o) => `<a href="${esc(o.href)}">${esc(o.emoji ?? '🎯')} ${esc(o.label)}</a>`)
          .join('')}</div>`,
      ),
    );
  }

  const next = el(`<div class="next">다음 문제까지 ${untilNextKst()}</div>`);
  $done.append(next);
  setInterval(() => { next.textContent = `다음 문제까지 ${untilNextKst()}`; }, 1000);

  $done.hidden = false;
  $input.closest('.guessbar').hidden = true;
  $left.hidden = true;
  paintShot();
}

function updateLeft() {
  $left.textContent = `${state.guesses.length} / ${maxGuesses}번째 시도`;
}

/**
 * 첫 한 수의 문턱을 없앤다.
 * 워들은 글자판이 있어 아무나 바로 시작하지만, 이 놀이는 *이름이 떠올라야* 시작된다.
 * 처음 온 사람이 빈 칸 앞에서 멈추는 게 이 화면에서 가장 흔한 이탈 지점이다.
 *
 * 예시는 날짜와 무관하게 표에서 고르게 세 개를 집는다 — 오늘 정답을 빼면
 * 「예시에 없는 것이 정답」이라는 정보가 새기 때문에 일부러 빼지 않는다.
 */
function renderSeeds() {
  const box = root.querySelector('.seeds');
  if (!box) return;
  if (state.guesses.length || state.status !== 'playing') {
    box.remove();
    return;
  }
  const picks = [0, 0.37, 0.71].map((r) => topic.items[Math.floor(topic.items.length * r)]).filter(Boolean);
  box.innerHTML = `<span>뭘 칠지 모르겠으면</span>${picks
    .map((p, i) => `<button type="button" data-seed="${i}">${esc(p.name)}</button>`)
    .join('')}`;
  [...box.querySelectorAll('button')].forEach((b, i) => b.addEventListener('click', () => submit(picks[i].name)));
}

function submit(name) {
  if (state.status !== 'playing') return;
  const item = findItem(topic.items, name);
  if (!item || state.guesses.includes(item.name)) return;
  state.guesses.push(item.name);
  const cells = renderRow(item);
  const won = mode === 'silhouette' ? item.name === answer.name : isWin(cells);
  if (won) state.status = 'won';
  else if (state.guesses.length >= maxGuesses) state.status = 'lost';
  write(storeKey, state);
  updateLeft();
  renderSeeds();
  paintShot();
  $input.value = '';
  $sug.innerHTML = '';
  if (state.status !== 'playing') {
    stats = updateStats(stats, { won: state.status === 'won', guesses: state.guesses.length, dayNumber });
    write(statsKey, stats);
    streak = touchDay(streak, dayNumber);
    write(streakKey, streak);
    renderStreak();
    finish();
  }
}

// ── 자동완성 ──
let cursor = -1;
function renderSuggestions() {
  const list = suggest(topic.items, $input.value, { exclude: state.guesses });
  cursor = -1;
  $sug.innerHTML = list
    .map(
      (item, i) =>
        `<button type="button" role="option" id="sug-${i}" data-i="${i}" aria-selected="false">${item.img && mode !== 'silhouette' ? `<img src="${esc(item.img)}" alt="" loading="lazy">` : ''}<span>${esc(item.name)}</span></button>`,
    )
    .join('');
  [...$sug.children].forEach((b, i) => b.addEventListener('click', () => submit(list[i].name)));
  return list;
}

$input.addEventListener('input', renderSuggestions);
$input.addEventListener('keydown', (e) => {
  const buttons = [...$sug.children];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!buttons.length) return;
    cursor = (cursor + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons.forEach((b, i) => b.setAttribute('aria-selected', String(i === cursor)));
    // 화면 낭독기가 「지금 어느 항목」인지 알려면 이 연결이 있어야 한다.
    $input.setAttribute('aria-activedescendant', `sug-${cursor}`);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const pick = cursor >= 0 ? buttons[cursor] : buttons[0];
    if (pick) submit(pick.querySelector('span').textContent);
  } else if (e.key === 'Escape') {
    $sug.innerHTML = '';
  }
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.guessbar')) $sug.innerHTML = '';
});

// ── 되살리기 (새로고침해도 오늘 진행은 남는다) ──
if ($shot && answer.img) {
  $shot.querySelector('img').src = answer.img;
  watchShot();
}
for (const name of state.guesses) {
  const item = findItem(topic.items, name);
  if (item) renderRow(item);
}
updateLeft();
renderSeeds();
renderStreak();
paintShot();
if (state.status !== 'playing') finish();
$input.focus({ preventScroll: true });
