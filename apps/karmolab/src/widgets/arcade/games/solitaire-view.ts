/**
 * 솔리테어 화면 (change.arcade-cards)
 *
 * 레퍼런스(`solitr.com` 실측)의 배치 그대로. 좌상 스톡과 웨이스트,
 * 우상 파운데이션 넷, 아래 태블로 일곱 열. 열 안 겹침은 카드 높이의 18%
 *
 * **끌지 않는다.** 고르고 놓기. 카드를 누르면 들리고 갈 곳을 누르면 옮겨짐
 * 끌기만 두면 마우스가 없는 사람이 통째로 막힘(`audit-mouse-only`). 고르고 놓기는
 * 자판으로도 그대로, 폰에서도 손가락 하나로
 *
 * 카드가 갈 곳이 하나뿐일 때가 많음. 고른 뒤 갈 곳을 화면이 짚어 줌
 */
import { t } from '../../../lib/i18n';
import { blip } from '../../../lib/blip';
import { applyDeckSkin, rankLabel, suitMark } from '../deck';
import { handNow } from '../hands';
import { roomAmbience } from '../ambience';
import { sceneOf } from '../scenes';
import type { GameView } from '../views';
import {
  allFaceUp,
  autoStep,
  bestMove,
  canDraw,
  canFound,
  foundationFor,
  canStack,
  doneCount,
  isRed,
  rankOf,
  runOk,
  suitOf,
  type SolitaireAction,
  type SolitaireState
} from './solitaire';

/* 무늬 글자와 값 이름은 `deck.ts` 한 곳. 스킨을 갈면 여기도 따라감 */
const mark = (suit: number): string => suitMark(suit);
const label = (rank0: number): string => rankLabel(rank0 + 1);
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * 카드 한 장. 앞면이면 값과 무늬, 뒷면이면 등무늬
 *
 * `data-k` 는 그 카드의 이름(0~51). 다시 그린 뒤에도 **같은 카드를 알아보려고** 붙임
 * 이게 있어야 옛 자리에서 새 자리로 미끄러지는 손맛이 삼(`features/play.md` 의 손맛)
 */
function card(n: number, up: boolean, cls = ''): string {
  /* 뒤집힌 카드도 **같은 이름**. 그래야 뒤집히면서 자리를 옮겨도 한 장으로 이어짐 */
  if (!up) return '<span class="ac-sol-card ac-back ' + cls + '" data-k="' + n + '"></span>';
  const r = label(rankOf(n));
  const m = mark(suitOf(n));
  return (
    '<span class="ac-sol-card' + (isRed(n) ? ' ac-red' : '') + ' ' + cls + '" data-k="' + n + '">' +
    '<b>' + esc(r) + '</b><i>' + esc(m) + '</i><em>' + esc(m) + '</em></span>'
  );
}

/** 지금 든 카드. 태블로 한 줄이거나 웨이스트 한 장이거나 파운데이션 한 장 */
type Held = { kind: 'run'; col: number; from: number } | { kind: 'waste' } | { kind: 'found'; pile: number } | null;

export const solitaireView: GameView<SolitaireState, SolitaireAction> = {
  id: 'solitaire',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-sol">' +
      '<div class="ac-sol-top">' +
      '<div class="ac-sol-deal" id="acSolDeal"></div>' +
      '<div class="ac-sol-found" id="acSolFound"></div>' +
      '</div>' +
      '<div class="ac-sol-tab" id="acSolTab"></div>' +
      '<div class="ac-sol-bar"><span id="acSolNote"></span>' +
      '<button type="button" class="btn btn-ghost" id="acSolAuto" style="display:none"></button>' +
      '<button type="button" class="btn btn-ghost" id="acSolHint"></button></div>' +
      '</div>';
    const dealEl = el.querySelector('#acSolDeal') as HTMLElement;
    const foundEl = el.querySelector('#acSolFound') as HTMLElement;
    const tabEl = el.querySelector('#acSolTab') as HTMLElement;
    const noteEl = el.querySelector('#acSolNote') as HTMLElement;
    const hintBtn = el.querySelector('#acSolHint') as HTMLButtonElement;
    const autoBtn = el.querySelector('#acSolAuto') as HTMLButtonElement;

    let held: Held = null;
    let last: SolitaireState | null = null;
    /**
     * 다시 그린 마지막 모양. 이게 없으면 매 프레임 `innerHTML` 이 갈려서
     * 누르는 사이에 카드가 사라진다. 그러면 누름이 성립을 안 해 **아무 반응이 없다**
     * (2026-09-01 배포판 실측: 스물여덟 칸이 다 눌리는 상태인데 눌러도 안 들림)
     */
    let paintKey = '';

    /**
     * 카드 폭을 판 폭에서 잰다. CSS 만으로는 안 된다. `calc()` 안의 100% 가 안 풀려
     * 카드가 0px 이 되고, `vw` 로 잡으면 사이드바를 못 빼 판이 오른쪽으로 넘친다(둘 다 실측)
     */
    const root = el.querySelector('.ac-sol') as HTMLElement;
    /* 카드 앞뒤 색은 스킨이 정함(`deck.ts`). 2D 와 3D 가 같은 값을 읽음 */
    applyDeckSkin(root);
    const fit = (): void => {
      const w = root.clientWidth || el.clientWidth || 0;
      const h = root.clientHeight || el.clientHeight || 0;
      if (!w) return;
      /* 일곱 열에 사이 여섯. 사이는 카드 폭의 0.2 배라 폭 = (판 - 좌우 여백) / 8.2 */
      const byW = (w - 40) / 8.2;
      /* 세로도 본다. 윗줄 한 장, 사이 0.25, 아래 열 한 장에 겹친 만큼
         칸을 다 쓰라는 계약이라 폭만 보면 긴 열이 아래로 넘친다 */
      const rows = Math.max(7, ...(last ? last.tableau.map((p) => p.cards.length) : [7]));
      const units = 1 + 0.25 + 1 + 0.18 * (rows - 1);
      const byH = h > 120 ? (h - 78) / units / 1.4 : byW;
      const sw = Math.max(38, Math.min(180, Math.floor(Math.min(byW, byH))));
      root.style.setProperty('--sw', sw + 'px');
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    Toolbox.onDispose?.(() => ro.disconnect());
    let flash = '';
    let flashUntil = 0;

    /* 방 소리. 카드를 놓고 집는 소리로 씀 */
    const amb = roomAmbience(el, sceneOf('solitaire') === 'bar' ? 'night' : 'day');

    /**
     * 안 되는 것에는 **삑 소리와 빨간 점등**. 글자만 바뀌면 눈이 딴 데 있을 때 못 봄
     * `at` 은 그 순간 눌린 자리. 없으면 아무 데도 안 깜빡임
     */
    const nope = (msg: string, at?: HTMLElement | null): void => {
      blip('bad');
      /* 자리를 이름으로 기억. 곧 다시 그려서 이 요소는 사라짐(실측: 클래스가 날아갔음) */
      const mark = at
        ? at.id
          ? '#' + at.id
          : at.dataset.f !== undefined
            ? '[data-f="' + at.dataset.f + '"]'
            : at.dataset.c !== undefined
              ? '.ac-sol-cell[data-c="' + at.dataset.c + '"][data-i="' + at.dataset.i + '"]'
              : ''
        : '';
      flash = msg;
      flashUntil = performance.now() + 2200;
      paint(true);
      if (!mark) return;
      const now = el.querySelector<HTMLElement>(mark);
      if (!now) return;
      now.classList.add('ac-nope');
      window.setTimeout(() => now.classList.remove('ac-nope'), 420);
    };

    const say = (msg: string): void => {
      flash = msg;
      flashUntil = performance.now() + 2200;
      paint(true);
    };

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

    /** 든 것을 그 자리에 놓는다 */
    const drop = (to: 'foundation' | 'tableau', at: number): void => {
      if (!held || !last) return;
      const h = held;
      held = null;
      if (h.kind === 'waste') act({ kind: 'waste', to, at });
      else if (h.kind === 'found') {
        if (to === 'tableau') act({ kind: 'unfound', pile: h.pile, at });
      } else act({ kind: 'move', col: h.col, from: h.from, to, at });
    };

    /**
     * 다시 그리면 CSS 전환이 매번 처음부터라 카드가 순간이동(사용자 지적)
     * 그리기 **전에** 자리를 재 두고, 그린 **뒤에** 그만큼 되돌린 채로 시작해 0 으로 보냄
     * 흔히 FLIP 이라 부르는 길. 다시 그려도 미끄러짐
     */
    const spots = new Map<string, DOMRect>();
    const snap = (): void => {
      spots.clear();
      el.querySelectorAll<HTMLElement>('.ac-sol-card[data-k]').forEach((c) => {
        spots.set(c.dataset.k as string, c.getBoundingClientRect());
      });
    };
    const slide = (): void => {
      const moved: HTMLElement[] = [];
      el.querySelectorAll<HTMLElement>('.ac-sol-card[data-k]').forEach((c) => {
        const was = spots.get(c.dataset.k as string);
        if (!was) return;
        const now = c.getBoundingClientRect();
        const dx = was.x - now.x;
        const dy = was.y - now.y;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        c.style.transition = 'none';
        c.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        moved.push(c);
      });
      if (!moved.length) return;
      requestAnimationFrame(() => {
        for (const c of moved) {
          c.style.transition = 'transform .22s cubic-bezier(.2,.9,.3,1)';
          c.style.transform = '';
        }
      });
    };

    /** 판이 얼마나 흘렀나. 레퍼런스 셋이 머리에 시계를 둔다(solitaired 00:00) */
    let elapsed = 0;
    const clock = (): string => {
      const sec = Math.floor(elapsed / 1000);
      return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
    };

    const paint = (force = false): void => {
      const s = last;
      if (!s) return;
      const hc = heldCard(s);
      const key = JSON.stringify([s.stock.length, s.waste, s.foundation, s.tableau, s.passes, s.moves, held, flash, flashUntil > performance.now(), Math.floor(elapsed / 1000)]);
      if (!force && key === paintKey) return;
      paintKey = key;
      snap();
      fit();

      /* 스톡과 웨이스트. 스톡이 비면 되돌릴 수 있는지 보인다 */
      const canRecycle = !s.stock.length && canDraw(s);
      dealEl.innerHTML =
        '<button type="button" class="ac-sol-slot ac-stock' + (s.stock.length || canRecycle ? '' : ' ac-dead') + '" id="acSolStock" aria-label="' + esc(t('arcade.solitaire.stock')) + '">' +
        (s.stock.length ? card(s.stock[s.stock.length - 1], false) : canRecycle ? '<span class="ac-sol-recycle">↺</span>' : '') +
        '<small>' + (s.stock.length ? s.stock.length : canRecycle ? esc(t('arcade.solitaire.recycle')) : esc(t('arcade.solitaire.empty'))) + '</small></button>' +
        '<button type="button" class="ac-sol-slot ac-waste' + (held?.kind === 'waste' ? ' ac-held' : '') + '" id="acSolWaste" aria-label="' + esc(t('arcade.solitaire.waste')) + '">' +
        (s.waste.length ? card(s.waste[s.waste.length - 1], true) : '') +
        (s.passes > 0 ? '<small>' + esc(t('arcade.solitaire.passes', { n: String(s.passes) })) + '</small>' : '') +
        '</button>';

      /* 파운데이션 넷. 든 카드가 갈 수 있으면 자리를 짚어 준다 */
      foundEl.innerHTML = s.foundation
        .map((f, i) => {
          const ok = hc !== null && canFound(f, hc);
          return (
            '<button type="button" class="ac-sol-slot ac-found' + (ok ? ' ac-can' : '') + (held?.kind === 'found' && held.pile === i ? ' ac-held' : '') +
            '" data-f="' + i + '" aria-label="' + esc(t('arcade.solitaire.found')) + '">' +
            (f.length ? card(f[f.length - 1], true) : '<span class="ac-sol-ghost">' + mark(i) + '</span>') +
            '</button>'
          );
        })
        .join('');

      /* 태블로 일곱 열 */
      tabEl.innerHTML = s.tableau
        .map((p, c) => {
          const hidden = p.cards.length - p.up;
          const ok = hc !== null && canStack(p, hc);
          const cards = p.cards
            .map((n, i) => {
              const up = i >= hidden;
              const isHeld = held?.kind === 'run' && held.col === c && i >= held.from;
              const can = up && runOk(p, i);
              return (
                '<button type="button" class="ac-sol-cell' + (isHeld ? ' ac-held' : '') + '" data-c="' + c + '" data-i="' + i + '"' +
                (can || !up ? '' : ' disabled') + ' style="--k:' + i + '">' + card(n, up) + '</button>'
              );
            })
            .join('');
          return (
            '<div class="ac-sol-col' + (ok ? ' ac-can' : '') + '" data-col="' + c + '" style="--n:' + Math.max(1, p.cards.length) + '">' +
            (p.cards.length ? cards : '<button type="button" class="ac-sol-cell ac-empty" data-c="' + c + '" data-i="-1" style="--k:0"><span class="ac-sol-slot ac-hole"></span></button>') +
            '</div>'
          );
        })
        .join('');

      slide();

      const done = doneCount(s);
      noteEl.textContent =
        performance.now() < flashUntil && flash
          ? flash
          : t('arcade.solitaire.progress', { n: String(done), m: String(s.moves) }) + '  ' + clock();
      hintBtn.textContent = t('arcade.solitaire.hint');
      /* 자동 마무리. 뒤집힌 카드도 안 뽑은 카드도 없을 때만 뜬다(레퍼런스와 같은 자리) */
      autoBtn.textContent = t('arcade.solitaire.auto');
      autoBtn.style.display = allFaceUp(s) && autoStep(s) ? '' : 'none';
    };

    /**
     * 끌기. 누르기와 **둘 다** (`features/play.md`)
     *
     * 누르는 순간 집고, 손끝을 따라 **그림자 카드**가 붙어 다니고, 떼는 자리에 놓기
     * 다시 그리기가 요소를 갈아치우므로 처음 잡은 요소를 들고 있으면 안 됨(실측: 안 먹음)
     */
    let dragAt: { x: number; y: number } | null = null;
    let ghost: HTMLElement | null = null;
    let dragged = false;

    const dropGhost = (): void => {
      ghost?.remove();
      ghost = null;
    };

    el.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0 || handNow() !== 'drag') return;
      const hit = (ev.target as HTMLElement).closest<HTMLElement>('.ac-sol-cell, #acSolWaste, [data-f]');
      if (!hit) return;
      dragAt = { x: ev.clientX, y: ev.clientY };
      dragged = false;
    });

    window.addEventListener('pointermove', (ev) => {
      if (!dragAt) return;
      if (!dragged) {
        if (Math.hypot(ev.clientX - dragAt.x, ev.clientY - dragAt.y) < 6) return;
        dragged = true;
        /**
         * 끌기 시작. **들고 있던 것이 있어도 새로 잡은 카드로 갈아탐**
         * 안 그러면 그것이 놓기로 읽혀 못 놓는다는 소리만 나오고, 먼저 든 것을 물려야
         * 다시 시작할 수 있었음(2026-09-01 사용자 실측)
         */
        held = null;
        const under = document.elementFromPoint(dragAt.x, dragAt.y) as HTMLElement | null;
        under?.closest<HTMLElement>('.ac-sol-cell, #acSolWaste, [data-f]')?.click();
        if (held) {
          const src = el.querySelector<HTMLElement>('.ac-held .ac-sol-card');
          if (src) {
            ghost = src.cloneNode(true) as HTMLElement;
            ghost.classList.add('ac-drag');
            const r = src.getBoundingClientRect();
            ghost.style.width = r.width + 'px';
            ghost.style.height = r.height + 'px';
            document.body.appendChild(ghost);
          }
        }
      }
      if (ghost) {
        ghost.style.left = ev.clientX - ghost.offsetWidth / 2 + 'px';
        ghost.style.top = ev.clientY - ghost.offsetHeight / 2 + 'px';
      }
    });

    window.addEventListener('pointerup', (ev) => {
      const was = dragged;
      dragAt = null;
      dragged = false;
      dropGhost();
      if (!was || !held) return;
      /* 놓은 자리. 카드 위든 빈 자리든 열 전체든 */
      const drop = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      const target = drop?.closest<HTMLElement>('.ac-sol-cell, .ac-sol-col, .ac-sol-slot, [data-f]');
      if (!target) {
        held = null;
        blip('tap');
        say(t('arcade.solitaire.dropped'));
        return;
      }
      const cell = target.classList.contains('ac-sol-col')
        ? (target.querySelector<HTMLElement>('.ac-sol-cell:last-child') ?? target)
        : target;
      cell.click();
    });

    /**
     * 두 번 누르면 바로 쌓는 자리로. 레퍼런스 넷 다 있는 손놀림
     * 갈 곳이 없으면 삑 소리와 빨간 점등. 아무 말 없이 안 되는 것이 제일 나쁨
     */
    el.addEventListener('dblclick', (ev) => {
      const s = last;
      if (!s) return;
      const target = ev.target as HTMLElement;
      const cell = target.closest<HTMLElement>('.ac-sol-cell');
      const waste = target.closest<HTMLElement>('#acSolWaste');
      let card = -1;
      if (waste && s.waste.length) card = s.waste[s.waste.length - 1];
      else if (cell) {
        const c = Number(cell.dataset.c);
        const i = Number(cell.dataset.i);
        const p = s.tableau[c];
        if (!p || i !== p.cards.length - 1 || i < p.cards.length - p.up) return;
        card = p.cards[i];
      } else return;
      const at = card >= 0 ? foundationFor(s, card) : null;
      if (at === null) {
        nope(t('arcade.solitaire.nofound'), (waste ?? cell) as HTMLElement);
        return;
      }
      held = null;
      amb.stone();
      if (waste) act({ kind: 'waste', to: 'foundation', at });
      else act({ kind: 'move', col: Number(cell?.dataset.c), from: Number(cell?.dataset.i), to: 'foundation', at });
    });

    /* 자동 마무리. 한 장씩 시차를 두고 올린다. 한꺼번에 올리면 무슨 일이 났는지 안 보인다 */
    let autoTimer = 0;
    const autoRun = (): void => {
      const s = last;
      if (!s) return;
      const mv = autoStep(s);
      if (!mv) return;
      amb.stone();
      act(mv);
      autoTimer = window.setTimeout(autoRun, 140);
    };
    autoBtn.onclick = () => {
      blip('good');
      say(t('arcade.solitaire.autoOn'));
      autoRun();
    };
    Toolbox.onDispose?.(() => window.clearTimeout(autoTimer));

    /* 누르기 하나로 다 한다. 든 것이 없으면 집고, 있으면 놓는다 */
    el.addEventListener('click', (ev) => {
      const s = last;
      if (!s) return;
      const target = ev.target as HTMLElement;
      /* 카드도 자리도 아닌 데를 누르면 들었던 것을 내려놓기. 물릴 길이 없으면 갇힘 */
      if (held && !target.closest('.ac-sol-cell, .ac-sol-slot, #acSolStock, #acSolWaste, [data-f]')) {
        held = null;
        blip('tap');
        say(t('arcade.solitaire.dropped'));
        return;
      }
      const stock = target.closest('#acSolStock');
      if (stock) {
        held = null;
        if (!canDraw(s)) { nope(t('arcade.solitaire.nodraw'), stock as HTMLElement); return; }
        amb.stone();
        act({ kind: 'draw' });
        return;
      }
      const waste = target.closest('#acSolWaste');
      if (waste) {
        if (!s.waste.length) { nope(t('arcade.solitaire.nowaste'), waste as HTMLElement); return; }
        held = held?.kind === 'waste' ? null : { kind: 'waste' };
        blip('tap');
        if (!held) say(t('arcade.solitaire.dropped'));
        paint();
        return;
      }
      const f = target.closest<HTMLElement>('[data-f]');
      if (f) {
        const at = Number(f.dataset.f);
        const hc = heldCard(s);
        if (held && hc !== null) {
          if (!canFound(s.foundation[at], hc)) { nope(t('arcade.solitaire.nofound'), f); return; }
          amb.stone();
          drop('foundation', at);
          return;
        }
        /* 든 것이 없으면 파운데이션 맨 위를 든다(되돌리기) */
        if (held?.kind === 'found' && held.pile === at) { held = null; say(t('arcade.solitaire.dropped')); return; }
        if (s.foundation[at].length) { held = { kind: 'found', pile: at }; blip('tap'); paint(); }
        return;
      }
      const cell = target.closest<HTMLElement>('.ac-sol-cell');
      if (cell) {
        const c = Number(cell.dataset.c);
        const i = Number(cell.dataset.i);
        const hc = heldCard(s);
        /* 든 것을 다시 누르면 내려놓기. 놓기보다 먼저 봄. 안 그러면 제 자리에 못 놓는다는
           소리만 나오고 영영 못 물림(2026-09-01 실측) */
        if (held?.kind === 'run' && held.col === c && i >= held.from) {
          held = null;
          blip('tap');
          say(t('arcade.solitaire.dropped'));
          return;
        }
        if (held && hc !== null) {
          if (!canStack(s.tableau[c], hc)) { nope(t('arcade.solitaire.nostack'), cell); return; }
          amb.stone();
          drop('tableau', c);
          return;
        }
        if (i < 0) return;
        const p = s.tableau[c];
        const hidden = p.cards.length - p.up;
        if (i < hidden) { nope(t('arcade.solitaire.facedown'), cell); return; }
        if (!runOk(p, i)) { nope(t('arcade.solitaire.norun'), cell); return; }
        const same = held?.kind === 'run' && held.col === c && held.from === i;
        held = same ? null : { kind: 'run', col: c, from: i };
        blip('tap');
        if (same) say(t('arcade.solitaire.dropped'));
        paint();
      }
    });

    hintBtn.onclick = () => {
      const s = last;
      if (!s) return;
      const mv = bestMove(s);
      if (!mv) { nope(t('arcade.solitaire.nohint'), hintBtn); return; }
      blip('good');
      say(hintText(mv, s));
    };

    return (v) => {
      last = v.state;
      elapsed = v.now;
      /* 상태가 바뀌면 들고 있던 것을 놓는다. 그 자리가 이미 없을 수 있다 */
      if (held) {
        const hc = heldCard(v.state);
        if (hc === null) held = null;
      }
      paint();
    };
  }
};

export function hintText(mv: SolitaireAction, s: SolitaireState): string {
  if (mv.kind === 'draw') return t('arcade.solitaire.hint.draw');
  if (mv.kind === 'waste') return t(mv.to === 'foundation' ? 'arcade.solitaire.hint.wasteFound' : 'arcade.solitaire.hint.wasteTab', { n: String(mv.at + 1) });
  if (mv.kind === 'unfound') return t('arcade.solitaire.hint.unfound', { n: String(mv.at + 1) });
  const p = s.tableau[mv.col];
  const name = p && p.cards[mv.from] !== undefined ? label(rankOf(p.cards[mv.from])) + mark(suitOf(p.cards[mv.from])) : '';
  return t(mv.to === 'foundation' ? 'arcade.solitaire.hint.toFound' : 'arcade.solitaire.hint.toTab', { c: name, n: String(mv.at + 1) });
}
