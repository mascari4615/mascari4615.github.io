/**
 * 불꽃놀이 화면 (TASK-KL-242)
 *
 * **내 패는 뒷면**으로, 남의 패는 앞면으로 그린다 — 이 놀이의 전부가 그 뒤집힘이다.
 * 남의 카드를 누르면 그 숫자를 알려 준다. 내 카드를 고르면 내거나 버린다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import type { HanabiState, HanabiAction } from './hanabi';

const HUE = ['#ef4444', '#22c55e', '#3b82f6'];

export const hanabiView: GameView<HanabiState, HanabiAction> = {
  id: 'hanabi',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-hb2">' +
      '<div class="ac-hbpiles" id="acHbPiles"></div>' +
      '<div class="ac-hbmeta" id="acHbMeta"></div>' +
      '<div id="acHbOthers"></div>' +
      '<div class="ac-hbmine" id="acHbMine"></div>' +
      '<div class="ac-hbact" id="acHbAct"></div>' +
      '</div>';
    const pilesEl = el.querySelector('#acHbPiles') as HTMLElement;
    const metaEl = el.querySelector('#acHbMeta') as HTMLElement;
    const othersEl = el.querySelector('#acHbOthers') as HTMLElement;
    const mineEl = el.querySelector('#acHbMine') as HTMLElement;
    const actEl = el.querySelector('#acHbAct') as HTMLElement;
    let picked = -1;

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = !s.over && s.turn === mySeat;

      pilesEl.innerHTML = s.piles
        .map(
          (n, c) =>
            '<span class="ac-hbp" style="border-color:' + HUE[c] + ';color:' + HUE[c] + '">' +
            (n || '·') +
            '</span>'
        )
        .join('');

      metaEl.textContent =
        t('arcade.hanabi.hints', { n: String(s.hints) }) +
        ' · ' +
        t('arcade.hanabi.fuses', { n: String(s.fuses) }) +
        ' · ' +
        t('arcade.hanabi.deck', { n: String(s.deck.length) });

      othersEl.innerHTML = v.seats
        .map((seat, i) => {
          if (i === mySeat) return '';
          const cards = (s.hands[i] ?? [])
            .map((c, j) => {
              const told = s.told[i]?.[j];
              const mark = told && (told.color || told.rank) ? '<i>·</i>' : '';
              return (
                '<button class="ac-hbc" data-o="' + i + '" data-j="' + j +
                '" style="border-color:' + HUE[c.color] + ';color:' + HUE[c.color] + '">' +
                c.rank + mark + '</button>'
              );
            })
            .join('');
          return '<div class="ac-hbrow"><small>' + seat.name + '</small><div>' + cards + '</div></div>';
        })
        .join('');

      mineEl.innerHTML =
        '<small>' + t('arcade.hanabi.mine') + '</small><div>' +
        (s.hands[mySeat] ?? [])
          .map((_, j) => {
            const told = s.told[mySeat]?.[j];
            const face = told && told.rank ? '?' : '·';
            return (
              '<button class="ac-hbc ac-back' + (j === picked ? ' ac-pick' : '') +
              '" data-i="' + j + '">' + face + '</button>'
            );
          })
          .join('') +
        '</div>';

      mineEl.querySelectorAll<HTMLButtonElement>('.ac-hbc').forEach((b) => {
        b.disabled = !myTurn;
        b.onclick = () => {
          const i = Number(b.dataset.i);
          picked = picked === i ? -1 : i;
        };
      });

      othersEl.querySelectorAll<HTMLButtonElement>('.ac-hbc').forEach((b) => {
        b.disabled = !myTurn || s.hints <= 0;
        b.onclick = () => {
          const o = Number(b.dataset.o);
          const j = Number(b.dataset.j);
          const card = s.hands[o]?.[j];
          if (card) act({ kind: 'hint', seat: o, rank: card.rank });
        };
      });

      const canAct = picked >= 0 && myTurn;
      actEl.innerHTML = canAct
        ? '<button class="btn btn-primary" id="acHbPlay">' + t('arcade.hanabi.play') + '</button>' +
          '<button class="btn btn-ghost" id="acHbDrop">' + t('arcade.hanabi.drop') + '</button>'
        : '<small>' + (myTurn ? t('arcade.hanabi.pickHint') : t('arcade.hanabi.waiting')) + '</small>';

      const play = actEl.querySelector('#acHbPlay') as HTMLButtonElement | null;
      const drop = actEl.querySelector('#acHbDrop') as HTMLButtonElement | null;
      if (play) {
        play.onclick = () => {
          act({ kind: 'play', index: picked });
          picked = -1;
        };
      }
      if (drop) {
        drop.onclick = () => {
          act({ kind: 'drop', index: picked });
          picked = -1;
        };
      }
    };
  }
};
