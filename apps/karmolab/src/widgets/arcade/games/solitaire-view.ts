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
import type { GameView } from '../views';
import {
  bestMove,
  canFound,
  canStack,
  doneCount,
  isRed,
  rankOf,
  runOk,
  suitOf,
  type SolitaireAction,
  type SolitaireState
} from './solitaire';

const MARKS = ['♠', '♣', '♥', '♦'];
const LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 카드 한 장. 앞면이면 값과 무늬, 뒷면이면 등무늬 */
function card(n: number, up: boolean, cls = ''): string {
  if (!up) return '<span class="ac-sol-card ac-back ' + cls + '"></span>';
  const r = LABELS[rankOf(n)];
  const m = MARKS[suitOf(n)];
  return (
    '<span class="ac-sol-card' + (isRed(n) ? ' ac-red' : '') + ' ' + cls + '">' +
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
      '<button type="button" class="btn btn-ghost" id="acSolHint"></button></div>' +
      '</div>';
    const dealEl = el.querySelector('#acSolDeal') as HTMLElement;
    const foundEl = el.querySelector('#acSolFound') as HTMLElement;
    const tabEl = el.querySelector('#acSolTab') as HTMLElement;
    const noteEl = el.querySelector('#acSolNote') as HTMLElement;
    const hintBtn = el.querySelector('#acSolHint') as HTMLButtonElement;

    let held: Held = null;
    let last: SolitaireState | null = null;
    let flash = '';
    let flashUntil = 0;

    const say = (msg: string): void => {
      flash = msg;
      flashUntil = performance.now() + 2200;
      paint();
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

    const paint = (): void => {
      const s = last;
      if (!s) return;
      const hc = heldCard(s);

      /* 스톡과 웨이스트. 스톡이 비면 되돌릴 수 있는지 보인다 */
      const canRecycle = !s.stock.length && s.waste.length > 0 && s.passes < 3;
      dealEl.innerHTML =
        '<button type="button" class="ac-sol-slot ac-stock' + (s.stock.length || canRecycle ? '' : ' ac-dead') + '" id="acSolStock" aria-label="' + esc(t('arcade.solitaire.stock')) + '">' +
        (s.stock.length ? card(0, false) : canRecycle ? '<span class="ac-sol-recycle">↺</span>' : '') +
        '<small>' + s.stock.length + '</small></button>' +
        '<button type="button" class="ac-sol-slot ac-waste' + (held?.kind === 'waste' ? ' ac-held' : '') + '" id="acSolWaste" aria-label="' + esc(t('arcade.solitaire.waste')) + '">' +
        (s.waste.length ? card(s.waste[s.waste.length - 1], true) : '') + '</button>';

      /* 파운데이션 넷. 든 카드가 갈 수 있으면 자리를 짚어 준다 */
      foundEl.innerHTML = s.foundation
        .map((f, i) => {
          const ok = hc !== null && canFound(f, hc);
          return (
            '<button type="button" class="ac-sol-slot ac-found' + (ok ? ' ac-can' : '') + (held?.kind === 'found' && held.pile === i ? ' ac-held' : '') +
            '" data-f="' + i + '" aria-label="' + esc(t('arcade.solitaire.found')) + '">' +
            (f.length ? card(f[f.length - 1], true) : '<span class="ac-sol-ghost">' + MARKS[i] + '</span>') +
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

      const done = doneCount(s);
      noteEl.textContent =
        performance.now() < flashUntil && flash
          ? flash
          : t('arcade.solitaire.progress', { n: String(done), m: String(s.moves) });
      hintBtn.textContent = t('arcade.solitaire.hint');
    };

    /* 누르기 하나로 다 한다. 든 것이 없으면 집고, 있으면 놓는다 */
    el.addEventListener('click', (ev) => {
      const s = last;
      if (!s) return;
      const target = ev.target as HTMLElement;
      const stock = target.closest('#acSolStock');
      if (stock) {
        held = null;
        if (!s.stock.length && (!s.waste.length || s.passes >= 3)) { say(t('arcade.solitaire.nodraw')); return; }
        act({ kind: 'draw' });
        return;
      }
      const waste = target.closest('#acSolWaste');
      if (waste) {
        if (!s.waste.length) { say(t('arcade.solitaire.nowaste')); return; }
        held = held?.kind === 'waste' ? null : { kind: 'waste' };
        paint();
        return;
      }
      const f = target.closest<HTMLElement>('[data-f]');
      if (f) {
        const at = Number(f.dataset.f);
        const hc = heldCard(s);
        if (held && hc !== null) {
          if (!canFound(s.foundation[at], hc)) { say(t('arcade.solitaire.nofound')); return; }
          drop('foundation', at);
          return;
        }
        /* 든 것이 없으면 파운데이션 맨 위를 든다(되돌리기) */
        if (s.foundation[at].length) { held = { kind: 'found', pile: at }; paint(); }
        return;
      }
      const cell = target.closest<HTMLElement>('.ac-sol-cell');
      if (cell) {
        const c = Number(cell.dataset.c);
        const i = Number(cell.dataset.i);
        const hc = heldCard(s);
        if (held && hc !== null) {
          if (!canStack(s.tableau[c], hc)) { say(t('arcade.solitaire.nostack')); return; }
          drop('tableau', c);
          return;
        }
        if (i < 0) return;
        const p = s.tableau[c];
        const hidden = p.cards.length - p.up;
        if (i < hidden) { say(t('arcade.solitaire.facedown')); return; }
        if (!runOk(p, i)) { say(t('arcade.solitaire.norun')); return; }
        held = held?.kind === 'run' && held.col === c && held.from === i ? null : { kind: 'run', col: c, from: i };
        paint();
      }
    });

    hintBtn.onclick = () => {
      const s = last;
      if (!s) return;
      const mv = bestMove(s);
      if (!mv) { say(t('arcade.solitaire.nohint')); return; }
      say(hintText(mv, s));
    };

    return (v) => {
      last = v.state;
      /* 상태가 바뀌면 들고 있던 것을 놓는다. 그 자리가 이미 없을 수 있다 */
      if (held) {
        const hc = heldCard(v.state);
        if (hc === null) held = null;
      }
      paint();
    };
  }
};

function hintText(mv: SolitaireAction, s: SolitaireState): string {
  if (mv.kind === 'draw') return t('arcade.solitaire.hint.draw');
  if (mv.kind === 'waste') return t(mv.to === 'foundation' ? 'arcade.solitaire.hint.wasteFound' : 'arcade.solitaire.hint.wasteTab', { n: String(mv.at + 1) });
  if (mv.kind === 'unfound') return t('arcade.solitaire.hint.unfound', { n: String(mv.at + 1) });
  const p = s.tableau[mv.col];
  const label = p && p.cards[mv.from] !== undefined ? LABELS[rankOf(p.cards[mv.from])] + MARKS[suitOf(p.cards[mv.from])] : '';
  return t(mv.to === 'foundation' ? 'arcade.solitaire.hint.toFound' : 'arcade.solitaire.hint.toTab', { c: label, n: String(mv.at + 1) });
}
