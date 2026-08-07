/**
 * 지난 문제 보기 (TASK-KAR-202).
 *
 * 정답이 결정론적이라 서버도 저장도 필요 없다 — 날짜만 있으면 그날 답이 다시 계산된다.
 * 그래서 이 목록은 배포 시점에 굳지 않는다. 매일 스스로 하루씩 늘어난다.
 *
 * **오늘 것은 절대 안 보여 준다.** 오늘 답이 여기 있으면 게임이 성립하지 않는다.
 */
import { dailyIndex, kstDayNumber, puzzleNumber, EPOCH_DAY_NUMBER } from './engine.mjs';

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
    `<tr><th scope="row"><span class="d">${dateLabel(d)}</span><span class="n">#${d - EPOCH_DAY_NUMBER + 1}</span>` +
    // 답만 읽고 나가지 않게 — 그날 문제를 지금 풀 수 있다.
    `<a class="play" href="../?d=${dateLabel(d)}">풀어보기</a></th>` +
    answers
      .map(
        (a, i) =>
          `<td><span class="mo">${esc(modes[i].label)}</span>${a.img ? `<img src="${esc(a.img)}" alt="" loading="lazy">` : ''}<b>${esc(a.name)}</b></td>`,
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
  `오늘(#${puzzleNumber()}) 답은 여기 없다 — 내일 이 자리에 올라온다. 놓친 날은 「풀어보기」로 지금 풀 수 있다.`;

if (cursor < oldest) {
  tbody.innerHTML = '<tr><td>아직 지난 문제가 없다.</td></tr>';
  $more.replaceChildren();
} else {
  $more.innerHTML = '<button type="button"></button>';
  $more.querySelector('button').addEventListener('click', appendChunk);
  appendChunk();
}
