/**
 * 도미노 화면 (TASK-KL-242)
 *
 * 줄이 길어지면 폰 화면을 넘는다 — 옆으로 흐르게 두고 **끝을 보여 준다**(맞닿는 숫자가 거기 있다).
 * 패를 고르면 붙일 수 있는 쪽만 단추로 뜬다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { canPlace, type DominoesState, type DominoesAction, type Tile } from './dominoes';

const pip = (t: Tile): string => '<span class="ac-dm">' + t[0] + '<i></i>' + t[1] + '</span>';

export const dominoesView: GameView<DominoesState, DominoesAction> = {
  id: 'dominoes',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-dmwrap">' +
      '<div class="ac-dmline" id="acDmLine"></div>' +
      '<div class="ac-dmhand" id="acDmHand"></div>' +
      '<div class="ac-dmbar"><span id="acDmSides"></span><button class="btn btn-ghost" id="acDmDraw"></button></div>' +
      '</div>';
    const lineEl = el.querySelector('#acDmLine') as HTMLElement;
    const handEl = el.querySelector('#acDmHand') as HTMLElement;
    const sidesEl = el.querySelector('#acDmSides') as HTMLElement;
    const drawBtn = el.querySelector('#acDmDraw') as HTMLButtonElement;
    drawBtn.onclick = () => act({ kind: 'draw' });
    let picked = -1;

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = s.won === -1 && s.turn === mySeat;
      const hand = s.hands[mySeat] ?? [];

      lineEl.innerHTML = s.line.length ? s.line.map(pip).join('') : '<small>' + t('arcade.dominoes.empty') + '</small>';
      lineEl.scrollLeft = lineEl.scrollWidth;

      handEl.innerHTML = hand
        .map((tile, i) => {
          const ok = canPlace(s.line, tile, 'left') || canPlace(s.line, tile, 'right');
          return (
            '<button class="ac-dmt' + (ok && myTurn ? ' ac-can' : '') + (i === picked ? ' ac-pick' : '') +
            '" data-i="' + i + '"' + (ok && myTurn ? '' : ' disabled') + '>' + pip(tile) + '</button>'
          );
        })
        .join('');
      handEl.querySelectorAll<HTMLButtonElement>('.ac-dmt').forEach((b) => {
        b.onclick = () => {
          const i = Number(b.dataset.i);
          const sides = (['left', 'right'] as const).filter((sd) => canPlace(s.line, hand[i], sd));
          if (sides.length === 1) { act({ index: i, side: sides[0] }); picked = -1; }
          else picked = picked === i ? -1 : i;
        };
      });

      const sides = picked >= 0 && hand[picked]
        ? (['left', 'right'] as const).filter((sd) => canPlace(s.line, hand[picked], sd))
        : [];
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

      const stuck = !hand.some((tile) => canPlace(s.line, tile, 'left') || canPlace(s.line, tile, 'right'));
      drawBtn.textContent = s.stock.length ? t('arcade.dominoes.draw') : t('arcade.dominoes.pass');
      drawBtn.disabled = !myTurn || !stuck;
    };
  }
};
