/**
 * 허브 — 오늘 뭘 풀었는지 표시 (TASK-KAR-202).
 *
 * 처음 온 사람에겐 아무 표시도 안 뜬다. 돌아온 사람에게만 「남은 판」이 보인다 —
 * 다 푼 판을 다시 누르게 만드는 게 이 화면의 가장 흔한 낭비다.
 */
import { kstDayKey, liveStreak, kstDayNumber } from './engine.mjs';

const dayKey = kstDayKey();
const dayNumber = kstDayNumber();
let left = 0;
let best = 0;

for (const card of document.querySelectorAll('.card[data-topic]')) {
  const { topic, mode } = card.dataset;
  let saved = null;
  let stats = null;
  try {
    saved = JSON.parse(localStorage.getItem(`daily:${topic}:${mode}`));
    stats = JSON.parse(localStorage.getItem(`daily:${topic}:${mode}:stats`));
  } catch { /* 깨진 저장본은 없던 셈 */ }

  best = Math.max(best, liveStreak(stats ?? {}, dayNumber));

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

const note = document.querySelector('.hub-note');
if (note && (left < document.querySelectorAll('.card[data-topic]').length || best > 0)) {
  const parts = [];
  if (best > 0) parts.push(`🔥 ${best}일 연속`);
  parts.push(left ? `오늘 남은 판 ${left}개` : '오늘 다 풀었다 — 내일 또');
  note.textContent = parts.join(' · ');
}
