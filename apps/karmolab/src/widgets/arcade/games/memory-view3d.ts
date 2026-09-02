/**
 * 짝맞추기 입체 (2026-09-03, D1)
 *
 * 방 상에 스물넉 장이 6x4 로 엎어져 있음. 누르면 뒤집힘(`card-stage.setBoard`, 솔리테어와 같은 손).
 * 짝은 값이 같은 카드 둘. 입체에서는 값을 끗수로, 무늬는 값의 짝수 홀수로 가름
 */
import { t } from '../../../lib/i18n';
import { blip } from '../../../lib/blip';
import type { GameView } from '../views';
import { mountCardStage, type CardStage, type CardSpotAt } from '../card-stage';
import { roomAmbience } from '../ambience';
import { sceneOf } from '../scenes';
import type { MemoryState, MemoryAction } from './memory';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* 6x4. 열 간격은 카드 폭보다 조금 넓게, 줄 간격은 카드 높이보다 조금 넓게 */
const COLS = 6;
const COL_X = 1.0;
const ROW_Z = 1.3;
const BOARD_W = 7.2;
const BOARD_D = 6.4;

export const view3d: GameView<MemoryState, MemoryAction> = {
  id: 'memory',
  bare: true,
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-t3 ac-t3room" id="acT3"></div>' +
      '<div class="ac-bjhud" id="acMmHud"><div class="ac-bjlines" id="acMmLines"></div></div>';
    const host = el.querySelector('#acT3') as HTMLElement;
    const lineBox = el.querySelector('#acMmLines') as HTMLElement;

    let latest: MemoryState | null = null;
    let mine = 0;
    const stage: CardStage = mountCardStage(host, {
      scene: sceneOf('memory'),
      board: { w: BOARD_W, d: BOARD_D, focus: { halfW: (COLS / 2) * COL_X + 0.2, halfD: 2 * ROW_Z + 0.6, z: 0, pitch: 62 }, },
      onPick: (id) => {
        if (!latest) return;
        const cell = Number(id.slice(2));
        const myTurn = latest.hideAt === 0 && latest.turn === mine && latest.up.length < 2;
        const open = latest.up.includes(cell) || latest.taken[cell] !== 0;
        if (!myTurn || open) {
          blip('bad');
          stage.nope(id);
          return;
        }
        blip('tap');
        act({ cell });
      }
    });
    const amb = roomAmbience(host);
    if (!stage.ok) {
      lineBox.textContent = t('arcade.no3d');
      return () => {};
    }

    let boardKey = '';
    let linesKey = '';
    let sawAt = 0;
    let sayUntil = 0;
    let sayText = '';

    return (v, mySeat, now) => {
      const s = v.state;
      latest = s;
      mine = mySeat;
      const myTurn = s.hideAt === 0 && s.turn === mySeat && s.up.length < 2;

      const bk = s.up.join(',') + '|' + s.taken.join(',') + '|' + (myTurn ? 1 : 0);
      if (bk !== boardKey) {
        boardKey = bk;
        const spots: CardSpotAt[] = [];
        s.cards.forEach((val, i) => {
          if (s.taken[i] !== 0) return;
          const c = i % COLS;
          const r = Math.floor(i / COLS);
          const open = s.up.includes(i);
          spots.push({
            id: 'c:' + i,
            x: (c - (COLS - 1) / 2) * COL_X,
            z: (r - 1.5) * ROW_Z,
            rank: (val % 13) + 1,
            suit: val % 4,
            up: open,
            can: myTurn && !open
          });
        });
        stage.setBoard(spots);
      }

      if (s.last && s.last.at !== sawAt) {
        sawAt = s.last.at;
        sayText = t(s.last.hit ? 'arcade.memory.hit' : 'arcade.memory.miss', { who: v.seats[s.last.by]?.name || '' });
        sayUntil = now + 1600;
        if (s.last.hit) blip('good');
        else amb.stone();
      }
      const got = v.seats.map((_, i) => s.taken.filter((x) => x === i + 1).length / 2);
      const lines = [
        now < sayUntil ? sayText : v.finished ? '' : myTurn ? t('arcade.table.myTurn') : t('arcade.table.turnOf', { who: v.seats[s.turn]?.name ?? '' }),
        ...v.seats.map((seat, i) => seat.name + ' ' + got[i])
      ];
      const lk = lines.join('|');
      if (lk !== linesKey) {
        linesKey = lk;
        lineBox.innerHTML = lines
          .map((x, i) => (x ? '<div class="ac-bjline' + (i === 0 ? ' ac-me' : ' ac-bjother') + '"><span>' + esc(x) + '</span></div>' : ''))
          .join('');
      }
    };
  }
};
