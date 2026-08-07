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
  describeRow,
  emptyStats,
  findItem,
  isWin,
  kstDayKey,
  kstDayNumber,
  practiceDate,
  liveStreak,
  touchDay,
  puzzleNumber,
  shareRow,
  shareText,
  suggest,
  updateStats,
} from './engine.mjs';
import { countPage, countEvent } from './count.mjs';

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

/**
 * 표가 오기 전까지 입력칸은 **먹통**이다 — 글자를 쳐도 아무 일도 안 일어난다.
 * 느린 회선에서는 그 몇 초가 「고장난 사이트」로 읽힌다. 기다리는 중이라고 말해 둔다.
 */
const $ready = root.querySelector('.guessbar input');
const readyPlaceholder = $ready?.placeholder ?? '';
if ($ready) {
  $ready.disabled = true;
  $ready.placeholder = '문제 불러오는 중…';
}

// 표 주소는 페이지가 알려 준다 — 속성판(/daily/<주제>/)과 실루엣판(/daily/<주제>/silhouette/)의 깊이가 다르다.
let topic;
try {
  const res = await fetch(`${root.dataset.data}?v=${stamp}`);
  if (!res.ok) throw new Error(`서버가 ${res.status} 로 답했어요`);
  topic = await res.json();
  if (!topic?.items?.length) throw new Error('표가 비어 있어요');
  if ($ready) {
    $ready.disabled = false;
    $ready.placeholder = readyPlaceholder;
  }
} catch (err) {
  fatal(`${err.message}. 인터넷이 끊겼거나 잠깐 말썽일 수 있어요.`);
  throw err;
}
/**
 * 연습 — 놓친 날의 문제를 지금 푼다 (`?d=YYYY-MM-DD`).
 *
 * 오늘 판을 다 풀고 나면 할 게 없었다. 지난 문제 목록은 답만 보여 줄 뿐 놀 수는 없었고,
 * 「오늘의 정답」을 검색해 들어온 사람도 읽고 나가는 것 말고는 할 일이 없었다.
 * 정답이 날짜에서 결정론적으로 나오므로 서버 없이 그날로 되돌아갈 수 있다.
 *
 * 열어도 되는 날인지는 규칙(engine)이 정한다 — 오늘·미래도, 1번 문제 이전도 안 된다.
 */
const practice = practiceDate(new URLSearchParams(location.search).get('d'));
const at = practice ?? new Date();
const answer = answerOf(topic, at, mode === 'classic' ? '' : mode);
const maxGuesses = mode === 'silhouette' ? 6 : topic.maxGuesses ?? 8;
const puzzleNo = puzzleNumber(at);
const dayKey = kstDayKey(at);
const dayNumber = kstDayNumber();
// 연습 판은 저장 자리를 따로 쓴다 — 오늘 판의 진행을 덮으면 안 된다.
const storeKey = practice ? `daily:${topicId}:${mode}:p:${dayKey}` : `daily:${topicId}:${mode}`;
const statsKey = `daily:${topicId}:${mode}:stats`;
// 연속은 판별이 아니라 **사이트 전체** 하루 단위다 — 판이 늘어도 끊기지 않는다.
const streakKey = 'daily:streak';

/**
 * 연습 판은 날짜마다 저장 자리를 하나씩 만든다. 두면 주제·모드·날짜만큼 무한히 쌓이고,
 * 브라우저 저장 한도에 닿는 순간 **오늘 진행이 조용히 저장 안 된다**. 오래된 것부터 버린다.
 */
function sweepPractice(keep = 40) {
  try {
    const keys = Object.keys(localStorage).filter((k) => /^daily:.+:p:\d{4}-\d{2}-\d{2}$/.test(k));
    if (keys.length <= keep) return;
    keys.sort(); // 끝이 날짜라 사전순 = 오래된 것부터
    for (const k of keys.slice(0, keys.length - keep)) localStorage.removeItem(k);
  } catch { /* 사생활 모드 */ }
}
sweepPractice();

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
if (practice) {
  root.querySelector('.tabs')?.insertAdjacentHTML('afterbegin', `<span class="tab practice">연습 · ${dayKey}</span>`);
  root.querySelector('.lede').textContent = `${dayKey} 의 문제입니다. 연습이라 기록에는 안 들어갑니다.`;
}

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
    el(
      `<div class="row"><div class="who">${img}<span>${esc(guess.name)}</span></div>` +
        // 색과 ▲▼ 는 눈에만 보인다 — 같은 내용을 말로도 남긴다.
        `<p class="sr">${esc(describeRow(topic.fields, cells, guess.name))}</p>` +
        `<div class="cells" aria-hidden="true" style="--cols:${topic.fields.length}">${html}</div></div>`,
    ),
  );
  return cells;
}

function untilNextKst() {
  const ms = 86400000 - ((Date.now() + 9 * 3600 * 1000) % 86400000);
  return `${Math.floor(ms / 3600000)}시간 ${Math.floor((ms % 3600000) / 60000)}분 ${Math.floor((ms % 60000) / 1000)}초`;
}

/**
 * 자정을 넘겨 창을 열어 둔 사람은 **어제 문제를 계속 풀고 있다** — 화면은 아무 말도 안 한다.
 * 다 풀고 나면 「다음 문제까지 0시간 0분」에서 멈추고, 새로 시작해도 어제 답으로 채점된다.
 * 날이 바뀌면 말해 주고, 새 문제로 갈 길을 준다. 저절로 넘기지는 않는다 — 두던 판이 날아간다.
 */
function watchMidnight() {
  if (practice) return;
  const startedOn = dayNumber;
  const timer = setInterval(() => {
    if (kstDayNumber() === startedOn) return;
    clearInterval(timer);
    if (root.querySelector('.newday')) return;
    const bar = el(
      '<div class="newday">자정이 지나 <b>새 문제</b>가 나왔어요. 지금 화면은 어제 문제입니다.<button type="button">새 문제 열기</button></div>',
    );
    bar.querySelector('button').addEventListener('click', () => {
      location.href = location.pathname;
    });
    root.querySelector('.tabs')?.after(bar);
  }, 15000);
}

function shareRows() {
  if (mode === 'silhouette') {
    /**
     * 실루엣은 속성 칸이 없다 — 몇 번 만에 갔는지가 전부다.
     * 그걸 세로로 한 칸씩 늘어놓으면 자랑할 그림이 안 나온다(⬛ 하나씩 여섯 줄).
     * **가로 한 줄**로 눕힌다 — 워들 격자가 눈에 걸리는 건 그 모양 때문이다.
     */
    return [
      state.guesses.map((_, i) => ({
        state: i === state.guesses.length - 1 && state.status === 'won' ? 'exact' : 'wrong',
      })),
    ];
  }
  return state.guesses.map((name) => compareItem(topic, findItem(topic.items, name), answer));
}

/**
 * 몇 번 만에 맞혔는지 쌓인 모양 — 워들에서 사람을 다시 오게 하는 화면이 이거다.
 * 「1판 100%」 한 줄로는 기록이 쌓이는 게 안 보인다.
 *
 * 형태는 가로 막대다(양을 비교하는 일이라). 색은 한 가지에 오늘 것만 진하게 —
 * 색만으로 알리지 않으려고 숫자를 항상 같이 적고, 오늘 줄에는 「오늘」이라고 쓴다.
 */
function distChart() {
  const dist = stats.dist ?? {};
  const tries = Object.keys(dist).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!tries.length) return el('<div class="dist" hidden></div>');
  const max = Math.max(...tries.map((t) => dist[t]));
  const mine = state.status === 'won' ? state.guesses.length : null;
  const rows = Array.from({ length: maxGuesses }, (_, i) => i + 1)
    .filter((t) => dist[t])
    .map((t) => {
      const n = dist[t];
      const pct = Math.max(6, Math.round((n / max) * 100));
      const now = t === mine;
      return `<div class="dist-row${now ? ' now' : ''}"><span class="k">${t}번</span><span class="track"><span class="bar" style="width:${pct}%"></span></span><span class="n">${n}${now ? ' ·오늘' : ''}</span></div>`;
    })
    .join('');
  return el(`<div class="dist"><div class="dist-t">몇 번 만에 맞혔나</div>${rows}</div>`);
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
    tries: state.guesses.length,
    url: location.origin + location.pathname + location.search,
  }).replace('\n\n', live > 1 ? `\n🔥 ${live}일 연속\n\n` : '\n\n');

  $done.innerHTML = '';
  $done.append(
    el(`<h2>${won ? `${state.guesses.length}번 만에 맞혔다` : '오늘은 실패'}</h2>`),
    el(`<div class="ans">${answer.img ? `<img src="${esc(answer.img)}" alt="">` : ''}<b>${esc(answer.name)}</b></div>`),
    el(`<div class="grid">${rows.map(shareRow).join('<br>')}</div>`),
    el(`<div class="tally">${stats.played}판 · ${Math.round((stats.wins / Math.max(1, stats.played)) * 100)}% 맞힘 · 연속 ${live}일 (최고 ${streak?.best ?? live}일)</div>`),
    distChart(),
  );

  /**
   * 이 물건은 결과가 퍼져야 사람이 온다. 그런데 지금까지는 **복사 → 앱 열기 → 붙여넣기** 셋이었다.
   * 폰에는 기기 공유 창이 있으니 한 번으로 끝낸다. 없는 기기(대부분의 PC)에서는 복사로 돌아간다.
   */
  const canShare = typeof navigator.share === 'function';
  const btn = el(`<button class="btn" type="button">${canShare ? '결과 공유하기' : '결과 복사하기'}</button>`);
  btn.addEventListener('click', async () => {
    if (canShare) {
      try {
        await navigator.share({ text });
        countEvent(`daily/${topicId}/공유/기기`);
        return;
      } catch (err) {
        // 사용자가 공유 창을 그냥 닫은 것뿐이면 아무 말도 하지 않는다.
        if (err?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      countEvent(`daily/${topicId}/공유/복사`);
      btn.textContent = '복사됨! 아무 데나 붙여넣기';
    } catch {
      btn.textContent = '복사 실패 — 길게 눌러 직접 복사';
    }
  });
  $done.append(btn);

  // 끝난 사람을 그냥 보내지 않는다 — 오늘 아직 안 푼 판을 바로 건넨다.
  // 오늘 판을 끝낸 사람이 지금 할 수 있는 것을 준다. 「내일 또」만 남기면 그대로 나간다.
  const yesterdayKey = kstDayKey(new Date(Date.now() - 86400000));
  const extra = practice
    ? [{ href: location.pathname, label: '오늘 문제 풀기', emoji: '📅', topic: topicId, mode }]
    : [{ href: `${location.pathname}?d=${yesterdayKey}`, label: '어제 문제 풀기', emoji: '📅', key: `daily:${topicId}:${mode}:p:${yesterdayKey}`, day: yesterdayKey }];
  const open = extra.concat(others).filter((o) => {
    // 이미 끝낸 것은 안 건넨다 — 다 푼 판을 또 누르게 하는 게 이 자리의 가장 흔한 낭비다.
    const s = read(o.key ?? `daily:${o.topic}:${o.mode}`, null);
    return !(s && s.day === (o.day ?? dayKey) && s.status !== 'playing');
  });

  /**
   * 여섯 개를 쏟아 놓으면 아무것도 안 고른다. 셋만 건넨다.
   * 가까운 것부터: 어제 판 → **같은 주제의 다른 모드**(방금 하던 것과 맥락이 같다) → 나머지.
   */
  const near = open.filter((o) => o.topic === topicId && !o.day);
  const rest = open.filter((o) => o.topic !== topicId && !o.day);
  const yesterday = open.filter((o) => o.day);
  const todo = [...yesterday, ...near, ...rest].slice(0, 3);

  if (todo.length) {
    $done.append(
      el(
        `<div class="more"><span>${open.length > todo.length ? '이어서 한 판 더' : '오늘 아직 안 푼 판'}</span>${todo
          .map((o) => `<a href="${esc(o.href)}">${esc(o.emoji ?? '🎯')} ${esc(o.label)}</a>`)
          .join('')}${open.length > todo.length ? `<a class="more-all" href="/daily/">전체 보기</a>` : ''}</div>`,
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

  /**
   * 판이 끝나면 입력칸이 사라지는데 **포커스는 거기 남는다.**
   * 마우스로 보는 사람은 모르지만, 키보드·화면 낭독기로 오는 사람은 없어진 자리에 갇혀
   * 결과에 닿지 못한다. 결과 상자로 옮겨 주고, 화면은 흔들지 않는다.
   */
  $done.setAttribute('tabindex', '-1');
  $done.focus({ preventScroll: true });
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
  [...box.querySelectorAll('button')].forEach((b, i) => b.addEventListener('click', () => submit(picks[i].name, '시작점')));
}

function submit(name, how = '직접') {
  if (state.status !== 'playing') return;
  const item = findItem(topic.items, name);
  if (!item || state.guesses.includes(item.name)) return;
  // 방문과 끝남만 세면 가운데가 깜깜하다 — 열고 한 수도 안 두고 나가는 사람이 몇인지 모른다.
  // 첫 수는 그 깔때기의 첫 칸이고, 시작점 단추가 실제로 먹히는지도 여기서만 갈린다.
  if (state.guesses.length === 0 && !practice) countEvent(`daily/${topicId}/${mode}/첫수/${how}`);
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
    if (!practice) {
      // 연습은 기록에 안 들어간다 — 지난 문제를 몰아 풀어 연속을 만들 수 있으면 기록이 뜻을 잃는다.
      stats = updateStats(stats, { won: state.status === 'won', guesses: state.guesses.length, dayNumber });
      write(statsKey, stats);
      streak = touchDay(streak, dayNumber);
      write(streakKey, streak);
    }
    // 「열어만 봤다」와 「끝까지 뒀다」를 가르는 유일한 신호. 이름·정답은 안 실린다.
    countEvent(`daily/${topicId}/${mode}/${state.status === 'won' ? '맞힘' : '실패'}${practice ? '/연습' : ''}`);
    renderStreak();
    finish();
  }
}

// ── 자동완성 ──
let cursor = -1;
function renderSuggestions() {
  const list = suggest(topic.items, $input.value, { exclude: state.guesses });
  cursor = -1;

  /**
   * 없는 이름을 치면 지금까지는 **아무 반응도 없었다** — 오타가 났는데 화면이 침묵하니
   * 「고장인가? 내가 틀렸나?」를 알 수 없다. 이미 낸 답도 목록에서 빠지므로 같은 침묵이 난다.
   */
  if ($input.value.trim() && !list.length) {
    const already = findItem(topic.items, $input.value);
    $sug.innerHTML = `<p class="sug-none">${already ? `「${esc(already.name)}」는 이미 냈어요.` : '그런 이름은 없어요. 철자를 확인해 보세요.'}</p>`;
    return list;
  }

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
watchMidnight();
// 연습 방문을 오늘 판과 합치면 「오늘 몇 명이 열었나」가 부풀어 깔때기를 못 믿는다.
countPage(practice ? `${location.pathname}연습/` : undefined);
paintShot();
if (state.status !== 'playing') finish();
$input.focus({ preventScroll: true });
