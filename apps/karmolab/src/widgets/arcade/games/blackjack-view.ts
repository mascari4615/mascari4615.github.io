/**
 * 블랙잭 평면 화면 (TASK-KL-242, 2026-09-01 전면 개편)
 *
 * 옛 화면은 카드에 무늬가 없었다. `cardMark` 로 글자만 찍어서 스페이드도 하트도, 빨강과
 * 검정도 없었다. 남의 손패도 안 보여 입체와 다른 놀이를 보여 줬다. 이겼는지 졌는지도
 * 카드 옆에 뜨지도 않았음
 *
 * 지금은 `card.ts` 의 `cardOf` 로 무늬와 색을 함께 찍는다. 값은 `deck.ts` 한 곳에서
 * 나오므로 입체와 같은 그림
 *
 * 손맛 계약(`memo/projects/karmolab/features/play.md`)을 여기서 지키는 법 넷
 *  1. **다시 그리기가 애니메이션을 죽인다.** 매 그림마다 `innerHTML` 을 갈면 카드가 순간이동.
 *     자리틀은 짜임이 바뀔 때만 새로 쓰고, 카드는 **새로 온 장만** 붙임
 *  2. **소리.** 누를 때 tap, 이기면 good, 죽거나 지면 bad. `lib/blip`
 *  3. **안 되는 것에도 반응.** 꺼진 버튼를 눌러도 삑 소리와 그 자리 빨간 흔들림
 *  4. **누르기와 끌기 둘 다.** 위로 밀면 한 장 더, 아래로 밀면 그만
 */
import { t } from '../../../lib/i18n';
import { blip } from '../../../lib/blip';
import type { GameView } from '../views';
import { cardBack, cardOf, applyDeckSkin } from '../card';
import { codeRank, codeSuit } from '../deck';
import {
  BETS,
  HANDS,
  activeHand,
  options,
  total,
  type BjRes,
  BJ_RESULTS,
  type BlackjackState,
  type BlackjackAction
} from './blackjack';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const card = (code: number): string => cardOf(codeRank(code), codeSuit(code));

const resKey: Record<BjRes, string> = {
  bj: 'arcade.blackjack.resBj',
  win: 'arcade.blackjack.resWin',
  push: 'arcade.blackjack.resPush',
  lose: 'arcade.blackjack.resLose',
  bust: 'arcade.blackjack.resBust',
  surrender: 'arcade.blackjack.resSurrender'
};

/** 이 결과에 어떤 소리인가 */
const soundOf = (res: BjRes): 'good' | 'bad' | 'tap' =>
  res === 'bj' || res === 'win' ? 'good' : res === 'push' ? 'tap' : 'bad';

/** 한 장을 HTML 로. `back` 이면 뒷면 */
const oneCard = (code: number | 'back'): string =>
  code === 'back' ? cardBack({ label: t('arcade.blackjack.dealerHidden') }) : card(code);

/**
 * 카드 줄을 **바뀐 만큼만** 고쳐 쓴다. 앞이 같으면 뒤에 붙이고, 갈린 자리부터 다시 놓음.
 * 통째로 새로 쓰면 CSS 전환이 매번 처음부터라 카드가 안 날아옴
 */
function syncCards(el: HTMLElement, want: Array<number | 'back'>): void {
  const keys = want.map(String);
  const cur = Array.from(el.children) as HTMLElement[];
  let same = 0;
  while (same < cur.length && same < keys.length && cur[same].dataset.k === keys[same]) same++;
  /* 뒷면이던 자리가 앞면으로 바뀌면 뒤집힌 것. 그 한 장만 뒤집는 그림 */
  const flipAt = same < cur.length && same < keys.length && cur[same].dataset.k === 'back' ? same : -1;
  while (el.children.length > same) el.removeChild(el.lastElementChild as Node);
  for (let i = same; i < want.length; i++) {
    const box = document.createElement('div');
    box.innerHTML = oneCard(want[i]);
    const node = box.firstElementChild as HTMLElement | null;
    if (!node) continue;
    node.dataset.k = keys[i];
    node.classList.add(i === flipAt ? 'ac-bjflip' : 'ac-bjin');
    /* 여러 장이 한꺼번에 오면 차례로 놓인다. 딜러가 돌리는 박자 */
    node.style.animationDelay = String((i - same) * 90) + 'ms';
    el.appendChild(node);
  }
}

/** 꺼진 버튼를 눌렀을 때. 삑 소리와 그 자리 빨간 흔들림 */
function nope(el: HTMLElement): void {
  blip('bad');
  el.classList.remove('ac-bjnope');
  /* 한 프레임 떼야 애니메이션이 다시 돎 */
  void el.offsetWidth;
  el.classList.add('ac-bjnope');
}

export const blackjackView: GameView<BlackjackState, BlackjackAction> = {
  id: 'blackjack',
  mount(el, act) {
    el.innerHTML =
      '<div class="ac-bj">' +
      '<div class="ac-bjtop"><span id="acBjHand"></span><span id="acBjShoe"></span></div>' +
      '<div class="ac-bjrow ac-bjdealer"><small id="acBjDlabel"></small><div class="ac-bjcards" id="acBjDealer"></div></div>' +
      '<div class="ac-bjseats" id="acBjSeats"></div>' +
      '<div class="ac-bjbar" id="acBjBar"></div>' +
      '<small class="ac-bjhint" id="acBjHint"></small>' +
      '</div>';
    const root = el.querySelector('.ac-bj') as HTMLElement;
    applyDeckSkin(root);
    const dealerEl = el.querySelector('#acBjDealer') as HTMLElement;
    const dLabel = el.querySelector('#acBjDlabel') as HTMLElement;
    const seatsEl = el.querySelector('#acBjSeats') as HTMLElement;
    const barEl = el.querySelector('#acBjBar') as HTMLElement;
    const handEl = el.querySelector('#acBjHand') as HTMLElement;
    const shoeEl = el.querySelector('#acBjShoe') as HTMLElement;
    const hintEl = el.querySelector('#acBjHint') as HTMLElement;

    /* 지금 무엇을 할 수 있나. 끌기가 보는 값 */
    let can = { hit: false, stand: false };
    /* 지난 판돈. 다음 판 거는 자리에 다시 걸기 버튼으로 */
    let lastBet = 0;

    const send = (a: BlackjackAction): void => {
      blip('tap');
      act(a);
    };

    const press = (b: HTMLButtonElement): void => {
      if (b.disabled) {
        nope(b);
        return;
      }
      const kind = b.dataset.do as string;
      if (kind === 'bet') send({ kind: 'bet', amount: Number(b.dataset.n || 1) });
      else if (kind === 'insure') send({ kind: 'insure', take: b.dataset.n === '1' });
      else send({ kind } as BlackjackAction);
    };

    /* 누르는 자리는 한 곳에서 받음. 다시 그려도 손이 안 끊김.
       꺼진 버튼는 click 이 안 오므로 pointerdown 으로 잡는다 */
    barEl.addEventListener('pointerdown', (ev) => {
      const b = (ev.target as HTMLElement).closest('button[data-do]') as HTMLButtonElement | null;
      if (b && b.disabled) nope(b);
    });
    barEl.onclick = (ev) => {
      const b = (ev.target as HTMLElement).closest('button[data-do]') as HTMLButtonElement | null;
      if (b) press(b);
    };

    /* 끌기. 위로 밀면 한 장 더, 아래로 밀면 그만. 누르기와 나란히 */
    let from: { x: number; y: number } | null = null;
    root.addEventListener('pointerdown', (ev) => {
      from = { x: ev.clientX, y: ev.clientY };
    });
    root.addEventListener('pointerup', (ev) => {
      if (!from) return;
      const dx = ev.clientX - from.x;
      const dy = ev.clientY - from.y;
      from = null;
      /* 40px 넘게, 그리고 세로가 가로보다 길 때만 민 것 */
      if (Math.abs(dy) < 40 || Math.abs(dy) < Math.abs(dx)) return;
      if (dy < 0 && can.hit) send({ kind: 'hit' });
      else if (dy > 0 && can.stand) send({ kind: 'stand' });
      else nope(root);
    });

    let barKey = '';
    let structKey = '';
    let toldHand = -1;
    let rows = new Map<string, { cards: HTMLElement; meta: HTMLElement; box: HTMLElement }>();
    let heads = new Map<number, HTMLElement>();

    return (v, mySeat) => {
      const s = v.state;
      const me = s.seats[mySeat];

      handEl.textContent = t('arcade.blackjack.handNo', {
        i: String(Math.min(s.hand + 1, HANDS)),
        n: String(HANDS)
      });
      shoeEl.textContent = t('arcade.blackjack.shoe', { n: String(Math.max(0, s.shoe.length - s.next)) });

      /* 딜러. 감춘 카드는 뒤집기 전까지 뒷면 */
      if (s.dealer.length === 0) {
        syncCards(dealerEl, []);
        dLabel.textContent = t('arcade.blackjack.waiting');
      } else {
        syncCards(
          dealerEl,
          s.dealer.map((c, i) => (s.revealed || i === 0 ? c : ('back' as const)))
        );
        dLabel.textContent = s.revealed
          ? t('arcade.blackjack.dealer', { n: String(total(s.dealer)) })
          : t('arcade.blackjack.dealerHidden');
      }

      /* 자리틀. 자리 수나 손 수가 바뀔 때만 새로 씀 */
      const order = s.seats.map((_, i) => i).sort((a, b) => (a === mySeat ? -1 : b === mySeat ? 1 : a - b));
      const struct = order.map((i) => i + ':' + s.seats[i].hands.length).join(',');
      if (struct !== structKey) {
        structKey = struct;
        seatsEl.innerHTML = order
          .map(
            (i) =>
              '<div class="ac-bjseat' + (i === mySeat ? ' ac-me' : '') + '" data-seat="' + i + '">' +
              '<small></small><div class="ac-bjhands">' +
              s.seats[i].hands
                .map(
                  (_, hi) =>
                    '<div class="ac-bjhand" data-h="' + i + '/' + hi + '">' +
                    '<div class="ac-bjcards"></div><div class="ac-bjmeta"></div></div>'
                )
                .join('') +
              '</div></div>'
          )
          .join('');
        rows = new Map();
        heads = new Map();
        seatsEl.querySelectorAll<HTMLElement>('.ac-bjhand').forEach((box) => {
          rows.set(box.dataset.h as string, {
            box,
            cards: box.querySelector('.ac-bjcards') as HTMLElement,
            meta: box.querySelector('.ac-bjmeta') as HTMLElement
          });
        });
        seatsEl.querySelectorAll<HTMLElement>('.ac-bjseat').forEach((p) => {
          heads.set(Number(p.dataset.seat), p.querySelector('small') as HTMLElement);
        });
      }

      for (const i of order) {
        const st = s.seats[i];
        const head = heads.get(i);
        if (head) {
          const html =
            esc(v.seats[i]?.name ?? '') +
            ' <b>' + esc(t('arcade.blackjack.chips', { n: String(st.chips) })) + '</b>' +
            (st.insurance > 0 ? ' <i>' + esc(t('arcade.blackjack.insure')) + '</i>' : '');
          if (head.innerHTML !== html) head.innerHTML = html;
        }
        const cur = activeHand(st);
        st.hands.forEach((h, hi) => {
          const row = rows.get(i + '/' + hi);
          if (!row) return;
          syncCards(row.cards, h.cards);
          row.box.classList.toggle('ac-live', s.phase === 'play' && h === cur && !h.done);
          for (const k of BJ_RESULTS) row.box.classList.toggle('ac-res-' + k, h.res === k);
          const bits: string[] = [];
          if (h.cards.length) bits.push('<span>' + total(h.cards) + '</span>');
          else bits.push(
            '<span>' +
              esc(st.bet > 0 ? t('arcade.blackjack.betPlaced', { n: String(st.bet) }) : t('arcade.blackjack.betting')) +
              '</span>'
          );
          if (h.bet > 0) bits.push('<span class="ac-bjbet">' + esc(t('arcade.blackjack.chips', { n: String(h.bet) })) + '</span>');
          if (h.res) bits.push('<b class="ac-bjres">' + esc(t(resKey[h.res])) + '</b>');
          const html = bits.join('');
          if (row.meta.innerHTML !== html) row.meta.innerHTML = html;
        });
      }

      /* 결과가 난 순간 한 번만 욺. 매 그림마다 울면 소음 */
      if (s.phase === 'done' && me && toldHand !== s.hand) {
        toldHand = s.hand;
        const best = me.hands.find((h) => h.res === 'bj' || h.res === 'win') ?? me.hands[0];
        if (best?.res) blip(soundOf(best.res));
      }

      /* 아래 버튼. 판이 무엇을 묻고 있나에 따라 갈림 */
      let bar = '';
      let hint = '';
      can = { hit: false, stand: false };
      if (me && !s.over) {
        if (s.phase === 'bet') {
          /* 지난 판돈 다시 걸기. 디지털 블랙잭 관례(레퍼런스 실측) */
          const rebet = lastBet > 0 && me.bet === 0 && me.chips >= lastBet
            ? '<button class="btn btn-ghost" data-do="bet" data-n="' + lastBet + '">' + esc(t('arcade.blackjack.rebet', { n: String(lastBet) })) + '</button>'
            : '';
          bar =
            '<span class="ac-bjask">' + esc(t('arcade.blackjack.bet')) + '</span>' +
            BETS.map(
              (b) =>
                '<button class="btn btn-primary" data-do="bet" data-n="' + b + '"' +
                (me.bet > 0 || me.chips < b ? ' disabled' : '') + '>' + b + '</button>'
            ).join('') + rebet;
        } else if (me.bet > 0) {
          lastBet = me.bet;
        } else if (s.phase === 'insure') {
          const half = Math.floor(me.bet / 2);
          bar =
            '<span class="ac-bjask">' + esc(t('arcade.blackjack.insureAsk', { n: String(half) })) + '</span>' +
            '<button class="btn btn-primary" data-do="insure" data-n="1"' +
            (me.answered || half < 1 || me.chips < half ? ' disabled' : '') + '>' +
            esc(t('arcade.blackjack.insureYes')) + '</button>' +
            '<button class="btn btn-ghost" data-do="insure" data-n="0"' +
            (me.answered ? ' disabled' : '') + '>' + esc(t('arcade.blackjack.insureNo')) + '</button>';
        } else if (s.phase === 'play') {
          const o = options(s, mySeat);
          can = { hit: o.hit, stand: o.stand };
          const btn = (kind: string, key: string, on: boolean, ghost = false): string =>
            '<button class="btn ' + (ghost ? 'btn-ghost' : 'btn-primary') + '" data-do="' + kind + '"' +
            (on ? '' : ' disabled') + '>' + esc(t(key)) + '</button>';
          bar =
            btn('hit', 'arcade.blackjack.hit', o.hit) +
            btn('stand', 'arcade.blackjack.stand', o.stand, true) +
            btn('double', 'arcade.blackjack.double', o.double, true) +
            btn('split', 'arcade.blackjack.split', o.split, true) +
            btn('surrender', 'arcade.blackjack.surrender', o.surrender, true);
          if (o.hit) hint = t('arcade.blackjack.swipe');
        }
      }
      if (bar !== barKey) {
        barKey = bar;
        barEl.innerHTML = bar;
      }
      if (hintEl.textContent !== hint) hintEl.textContent = hint;
    };
  }
};
