/**
 * 허브 — 오늘 뭘 풀었는지 표시 (TASK-KAR-202).
 *
 * 처음 온 사람에겐 아무 표시도 안 뜬다. 돌아온 사람에게만 「남은 판」이 보인다 —
 * 다 푼 판을 다시 누르게 만드는 게 이 화면의 가장 흔한 낭비다.
 */
import { kstDayKey, kstDayNumber, streakLine } from './engine.mjs';
import { countPage } from './count.mjs';

const dayKey = kstDayKey();
const dayNumber = kstDayNumber();
let left = 0;
let streakSaid = '';
try { streakSaid = streakLine(JSON.parse(localStorage.getItem('daily:streak')) ?? {}, dayNumber); } catch { /* 깨진 저장본 */ }

for (const card of document.querySelectorAll('.card[data-topic]')) {
  const { topic, mode } = card.dataset;
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(`daily:${topic}:${mode}`));
  } catch { /* 깨진 저장본은 없던 셈 */ }

  const done = saved && saved.day === dayKey && saved.status !== 'playing';
  if (done) {
    card.classList.add('done-today');
    card.querySelector('.cnt').insertAdjacentHTML(
      'afterbegin',
      saved.status === 'won' ? `<span class="done-mark">오늘 ${saved.guesses.length}번에 ✔</span>` : '<span class="done-mark miss">오늘 실패</span>',
    );
  } else {
    left += 1;
  }
}

/**
 * 고를 것부터 정해야 하는 화면은 그만큼 사람을 놓친다.
 * 워들은 링크를 누르면 곧장 게임이다 — 여기도 「지금 한 판」을 한 번에 열어 준다.
 * 처음 온 사람에겐 첫 판, 돌아온 사람에겐 오늘 아직 안 푼 판.
 */
const cards = document.querySelectorAll('.card[data-topic]');
const jump = document.querySelector('.hub-jump');
const firstUndone = [...cards].find((c) => !c.classList.contains('done-today'));

if (jump && firstUndone) {
  const group = firstUndone.closest('.group')?.querySelector('.group-t')?.firstChild?.textContent?.trim() ?? '';
  const name = `${group} ${firstUndone.querySelector('h3').textContent.trim()}`.trim();
  jump.innerHTML = `<a class="btn" href="${firstUndone.getAttribute('href')}">${left === cards.length ? '오늘 한 판 시작' : '남은 판 이어서'} · ${name}</a>`;
} else if (jump && cards.length) {
  /**
   * 오늘 다 푼 사람에게 「내일 또」만 남기면 그대로 나간다.
   * 어제 판은 지금 바로 할 수 있다 — 판 화면에서는 이미 건네고 있었는데 여기만 비어 있었다.
   */
  const yKey = new Date(Date.now() - 86400000 + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const first = cards[0];
  const group = first.closest('.group')?.querySelector('.group-t')?.firstChild?.textContent?.trim() ?? '';
  jump.innerHTML = `<a class="btn" href="${first.getAttribute('href')}?d=${yKey}">📅 어제 판 풀기 · ${group}</a>`;
}

const note = document.querySelector('.hub-note');
if (note && (left < document.querySelectorAll('.card[data-topic]').length || streakSaid)) {
  const parts = [];
  // 끊겼으면 끊겼다고 말한다 — 불꽃만 조용히 사라지면 본인은 왜 없어졌는지 모른다.
  if (streakSaid) parts.push(streakSaid);
  parts.push(left ? `오늘 남은 판 ${left}개` : '오늘 다 풀었다 — 내일 또');
  note.textContent = parts.join(' · ');
}

countPage();
