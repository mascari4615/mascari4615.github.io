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

const topic = await (await fetch(`${root.dataset.data}?v=${stamp}`)).json();
const today = kstDayNumber();

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dateLabel = (dayNumber) => new Date(dayNumber * 86400000).toISOString().slice(0, 10);

const modes = [{ key: '', label: '속성' }];
if (topic.items.every((i) => i.img)) modes.push({ key: 'silhouette', label: '실루엣' });

const rows = [];
for (let d = today - 1; d >= Math.max(EPOCH_DAY_NUMBER, today - DAYS); d -= 1) {
  const answers = modes.map((m) => topic.items[dailyIndex(topic.id, d, topic.items.length, m.key)]);
  rows.push(
    `<tr><th scope="row"><span class="d">${dateLabel(d)}</span><span class="n">#${d - EPOCH_DAY_NUMBER + 1}</span></th>` +
      answers
        .map(
          (a, i) =>
            `<td><span class="mo">${esc(modes[i].label)}</span>${a.img ? `<img src="${esc(a.img)}" alt="" loading="lazy">` : ''}<b>${esc(a.name)}</b></td>`,
        )
        .join('') +
      '</tr>',
  );
}

root.querySelector('.past-note').textContent =
  `오늘(#${puzzleNumber()}) 답은 여기 없다 — 내일 이 자리에 올라온다.`;
root.querySelector('tbody').innerHTML = rows.join('') || '<tr><td>아직 지난 문제가 없다.</td></tr>';
