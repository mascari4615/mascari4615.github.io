/**
 * 오목. 입체 화면 (같은 규칙, 다른 표현)
 *
 * 규칙(`gomoku.ts`)은 이 파일을 모른다. `views.ts` 의 좁은 구멍 하나로만 붙는다 . 
 * 그래서 2D 화면과 나란히 존재하고, 사람이 판 안에서 고른다(2D/3D 단추).
 *
 * 무대는 `three-board.ts` 가 짓는다(받아 둔 three). 여기 있는 일은 **상태를 알로 옮기는 것**뿐.
 */
import { t } from '../../../lib/i18n';
import type { GameView } from '../views';
import { mountThreeBoard, type Board3d, type Stone } from '../three-board';
import { roomAmbience } from '../ambience';
import { sceneOf, specOf } from '../scenes';
import { DEFAULT_SIZE, starPoints, type GomokuState, type GomokuAction } from './gomoku';

/** 자리 카드는 오락실 본체 것. 여기서는 클래스와 작은 글자만 얹는다 */
function seatCards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('#acSeats .ac-seat:not(.ac-watch)'));
}
function sub(card: HTMLElement, cls: string): HTMLElement {
  let e = card.querySelector<HTMLElement>('.' + cls);
  if (!e) {
    e = document.createElement('small');
    e.className = cls;
    card.appendChild(e);
  }
  return e;
}

export const view3d: GameView<GomokuState, GomokuAction> = {
  id: 'gomoku',
  bare: true,
  mount(el, act) {
    /* 무대는 제 자리를 다 쓴다. 크기는 무대 계약(`--ac-stage`)이 정한다. */
    el.innerHTML = '<div class="ac-t3 ac-t3room" id="acT3"><div class="ac-yctoast" id="acGmToast" role="status"></div></div>';
    const host = el.querySelector('#acT3') as HTMLElement;
    /* 알림. 차례, 10초, 금수 자리, 무르기를 판 위 가운데 한 줄로(사용자 요청). 생김새는 야추와 같은 방 알림 */
    const toastEl = el.querySelector('#acGmToast') as HTMLElement;
    let toastTimer = 0;
    const toast = (text: string, ms = 1300): void => {
      toastEl.textContent = text;
      toastEl.classList.add('ac-show');
      if (toastTimer) window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => {
        toastEl.classList.remove('ac-show');
        toastTimer = 0;
      }, ms);
    };
    /* 마지막으로 알린 차례. 같은 차례를 두 번 알리지 않음 */
    let toldTurn = -1;
    let toldHurry = false;
    /* 방의 소리(`ambience.ts`). 첫 손길에 깨고, 주인이 문서에서 빠지면 스스로 멈춘다 */
    /* 방은 취향(`scenes.ts`). 갈아 끼우면 오락실이 화면을 새로 세우므로 여기서는 지금 값만 읽는다 */
    const sceneId = sceneOf();
    const amb = roomAmbience(host, specOf(sceneId).voice);
    host.addEventListener('pointerdown', () => amb.wake(), { passive: true });
    let shown = -1;
    /* 놓인 차례. 대국 중 수 번호는 상태에 없으니 화면이 알이 나타난 순서를 기억한다. 무르면 빠진다 */
    const order: number[] = [];
    const pref = (key: string): boolean => {
      try {
        return localStorage.getItem(key) === 'on';
      } catch {
        return false;
      }
    };
    /* 미리 보기에 쓸 마지막 상태와 내 자리. 손이 움직일 때 규칙을 물어야 한다 */
    let lastState: GomokuState | null = null;
    let lastSeat = -1;
    let lastTick = -1;

    /* 오목은 **줄이 만나는 점**에 둔다. 칸 안에 두면 그건 다른 놀이다. */
    let n = 0;
    let board: Board3d | null = null;
    let dead = false;
    const build = (size: number): void => {
      n = size;
      const stars = new Set(starPoints(size));
      /* 방 표현. 다다미, 스포트, 알 떨어지는 손맛, 카메라 동작까지 한 벌(`three-board.ts`) */
      board = mountThreeBoard(host, {
        n,
        star: (i) => stars.has(i),
        onCross: true,
        bowls: true,
        room: true,
        scene: sceneId,
        onCell: (i) => {
          /* 금수 자리는 규칙이 조용히 무시한다. 사람에게는 말해 줘야 왜 안 놓이는지 안다 */
          const s = lastState;
          if (s && lastSeat === 0 && s.turn === 0 && s.won === -1 && s.banned.indexOf(i) >= 0) {
            toast(t('arcade.gomoku.toast.banned'));
            return;
          }
          act({ cell: i });
        },
        /* 다음 수 미리 보기. 내 차례고, 빈 자리고, 금수가 아닐 때만 */
        onHover: (i) => {
          const s = lastState;
          if (!board || !s) return;
          const ok = i >= 0 && s.won === -1 && s.turn === lastSeat && s.board[i] === 0 && !(lastSeat === 0 && s.banned.indexOf(i) >= 0);
          board.ghost(ok ? i : -1, lastSeat + 1);
        }
      });
      if (!board.ok) {
        /* WebGL 을 못 얻었다. 판이 없으면 안 되므로 조용히 비운다(부르는 쪽이 2D 로 물러선다). */
        board = null;
        dead = true;
        host.innerHTML = '';
      } else if (board.software && !el.querySelector('.ac-t3warn')) {
        /* CPU 로 그리는 중. 판 탓이 아니라 브라우저 설정이라고 사람에게 말한다. 2D 는 이 상태에서도 가볍다 */
        const warn = document.createElement('div');
        warn.className = 'ac-t3warn';
        warn.setAttribute('role', 'status');
        const msg = document.createElement('span');
        msg.textContent = t('arcade.t3.software');
        const to2d = document.createElement('button');
        to2d.type = 'button';
        to2d.className = 'btn btn-ghost';
        to2d.textContent = t('arcade.t3.software.btn');
        /* 표현 단추(`#acDim`)는 오락실 본체 것. 같은 손으로 눌러야 저장과 갈아 끼우기가 한 길로 간다 */
        to2d.onclick = () => document.getElementById('acDim')?.click();
        warn.append(msg, to2d);
        el.prepend(warn);
      }
    };
    build(DEFAULT_SIZE);

    return (v, mySeat, now) => {
      const s = v.state;
      if (!dead && s.n !== n) build(s.n);
      if (!board) return;
      lastState = s;
      lastSeat = mySeat;
      const myTurn = s.won === -1 && s.turn === mySeat;
      if (!myTurn) board.ghost(-1, mySeat + 1);
      /* 차례 알림. 첫 그림(shown < 0)은 조용히. 판이 끝나면 결과 종이가 말한다. 복기 중엔 안 한다 */
      if (!v.review && shown >= 0 && s.won === -1 && s.turn !== toldTurn) {
        toast(myTurn ? t('arcade.gomoku.toast.me') : t('arcade.gomoku.toast.turn', { who: v.seats[s.turn]?.name ?? '' }));
      }
      toldTurn = s.turn;
      /* 자리 카드: 룰 한 줄(내 카드), 남은 시간(차례 카드) */
      const cards = seatCards();
      const mine = cards[mySeat];
      if (mine) {
        const rule = [
          s.renju ? t('arcade.setup.renju.on') : t('arcade.gomoku.rule.free'),
          t('arcade.gomoku.rule.lines', { n: String(s.n) }),
          s.limit ? t('arcade.gomoku.rule.limit', { s: String(s.limit) }) : ''
        ].filter(Boolean).join(' / ');
        const e = sub(mine, 'ac-rule');
        if (e.textContent !== rule) e.textContent = rule;
      }
      cards.forEach((card, i) => {
        const clock = sub(card, 'ac-clock');
        if (s.limit && s.won === -1 && i === s.turn) {
          const left = Math.max(0, Math.ceil((s.turnEndsAt - now) / 1000));
          const txt = String(left);
          if (clock.textContent !== txt) clock.textContent = txt;
          card.style.setProperty('--ac-left', String(left / s.limit));
          clock.classList.toggle('ac-hurry', left <= 10);
          /* 내 차례 10초. 한 번만 */
          if (i === mySeat && left <= 10 && left > 0 && !toldHurry) {
            toldHurry = true;
            toast(t('arcade.gomoku.toast.hurry'), 1600);
          }
          if (left > 10) toldHurry = false;
          /* 마지막 10초는 매초 초침. 내 차례든 남의 차례든 방에 있는 사람은 다 듣는다 */
          if (left <= 10 && left !== lastTick && left > 0) {
            lastTick = left;
            amb.tick();
          }
        } else if (clock.textContent) {
          clock.textContent = '';
          clock.classList.remove('ac-hurry');
        }
      });
      const stones: Stone[] = [];
      /* 놓인 차례 갱신. 새로 보인 알은 뒤에(한꺼번에 여럿이면 칸 순), 사라진 알은 뺀다 */
      const present = new Set<number>();
      for (let i = 0; i < s.board.length; i += 1) if (s.board[i]) present.add(i);
      for (let k = order.length - 1; k >= 0; k -= 1) if (!present.has(order[k])) order.splice(k, 1);
      for (const c of present) if (order.indexOf(c) < 0) order.push(c);
      /* 수 번호. 복기면 복기의 차례, 대국 중이면 설정이 켜졌을 때 화면이 기억한 차례 */
      const numOf = new Map<number, number>();
      if (v.review) v.review.order.forEach((cell, i) => numOf.set(cell, i + 1));
      else if (pref('karmolab.arcade.numbers')) order.forEach((cell, i) => numOf.set(cell, i + 1));
      board.coords(pref('karmolab.arcade.coords'));
      for (let i = 0; i < s.board.length; i += 1) {
        const who = s.board[i];
        if (who) stones.push({ cell: i, who, last: i === s.last, n: numOf.get(i) });
      }
      /* 여기 둘 수 있다는 빈 칸 전부라 표시하지 않는다. 판이 온통 점으로 덮인다.
         자리를 좁혀 주는 놀이(오델로, 체커)에서만 쓴다. */
      /* 힌트. 금색 고리 하나. 손 올린 미리 보기와 겹쳐도 됨 */
      const hintCell = (v.hint as { cell?: number } | undefined)?.cell;
      board.advise(typeof hintCell === 'number' ? hintCell : -1);
      board.place(stones);
      /* 알이 늘었으면 딱. 첫 그림은 안 울린다(도중에 들어온 판이면 스무 개가 한꺼번에 울린다) */
      if (shown >= 0 && stones.length > shown) amb.stone();
      /* 알이 줄었으면 누가 물렀다. 무른 쪽은 지금 차례인 쪽. 복기에서 뒤로 가는 건 무르기가 아니다 */
      if (!v.review && shown >= 0 && stones.length < shown) toast(t('arcade.gomoku.toast.undo', { who: v.seats[s.turn]?.name ?? '' }), 1600);
      shown = stones.length;
      /* 복기에서는 카메라가 안 다가선다. 끝 장면과 처음 장면을 오가므로 */
      if (s.won !== -1 && !v.review) board.finish();
      host.classList.toggle('ac-waiting', !myTurn);
      /* 차례를 자리 카드에 표시. 자리 카드는 오락실 본체 것이라 여기서 클래스만 얹는다 */
      document.querySelectorAll('#acSeats .ac-seat:not(.ac-watch)').forEach((e, i) => {
        e.classList.toggle('ac-turn', s.won === -1 && i === s.turn);
      });
    };
  }
};
