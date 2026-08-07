/**
 * 지난 문제 보기 (TASK-KAR-202).
 *
 * 정답이 결정론적이라 서버도 저장도 필요 없다 — 날짜만 있으면 그날 답이 다시 계산된다.
 * 그래서 이 목록은 배포 시점에 굳지 않는다. 매일 스스로 하루씩 늘어난다.
 *
 * **오늘 것은 절대 안 보여 준다.** 오늘 답이 여기 있으면 게임이 성립하지 않는다.
 */
import { dailyIndex, kstDayNumber, puzzleNumber, EPOCH_DAY_NUMBER } from './engine.mjs';
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

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dateLabel = (dayNumber) => new Date(dayNumber * 86400000).toISOString().slice(0, 10);

const modes = [{ key: '', label: '속성' }];
if (topic.items.every((i) => i.img)) modes.push({ key: 'silhouette', label: '실루엣' });

const oldest = Math.max(EPOCH_DAY_NUMBER, 0);

function rowFor(d) {
  const answers = modes.map((m) => topic.items[dailyIndex(topic.id, d, topic.items.length, m.key)]);
  return (
    `<tr><th scope="row"><span class="d">${dateLabel(d)}</span><span class="n">#${d - EPOCH_DAY_NUMBER + 1}</span></th>` +
    answers
      .map(
        (a, i) =>
          // 답은 단추 안에 있다 — 가려 둔 동안에도 눌러서 열 수 있어야 하고, 키보드로도 되어야 한다.
          `<td><span class="mo">${esc(modes[i].label)}</span>` +
          `<button type="button" class="a">${a.img ? `<img src="${esc(a.img)}" alt="" loading="lazy">` : ''}<b>${esc(a.name)}</b></button>` +
          // 답만 읽고 나가지 않게 — 그날 그 판을 지금 풀 수 있다. 판마다 따로 걸어야 한다:
          // 하나만 걸면 실루엣 답은 보여 주면서 실루엣은 못 풀게 된다.
          `<a class="play" href="../${modes[i].key ? `${modes[i].key}/` : ''}?d=${dateLabel(d)}">풀어보기</a></td>`,
      )
      .join('') +
    '</tr>'
  );
}

/**
 * 30일에서 끊지 않는다 — 끊긴 만큼 연습할 날도, 검색에 걸릴 글도 사라진다.
 * 다만 한 번에 다 그리면 첫 화면이 무거워지므로 30일씩 이어 붙인다.
 */
const tbody = root.querySelector('tbody');
const $more = root.querySelector('.past-more');
let cursor = today - 1;

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

function paintReveal() {
  table.classList.toggle('hide', !revealed);
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
  if (cell) cell.classList.add('on');
});

if (cursor < oldest) {
  tbody.innerHTML = '<tr><td>아직 지난 문제가 없다.</td></tr>';
  $more.replaceChildren();
  root.querySelector('.past-reveal').remove(); // 가릴 답이 없다
} else {
  $more.innerHTML = '<button type="button"></button>';
  $more.querySelector('button').addEventListener('click', () => {
    // 지난 문제를 「더 보는」 사람이 있는지 — 없으면 30일에서 끊어도 된다는 뜻이다.
    countEvent(`daily/${topicId}/지난문제/더보기`);
    appendChunk();
  });
  appendChunk();
}

countPage();
