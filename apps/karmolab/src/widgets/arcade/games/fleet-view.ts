/**
 * 함대 찾기 화면 (TASK-KL-242)
 *
 * 내 판과 남의 판을 **같은 크기로** 나란히 둔다. 내 배가 어디까지 맞았는지가 남을 두들기는
 * 것만큼 중요해서다. 남의 판에서 내가 아는 것은 자국뿐이라, 안 두들긴 칸은 그냥 비어 있다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { N, type FleetState, type FleetAction } from './fleet';

export const fleetView: GameView<FleetState, FleetAction> = {
  id: 'fleet',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-fl"><div class="ac-flmsg" id="acFlMsg"></div><div class="ac-flgrids" id="acFlG"></div></div>';
    const msg = el.querySelector('#acFlMsg') as HTMLElement;
    const wrap = el.querySelector('#acFlG') as HTMLElement;
    let built = 0;

    return (v, mySeat) => {
      const s = v.state;
      const mine = s.turn === mySeat && !s.over && !v.finished;

      if (built !== v.seats.length) {
        built = v.seats.length;
        wrap.innerHTML = v.seats
          .map((_, i) =>
            '<div class="ac-flone" data-at="' + i + '">' +
            '<div class="ac-flname"></div>' +
            '<div class="ac-flboard" style="--n:' + N + '">' +
            Array.from({ length: N * N }, (__, c) => '<button class="ac-flc" data-c="' + c + '"></button>').join('') +
            '</div></div>')
          .join('');
      }

      wrap.querySelectorAll<HTMLElement>('.ac-flone').forEach((box, i) => {
        const own = i === mySeat;
        box.className = 'ac-flone' + (own ? ' ac-me' : '') + (s.alive[i] ? '' : ' ac-dead');
        (box.querySelector('.ac-flname') as HTMLElement).textContent =
          v.seats[i].name + (own ? ', ' + t('arcade.fleet.mine') : '');
        box.querySelectorAll<HTMLButtonElement>('.ac-flc').forEach((b, c) => {
          const m = s.mark[i][c];
          /* 내 판에서만 배가 보인다. 남의 판 배는 애초에 여기까지 안 온다. */
          const ship = own && (s.ships[mySeat] ?? []).includes(c);
          b.className =
            'ac-flc' + (ship ? ' ac-ship' : '') + (m === 1 ? ' ac-miss' : m === 2 ? ' ac-hit' : '') +
            (s.last && s.last.at === i && s.last.cell === c ? ' ac-lastshot' : '');
          b.disabled = own || !mine || !s.alive[i] || m !== 0;
          b.onclick = () => act({ at: i, cell: c });
        });
      });

      msg.textContent = v.finished
        ? ''
        : mine
          ? t('arcade.fleet.your')
          : t('arcade.fleet.wait', { who: v.seats[s.turn]?.name ?? '' });
    };
  }
};
