/**
 * 블랙잭 입체 화면 (같은 규칙, 다른 표현). 2026-09-01 개편
 *
 * 규칙(`blackjack.ts`)은 이 파일을 모른다. 무대는 `card-stage.ts`(방 안 탁자).
 *
 * 손맛 계약(`memo/projects/karmolab/features/play.md`). 소리, 막힘 반응, 끌기를 여기도.
 * 끌기는 무대 위에서. 위로 밀면 한 장 더, 아래로 밀면 그만
 *
 * 옛 화면이 놓친 것 셋
 *  1. **감춘 카드 뒤집기.** 규칙이 카드를 실제로 뽑아 두므로 열리는 순간 그 자리에서 돎
 *  2. **줄 이름표.** 누구 줄인지와 합계를 상 위에 눕힌다. 아래 HUD 한 줄만 보고 치지 않게
 *  3. **결과 빛깔.** 이긴 줄, 죽은 줄, 비긴 줄이 이름표 색으로 갈림
 */
import { t } from '../../../lib/i18n';
import { blip } from '../../../lib/blip';
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
      '<div class="ac-bjhud" id="acBjHud">' +
      '<div class="ac-bjlines" id="acBjLines"></div><div class="ac-bjacts" id="acBjActs"></div>' +
      '</div>';
    const host = el.querySelector('#acT3') as HTMLElement;
    const hudEl = el.querySelector('#acBjHud') as HTMLElement;
    const lineBox = el.querySelector('#acBjLines') as HTMLElement;
    const actBox = el.querySelector('#acBjActs') as HTMLElement;

    const scene = sceneOf('blackjack');
    const stage: CardStage | null = mountCardStage(host, { scene, table: 'casino' });
    /* 방 소리. 알이 놓이는 소리를 카드 놓는 소리로 쓴다 */
    const amb = roomAmbience(host);

    if (!stage.ok) {
      /* WebGL 이 없는 창. 셸이 평면으로 내려 준다 */
      lineBox.textContent = t('arcade.no3d');
      return () => {};
    }

    /* 지금 무엇을 할 수 있나. 끌기가 보는 값 */
    let can = { hit: false, stand: false };

    const send = (a: BlackjackAction): void => {
      amb.stone();
      blip('tap');
      act(a);
    };

    /** 안 되는 것. 삑 소리와 그 자리 빨간 흔들림 */
    const nope = (el: HTMLElement): void => {
      blip('bad');
      el.classList.remove('ac-bjnope');
      void el.offsetWidth;
      el.classList.add('ac-bjnope');
    };

    hudEl.onclick = (ev) => {
      const b = (ev.target as HTMLElement).closest('button[data-do]') as HTMLButtonElement | null;
      if (!b) return;
      if (b.disabled) {
        nope(b);
        return;
      }
      const kind = b.dataset.do as string;
      if (kind === 'bet') send({ kind: 'bet', amount: Number(b.dataset.n || 1) });
      else if (kind === 'insure') send({ kind: 'insure', take: b.dataset.n === '1' });
      else send({ kind } as BlackjackAction);
    };
    /* 꺼진 버튼는 click 이 안 옴 */
    hudEl.addEventListener('pointerdown', (ev) => {
      const b = (ev.target as HTMLElement).closest('button[data-do]') as HTMLButtonElement | null;
      if (b && b.disabled) nope(b);
    });

    /* 끌기. 상 위에서 위로 밀면 한 장 더, 아래로 밀면 그만 */
    let from: { x: number; y: number } | null = null;
    host.addEventListener('pointerdown', (ev) => {
      from = { x: ev.clientX, y: ev.clientY };
    });
    host.addEventListener('pointerup', (ev) => {
      if (!from) return;
      const dx = ev.clientX - from.x;
      const dy = ev.clientY - from.y;
      from = null;
      if (Math.abs(dy) < 40 || Math.abs(dy) < Math.abs(dx)) return;
      if (dy < 0 && can.hit) send({ kind: 'hit' });
      else if (dy > 0 && can.stand) send({ kind: 'stand' });
      else nope(hudEl);
    });

    /* 알림 줄과 버튼을 따로 고쳐 쓴다. 한 덩이로 두면 봇이 걸 때마다 버튼이 새로 생겨
       사람이 누르던 버튼이 손 밑에서 사라진다 (2026-09-01 실측: 누르기가 30초 동안 안 먹었다) */
    let lineKey = '';
    let actKey = '';
    let toldHand = -1;

    const paintHud = (s: BlackjackState, mySeat: number, names: readonly string[]): void => {
      const me = s.seats[mySeat];
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
          can = { hit: o.hit, stand: o.stand };
          acts =
            btn('hit', t('arcade.blackjack.hit'), o.hit) +
            btn('stand', t('arcade.blackjack.stand'), o.stand, true) +
            btn('double', t('arcade.blackjack.double'), o.double, true) +
            btn('split', t('arcade.blackjack.split'), o.split, true) +
            btn('surrender', t('arcade.blackjack.surrender'), o.surrender, true);
        }
      }
      if (s.phase !== 'play') can = { hit: false, stand: false };
      const lineHtml =
        lines.join('') +
        (can.hit ? '<div class="ac-bjline ac-bjother"><span>' + esc(t('arcade.blackjack.swipe')) + '</span></div>' : '');
      if (lineHtml !== lineKey) {
        lineKey = lineHtml;
        lineBox.innerHTML = lineHtml;
      }
      if (acts !== actKey) {
        actKey = acts;
        actBox.innerHTML = acts;
      }

      /* 결과가 난 순간 한 번만 욺 */
      if (s.phase === 'done' && me && toldHand !== s.hand) {
        toldHand = s.hand;
        const best = me.hands.find((h) => h.res === 'bj' || h.res === 'win') ?? me.hands[0];
        if (best?.res) blip(best.res === 'bj' || best.res === 'win' ? 'good' : best.res === 'push' ? 'tap' : 'bad');
      }
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
      stage.setSeats(s.seats.length);
      stage.set(hands, mySeat);
      /* 베팅 서클 위 칩. 아직 안 치른 판돈만 */
      stage.setChips(
        s.seats.map((st, i) => ({
          seat: i,
          /* 값을 치르기 전까지 칩은 서클 위에 남음. 결과가 나자마자 걷으면
             무엇을 걸었는지 볼 새가 없음 */
          amount: s.phase === 'bet' ? st.bet : st.hands.reduce((a, h) => a + h.bet, 0)
        }))
      );
      paintHud(s, mySeat, names);
    };
  }
};
