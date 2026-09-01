/**
 * 블랙잭 입체 화면 (같은 규칙, 다른 표현). 2026-09-01 개편
 *
 * 규칙(`blackjack.ts`)은 이 파일을 모른다. 무대는 `card-stage.ts`(방 안 탁자).
 *
 * 옛 화면이 놓친 것 셋
 *  1. **감춘 카드 뒤집기.** 규칙이 카드를 실제로 뽑아 두므로 열리는 순간 그 자리에서 돎
 *  2. **줄 이름표.** 누구 줄인지와 합계를 상 위에 눕힌다. 아래 HUD 한 줄만 보고 치지 않게
 *  3. **결과 빛깔.** 이긴 줄, 죽은 줄, 비긴 줄이 이름표 색으로 갈림
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { mountCardStage, type CardHand, type CardStage } from '../card-stage';
import { roomAmbience } from '../ambience';
import { sceneOf } from '../scenes';
import { codeRank, codeSuit } from '../deck';
import {
  BETS,
  HANDS,
  activeHand,
  options,
  total,
  type BjRes,
  type BlackjackState,
  type BlackjackAction
} from './blackjack';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const resKey: Record<BjRes, string> = {
  bj: 'arcade.blackjack.resBj',
  win: 'arcade.blackjack.resWin',
  push: 'arcade.blackjack.resPush',
  lose: 'arcade.blackjack.resLose',
  bust: 'arcade.blackjack.resBust',
  surrender: 'arcade.blackjack.resSurrender'
};

const toneOf = (res: BjRes | undefined, live: boolean): CardHand['tone'] => {
  if (res === 'bj' || res === 'win') return 'win';
  if (res === 'lose' || res === 'bust' || res === 'surrender') return 'lose';
  if (res === 'push') return 'push';
  return live ? 'turn' : 'idle';
};

export const view3d: GameView<BlackjackState, BlackjackAction> = {
  id: 'blackjack',
  bare: true,
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-t3 ac-t3room" id="acT3"></div>' +
      '<div class="ac-bjhud" id="acBjHud"></div>';
    const host = el.querySelector('#acT3') as HTMLElement;
    const hudEl = el.querySelector('#acBjHud') as HTMLElement;

    const scene = sceneOf('blackjack');
    const stage: CardStage | null = mountCardStage(host, { scene });
    /* 방 소리. 알이 놓이는 소리를 카드 놓는 소리로 쓴다 */
    const amb = roomAmbience(host);

    if (!stage.ok) {
      /* WebGL 이 없는 창. 셸이 평면으로 내려 준다 */
      hudEl.textContent = t('arcade.no3d');
      return () => {};
    }

    hudEl.onclick = (ev) => {
      const b = (ev.target as HTMLElement).closest('button[data-do]') as HTMLButtonElement | null;
      if (!b || b.disabled) return;
      amb.stone();
      const kind = b.dataset.do as string;
      if (kind === 'bet') act({ kind: 'bet', amount: Number(b.dataset.n || 1) });
      else if (kind === 'insure') act({ kind: 'insure', take: b.dataset.n === '1' });
      else act({ kind } as BlackjackAction);
    };

    let hudKey = '';

    const paintHud = (s: BlackjackState, mySeat: number, names: readonly string[]): void => {
      const me = s.seats[mySeat];
      const key = JSON.stringify([s.phase, s.hand, s.next, s.revealed, s.over, mySeat, s.seats, s.dealer]);
      if (key === hudKey) return;
      hudKey = key;

      const lines: string[] = [];
      lines.push(
        '<div class="ac-bjline"><span>' +
          esc(t('arcade.blackjack.handNo', { i: String(Math.min(s.hand + 1, HANDS)), n: String(HANDS) })) +
          ', ' +
          esc(t('arcade.blackjack.shoe', { n: String(Math.max(0, s.shoe.length - s.next)) })) +
          '</span></div>'
      );
      const dealerLine =
        s.dealer.length === 0
          ? t('arcade.blackjack.waiting')
          : s.revealed
            ? t('arcade.blackjack.dealer', { n: String(total(s.dealer)) })
            : t('arcade.blackjack.dealerHidden');
      lines.push('<div class="ac-bjline"><span>' + esc(dealerLine) + '</span></div>');

      /* 남의 합계도 냄. 옛 화면은 딜러와 내 것 둘뿐 */
      s.seats.forEach((st, i) => {
        if (i === mySeat) return;
        const h = st.hands.find((x) => x.cards.length) ?? st.hands[0];
        const txt =
          (names[i] ?? '') +
          ' ' +
          t('arcade.blackjack.chips', { n: String(st.chips) }) +
          (h && h.cards.length ? ', ' + total(h.cards) : '');
        lines.push('<div class="ac-bjline ac-bjother"><span>' + esc(txt) + '</span></div>');
      });

      if (me) {
        const cur = activeHand(me);
        const mine =
          t('arcade.blackjack.chips', { n: String(me.chips) }) +
          (cur && cur.cards.length ? ', ' + t('arcade.blackjack.mine', { n: String(total(cur.cards)) }) : '');
        const res = cur?.res ? ' <b>' + esc(t(resKey[cur.res])) + '</b>' : '';
        lines.push('<div class="ac-bjline ac-me"><span>' + esc(mine) + res + '</span></div>');
      }

      let acts = '';
      const btn = (kind: string, label: string, on: boolean, ghost = false, data = ''): string =>
        '<button type="button" class="ac-bjbtn' + (ghost ? ' ac-ghost' : '') + '" data-do="' + kind + '"' +
        data + (on ? '' : ' disabled') + '>' + esc(label) + '</button>';

      if (me && !s.over) {
        if (s.phase === 'bet') {
          acts = BETS.map((b) =>
            btn('bet', String(b), me.bet === 0 && me.chips >= b, false, ' data-n="' + b + '"')
          ).join('');
        } else if (s.phase === 'insure') {
          const half = Math.floor(me.bet / 2);
          acts =
            btn('insure', t('arcade.blackjack.insureYes'), !me.answered && half >= 1 && me.chips >= half, false, ' data-n="1"') +
            btn('insure', t('arcade.blackjack.insureNo'), !me.answered, true, ' data-n="0"');
        } else if (s.phase === 'play') {
          const o = options(s, mySeat);
          acts =
            btn('hit', t('arcade.blackjack.hit'), o.hit) +
            btn('stand', t('arcade.blackjack.stand'), o.stand, true) +
            btn('double', t('arcade.blackjack.double'), o.double, true) +
            btn('split', t('arcade.blackjack.split'), o.split, true) +
            btn('surrender', t('arcade.blackjack.surrender'), o.surrender, true);
        }
      }
      hudEl.innerHTML = lines.join('') + (acts ? '<div class="ac-bjacts">' + acts + '</div>' : '');
    };

    return (v, mySeat) => {
      const s = v.state;
      if (!stage) return;
      const names = v.seats.map((x) => x.name);

      /* 딜러 줄. 감춘 카드는 실제로 뽑혀 있고, 열리기 전에는 뒷면 */
      const dealerCards = s.dealer.map((c, i) => ({
        rank: codeRank(c),
        suit: codeSuit(c),
        up: s.revealed || i === 0
      }));
      const dealer: CardHand = {
        seat: -1,
        cards: dealerCards,
        label: s.revealed
          ? t('arcade.blackjack.dealer', { n: String(total(s.dealer)) })
          : t('arcade.blackjack.dealerHidden'),
        tone: 'idle'
      };

      const hands: CardHand[] = s.dealer.length ? [dealer] : [];
      s.seats.forEach((st, i) => {
        /* 남의 손패도 다 보인다. 블랙잭은 서로의 수가 승패를 안 바꾼다 */
        const cur = activeHand(st);
        st.hands.forEach((h, hi) => {
          if (!h.cards.length) return;
          const live = s.phase === 'play' && h === cur && !h.done;
          const tag =
            (st.hands.length > 1 ? String(hi + 1) + '. ' : '') +
            (names[i] ?? '') +
            ' ' +
            total(h.cards) +
            (h.res ? ' ' + t(resKey[h.res]) : '');
          hands.push({
            seat: i,
            cards: h.cards.map((c) => ({ rank: codeRank(c), suit: codeSuit(c), up: true })),
            label: tag,
            tone: toneOf(h.res, live)
          });
        });
      });
      stage.set(hands, mySeat);
      paintHud(s, mySeat, names);
    };
  }
};
