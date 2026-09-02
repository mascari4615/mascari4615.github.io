/**
 * 도미노 입체 (2026-09-03, D1. 입체가 정본)
 *
 * 방 상(`card-stage`)에 사람들이 둘러앉음. 남의 짝은 뒷면 타일로 개수만, 내 짝은 앞면,
 * 가운데 줄에는 깔린 타일 (왼쪽 끝이 첫 타일 위 눈, 오른쪽 끝이 마지막 타일 아래 눈).
 * 상 위 내 타일을 직접 고른다. 놓을 쪽이 하나면 바로, 둘이면 HUD의 왼쪽/오른쪽 버튼
 */
import { t } from '../../../lib/i18n';
import { blip } from '../../../lib/blip';
import type { GameView } from '../views';
import { mountCardStage, type CardHand, type CardStage } from '../card-stage';
import { roomAmbience } from '../ambience';
import { sceneOf } from '../scenes';
import { diePip } from '../die';
import { canPlace, weightOf, type DominoesState, type DominoesAction, type Tile } from './dominoes';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pip = (tile: Tile): string => '<span class="ac-dmtile"><i>' + diePip(tile[0]) + '</i><i>' + diePip(tile[1]) + '</i></span>';

export const view3d: GameView<DominoesState, DominoesAction> = {
  id: 'dominoes',
  bare: true,
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-t3 ac-t3room" id="acT3"></div>' +
      '<div class="ac-bjhud" id="acDmHud"><div class="ac-bjlines" id="acDmLines"></div><div class="ac-bjacts ac-tbacts" id="acDmActs"></div></div>';
    const host = el.querySelector('#acT3') as HTMLElement;
    const hudEl = el.querySelector('#acDmHud') as HTMLElement;
    const lineBox = el.querySelector('#acDmLines') as HTMLElement;
    const actBox = el.querySelector('#acDmActs') as HTMLElement;

    const amb = roomAmbience(host);
    let picked = -1;
    let actsKey = '';
    let latest: DominoesState | null = null;
    let mine = 0;
    const chooseTile = (i: number): void => {
      if (!latest) return;
      const hand = latest.hands[mine] ?? [];
      const tile = hand[i];
      if (!tile) return;
      const sides = (['left', 'right'] as const).filter((side) => canPlace(latest!.line, tile, side));
      if (!sides.length) return;
      blip('tap');
      if (sides.length === 1) {
        amb.stone();
        act({ index: i, side: sides[0] });
        picked = -1;
      } else picked = picked === i ? -1 : i;
      actsKey = '';
    };
    const chooseSide = (side: 'left' | 'right'): void => {
      const tile = latest?.hands[mine]?.[picked];
      if (!latest || picked < 0 || !tile || !canPlace(latest.line, tile, side)) return;
      amb.stone();
      blip('tap');
      act({ index: picked, side });
      picked = -1;
      actsKey = '';
    };
    const stage: CardStage = mountCardStage(host, {
      scene: sceneOf('dominoes'),
      onPick(id) {
        if (id.startsWith('tile:')) chooseTile(Number(id.split(':')[1]));
      }
    });
    if (!stage.ok) {
      lineBox.textContent = t('arcade.no3d');
      return () => {};
    }

    let linesKey = '';

    const nope = (b: HTMLElement): void => {
      blip('bad');
      b.classList.remove('ac-bjnope');
      void b.offsetWidth;
      b.classList.add('ac-bjnope');
    };
    hudEl.onclick = (ev) => {
      const b = (ev.target as HTMLElement).closest('button[data-do]') as HTMLButtonElement | null;
      if (!b || !latest) return;
      if (b.disabled) {
        nope(b);
        return;
      }
      const kind = b.dataset.do;
      if (kind === 'tile') {
        chooseTile(Number(b.dataset.n));
      } else if (kind === 'side') {
        chooseSide(b.dataset.s as 'left' | 'right');
      } else if (kind === 'draw') {
        blip('tap');
        act({ kind: 'draw' });
      }
    };
    hudEl.addEventListener('pointerdown', (ev) => {
      const b = (ev.target as HTMLElement).closest('button[data-do]') as HTMLButtonElement | null;
      if (b && b.disabled) nope(b);
    });

    const btn = (kind: string, html: string, on: boolean, ghost: boolean, data = '', pick = false): string =>
      '<button type="button" class="ac-bjbtn' + (ghost ? ' ac-ghost' : '') + (pick ? ' ac-on' : '') + '" data-do="' + kind + '"' +
      data + (on ? '' : ' disabled') + '>' + html + '</button>';

    return (v, mySeat) => {
      const s = v.state;
      latest = s;
      mine = mySeat;
      const names = v.seats.map((x) => x.name);
      const myTurn = s.won === -1 && s.turn === mySeat && !v.finished;
      const hand = s.hands[mySeat] ?? [];

      /* 상 위. 가운데 줄, 남의 짝은 뒷면 일곱까지, 내 짝은 앞면 */
      const hands: CardHand[] = [];
      if (s.line.length) {
        hands.push({
          seat: -1,
          cards: s.line.map((tile) => ({ rank: 0, tile, up: true })),
          wrap: 10,
          label: t('arcade.dominoes.stock', { n: String(s.stock.length) }),
          tone: 'idle'
        });
      }
      s.hands.forEach((h, i) => {
        if (!h.length) return;
        const isMe = i === mySeat;
        hands.push({
          seat: i,
          cards: (isMe ? h : h.slice(0, 7)).map((tile, j) => ({
            rank: 0,
            tile: isMe ? tile : [0, 0],
            up: isMe,
            id: isMe ? 'tile:' + j : undefined,
            can: isMe && myTurn && (canPlace(s.line, tile, 'left') || canPlace(s.line, tile, 'right')),
            held: isMe && j === picked
          })),
          label: (names[i] ?? '') + ' ' + t('arcade.president.cards', { n: String(h.length) }),
          tone: s.won === i ? 'win' : s.won === -1 && s.turn === i ? 'turn' : 'idle'
        });
      });
      stage.setSeats(s.hands.length);
      stage.set(hands, mySeat);

      const line = s.won !== -1 ? '' : myTurn ? t('arcade.table.myTurn') : t('arcade.table.turnOf', { who: names[s.turn] ?? '' });
      const sub = t('arcade.dominoes.mypips', { n: String(hand.reduce((a, x) => a + weightOf(x), 0)) });
      const lk = line + '|' + sub;
      if (lk !== linesKey) {
        linesKey = lk;
        lineBox.innerHTML =
          (line ? '<div class="ac-bjline ac-me"><span>' + esc(line) + '</span></div>' : '') +
          '<div class="ac-bjline ac-bjother"><span>' + esc(sub) + '</span></div>';
      }

      /* 짝 고르기. 놓을 수 있는 짝만 켜짐, 고르면 쪽 버튼, 막히면 뽑기나 넘기기 */
      const can = hand.map((tile) => canPlace(s.line, tile, 'left') || canPlace(s.line, tile, 'right'));
      const sides = picked >= 0 && hand[picked] ? (['left', 'right'] as const).filter((sd) => canPlace(s.line, hand[picked], sd)) : [];
      const stuck = !can.some(Boolean);
      const ak = myTurn ? hand.map((tile, i) => tile.join('') + (can[i] ? 'c' : '') + (i === picked ? 'p' : '')).join(',') + '|' + sides.join(',') + '|' + s.stock.length : 'off';
      if (ak !== actsKey) {
        actsKey = ak;
        actBox.innerHTML = myTurn
          ? hand.map((tile, i) => btn('tile', pip(tile), can[i], true, ' data-n="' + i + '"', i === picked)).join('') +
            sides.map((sd) => btn('side', esc(t(sd === 'left' ? 'arcade.dominoes.left' : 'arcade.dominoes.right')), true, false, ' data-s="' + sd + '"')).join('') +
            btn('draw', esc(t(s.stock.length ? 'arcade.dominoes.draw' : 'arcade.dominoes.pass')), stuck, true)
          : '';
      }
    };
  }
};
