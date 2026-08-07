/**
 * 허브 — 오늘 뭘 풀었는지 표시 (TASK-KAR-202).
 *
 * 처음 온 사람에겐 아무 표시도 안 뜬다. 돌아온 사람에게만 「남은 판」이 보인다 —
 * 다 푼 판을 다시 누르게 만드는 게 이 화면의 가장 흔한 낭비다.
 */
import { kstDayKey, liveStreak, kstDayNumber } from './engine.mjs';
import { countPage } from './count.mjs';

const dayKey = kstDayKey();
const dayNumber = kstDayNumber();
let left = 0;
let best = 0;
try { best = liveStreak(JSON.parse(localStorage.getItem('daily:streak')) ?? {}, dayNumber); } catch { /* 깨진 저장본 */ }

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
const jump = document.querySelector('.hub-jump');
const firstUndone = [...document.querySelectorAll('.card[data-topic]')].find((c) => !c.classList.contains('done-today'));
if (jump && firstUndone) {
  const group = firstUndone.closest('.group')?.querySelector('.group-t')?.firstChild?.textContent?.trim() ?? '';
  const name = `${group} ${firstUndone.querySelector('h3').textContent.trim()}`.trim();
  jump.innerHTML = `<a class="btn" href="${firstUndone.getAttribute('href')}">${left === document.querySelectorAll('.card[data-topic]').length ? '오늘 한 판 시작' : '남은 판 이어서'} · ${name}</a>`;
}

const note = document.querySelector('.hub-note');
if (note && (left < document.querySelectorAll('.card[data-topic]').length || best > 0)) {
  const parts = [];
  if (best > 0) parts.push(`🔥 ${best}일 연속`);
  parts.push(left ? `오늘 남은 판 ${left}개` : '오늘 다 풀었다 — 내일 또');
  note.textContent = parts.join(' · ');
}

countPage();
