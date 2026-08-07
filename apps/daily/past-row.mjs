/**
 * 지난 문제 한 줄 (TASK-KAR-202) — **빌드와 브라우저가 같은 줄을 그린다.**
 *
 * 왜 나뉘어 있으면 안 되나: 이 표는 두 곳에서 만들어진다. 배포할 때 HTML 에 미리 박아 넣고
 * (검색 로봇은 자바스크립트를 안 돌려 주는 쪽이 많다 — 안 박으면 로봇 눈엔 빈 표다),
 * 그 뒤로 하루씩 지나간 날은 브라우저가 그 위에 얹는다. 두 벌로 두면 언젠가 어긋난다.
 */
import { dailyIndex, EPOCH_DAY_NUMBER } from './engine.mjs';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const dateLabel = (dayNumber) => new Date(dayNumber * 86400000).toISOString().slice(0, 10);

/** 그림이 다 있는 주제만 실루엣 판이 선다 — 판이 서야 그날 답도 있다. */
export function modesOf(topic) {
  const modes = [{ key: '', label: '속성' }];
  if (topic.items.every((i) => i.img)) modes.push({ key: 'silhouette', label: '실루엣' });
  return modes;
}

export function pastRow(topic, day, modes = modesOf(topic)) {
  const date = dateLabel(day);
  const cells = modes
    .map((m) => {
      const a = topic.items[dailyIndex(topic.id, day, topic.items.length, m.key)];
      return (
        `<td><span class="mo">${esc(m.label)}</span>` +
        // 답은 단추 안에 있다 — 가려 둔 동안에도 눌러서 열 수 있어야 하고, 키보드로도 되어야 한다.
        // 그림 주소는 **data- 로만** 둔다. 답은 흐리게 가려져 있어서, 열기 전에는 그림이
        // 아무 뜻도 없는데 무게만 나간다 (롤은 한 장 훑는 데 1.3MB 였다). 열 때 채운다.
        `<button type="button" class="a">${a.img ? `<img data-src="${esc(a.img)}" alt="" loading="lazy">` : ''}<b>${esc(a.name)}</b></button>` +
        // 답만 읽고 나가지 않게 — 그날 그 판을 지금 풀 수 있다. 판마다 따로 걸어야 한다:
        // 하나만 걸면 실루엣 답은 보여 주면서 실루엣은 못 풀게 된다.
        `<a class="play" href="../${m.key ? `${m.key}/` : ''}?d=${date}">풀어보기</a></td>`
      );
    })
    .join('');
  // data-day 는 브라우저가 「어디까지 박혀 있나」를 읽는 표식이다 — 없으면 같은 날을 두 번 그린다.
  return `<tr data-day="${day}"><th scope="row"><span class="d">${date}</span><span class="n">#${day - EPOCH_DAY_NUMBER + 1}</span></th>${cells}</tr>`;
}
