/**
 * 오늘의 초성 화면 (change.arcade-absorbs-play 단계 4)
 *
 * 초성과 글자 수만 그림. 답은 DOM 에 안 둠. 맞힌 칸에만 도구 이름을 알려 줌(이 놀이가 사이트를 가르치는 자리).
 * 오늘 것은 `core/dailycho` 가 한국 시간 날짜로 만들고 첫 수로 실음
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { dateKST, humanLeft, msUntilNextKST } from '../../../core/daily';
import { puzzleFor } from '../../../core/dailycho';
import type { ChoState, ChoAction } from './dailycho';

const esc = (v: unknown): string =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const dailychoView: GameView<ChoState, ChoAction> = {
  id: 'dailycho',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-wc ac-cho">' +
      '<div class="ac-wcpick" id="acChoPick">' +
      '<p class="ac-wcask" id="acChoHead"></p>' +
      '<p class="ac-wcmsg">' + esc(t('arcade.dailycho.lead')) + '</p>' +
      '<button type="button" class="ac-wcstart" id="acChoStart">' + esc(t('arcade.dailycho.start')) + '</button>' +
      '</div>' +
      '<div class="ac-wcplay" id="acChoPlay" hidden>' +
      '<p class="ac-wcask" id="acChoTitle"></p>' +
      '<div class="ac-cholist" id="acChoList"></div>' +
      '<div class="ac-wcacts"><button type="button" class="ac-wcstart" id="acChoDone">' + esc(t('arcade.dailycho.check')) + '</button></div>' +
      '<p class="ac-wcmsg" id="acChoLine"></p>' +
      '<div class="ac-rxrow" id="acChoRow"></div>' +
      '</div>' +
      '</div>';
    const $ = <T extends HTMLElement>(id: string): T => el.querySelector<T>('#' + id)!;
    const today = puzzleFor(dateKST());
    $('acChoHead').textContent = t('arcade.dailycho.head', { n: String(today.day), left: humanLeft(msUntilNextKST()) });
    $('acChoStart').onclick = () => act({ kind: 'load', puzzle: today });
    let built = false;
    let graded = false;

    return (v, mySeat) => {
      const s = v.state;
      const seat = mySeat < 0 ? 0 : mySeat;
      if (!s.puzzle) {
        $('acChoPick').hidden = false;
        $('acChoPlay').hidden = true;
        if (mySeat > 0) $('acChoHead').textContent = t('arcade.dailycho.waitHost');
        return;
      }
      $('acChoPick').hidden = true;
      $('acChoPlay').hidden = false;
      const lane = s.lanes[seat];
      if (!lane) return;
      if (!built) {
        built = true;
        $('acChoTitle').textContent = t('arcade.dailycho.title', { n: String(s.puzzle.day) });
        $('acChoList').innerHTML = s.puzzle.questions
          .map((q, i) =>
            '<div class="ac-chorow"><span class="ac-chohint">' + esc(q.hint) + '</span><span class="ac-cholen">' + esc(t('arcade.dailycho.len', { n: String(q.length) })) + '</span>' +
            '<input type="text" class="ac-choin" data-i="' + i + '" maxlength="8" autocomplete="off" spellcheck="false" aria-label="' + (i + 1) + '">' +
            '<span class="ac-chomark" id="acChoMark' + i + '" aria-live="polite"></span></div>')
          .join('');
        const inputs = Array.from(el.querySelectorAll<HTMLInputElement>('.ac-choin'));
        inputs.forEach((input, i) => {
          input.addEventListener('change', () => act({ kind: 'answer', i, text: input.value.trim() }));
          input.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            act({ kind: 'answer', i, text: input.value.trim() });
            if (i + 1 < inputs.length) inputs[i + 1].focus();
            else $('acChoDone').click();
          });
        });
        $('acChoDone').onclick = () => {
          inputs.forEach((input, i) => {
            if (input.value.trim() !== (lane.answers[i] ?? '')) act({ kind: 'answer', i, text: input.value.trim() });
          });
          act({ kind: 'submit' });
        };
        inputs[0]?.focus();
      }
      if (lane.done && !graded) {
        graded = true;
        el.querySelectorAll<HTMLInputElement>('.ac-choin').forEach((input) => { input.disabled = true; });
        s.puzzle.questions.forEach((q, i) => {
          const mark = $('acChoMark' + i);
          mark.textContent = lane.marks[i] === 'hit' ? '🟩 ' + q.tool : lane.marks[i] === 'near' ? t('arcade.dailycho.near') : '⬛';
        });
        ($('acChoDone') as HTMLButtonElement).disabled = true;
      }
      $('acChoLine').textContent = lane.done
        ? t('arcade.dailycho.score', { right: String(lane.right), total: String(s.puzzle.questions.length) })
        : t('arcade.dailycho.hint');
      $('acChoRow').innerHTML = v.seats
        .map((sq, i) => '<span class="ac-dts' + (i === seat ? ' ac-me' : '') + '">' + esc(sq.name) + (s.lanes[i]?.done ? ' <b>' + s.lanes[i].right + '</b>' : '') + '</span>')
        .join('');
    };
  }
};
