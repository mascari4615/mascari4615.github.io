/**
 * 등불 잇기 화면 (TASK-KL-242)
 *
 * **내 패는 뒷면**으로, 남의 패는 앞면으로 그린다. 이 놀이의 전부가 그 뒤집힘이다.
 * 남의 카드를 누르면 그 숫자를 알려 준다. 내 카드를 고르면 내거나 버린다.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { cardBack, cardMark } from '../card';
import type { LanternsState, LanternsAction } from './lanterns';

const HUE = ['#ef4444', '#22c55e', '#3b82f6'];
/**
 * **색이 이 놀이의 규칙 그 자체다**. 빨강 줄, 초록 줄, 파랑 줄을 따로 쌓는다. 그래서 색만으로
 * 그리면 색을 못 가르는 사람은 이 놀이를 **아예 못 한다**(적록색약은 스무 명에 하나꼴이다).
 * 색마다 모양을 같이 준다. 모양은 아무나 읽는다. 색을 없애는 것이 아니라 **하나 더** 주는 것이다.
 */
const MARK = ['◆', '▲', '●'];

export const lanternsView: GameView<LanternsState, LanternsAction> = {
  id: 'lanterns',
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
            MARK[c] + (n || ', ') +
            '</span>'
        )
        .join('');

      metaEl.textContent =
        t('arcade.lanterns.hints', { n: String(s.hints) }) +
        ', ' +
        t('arcade.lanterns.fuses', { n: String(s.fuses) }) +
        ', ' +
        t('arcade.lanterns.deck', { n: String(s.deck.length) });

      othersEl.innerHTML = v.seats
        .map((seat, i) => {
          if (i === mySeat) return '';
          const cards = (s.hands[i] ?? [])
            .map((c, j) => {
              const told = s.told[i]?.[j];
              return cardMark(MARK[c.color] + c.rank, {
                can: myTurn && s.hints > 0,
                hue: HUE[c.color],
                /* 이미 일러 준 패에는 표를 남긴다. 같은 말을 두 번 하지 않게. */
                note: told && (told.color || told.rank) ? '-' : undefined,
                data: { o: i, j }
              });
            })
            .join('');
          return '<div class="ac-hbrow"><small>' + seat.name + '</small><div>' + cards + '</div></div>';
        })
        .join('');

      mineEl.innerHTML =
        '<small>' + t('arcade.lanterns.mine') + '</small><div>' +
        (s.hands[mySeat] ?? [])
          .map((_, j) => {
            const told = s.told[mySeat]?.[j];
            /* 내 패는 언제나 뒷면. 들은 것이 있는지는 읽어 주는 이름으로만 갈린다. */
            return cardBack({
              can: myTurn,
              pick: j === picked,
              data: { i: j },
              label: told && told.rank ? '들은 것이 있는 내 패' : '내 패'
            });
          })
          .join('') +
        '</div>';

      /* 누를 수 있는지는 종이를 만들 때 정해졌다(`can`). 여기서는 무슨 일이 일어나는지만. */
      mineEl.querySelectorAll<HTMLButtonElement>('.ac-pc').forEach((b) => {
        b.onclick = () => {
          const i = Number(b.dataset.i);
          picked = picked === i ? -1 : i;
        };
      });

      othersEl.querySelectorAll<HTMLButtonElement>('.ac-pc').forEach((b) => {
        b.onclick = () => {
          const o = Number(b.dataset.o);
          const j = Number(b.dataset.j);
          const card = s.hands[o]?.[j];
          if (card) act({ kind: 'hint', seat: o, rank: card.rank });
        };
      });

      const canAct = picked >= 0 && myTurn;
      actEl.innerHTML = canAct
        ? '<button class="btn btn-primary" id="acHbPlay">' + t('arcade.lanterns.play') + '</button>' +
          '<button class="btn btn-ghost" id="acHbDrop">' + t('arcade.lanterns.drop') + '</button>'
        : '<small>' + (myTurn ? t('arcade.lanterns.pickHint') : t('arcade.lanterns.waiting')) + '</small>';

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
