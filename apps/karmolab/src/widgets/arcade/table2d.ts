/**
 * 2D 공용 상 (2026-09-02 감사 C1, 사용자 결정 B 상 둘레 배치)
 *
 * 카드 갈래 열한 판이 같은 배치를 탄다. 콘텐츠 칸 전체가 상이고,
 * - 위: 상대 자리 카드(셸 `#acSeats` 가 그림) 아래에 뒷면 부채. 장수가 눈에 보임
 * - 가운데: 판(더미, 깔린 것). 알림 한 줄은 그 위
 * - 아래: 내 손패와 행동 버튼
 * 지금 차례는 자리 카드 금테. 셸의 자리 카드에 `ac-turn` 을 얹는다 (입체 오목과 같은 손)
 *
 * 화면(`<game>-view.ts`)은 `mountTable` 로 틀을 받고 `center`, `hand`, `acts` 만 채움.
 * 표현(`GameView.table: true`)이 켜야 셸이 자리 카드를 위 줄에 펼침
 */
import { cardBack } from './card';
import type { MatchView } from './kernel';

export interface Table {
  /** 가운데. 더미와 깔린 것 */
  center: HTMLElement;
  /** 내 손패 줄 */
  hand: HTMLElement;
  /** 행동 버튼 줄 */
  acts: HTMLElement;
  /** 가운데 위 한 줄. 빈 글자면 사라짐 */
  toast: (text: string) => void;
  /**
   * 매 그림마다. 상대 자리 아래 뒷면 부채와 차례 금테
   * - `backs(i)`: 그 자리의 뒷면 장수. 0 이면 부채 없음
   * - `turn`: 지금 차례 자리. -1 이면 아무도
   */
  paint: (v: MatchView<unknown>, mySeat: number, backs: (i: number) => number, turn: number) => void;
}

/** 자리 카드 폭과 좌우 여백. CSS 의 --ac-tb-seat-w, 18px 와 같은 값 */
const SEAT_W = 300;
const EDGE = 18;

export function mountTable(el: HTMLElement): Table {
  el.innerHTML =
    '<div class="ac-tb">' +
    '<div class="ac-tb-fans"></div>' +
    '<div class="ac-tb-center"><div class="ac-tb-toast" role="status"></div><div class="ac-tb-board"></div></div>' +
    '<div class="ac-tb-mine"><div class="ac-tb-hand"></div><div class="ac-tb-acts"></div></div>' +
    '</div>';
  const root = el.querySelector('.ac-tb') as HTMLElement;
  const fans = root.querySelector('.ac-tb-fans') as HTMLElement;
  const toastEl = root.querySelector('.ac-tb-toast') as HTMLElement;
  const center = root.querySelector('.ac-tb-board') as HTMLElement;
  const hand = root.querySelector('.ac-tb-hand') as HTMLElement;
  const acts = root.querySelector('.ac-tb-acts') as HTMLElement;
  /* 부채는 자리마다 한 상자. 장수가 바뀔 때만 다시 그림 (매 프레임 innerHTML 은 전환을 죽임) */
  const drawn = new Map<number, string>();

  const toast = (text: string): void => {
    if (toastEl.textContent !== text) toastEl.textContent = text;
  };

  const paint = (v: MatchView<unknown>, mySeat: number, backs: (i: number) => number, turn: number): void => {
    const others = v.seats.map((_, i) => i).filter((i) => i !== mySeat);
    const n = others.length;
    const width = root.clientWidth;
    others.forEach((seat, k) => {
      let box = fans.querySelector<HTMLElement>('[data-seat="' + seat + '"]');
      if (!box) {
        box = document.createElement('div');
        box.className = 'ac-tb-fan';
        box.dataset.seat = String(seat);
        fans.append(box);
      }
      /* 셸의 자리 카드와 같은 자리. CSS 의 left 식과 같은 값 */
      const left = EDGE + ((width - EDGE * 2 - SEAT_W) * (k + 1)) / (n + 1);
      box.style.left = Math.round(left) + 'px';
      const count = Math.max(0, backs(seat));
      const key = count + '|' + v.seats[seat]?.name;
      if (drawn.get(seat) === key) return;
      drawn.set(seat, key);
      box.innerHTML = count
        ? Array.from({ length: Math.min(count, 12) }, () => cardBack()).join('') + '<b>' + count + '</b>'
        : '';
    });
    for (const box of Array.from(fans.children) as HTMLElement[]) {
      if (!others.includes(Number(box.dataset.seat))) box.remove();
    }
    /* 차례 금테. 셸의 자리 카드에 얹는다. 자리 카드는 자리 차례(watch 제외)로 서 있음 */
    const play = el.closest('#acPlay');
    const cards = play ? Array.from(play.querySelectorAll<HTMLElement>('#acSeats .ac-seat:not(.ac-watch)')) : [];
    cards.forEach((c, i) => c.classList.toggle('ac-turn', i === turn));
  };

  return { center, hand, acts, toast, paint };
}
