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
import { blip } from '../../../lib/blip';
import type { GameView } from '../views';
import { mountCardStage, type CardSpotAt, type CardStage } from '../card-stage';
import { roomAmbience } from '../ambience';
import { sceneOf } from '../scenes';
import {
  allFaceUp,
  autoStep,
  bestMove,
  canDraw,
  canFound,
  canStack,
  doneCount,
  foundationFor,
  rankOf,
  runOk,
  suitOf,
  type SolitaireAction,
  type SolitaireState
} from './solitaire';
/* 안내 문구는 평면과 **같은 글**. 두 화면이 다른 말을 하면 안 된다 */
import { hintText } from './solitaire-view';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 상 크기. 일곱 열이 들어가고 위 줄에 여섯 자리가 선다 */
const BOARD_W = 8.4;
const BOARD_D = 7.2;
/** 열 사이. 카드 폭 0.82 에 여유 */
const COL_X = 1.05;
/**
 * 열 안에서 한 장 내려오는 만큼. 레퍼런스는 카드 높이의 16~20%
 * (solitr 20px/123, worldofsolitaire 33px/163. 2026-09-01 실측). 평면도 18%
 * 입체는 카메라가 비스듬해 깊이가 눌려 보임. 그 눌림만큼 키운 26%
 * 옛 값 0.42 는 37%. 열이 상 절반을 먹던 값
 */
const STEP_Z = 0.3;
const TOP_Z = -2.5;
const TAB_Z = -1.1;

/** 카드 반 폭과 반 높이. 카메라가 담을 구역을 잴 때 씀 */
const CARD_HALF_W = 0.41;
const CARD_HALF_H = 0.574;

/**
 * 열이 `rows` 장일 때 카메라가 담을 깊이와 가운데
 * 처음 일곱 장에서 시작해 열이 길어지면 넓어진다. 고정으로 잡으면 처음 판 아래가 비어 보임
 * (2026-09-01 사용자 지적: 구도가 최악)
 */
const depthFor = (rows: number): { halfD: number; z: number } => {
  const back = TOP_Z - CARD_HALF_H;
  const front = TAB_Z + Math.max(0, rows - 1) * STEP_Z + CARD_HALF_H;
  return { halfD: (front - back) / 2, z: (front + back) / 2 };
};

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
    /** 판이 얼마나 흘렀나. 평면과 같은 시계 */
    let elapsed = 0;
    /** 마지막으로 누른 자리와 때. 같은 자리를 곧바로 다시 누르면 두 번 누른 것 */
    let tapAt = { id: '', t: 0 };
    let autoTimer = 0;
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

    /** 안 되는 것. 삑 소리와 그 자리 카드가 빨갛게 떨림 */
    const nope = (msg: string, id?: string): void => {
      blip('bad');
      if (id) stage.nope(id);
      say(msg);
    };

    /** 그 자리의 카드. 두 번 눌러 바로 올릴 때 무엇인지 알아야 함 */
    const cardAt = (s: SolitaireState, id: string): number => {
      if (id === 'waste') return s.waste.length ? s.waste[s.waste.length - 1] : -1;
      const m = /^c(\d+):(\d+)$/.exec(id);
      if (!m) return -1;
      const p = s.tableau[Number(m[1])];
      const i = Number(m[2]);
      if (!p || i !== p.cards.length - 1 || i < p.cards.length - p.up) return -1;
      return p.cards[i];
    };

    /** 누른 이름을 규칙의 수로 푼다 */
    const pick = (id: string): void => {
      const s = last;
      if (!s) return;
      /* 같은 자리를 곧바로 다시 누르면 쌓는 자리로 바로. 평면의 두 번 누르기와 같은 손놀림 */
      const now = performance.now();
      const twice = tapAt.id === id && now - tapAt.t < 340;
      tapAt = { id, t: now };
      if (twice) {
        const card = cardAt(s, id);
        const at = card >= 0 ? foundationFor(s, card) : null;
        if (at !== null) {
          held = null;
          amb.stone();
          if (id === 'waste') act({ kind: 'waste', to: 'foundation', at });
          else {
            const m = /^c(\d+):(\d+)$/.exec(id);
            if (m) act({ kind: 'move', col: Number(m[1]), from: Number(m[2]), to: 'foundation', at });
          }
          return;
        }
      }
      if (id === 'stock') {
        held = null;
        if (!canDraw(s)) {
          nope(t('arcade.solitaire.nodraw'), 'stock');
          return;
        }
        amb.stone();
        act({ kind: 'draw' });
        return;
      }
      const hc = heldCard(s);
      if (id === 'waste') {
        if (held && hc !== null && held.kind !== 'waste') {
          nope(t('arcade.solitaire.nostack'), 'waste');
          return;
        }
        if (!s.waste.length) {
          nope(t('arcade.solitaire.nowaste'), 'waste');
          return;
        }
        const same = held?.kind === 'waste';
        held = same ? null : { kind: 'waste' };
        blip('tap');
        if (same) say(t('arcade.solitaire.dropped'));
        paint();
        return;
      }
      if (id.startsWith('f')) {
        const at = Number(id.slice(1));
        if (held && hc !== null) {
          if (!canFound(s.foundation[at], hc)) {
            nope(t('arcade.solitaire.nofound'), 'f' + at);
            return;
          }
          const h = held;
          held = null;
          amb.stone();
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
          blip('tap');
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
          nope(t('arcade.solitaire.nostack'), id);
          return;
        }
        const h = held;
        held = null;
        amb.stone();
        if (h.kind === 'waste') act({ kind: 'waste', to: 'tableau', at: c });
        else if (h.kind === 'found') act({ kind: 'unfound', pile: h.pile, at: c });
        else act({ kind: 'move', col: h.col, from: h.from, to: 'tableau', at: c });
        return;
      }
      if (i < 0) return;
      const p = s.tableau[c];
      const hidden = p.cards.length - p.up;
      if (i < hidden) {
        nope(t('arcade.solitaire.facedown'), id);
        return;
      }
      if (!runOk(p, i)) {
        nope(t('arcade.solitaire.norun'), id);
        return;
      }
      const same = held?.kind === 'run' && held.col === c && held.from === i;
      held = same ? null : { kind: 'run', col: c, from: i };
      blip('tap');
      if (same) say(t('arcade.solitaire.dropped'));
      paint();
    };

    const stage: CardStage = mountCardStage(host, {
      scene,
      board: {
        w: BOARD_W,
        d: BOARD_D,
        /* 카메라가 담을 구역. 일곱 열 폭과 윗줄에서 열 열 장까지. 상 전체가 아니다 */
        focus: { halfW: 3 * COL_X + CARD_HALF_W, ...depthFor(7), pitch: 64 }
      },
      onPick: pick,
      /* 끌기가 시작되면 들고 있던 것을 물린다. 새로 잡은 카드가 놓기로 읽히면 안 된다 */
      onDrop: () => {
        held = null;
      },
      /* 빈 데를 누르면 내려놓기. 물릴 길이 없으면 갇힌다(평면과 같은 길) */
      onMiss: () => {
        if (!held) return;
        held = null;
        blip('tap');
        say(t('arcade.solitaire.dropped'));
      }
    });

    if (!stage.ok) {
      barEl.textContent = t('arcade.no3d');
      return () => {};
    }

    /* 자동 마무리. 한 장씩 시차를 두고. 한꺼번에 올리면 무슨 일이 났는지 안 보인다 */
    function autoRun(): void {
      const s = last;
      if (!s) return;
      const mv = autoStep(s);
      if (!mv) return;
      amb.stone();
      act(mv);
      autoTimer = window.setTimeout(autoRun, 140);
    }

    function paint(): void {
      const s = last;
      if (!s) return;
      const spots: CardSpotAt[] = [];

      const hc = heldCard(s);
      /* 더미. 남은 게 있으면 뒷면 한 장 */
      if (s.stock.length) spots.push({ id: 'stock', x: colX(0), z: TOP_Z, rank: 0, up: false });
      /* 뽑은 자리. 새로 나온 카드는 **더미에서 날아온다**. 뚝 나오면 어디서 왔는지 모른다 */
      if (s.waste.length) {
        const card = s.waste[s.waste.length - 1];
        spots.push({
          id: 'waste',
          x: colX(1),
          z: TOP_Z,
          rank: rankOf(card) + 1,
          suit: suitOf(card),
          up: true,
          held: held?.kind === 'waste',
          from: { x: colX(0), z: TOP_Z }
        });
      }
      /* 쌓는 자리 넷. 든 카드가 갈 수 있으면 자리를 짚어 준다(평면의 `ac-can`) */
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
          held: held?.kind === 'found' && held.pile === i,
          can: hc !== null && canFound(f, hc)
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
      /* 열 맨 아래 카드에 놓을 수 있다는 표시. 빈 열은 아래 테두리가 맡는다 */
      if (hc !== null) {
        s.tableau.forEach((p, c) => {
          if (!p.cards.length || !canStack(p, hc)) return;
          const at = spots.find((sp) => sp.id === 'c' + c + ':' + (p.cards.length - 1));
          if (at) at.can = true;
        });
      }
      stage.setBoard(spots);

      /* 빈 자리 테두리. 놓을 수 있는 곳이 바뀌면 다시 그린다 */
      stage.setSlots([
        { x: colX(0), z: TOP_Z, id: 'stock' },
        { x: colX(1), z: TOP_Z, id: 'waste' },
        ...Array.from({ length: 4 }, (_, i) => ({
          x: colX(3 + i),
          z: TOP_Z,
          id: 'f' + i,
          can: hc !== null && !s.foundation[i].length && canFound(s.foundation[i], hc)
        })),
        ...Array.from({ length: 7 }, (_, c) => ({
          x: colX(c),
          z: TAB_Z,
          id: 'c' + c + ':-1',
          can: hc !== null && !s.tableau[c].cards.length && canStack(s.tableau[c], hc)
        }))
      ]);

      /* 가장 긴 열에 맞춰 담을 깊이를 다시 잡는다. 일곱 장보다 짧아지지는 않는다 */
      const rows = Math.max(7, ...s.tableau.map((p) => p.cards.length));
      const d = depthFor(rows);
      stage.setFocus(d.halfD, d.z);

      /* 상 위 글자. 남은 장수와 되돌린 바퀴. 평면은 더미 밑에 숫자를 적는다 */
      const recycle = !s.stock.length && canDraw(s);
      stage.setNotes([
        {
          x: colX(0),
          z: TOP_Z + 0.72,
          text: s.stock.length ? String(s.stock.length) : recycle ? t('arcade.solitaire.recycle') : t('arcade.solitaire.empty'),
          tone: recycle ? 'turn' : 'idle'
        },
        ...(s.passes > 0 ? [{ x: colX(1), z: TOP_Z + 0.72, text: t('arcade.solitaire.passes', { n: String(s.passes) }) }] : [])
      ]);

      const done = doneCount(s);
      const sec = Math.floor(elapsed / 1000);
      const clock = String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
      const msg =
        performance.now() < flashUntil && flash
          ? flash
          : t('arcade.solitaire.progress', { n: String(done), m: String(s.moves) }) + '  ' + clock;
      const canAuto = allFaceUp(s) && autoStep(s);
      barEl.innerHTML =
        '<span>' + esc(msg) + '</span>' +
        (canAuto ? '<button type="button" class="ac-sol3dhint" id="acSol3dAuto">' + esc(t('arcade.solitaire.auto')) + '</button>' : '') +
        '<button type="button" class="ac-sol3dhint" id="acSol3dHint">' + esc(t('arcade.solitaire.hint')) + '</button>';
      const ab = barEl.querySelector<HTMLButtonElement>('#acSol3dAuto');
      if (ab) {
        ab.onclick = () => {
          blip('good');
          say(t('arcade.solitaire.autoOn'));
          autoRun();
        };
      }
      const hb = barEl.querySelector<HTMLButtonElement>('#acSol3dHint');
      if (hb) {
        hb.onclick = () => {
          const now = last;
          if (!now) return;
          const mv = bestMove(now);
          if (mv) { blip('good'); say(hintText(mv, now)); }
          else nope(t('arcade.solitaire.nohint'));
        };
      }
    }

    Toolbox.onDispose?.(() => window.clearTimeout(autoTimer));

    return (v) => {
      last = v.state;
      elapsed = v.now;
      if (held && heldCard(v.state) === null) held = null;
      paint();
    };
  }
};
