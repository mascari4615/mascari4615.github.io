/**
 * 오늘의 하나 맞히기 — 브라우저 껍데기 (TASK-KAR-202).
 * 규칙은 전부 engine.mjs 에 있다. 여기는 화면과 저장만 한다.
 */
import {
  answerOf,
  compareItem,
  findItem,
  isWin,
  kstDayKey,
  puzzleNumber,
  shareRow,
  shareText,
  suggest,
} from './engine.mjs';

const root = document.getElementById('app');
const topicId = root.dataset.topic;
const stamp = root.dataset.stamp || '';

const topic = await (await fetch(`../data/${topicId}.json?v=${stamp}`)).json();
const answer = answerOf(topic);
const maxGuesses = topic.maxGuesses ?? 8;
const puzzleNo = puzzleNumber();
const dayKey = kstDayKey();
const storeKey = `daily:${topicId}`;

/** 저장은 오늘 것만 의미가 있다 — 날이 바뀌면 통째로 버린다. */
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey) || '{}');
    if (saved.day === dayKey) return saved;
  } catch { /* 깨진 저장본은 없던 셈 친다 */ }
  return { day: dayKey, guesses: [], status: 'playing' };
}
function saveState() {
  try { localStorage.setItem(storeKey, JSON.stringify(state)); } catch { /* 사생활 모드 */ }
}

const state = loadState();

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

root.querySelector('.no').textContent = `#${puzzleNo}`;
$rows.style.setProperty('--cols', topic.fields.length);

function markOf(field, cell) {
  if (cell.state === 'exact') return '';
  if (field.kind === 'number') return cell.dir === 'up' ? '▲' : '▼';
  return cell.state === 'near' ? '≈' : '';
}

function renderRow(guess) {
  const cells = compareItem(topic, guess, answer);
  const html = topic.fields
    .map((field, i) => {
      const cell = cells[i];
      const mark = markOf(field, cell);
      const unit = field.unit && typeof cell.value === 'number' ? field.unit : '';
      return `<div class="cell ${cell.state}"><span class="k">${esc(field.label)}</span><span class="v">${esc(fmt(cell.value))}${unit}<span class="mark">${mark}</span></span></div>`;
    })
    .join('');
  const img = guess.img ? `<img src="${esc(guess.img)}" alt="" loading="lazy">` : '';
  const node = el(`<div class="row"><div class="who">${img}<span>${esc(guess.name)}</span></div><div class="cells" style="--cols:${topic.fields.length}">${html}</div></div>`);
  $rows.prepend(node);
  return cells;
}

function untilNextKst() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const ms = 86400000 - (kst.getTime() % 86400000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}시간 ${m}분 ${s}초`;
}

function finish() {
  const won = state.status === 'won';
  const rows = state.guesses.map((name) => compareItem(topic, findItem(topic.items, name), answer));
  const text = shareText({
    title: `${topic.emoji ?? ''} ${topic.title}`.trim(),
    puzzleNo,
    rows,
    won,
    maxGuesses,
    url: location.origin + location.pathname,
  });

  $done.innerHTML = '';
  $done.append(
    el(`<h2>${won ? `${state.guesses.length}번 만에 맞혔다` : '오늘은 실패'}</h2>`),
    el(`<div class="ans">${answer.img ? `<img src="${esc(answer.img)}" alt="">` : ''}<b>${esc(answer.name)}</b></div>`),
    el(`<div class="grid">${rows.map(shareRow).join('<br>')}</div>`),
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
  const next = el(`<div class="next">다음 문제까지 ${untilNextKst()}</div>`);
  $done.append(next);
  setInterval(() => { next.textContent = `다음 문제까지 ${untilNextKst()}`; }, 1000);

  $done.hidden = false;
  $input.closest('.guessbar').hidden = true;
  $left.hidden = true;
}

function updateLeft() {
  $left.textContent = `${state.guesses.length} / ${maxGuesses}번째 시도`;
}

function submit(name) {
  if (state.status !== 'playing') return;
  const item = findItem(topic.items, name);
  if (!item || state.guesses.includes(item.name)) return;
  state.guesses.push(item.name);
  const cells = renderRow(item);
  if (isWin(cells)) state.status = 'won';
  else if (state.guesses.length >= maxGuesses) state.status = 'lost';
  saveState();
  updateLeft();
  $input.value = '';
  $sug.innerHTML = '';
  if (state.status !== 'playing') finish();
}

// ── 자동완성 ──
let cursor = -1;
function renderSuggestions() {
  const list = suggest(topic.items, $input.value, { exclude: state.guesses });
  cursor = -1;
  $sug.innerHTML = list
    .map(
      (item, i) =>
        `<button type="button" data-i="${i}" aria-selected="false">${item.img ? `<img src="${esc(item.img)}" alt="" loading="lazy">` : ''}<span>${esc(item.name)}</span></button>`,
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
for (const name of state.guesses) {
  const item = findItem(topic.items, name);
  if (item) renderRow(item);
}
updateLeft();
if (state.status !== 'playing') finish();
$input.focus({ preventScroll: true });
