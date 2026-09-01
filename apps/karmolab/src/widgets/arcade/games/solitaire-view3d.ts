/**
 * 솔리테어. 입체 화면 (같은 규칙, 다른 표현)
 *
 * 규칙(`solitaire.ts`)은 이 파일을 모름. 무대는 `card-stage.ts` 의 판 모드
 * 상 위에 좌상 더미와 뽑은 자리, 우상 쌓는 자리 넷, 아래 일곱 열을 그대로
 *
 * 평면과 **같은 손놀림**. 끌지 않고 고르고 놓기. 카드를 누르면 들리고 갈 곳을 누르면 옮겨짐
 * 무대는 이름(`id`)만 돌려주고 규칙은 이 파일이 풂
 *
 * 진도와 안내는 판 아래 한 줄. 입체에서도 지금 무엇을 하는지는 글자가 말해야 함
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { mountCardStage, type CardSpotAt, type CardStage } from '../card-stage';
import { roomAmbience } from '../ambience';
import { sceneOf } from '../scenes';
import {
  bestMove,
  canFound,
  canStack,
  doneCount,
  rankOf,
  runOk,
  suitOf,
  type SolitaireAction,
  type SolitaireState
} from './solitaire';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 상 크기. 일곱 열이 들어가고 위 줄에 여섯 자리가 선다 */
const BOARD_W = 8.4;
const BOARD_D = 7.2;
/** 열 사이. 카드 폭 0.82 에 여유 */
const COL_X = 1.05;
/** 열 안에서 한 장 내려오는 만큼 */
const STEP_Z = 0.42;
const TOP_Z = -2.5;
const TAB_Z = -1.1;

/** 열 x 자리. 일곱 열을 가운데 맞춤 */
const colX = (c: number): number => (c - 3) * COL_X;

type Held = { kind: 'run'; col: number; from: number } | { kind: 'waste' } | { kind: 'found'; pile: number } | null;

export const view3d: GameView<SolitaireState, SolitaireAction> = {
  id: 'solitaire',
  bare: true,
  mount(el, act) {
    el.innerHTML = '<div class="ac-t3 ac-t3room" id="acT3"></div><div class="ac-sol3d" id="acSol3d"></div>';
    const host = el.querySelector('#acT3') as HTMLElement;
    const barEl = el.querySelector('#acSol3d') as HTMLElement;

    let last: SolitaireState | null = null;
    let held: Held = null;
    let flash = '';
    let flashUntil = 0;

    const scene = sceneOf('solitaire');
    const amb = roomAmbience(host);

    /** 든 카드가 무엇인가 */
    const heldCard = (s: SolitaireState): number | null => {
      if (!held) return null;
      if (held.kind === 'waste') return s.waste.length ? s.waste[s.waste.length - 1] : null;
      if (held.kind === 'found') {
        const f = s.foundation[held.pile];
        return f.length ? f[f.length - 1] : null;
      }
      const p = s.tableau[held.col];
      return p && held.from < p.cards.length ? p.cards[held.from] : null;
    };

    const say = (msg: string): void => {
      flash = msg;
      flashUntil = performance.now() + 2200;
      paint();
    };

    /** 누른 이름을 규칙의 수로 푼다 */
    const pick = (id: string): void => {
      const s = last;
      if (!s) return;
      amb.stone();
      if (id === 'stock') {
        held = null;
        if (!s.stock.length && (!s.waste.length || s.passes >= 3)) {
          say(t('arcade.solitaire.nodraw'));
          return;
        }
        act({ kind: 'draw' });
        return;
      }
      const hc = heldCard(s);
      if (id === 'waste') {
        if (held && hc !== null && held.kind !== 'waste') {
          say(t('arcade.solitaire.nostack'));
          return;
        }
        if (!s.waste.length) {
          say(t('arcade.solitaire.nowaste'));
          return;
        }
        const same = held?.kind === 'waste';
        held = same ? null : { kind: 'waste' };
        if (same) say(t('arcade.solitaire.dropped'));
        paint();
        return;
      }
      if (id.startsWith('f')) {
        const at = Number(id.slice(1));
        if (held && hc !== null) {
          if (!canFound(s.foundation[at], hc)) {
            say(t('arcade.solitaire.nofound'));
            return;
          }
          const h = held;
          held = null;
          if (h.kind === 'waste') act({ kind: 'waste', to: 'foundation', at });
          else if (h.kind === 'run') act({ kind: 'move', col: h.col, from: h.from, to: 'foundation', at });
          return;
        }
        if (held?.kind === 'found' && held.pile === at) {
          held = null;
          say(t('arcade.solitaire.dropped'));
          return;
        }
        if (s.foundation[at].length) {
          held = { kind: 'found', pile: at };
          paint();
        }
        return;
      }
      /* 태블로. 이름은 `c<열>:<몇 번째>` */
      const m = /^c(\d+):(-?\d+)$/.exec(id);
      if (!m) return;
      const c = Number(m[1]);
      const i = Number(m[2]);
      /* 든 것을 다시 누르면 내려놓기. 놓기보다 먼저 */
      if (held?.kind === 'run' && held.col === c && i >= held.from) {
        held = null;
        say(t('arcade.solitaire.dropped'));
        return;
      }
      if (held && hc !== null) {
        if (!canStack(s.tableau[c], hc)) {
          say(t('arcade.solitaire.nostack'));
          return;
        }
        const h = held;
        held = null;
        if (h.kind === 'waste') act({ kind: 'waste', to: 'tableau', at: c });
        else if (h.kind === 'found') act({ kind: 'unfound', pile: h.pile, at: c });
        else act({ kind: 'move', col: h.col, from: h.from, to: 'tableau', at: c });
        return;
      }
      if (i < 0) return;
      const p = s.tableau[c];
      const hidden = p.cards.length - p.up;
      if (i < hidden) {
        say(t('arcade.solitaire.facedown'));
        return;
      }
      if (!runOk(p, i)) {
        say(t('arcade.solitaire.norun'));
        return;
      }
      const same = held?.kind === 'run' && held.col === c && held.from === i;
      held = same ? null : { kind: 'run', col: c, from: i };
      if (same) say(t('arcade.solitaire.dropped'));
      paint();
    };

    const stage: CardStage = mountCardStage(host, {
      scene,
      board: { w: BOARD_W, d: BOARD_D },
      onPick: pick
    });

    if (!stage.ok) {
      barEl.textContent = t('arcade.no3d');
      return () => {};
    }

    /* 빈 자리 테두리. 더미, 뽑은 자리, 쌓는 자리 넷, 일곱 열 */
    stage.setSlots([
      { x: colX(0), z: TOP_Z },
      { x: colX(1), z: TOP_Z },
      { x: colX(3), z: TOP_Z },
      { x: colX(4), z: TOP_Z },
      { x: colX(5), z: TOP_Z },
      { x: colX(6), z: TOP_Z },
      ...Array.from({ length: 7 }, (_, c) => ({ x: colX(c), z: TAB_Z }))
    ]);

    function paint(): void {
      const s = last;
      if (!s) return;
      const spots: CardSpotAt[] = [];

      /* 더미. 남은 게 있으면 뒷면 한 장 */
      if (s.stock.length) spots.push({ id: 'stock', x: colX(0), z: TOP_Z, rank: 0, up: false });
      /* 뽑은 자리 */
      if (s.waste.length) {
        const card = s.waste[s.waste.length - 1];
        spots.push({
          id: 'waste',
          x: colX(1),
          z: TOP_Z,
          rank: rankOf(card) + 1,
          suit: suitOf(card),
          up: true,
          held: held?.kind === 'waste'
        });
      }
      /* 쌓는 자리 넷 */
      s.foundation.forEach((f, i) => {
        if (!f.length) return;
        const card = f[f.length - 1];
        spots.push({
          id: 'f' + i,
          x: colX(3 + i),
          z: TOP_Z,
          rank: rankOf(card) + 1,
          suit: suitOf(card),
          up: true,
          held: held?.kind === 'found' && held.pile === i
        });
      });
      /* 일곱 열 */
      s.tableau.forEach((p, c) => {
        const hidden = p.cards.length - p.up;
        p.cards.forEach((card, i) => {
          const up = i >= hidden;
          spots.push({
            id: 'c' + c + ':' + i,
            x: colX(c),
            z: TAB_Z + i * STEP_Z,
            rank: up ? rankOf(card) + 1 : 0,
            suit: suitOf(card),
            up,
            layer: i,
            held: held?.kind === 'run' && held.col === c && i >= held.from
          });
        });
        /* 빈 열도 누를 수 있어야 K 를 놓음 */
        if (!p.cards.length) spots.push({ id: 'c' + c + ':-1', x: colX(c), z: TAB_Z, rank: 0, up: false, layer: -1 });
      });
      stage.setBoard(spots);

      const done = doneCount(s);
      const msg =
        performance.now() < flashUntil && flash
          ? flash
          : t('arcade.solitaire.progress', { n: String(done), m: String(s.moves) });
      barEl.innerHTML =
        '<span>' + esc(msg) + '</span>' +
        '<button type="button" class="ac-sol3dhint" id="acSol3dHint">' + esc(t('arcade.solitaire.hint')) + '</button>';
      const hb = barEl.querySelector<HTMLButtonElement>('#acSol3dHint');
      if (hb) {
        hb.onclick = () => {
          const now = last;
          if (!now) return;
          say(bestMove(now) ? t('arcade.solitaire.hintOn') : t('arcade.solitaire.nohint'));
        };
      }
    }

    return (v) => {
      last = v.state;
      if (held && heldCard(v.state) === null) held = null;
      paint();
    };
  }
};
