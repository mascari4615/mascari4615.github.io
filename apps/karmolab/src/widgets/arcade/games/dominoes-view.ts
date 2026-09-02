/**
 * 도미노 화면 (TASK-KL-242)
 *
 * 짝을 누르면 놓을 수 있는 쪽이 하나면 바로, 둘이면 왼쪽 오른쪽 버튼.
 * 2D 공용 상(`table2d.ts`)을 탄다 (2026-09-03). 상대는 위 자리 카드와 뒷면 부채(짝 수), 가운데 깔린 줄, 아래 내 짝
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { diePip } from '../die';
import { mountTable } from '../table2d';
import { canPlace, weightOf, type DominoesState, type DominoesAction, type Tile } from './dominoes';

const esc = (x: string): string => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const pip = (tile: Tile): string =>
  '<span class="ac-dmtile"><i>' + diePip(tile[0]) + '</i><i>' + diePip(tile[1]) + '</i></span>';

export const dominoesView: GameView<DominoesState, DominoesAction> = {
  id: 'dominoes',
  table: true,
  mount(el, act) {
    const tb = mountTable(el);
    tb.center.innerHTML = '<div class="ac-dmline" id="acDmLine"></div>';
    tb.hand.classList.add('ac-dmhand');
    tb.acts.innerHTML = '<span id="acDmSides"></span><button class="btn btn-ghost" id="acDmDraw"></button><span class="ac-dmnums" id="acDmNums"></span>';
    const lineEl = el.querySelector('#acDmLine') as HTMLElement;
    const sidesEl = el.querySelector('#acDmSides') as HTMLElement;
    const drawBtn = el.querySelector('#acDmDraw') as HTMLButtonElement;
    /* 남은 눈과 더미. 점수가 남들 눈 합이라 그 숫자가 지금 얼마인지 보여야 고를 것이 생김 */
    const numsEl = el.querySelector('#acDmNums') as HTMLElement;
    drawBtn.onclick = () => act({ kind: 'draw' });
    let picked = -1;
    let lineKey = '';
    let handKey = '';
    let sideKey = '';

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = s.won === -1 && s.turn === mySeat;
      const hand = s.hands[mySeat] ?? [];

      tb.paint(v as never, mySeat, (i) => s.hands[i]?.length ?? 0, s.won === -1 ? s.turn : -1);
      tb.toast(s.won !== -1 ? '' : myTurn ? t('arcade.table.myTurn') : t('arcade.table.turnOf', { who: v.seats[s.turn]?.name ?? '' }));

      const lk = s.line.map((x) => x.join('')).join(',');
      if (lk !== lineKey) {
        lineKey = lk;
        lineEl.innerHTML = s.line.length ? s.line.map(pip).join('') : '<small>' + t('arcade.dominoes.empty') + '</small>';
        lineEl.scrollLeft = lineEl.scrollWidth;
      }

      const hk = hand.map((tile, i) => tile.join('') + ((canPlace(s.line, tile, 'left') || canPlace(s.line, tile, 'right')) && myTurn ? 'c' : '') + (i === picked ? 'p' : '')).join(',');
      if (hk !== handKey) {
        handKey = hk;
        tb.hand.innerHTML = hand
          .map((tile, i) => {
            const ok = canPlace(s.line, tile, 'left') || canPlace(s.line, tile, 'right');
            return (
              '<button class="ac-dmt' + (ok && myTurn ? ' ac-can' : '') + (i === picked ? ' ac-pick' : '') +
              '" data-i="' + i + '"' + (ok && myTurn ? '' : ' disabled') + '>' + pip(tile) + '</button>'
            );
          })
          .join('');
        tb.hand.querySelectorAll<HTMLButtonElement>('.ac-dmt').forEach((b) => {
          b.onclick = () => {
            const i = Number(b.dataset.i);
            const sides = (['left', 'right'] as const).filter((sd) => canPlace(s.line, hand[i], sd));
            if (sides.length === 1) { act({ index: i, side: sides[0] }); picked = -1; }
            else picked = picked === i ? -1 : i;
          };
        });
      }

      const sides = picked >= 0 && hand[picked]
        ? (['left', 'right'] as const).filter((sd) => canPlace(s.line, hand[picked], sd))
        : [];
      const sk = sides.join(',');
      if (sk !== sideKey) {
        sideKey = sk;
        sidesEl.innerHTML = sides
          .map((sd) => '<button class="btn btn-primary ac-dmside" data-s="' + sd + '">' +
            t(sd === 'left' ? 'arcade.dominoes.left' : 'arcade.dominoes.right') + '</button>')
          .join('');
        sidesEl.querySelectorAll<HTMLButtonElement>('.ac-dmside').forEach((b) => {
          b.onclick = () => {
            act({ index: picked, side: b.dataset.s as 'left' | 'right' });
            picked = -1;
          };
        });
      }

      numsEl.innerHTML =
        '<span>' + esc(t('arcade.dominoes.mypips', { n: String(hand.reduce((a2, x) => a2 + weightOf(x), 0)) })) + '</span>' +
        '<span>' + esc(t('arcade.dominoes.stock', { n: String(s.stock.length) })) + '</span>';

      const stuck = !hand.some((tile) => canPlace(s.line, tile, 'left') || canPlace(s.line, tile, 'right'));
      drawBtn.textContent = s.stock.length ? t('arcade.dominoes.draw') : t('arcade.dominoes.pass');
      drawBtn.disabled = !myTurn || !stuck;
    };
  }
};
