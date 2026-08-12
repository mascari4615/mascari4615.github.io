/**
 * 오락실 커널 — 방 하나에서 판이 굴러가게 하는 것 전부 (TASK-KL-242)
 *
 * 화면도 그물망도 여기 없다. **들어오는 것은 수(action)와 시각(now), 나가는 것은 상태**뿐이다.
 * 그래서 게임 51개를 전부 사람 손 없이 돌려 볼 수 있다 — 테스트가 시계를 직접 밀어 준다.
 *
 * 시계를 밖에서 받는 이유: `Date.now()` 를 안에서 부르면 테스트가 4초를 진짜로 기다려야 한다.
 * 51개짜리 검증에서 그건 못 쓴다.
 *
 * 봇 예약이 「낡아도」 그냥 둔다 — 사이에 판이 바뀌어 못 두는 수가 되면 `reduce` 가 상태를
 * 그대로 돌려준다(게임의 약속 ①). 예약을 상태가 바뀔 때마다 지우면 실시간 게임에서 봇이
 * 영영 못 둔다(제한시간이 매 tick 상태를 바꾸므로).
 */
import type { GameDef, GameCtx, Seat, Outcome, Note } from './types';
import { mulberry32 } from './rng';

export interface SeatSpec {
  name: string;
  bot: boolean;
}

export interface MatchView<S> {
  round: number;
  rounds: number;
  state: S;
  seats: readonly Seat[];
  /** 판 전체가 끝났나 */
  finished: boolean;
  /** 이번 판이 끝나고 다음 판을 기다리는 중인가 */
  roundOver: boolean;
  note?: Note;
}

/** 판 사이 쉬는 시간 — 결과를 읽을 틈이 없으면 이긴 줄도 모른다. */
const BREAK_MS = 900;

export class Match<S, A> {
  readonly seats: Seat[];
  private readonly game: GameDef<S, A>;
  private readonly seed: number;
  private round = 0;
  private state: S;
  private finished = false;
  private roundOverAt: number | null = null;
  private note: Note | undefined;
  private now = 0;
  /** 봇이 두기로 예약해 둔 수 */
  private pending: Array<{ seat: number; action: A; at: number }> = [];
  private listeners: Array<(v: MatchView<S>) => void> = [];

  constructor(game: GameDef<S, A>, seed: number, seats: SeatSpec[]) {
    this.game = game;
    this.seed = seed;
    const [min, max] = game.seats;
    const filled = seats.slice(0, max);
    /* 사람이 모자란 자리는 봇이 앉는다 — 이 한 줄이 「싱글 모드」를 없앤다. */
    while (filled.length < min) filled.push({ name: `봇 ${filled.length + 1}`, bot: true });
    this.seats = filled.map((s, index) => ({ index, name: s.name, bot: s.bot, score: 0 }));
    this.state = game.init(this.ctx());
  }

  /** 라운드마다 씨앗을 갈라 준다 — 안 그러면 5판이 전부 같은 문제다. */
  private ctx(): GameCtx {
    return { seats: this.seats, rng: mulberry32(this.seed + this.round * 0x9e3779b9), now: this.now, round: this.round };
  }

  view(): MatchView<S> {
    return {
      round: this.round,
      rounds: this.game.rounds,
      state: this.state,
      seats: this.seats,
      finished: this.finished,
      roundOver: this.roundOverAt !== null,
      note: this.note
    };
  }

  onChange(fn: (v: MatchView<S>) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((f) => f !== fn);
    };
  }

  private emit(): void {
    const v = this.view();
    for (const fn of this.listeners) fn(v);
  }

  /** 한 수 둔다. 못 두는 자리·때면 조용히 흘린다(예외 X — 남의 창에서 오는 수다). */
  dispatch(seat: number, action: A): void {
    if (this.finished || this.roundOverAt !== null) return;
    if (seat < 0 || seat >= this.seats.length) return;
    if (this.game.canAct && !this.game.canAct(this.state, seat)) return;
    this.state = this.game.reduce(this.state, action, seat, this.ctx());
    this.settle();
    this.emit();
  }

  /**
   * 시계를 여기까지 밀었다. 실시간 게임의 `tick`, 봇의 예약, 판 사이 쉬는 시간이 전부 여기서 돈다.
   * 밀린 시간이 얼마든 한 번에 처리한다 — 창을 뒤에 뒀다 돌아와도 판이 어긋나지 않는다.
   */
  step(now: number): void {
    if (this.finished) return;
    this.now = now;

    if (this.roundOverAt !== null) {
      if (now >= this.roundOverAt) this.nextRound();
      this.emit();
      return;
    }

    if (this.game.realtime && this.game.tick) {
      this.state = this.game.tick(this.state, this.ctx());
      if (this.settle()) {
        this.emit();
        return;
      }
    }

    /* 예약된 봇의 수를 때가 된 것만 둔다. */
    const due = this.pending.filter((p) => p.at <= now);
    if (due.length) {
      this.pending = this.pending.filter((p) => p.at > now);
      for (const p of due) {
        if (this.roundOverAt !== null) break;
        if (this.game.canAct && !this.game.canAct(this.state, p.seat)) continue;
        this.state = this.game.reduce(this.state, p.action, p.seat, this.ctx());
        if (this.settle()) break;
      }
    }

    this.scheduleBots();
    this.emit();
  }

  private scheduleBots(): void {
    if (this.roundOverAt !== null || this.finished) return;
    for (const s of this.seats) {
      if (!s.bot) continue;
      if (this.pending.some((p) => p.seat === s.index)) continue;
      if (this.game.canAct && !this.game.canAct(this.state, s.index)) continue;
      const mv = this.game.bot(this.state, s.index, this.ctx());
      if (!mv) continue;
      this.pending.push({ seat: s.index, action: mv.action, at: this.now + (mv.delayMs ?? 0) });
    }
  }

  /** 이번 판이 끝났나 보고, 끝났으면 점수를 붙인다. 끝났으면 true. */
  private settle(): boolean {
    const out: Outcome = this.game.outcome(this.state, this.ctx());
    if (!out.over) return false;
    if (out.scores) out.scores.forEach((n, i) => { if (this.seats[i]) this.seats[i].score += n; });
    this.note = out.note;
    this.pending = [];
    this.roundOverAt = this.now + BREAK_MS;
    return true;
  }

  private nextRound(): void {
    this.roundOverAt = null;
    this.note = undefined;
    this.round++;
    if (this.round >= this.game.rounds) {
      this.finished = true;
      return;
    }
    this.state = this.game.init(this.ctx());
    this.scheduleBots();
  }

  /** 이긴 자리들 (동점이면 여럿). 아직 안 끝났으면 빈 배열. */
  winners(): Seat[] {
    if (!this.finished) return [];
    const top = Math.max(...this.seats.map((s) => s.score));
    return this.seats.filter((s) => s.score === top);
  }
}
