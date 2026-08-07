/**
 * 지난 문제 보기 (TASK-KAR-202).
 *
 * 정답이 결정론적이라 서버도 저장도 필요 없다 — 날짜만 있으면 그날 답이 다시 계산된다.
 * 그래서 이 목록은 배포 시점에 굳지 않는다. 매일 스스로 하루씩 늘어난다.
 *
 * **오늘 것은 절대 안 보여 준다.** 오늘 답이 여기 있으면 게임이 성립하지 않는다.
 */
import { kstDayNumber, puzzleNumber, EPOCH_DAY_NUMBER } from './engine.mjs';
import { modesOf, pastRow } from './past-row.mjs';
import { countPage, countEvent } from './count.mjs';

const root = document.getElementById('past');
const topicId = root.dataset.topic;
const stamp = root.dataset.stamp || '';
const DAYS = 30;

let topic;
try {
  const res = await fetch(`${root.dataset.data}?v=${stamp}`);
  if (!res.ok) throw new Error(`서버가 ${res.status} 로 답했어요`);
  topic = await res.json();
} catch (err) {
  // 조용히 빈 표를 남기지 않는다 — 빈 화면은 「고장」으로 읽힌다.
  root.querySelector('.past-note').textContent = `목록을 못 불러왔어요 (${err.message}). 새로고침해 보세요.`;
  throw err;
}
const today = kstDayNumber();

const modes = modesOf(topic);
const oldest = Math.max(EPOCH_DAY_NUMBER, 0);
const rowFor = (d) => pastRow(topic, d, modes);

/**
 * 30일에서 끊지 않는다 — 끊긴 만큼 연습할 날도, 검색에 걸릴 글도 사라진다.
 * 다만 한 번에 다 그리면 첫 화면이 무거워지므로 30일씩 이어 붙인다.
 */
const tbody = root.querySelector('tbody');
const $more = root.querySelector('.past-more');

/**
 * 줄 대부분은 **배포할 때 이미 박혀 있다** (검색 로봇은 자바스크립트를 안 돌려 주는 쪽이 많다).
 * 여기서 할 일은 두 가지뿐이다: 배포 뒤로 지나간 날을 위에 얹고, 「더 보기」로 옛날을 잇는다.
 */
const baked = [...tbody.querySelectorAll('tr[data-day]')].map((tr) => Number(tr.dataset.day));
const newestBaked = baked.length ? Math.max(...baked) : null;
let cursor = baked.length ? Math.min(...baked) - 1 : today - 1;

if (newestBaked !== null && newestBaked < today - 1) {
  // 배포 뒤로 하루 이상 지났다 — 그 사이 날들을 맨 위에 얹는다.
  const html = [];
  for (let d = today - 1; d > newestBaked; d -= 1) html.push(rowFor(d));
  tbody.insertAdjacentHTML('afterbegin', html.join(''));
}

function appendChunk() {
  const stop = Math.max(oldest, cursor - DAYS + 1);
  const html = [];
  for (let d = cursor; d >= stop; d -= 1) html.push(rowFor(d));
  tbody.insertAdjacentHTML('beforeend', html.join(''));
  cursor = stop - 1;
  const left = cursor - oldest + 1;
  if (left <= 0) $more.replaceChildren();
  else $more.querySelector('button').textContent = `${Math.min(DAYS, left)}일 더 보기 (남은 ${left}일)`;
}

root.querySelector('.past-note').textContent =
  `오늘(#${puzzleNumber()}) 답은 여기 없다 — 내일 이 자리에 올라온다. 놓친 날은 「풀어보기」로 지금 풀 수 있어서, ` +
  '답은 흐리게 가려 뒀다 (누르면 열린다).';

/**
 * 답을 가려 둔다.
 *
 * 지금까지는 「풀어보기」 단추 **바로 옆에 그날 답**이 적혀 있었다 — 풀러 가려고 눈을 옮기는
 * 동안 답이 먼저 눈에 들어온다. 연습 기능이 스스로를 망치고 있었다.
 *
 * 글자는 그대로 두고 흐리게만 한다 — 답을 찾아 검색해 들어온 사람도, 검색 엔진도 잃지 않는다.
 * 하나만 보고 싶으면 그 칸을 누르고, 다 보고 싶으면 위 단추를 누른다. 고른 것은 기억한다.
 */
const table = root.querySelector('table.past');
const $reveal = root.querySelector('.past-reveal button');
const REVEAL_KEY = 'daily:past:reveal';
let revealed = false;
try {
  revealed = localStorage.getItem(REVEAL_KEY) === '1';
} catch { /* 사생활 모드 */ }

/**
 * 열린 칸의 그림만, 그것도 **눈에 들어올 때** 받아 온다.
 *
 * 가려진 동안에는 그림이 아무 뜻도 없어서 주소만 들고 있는다. 그런데 「답 모두 보기」를
 * 한 번 누르면 예순 장이 한꺼번에 쏟아졌다 (롤은 그것만 1.1MB). 그 상태는 기억되므로
 * 다시 올 때마다 또 낸다. 실제로 화면에 들어온 것만 받게 한다.
 */
function loadNow(img) {
  if (!img?.dataset?.src) return;
  img.src = img.dataset.src;
  delete img.dataset.src;
}

const watcher =
  typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(
        (entries, obs) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            loadNow(e.target);
            obs.unobserve(e.target);
          }
        },
        { rootMargin: '300px' }, // 스크롤보다 조금 앞서 받아 둔다
      )
    : null;

/** 아직 안 받은 그림들을 감시에 올린다 (없으면 그냥 다 받는다 — 오래된 브라우저). */
function loadShown(scope = table) {
  for (const img of scope.querySelectorAll('img[data-src]')) {
    if (watcher) watcher.observe(img);
    else loadNow(img);
  }
}

function paintReveal() {
  table.classList.toggle('hide', !revealed);
  if (revealed) loadShown();
  $reveal.textContent = revealed ? '답 가리기' : '답 모두 보기';
  $reveal.setAttribute('aria-pressed', String(revealed));
}
$reveal.addEventListener('click', () => {
  revealed = !revealed;
  try {
    localStorage.setItem(REVEAL_KEY, revealed ? '1' : '0');
  } catch { /* 사생활 모드 */ }
  paintReveal();
  countEvent(`daily/${topicId}/지난문제/${revealed ? '답보기' : '답가리기'}`);
});
paintReveal();

// 한 칸만 열기 — 다 열지 않고 하루치만 확인하고 싶은 경우.
tbody.addEventListener('click', (e) => {
  const cell = e.target.closest('td');
  if (!cell) return;
  cell.classList.add('on');
  // 누른 칸은 이미 눈앞이라 기다릴 것 없이 바로 받는다.
  for (const img of cell.querySelectorAll('img[data-src]')) loadNow(img);
});

if (!tbody.querySelector('tr[data-day]') && cursor < oldest) {
  tbody.innerHTML = '<tr><td>아직 지난 문제가 없다.</td></tr>';
  $more.replaceChildren();
  root.querySelector('.past-reveal').remove(); // 가릴 답이 없다
} else if (cursor < oldest) {
  // 박혀 있는 줄로 이미 첫 문제까지 닿았다 — 더 볼 게 없다.
  $more.replaceChildren();
} else {
  $more.innerHTML = '<button type="button"></button>';
  $more.querySelector('button').addEventListener('click', () => {
    // 지난 문제를 「더 보는」 사람이 있는지 — 없으면 30일에서 끊어도 된다는 뜻이다.
    countEvent(`daily/${topicId}/지난문제/더보기`);
    appendChunk();
  });
  // 박혀 있는 줄이 이미 30일치다 — 처음부터 또 30일을 얹지 않는다.
  // 다만 박힌 게 하나도 없으면(옛 HTML 이 캐시에 남은 경우) 여기서 처음 30일을 그린다.
  if (baked.length) {
    $more.querySelector('button').textContent = `${Math.min(DAYS, cursor - oldest + 1)}일 더 보기 (남은 ${cursor - oldest + 1}일)`;
  } else {
    appendChunk();
  }
}

countPage();
