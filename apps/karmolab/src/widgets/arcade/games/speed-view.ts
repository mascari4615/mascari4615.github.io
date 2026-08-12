/**
 * 스피드 화면 (TASK-KL-242)
 *
 * 차례가 없으므로 **낼 수 있는 카드를 늘 눈에 띄게** 해 둔다 — 못 내는 카드를 누르는 데
 * 시간을 쓰면 그건 반응 놀이가 아니라 수수께끼가 된다.
 *
 * 카드를 고른 뒤 가운데를 누르는 두 걸음 대신, **카드를 누르면 낼 수 있는 자리로 바로 간다**.
 * 양쪽 다 낼 수 있을 때만 고르게 한다(그런 경우는 드물다).
 */
import type { GameView } from '../views';
import { near, type SpeedState, type SpeedAction } from './speed';

const label = (n: number): string => (n === 1 ? 'A' : n === 11 ? 'J' : n === 12 ? 'Q' : n === 13 ? 'K' : String(n));

export const speedView: GameView<SpeedState, SpeedAction> = {
  id: 'speed',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-sp">' +
      '<div class="ac-spfoe" id="acSpFoe"></div>' +
      '<div class="ac-spcenter" id="acSpCenter"></div>' +
      '<div class="ac-sphand" id="acSpHand"></div>' +
      '</div>';
    const foe = el.querySelector('#acSpFoe') as HTMLElement;
    const center = el.querySelector('#acSpCenter') as HTMLElement;
    const hand = el.querySelector('#acSpHand') as HTMLElement;
    /** 어느 자리에 낼지 고르는 중인 카드 (양쪽 다 가능할 때만 쓴다) */
    let picking = -1;

    return (v, mySeat) => {
      const s = v.state;
      const mine = s.hands[mySeat] ?? [];
      const other = 1 - mySeat;

      foe.textContent = '🂠'.repeat(Math.min(7, (s.hands[other] ?? []).length)) +
        '  ' + (s.decks[other]?.length ?? 0);

      center.innerHTML = s.center
        .map((c, p) => '<button class="ac-spc" data-p="' + p + '">' + label(c) + '</button>')
        .join('');
      center.querySelectorAll<HTMLButtonElement>('.ac-spc').forEach((b) => {
        const p = Number(b.dataset.p);
        b.classList.toggle('ac-can', picking >= 0 && near(mine[picking], s.center[p]));
        b.disabled = picking < 0 || !near(mine[picking], s.center[p]);
        b.onclick = () => {
          act({ card: picking, pile: p });
          picking = -1;
        };
      });

      hand.innerHTML = mine
        .map((c, i) => {
          const ok = s.center.some((p) => near(c, p));
          return (
            '<button class="ac-spcard' + (ok ? ' ac-can' : '') + (i === picking ? ' ac-pick' : '') +
            '" data-i="' + i + '"' + (ok ? '' : ' disabled') + '>' + label(c) + '</button>'
          );
        })
        .join('');
      hand.querySelectorAll<HTMLButtonElement>('.ac-spcard').forEach((b) => {
        b.onclick = () => {
          const i = Number(b.dataset.i);
          const fits = [0, 1].filter((p) => near(mine[i], s.center[p]));
          if (fits.length === 1) act({ card: i, pile: fits[0] });
          else picking = i;
        };
      });
    };
  }
};
