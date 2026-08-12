/**
 * 컵 옮기기 화면 (TASK-KL-242)
 *
 * 바꿔치기는 **커널이 정한 차례를 그대로** 그린다 — 화면이 알아서 흔들면 사람마다 다른 것을
 * 보게 된다. 지금 몇 번째 바꿔치기인지도 커널 시계로 센다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { ballAt, progress, type ShellState, type ShellAction } from './shell';

export const shellgameView: GameView<ShellState, ShellAction> = {
  id: 'shellgame',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-sh">' +
      '<div class="ac-shstage" id="acShStage"></div>' +
      '<div class="ac-shmsg" id="acShMsg"></div>' +
      '<div class="ac-shwho" id="acShWho"></div>' +
      '</div>';
    const stage = el.querySelector('#acShStage') as HTMLElement;
    const msg = el.querySelector('#acShMsg') as HTMLElement;
    const who = el.querySelector('#acShWho') as HTMLElement;
    stage.innerHTML = [0, 1, 2]
      .map((i) => '<button class="ac-shc" data-i="' + i + '"><span></span></button>')
      .join('');
    const cups = Array.from(stage.querySelectorAll<HTMLButtonElement>('.ac-shc'));

    return (v, mySeat, now) => {
      const s = v.state;
      const done = progress(s, now);
      const shuffling = done < s.swaps.length;
      const reveal = s.showAt !== 0;
      const mine = s.picks[mySeat];

      /* 지금까지의 바꿔치기를 자리 배치에 반영한다 — 컵이 실제로 자리를 옮긴 것처럼 보이게. */
      const slot = [0, 1, 2];
      for (let i = 0; i < done; i++) {
        const sw = s.swaps[i];
        if (!sw || sw.a < 0 || sw.b < 0) break;
        const ia = slot.indexOf(sw.a);
        const ib = slot.indexOf(sw.b);
        if (ia >= 0 && ib >= 0) {
          const keep = slot[ia];
          slot[ia] = slot[ib];
          slot[ib] = keep;
        }
      }

      const right = reveal ? ballAt(s) : -1;
      cups.forEach((b, i) => {
        b.style.order = String(slot.indexOf(i));
        b.className =
          'ac-shc' +
          (shuffling ? ' ac-move' : '') +
          (mine === i ? ' ac-pick' : '') +
          (reveal && right === i ? ' ac-ball' : '');
        b.disabled = shuffling || reveal || mine !== -1;
        b.onclick = () => act({ cup: i });
      });

      msg.textContent = shuffling
        ? t('arcade.shell.watch')
        : reveal
          ? right === mine
            ? t('arcade.shell.right')
            : t('arcade.shell.wrong')
          : mine === -1
            ? t('arcade.shell.pick')
            : t('arcade.shell.waiting');

      who.innerHTML = v.seats
        .map((seat, i) =>
          '<span class="ac-dts' + (i === mySeat ? ' ac-me' : '') + '">' +
          seat.name + ' <b>' + (s.score[i] ?? 0) + '</b></span>')
        .join('');
    };
  }
};
