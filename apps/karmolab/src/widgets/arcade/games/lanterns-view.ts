/**
 * 등불 잇기 화면 (TASK-KL-242). 하나비 계열
 *
 * 내 패는 안 보이고 남의 패는 다 보임. 남의 패를 눌러 일러 주거나, 내 패를 골라 내거나 버림
 * 2D 공용 상(`table2d.ts`)을 탄다 (2026-09-03). 상대는 위 자리 카드, 가운데에 남의 패(앞면)와 쌓인 등불, 아래 내 패(뒷면)
 * 뒷면 부채는 안 씀. 이 놀이는 남의 패가 앞면이라 부채 자리에 그 패
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { cardBack, cardMark } from '../card';
import { mountTable } from '../table2d';
import type { LanternsState, LanternsAction } from './lanterns';

const HUE = ['#ef4444', '#22c55e', '#3b82f6'];
const MARK = ['◆', '▲', '●'];

export const lanternsView: GameView<LanternsState, LanternsAction> = {
  id: 'lanterns',
  table: true,
  mount(el, act) {
    const tb = mountTable(el);
    tb.center.innerHTML =
      '<div id="acHbOthers" class="ac-hbothers"></div>' +
      '<div class="ac-hbpiles" id="acHbPiles"></div>';
    tb.acts.innerHTML = '<span id="acHbAct"></span>';
    const pilesEl = el.querySelector('#acHbPiles') as HTMLElement;
    const othersEl = el.querySelector('#acHbOthers') as HTMLElement;
    const actEl = el.querySelector('#acHbAct') as HTMLElement;
    let picked = -1;
    let pilesKey = '';
    let othersKey = '';
    let mineKey = '';
    let actKey = '';

    return (v, mySeat) => {
      const s = v.state;
      const myTurn = !s.over && s.turn === mySeat;

      tb.paint(v as never, mySeat, () => 0, s.over ? -1 : s.turn);
      tb.toast(
        (s.over ? '' : myTurn ? t('arcade.table.myTurn') + '. ' : t('arcade.table.turnOf', { who: v.seats[s.turn]?.name ?? '' }) + '. ') +
        t('arcade.lanterns.hints', { n: String(s.hints) }) + ', ' +
        t('arcade.lanterns.fuses', { n: String(s.fuses) }) + ', ' +
        t('arcade.lanterns.deck', { n: String(s.deck.length) })
      );

      const pk = s.piles.join(',');
      if (pk !== pilesKey) {
        pilesKey = pk;
        pilesEl.innerHTML = s.piles
          .map((n, c) => '<span class="ac-hbp" style="border-color:' + HUE[c] + ';color:' + HUE[c] + '">' + MARK[c] + (n || ', ') + '</span>')
          .join('');
      }

      const ok = JSON.stringify([s.hands.map((h, i) => (i === mySeat ? h.length : h)), s.told, myTurn && s.hints > 0]);
      if (ok !== othersKey) {
        othersKey = ok;
        othersEl.innerHTML = v.seats
          .map((seat, i) => {
            if (i === mySeat) return '';
            const cards = (s.hands[i] ?? [])
              .map((c, j) => {
                const told = s.told[i]?.[j];
                return cardMark(MARK[c.color] + c.rank, {
                  can: myTurn && s.hints > 0,
                  hue: HUE[c.color],
                  /* 이미 일러 준 패에는 표를 남김. 같은 말을 두 번 하지 않게 */
                  note: told && (told.color || told.rank) ? '-' : undefined,
                  data: { o: i, j }
                });
              })
              .join('');
            return '<div class="ac-hbrow"><small>' + seat.name + '</small><div>' + cards + '</div></div>';
          })
          .join('');
        othersEl.querySelectorAll<HTMLButtonElement>('.ac-pc').forEach((b) => {
          b.onclick = () => {
            const o = Number(b.dataset.o);
            const j = Number(b.dataset.j);
            const card = s.hands[o]?.[j];
            if (card) act({ kind: 'hint', seat: o, rank: card.rank });
          };
        });
      }

      const mk = (s.hands[mySeat] ?? []).length + '|' + picked + '|' + (myTurn ? 1 : 0) + '|' + JSON.stringify(s.told[mySeat] ?? []);
      if (mk !== mineKey) {
        mineKey = mk;
        tb.hand.innerHTML = (s.hands[mySeat] ?? [])
          .map((_, j) => {
            const told = s.told[mySeat]?.[j];
            /* 내 패는 언제나 뒷면. 들은 것이 있는지는 읽어 주는 이름으로만 갈림 */
            return cardBack({
              can: myTurn,
              pick: j === picked,
              data: { i: j },
              label: told && told.rank ? '들은 것이 있는 내 패' : '내 패'
            });
          })
          .join('');
        /* 누를 수 있는지는 종이를 만들 때 정해짐(`can`). 여기서는 무슨 일이 일어나는지만 */
        tb.hand.querySelectorAll<HTMLButtonElement>('.ac-pc').forEach((b) => {
          b.onclick = () => {
            const i = Number(b.dataset.i);
            picked = picked === i ? -1 : i;
          };
        });
      }

      const canAct = picked >= 0 && myTurn;
      const ak = canAct ? 'act' : myTurn ? 'pick' : 'wait';
      if (ak !== actKey) {
        actKey = ak;
        actEl.innerHTML = canAct
          ? '<button class="btn btn-primary" id="acHbPlay">' + t('arcade.lanterns.play') + '</button>' +
            '<button class="btn btn-ghost" id="acHbDrop">' + t('arcade.lanterns.drop') + '</button>'
          : '<small>' + (myTurn ? t('arcade.lanterns.pickHint') : t('arcade.lanterns.waiting')) + '</small>';
        const play = actEl.querySelector('#acHbPlay') as HTMLButtonElement | null;
        const drop = actEl.querySelector('#acHbDrop') as HTMLButtonElement | null;
        if (play) play.onclick = () => { act({ kind: 'play', index: picked }); picked = -1; };
        if (drop) drop.onclick = () => { act({ kind: 'drop', index: picked }); picked = -1; };
      }
    };
  }
};
