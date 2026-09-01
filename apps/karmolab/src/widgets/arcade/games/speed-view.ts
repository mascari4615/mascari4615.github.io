/**
 * 스피드 화면 (TASK-KL-242)
 *
 * 차례가 없으므로 **낼 수 있는 카드를 늘 눈에 띄게** 해 둔다. 못 내는 카드를 누르는 데
 * 시간을 쓰면 그건 반응 놀이가 아니라 수수께끼가 된다.
 *
 * 카드를 고른 뒤 가운데를 누르는 두 걸음 대신, **카드를 누르면 낼 수 있는 자리로 바로 간다**.
 * 양쪽 다 낼 수 있을 때만 고르게 한다(그런 경우는 드물다).
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { cardBack, cardMark } from '../card';
import { near, type SpeedState, type SpeedAction } from './speed';

const esc = (x: string): string => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const label = (n: number): string => (n === 1 ? 'A' : n === 11 ? 'J' : n === 12 ? 'Q' : n === 13 ? 'K' : String(n));

export const speedView: GameView<SpeedState, SpeedAction> = {
  id: 'speed',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-sp">' +
      '<div class="ac-spfoe" id="acSpFoe"></div>' +
      '<div class="ac-spsay" id="acSpSay" role="status"></div>' +
      '<div class="ac-spcenter" id="acSpCenter"></div>' +
      '<div class="ac-sphand" id="acSpHand"></div>' +
      '<div class="ac-spmine" id="acSpMine"></div>' +
      '</div>';
    const foe = el.querySelector('#acSpFoe') as HTMLElement;
    const center = el.querySelector('#acSpCenter') as HTMLElement;
    const hand = el.querySelector('#acSpHand') as HTMLElement;
    /* 내 더미가 몇 장 남았나. 남의 것만 보이면 내가 이기고 있는지 지고 있는지 모른다 */
    const mineEl = el.querySelector('#acSpMine') as HTMLElement;
    const sayEl = el.querySelector('#acSpSay') as HTMLElement;
    let sawDeals = 0;
    let sayTimer = 0;
    /** 어느 자리에 낼지 고르는 중인 카드 (양쪽 다 가능할 때만 쓴다) */
    let picking = -1;

    return (v, mySeat) => {
      const s = v.state;
      const mine = s.hands[mySeat] ?? [];
      const other = 1 - mySeat;

      /* 남의 패 = 뒷면 카드 줄. 글자(🂠)로 그리면 글꼴 따라 크기가 널뛴다. */
      /* 뒷면만 겹쳐 두면 몇 장인지 안 보인다(실측: 한 장처럼 뭉쳤다). 손과 더미를 글자로 적는다 */
      foe.innerHTML =
        Array.from({ length: Math.min(5, (s.hands[other] ?? []).length) }, () => cardBack()).join('') +
        '<b>' + esc(t('arcade.speed.foe', {
          h: String((s.hands[other] ?? []).length),
          d: String(s.decks[other]?.length ?? 0)
        })) + '</b>';

      center.innerHTML = s.center
        .map((c, p) => cardMark(label(c), { data: { p } }))
        .join('');
      center.querySelectorAll<HTMLButtonElement>('.ac-pc[data-p]').forEach((b) => {
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
          return cardMark(label(c), { can: ok, dim: !ok, pick: i === picking, data: { i } });
        })
        .join('');
      mineEl.textContent = t('arcade.speed.mine', { n: String(s.decks[mySeat]?.length ?? 0) });

      /* 양쪽이 다 막히면 가운데를 새로 깐다. 그 순간을 놓치면 왜 카드가 바뀌었는지 모른다 */
      if ((s.deals ?? 0) !== sawDeals) {
        sawDeals = s.deals ?? 0;
        if (sawDeals > 0) {
          sayEl.textContent = t('arcade.speed.deal');
          window.clearTimeout(sayTimer);
          sayTimer = window.setTimeout(() => { sayEl.textContent = ''; }, 1400);
        }
      }

      hand.querySelectorAll<HTMLButtonElement>('.ac-pc[data-i]').forEach((b) => {
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
