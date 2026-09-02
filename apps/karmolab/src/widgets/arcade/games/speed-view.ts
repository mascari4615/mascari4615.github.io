/**
 * 스피드 화면 (TASK-KL-242)
 *
 * 차례 없음. 한 끗 위아래면 누구든 먼저. 양쪽 다 되면 카드를 먼저 고르고 가운데 자리를 고름
 * 2D 공용 상(`table2d.ts`)을 탄다 (2026-09-03). 상대는 위에 자리 카드와 뒷면 부채, 가운데 두 자리, 아래 내 손패
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { cardMark } from '../card';
import { mountTable } from '../table2d';
import { near, type SpeedState, type SpeedAction } from './speed';

const label = (r: number): string =>
  r === 1 ? 'A' : r === 11 ? 'J' : r === 12 ? 'Q' : r === 13 ? 'K' : String(r);

export const speedView: GameView<SpeedState, SpeedAction> = {
  id: 'speed',
  table: true,
  mount(el, act) {
    const tb = mountTable(el);
    tb.center.innerHTML = '<div class="ac-spcenter" id="acSpCenter"></div>';
    tb.acts.innerHTML = '<span class="ac-spmine" id="acSpMine"></span>';
    const center = el.querySelector('#acSpCenter') as HTMLElement;
    const mineEl = el.querySelector('#acSpMine') as HTMLElement;
    let sawDeals = 0;
    let dealUntil = 0;
    /** 어느 자리에 낼지 고르는 중인 카드 (양쪽 다 가능할 때만 쓴다) */
    let picking = -1;
    let centerKey = '';
    let handKey = '';

    return (v, mySeat, now) => {
      const s = v.state;
      const mine = s.hands[mySeat] ?? [];
      const other = 1 - mySeat;

      /* 상대 자리 아래 뒷면 부채. 차례가 없는 놀이라 금테는 안 씀 */
      tb.paint(v as never, mySeat, (i) => s.hands[i]?.length ?? 0, -1);

      /* 양쪽이 다 막히면 가운데를 새로 깐다. 그 순간을 놓치면 왜 카드가 바뀌었는지 모른다 */
      if ((s.deals ?? 0) !== sawDeals) {
        sawDeals = s.deals ?? 0;
        if (sawDeals > 0) dealUntil = now + 1400;
      }
      tb.toast(
        now < dealUntil
          ? t('arcade.speed.deal')
          : t('arcade.speed.foe', { h: String((s.hands[other] ?? []).length), d: String(s.decks[other]?.length ?? 0) })
      );

      const ck = s.center.join(',') + '|' + (picking >= 0 ? mine[picking] : '');
      if (ck !== centerKey) {
        centerKey = ck;
        center.innerHTML = s.center
          .map((c, p) => {
            const can = picking >= 0 && near(mine[picking], s.center[p]);
            return cardMark(label(c), { data: { p }, can });
          })
          .join('');
        center.querySelectorAll<HTMLButtonElement>('.ac-pc[data-p]').forEach((b) => {
          const p = Number(b.dataset.p);
          b.disabled = picking < 0 || !near(mine[picking], s.center[p]);
          b.onclick = () => {
            act({ card: picking, pile: p });
            picking = -1;
          };
        });
      }

      const hk = mine.map((c, i) => c + (s.center.some((p) => near(c, p)) ? 'c' : '') + (i === picking ? 'p' : '')).join(',');
      if (hk !== handKey) {
        handKey = hk;
        tb.hand.innerHTML = mine
          .map((c, i) => {
            const ok = s.center.some((p) => near(c, p));
            return cardMark(label(c), { can: ok, dim: !ok, pick: i === picking, data: { i } });
          })
          .join('');
        tb.hand.querySelectorAll<HTMLButtonElement>('.ac-pc[data-i]').forEach((b) => {
          b.onclick = () => {
            const i = Number(b.dataset.i);
            const fits = [0, 1].filter((p) => near(mine[i], s.center[p]));
            if (fits.length === 1) act({ card: i, pile: fits[0] });
            else picking = i;
          };
        });
      }
      mineEl.textContent = t('arcade.speed.mine', { n: String(s.decks[mySeat]?.length ?? 0) });
    };
  }
};
