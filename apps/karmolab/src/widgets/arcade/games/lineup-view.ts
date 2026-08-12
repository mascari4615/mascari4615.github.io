/**
 * 한 줄 서기 화면 (TASK-KL-242)
 *
 * 순서를 정하는 일은 **누르는 차례**로 받는다 — 끌어서 옮기기는 폰에서 자주 어긋나고,
 * 「몇 번째」를 숫자로 고르게 하면 셈이 두 번이 된다. 왼쪽에서 고르면 오른쪽 줄에 쌓인다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { useQuestionCount, type LineupState, type LineupAction } from './lineup';

export const lineupView: GameView<LineupState, LineupAction> = {
  id: 'lineup',
  mount(el, act) {
    /* 질문 개수를 말 묶음에서 센다 — 규칙 파일은 무엇을 묻는지 모른다. */
    const raw = t('arcade.lineup.questions');
    const questions = raw && raw !== 'arcade.lineup.questions' ? raw.split('|').map((q) => q.trim()) : [];
    if (questions.length) useQuestionCount(questions.length);

    el.innerHTML =
      '<div class="ac-lu">' +
      '<div class="ac-luq" id="acLuQ"></div>' +
      '<div id="acLuBody"></div>' +
      '</div>';
    const qEl = el.querySelector('#acLuQ') as HTMLElement;
    const body = el.querySelector('#acLuBody') as HTMLElement;
    let order: number[] = [];
    let slider = 50;

    return (v, mySeat) => {
      const s = v.state;
      qEl.textContent = questions[s.q] ?? t('arcade.lineup.fallback');

      if (s.phase === 'pick') {
        const mine = s.picks[mySeat];
        if (mine === null) {
          body.innerHTML =
            '<input type="range" id="acLuR" min="0" max="100" value="' + slider + '">' +
            '<div class="ac-lubig" id="acLuV">' + slider + '</div>' +
            '<button class="btn btn-primary" id="acLuGo">' + t('arcade.lineup.lock') + '</button>';
          const r = body.querySelector('#acLuR') as HTMLInputElement;
          const val = body.querySelector('#acLuV') as HTMLElement;
          r.oninput = () => {
            slider = Number(r.value);
            val.textContent = String(slider);
          };
          (body.querySelector('#acLuGo') as HTMLButtonElement).onclick = () =>
            act({ kind: 'pick', value: slider });
        } else {
          body.innerHTML = '<p class="tool-status">' + t('arcade.lineup.locked', { n: String(mine) }) + '</p>';
        }
        order = [];
        return;
      }

      if (s.phase === 'order') {
        const done = s.guesses[mySeat] !== null;
        if (done) {
          body.innerHTML = '<p class="tool-status">' + t('arcade.lineup.sent') + '</p>';
          return;
        }
        const rest = v.seats.map((_, i) => i).filter((i) => !order.includes(i));
        body.innerHTML =
          '<p class="tool-status">' + t('arcade.lineup.orderHint') + '</p>' +
          '<div class="ac-lurow">' +
          rest.map((i) => '<button class="ac-lup" data-i="' + i + '">' + v.seats[i].name + '</button>').join('') +
          '</div>' +
          '<div class="ac-luline">' +
          order.map((i, k) => '<span>' + (k + 1) + '. ' + v.seats[i].name + '</span>').join('') +
          '</div>' +
          (order.length === v.seats.length
            ? '<button class="btn btn-primary" id="acLuSend">' + t('arcade.lineup.send') + '</button>'
            : '<button class="btn btn-ghost" id="acLuUndo">' + t('arcade.lineup.undo') + '</button>');

        body.querySelectorAll<HTMLButtonElement>('.ac-lup').forEach((b) => {
          b.onclick = () => order.push(Number(b.dataset.i));
        });
        const send = body.querySelector('#acLuSend') as HTMLButtonElement | null;
        if (send) send.onclick = () => act({ kind: 'order', order: order.slice() });
        const undo = body.querySelector('#acLuUndo') as HTMLButtonElement | null;
        if (undo) undo.onclick = () => order.pop();
        return;
      }

      /* reveal — 진짜 순서와 점수 */
      const real = s.picks
        .map((val, i) => ({ v: val ?? 0, i }))
        .sort((a, b) => a.v - b.v || a.i - b.i);
      body.innerHTML =
        '<div class="ac-luline">' +
        real.map((x, k) => '<span>' + (k + 1) + '. ' + v.seats[x.i].name + ' <b>' + x.v + '</b></span>').join('') +
        '</div>' +
        '<div class="ac-lurow">' +
        v.seats.map((seat, i) => '<span class="ac-dts">' + seat.name + ' ' + s.score[i] + '</span>').join('') +
        '</div>';
      order = [];
    };
  }
};
