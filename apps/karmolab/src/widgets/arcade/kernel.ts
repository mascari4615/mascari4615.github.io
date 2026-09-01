/**
 * 오락실 커널. 방 하나에서 판이 굴러가게 하는 것 전부 (TASK-KL-242)
 *
 * 화면도 그물망도 여기 없다. **들어오는 것은 수(action)와 시각(now), 나가는 것은 상태**뿐이다.
 * 그래서 게임 51개를 전부 사람 손 없이 돌려 볼 수 있다. 테스트가 시계를 직접 밀어 준다.
 *
 * 시계를 밖에서 받는 이유: `Date.now()` 를 안에서 부르면 테스트가 4초를 진짜로 기다려야 한다.
 * 51개짜리 검증에서 그건 못 쓴다.
 *
 * 봇 예약이 낡아도 그냥 둔다. 사이에 판이 바뀌어 못 두는 수가 되면 `reduce` 가 상태를
 * 그대로 돌려준다(게임의 약속 ①). 예약을 상태가 바뀔 때마다 지우면 실시간 게임에서 봇이
 * 영영 못 둔다(제한시간이 매 tick 상태를 바꾸므로).
 */
import type { GameDef, GameCtx, GameOpts, Seat, Outcome, Note } from './types';
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
  /** 판이 선 뒤 흐른 시각(ms). 실시간 판의 화면이 남은 시간을 잰다 */
  now: number;
  note?: Note;
  /** 복기 중이면. 화면이 알에 수 번호를 얹고 알림을 참는다(`arcade.ts` 가 채움) */
  review?: { order: number[]; at: number; total: number };
  /** 힌트로 보여 줄 수. 화면이 표시만 한다(`arcade.ts` 가 채움) */
  hint?: unknown;
}

/** 판 사이 쉬는 시간. 결과를 읽을 틈이 없으면 이긴 줄도 모른다. */
const BREAK_MS = 900;

/**
 * 커널의 한 칸. 실시간 놀이의 숫자들이 **초당 60칸**을 전제로 맞춰져 있다. 그 전제를
 * 이제 커널이 지킨다(전에는 화면 주사율이 정했다).
 */
const TICK = 16;

/**
 * `step` 한 번에 따라잡을 칸 수(= 4초어치).
 *
 * 창을 한참 뒤에 뒀다 돌아오면 수만 칸이 밀려 있는데 그걸 다 돌면 창이 굳는다. 반대로 너무
 * 조이면 판 사이 쉬는 시간(0.9초)조차 한 번에 못 넘어가 검사가 멈춘다(실제로 그렇게 빨갰다).
 */
const MAX_CATCHUP = 240;

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
  /**
   * **사람이 누른 것만** 적어 둔다 (TASK-KL-264 재생).
   *
   * 봇의 수는 안 적는다. 씨앗이 같으면 커널이 똑같이 다시 만들어 내기 때문이다. 시각도
   * 칸 단위라 화면 주사율이 안 남는다. 그래서 한 판이 **씨앗 하나 + 누른 것 몇 줄**로 줄어든다.
   */
  readonly tape: Array<{ at: number; seat: number; action: A }> = [];
  /** 판에 실제로 먹힌 수. 사람과 봇 모두. 결과에 "열두 수" 로 적는다 */
  moves = 0;
  private listeners: Array<(v: MatchView<S>) => void> = [];
  /** 이번 판의 난수. 판이 바뀔 때만 새로 만든다 */
  private rand: () => number;
  /**
   * **봇만 쓰는 난수**. 판의 난수와 갈라 둔다.
   *
   * 봇이 판의 난수를 뽑으면 봇에게 몇 번 물어봤나가 판 전개를 바꾼다. 그런데 그 횟수는
   * 자리가 몇이고 화면이 몇 번 돌았나에 따라 달라진다. 같은 씨앗이 같은 판을 안 만든다.
   * 그래서 흐름을 둘로 나눈다. 게임 파일은 이 사실을 몰라도 된다: `bot()` 안에서도 그냥
   * `ctx.rng` 를 부르면 되고, 커널이 그때만 이쪽 흐름을 건네준다.
   */
  private botRand: () => number;
  /** 시작할 때 고른 값. 방과 편지와 다시보기가 씨앗과 함께 나른다 */
  readonly opts: GameOpts;

  constructor(game: GameDef<S, A>, seed: number, seats: SeatSpec[], opts: GameOpts = {}) {
    this.game = game;
    this.seed = seed;
    this.opts = opts;
    this.rand = mulberry32(seed);
    /* 씨앗을 비틀어 나눈다. 같은 씨앗에서 두 흐름이 같은 값을 내면 나눈 뜻이 없다. */
    this.botRand = mulberry32((seed ^ 0x5bf03635) >>> 0);
    const [min, max] = game.seats;
    const filled = seats.slice(0, max);
    /* 사람이 모자란 자리는 봇이 앉는다. 이 한 줄이 싱글 모드를 없앤다. */
    while (filled.length < min) filled.push({ name: `봇 ${filled.length + 1}`, bot: true });
    this.seats = filled.map((s, index) => ({ index, name: s.name, bot: s.bot, score: 0 }));
    this.state = game.init(this.ctx());
  }

  /**
   * 라운드마다 씨앗을 갈라 준다. 안 그러면 5판이 전부 같은 문제다.
   *
   * **난수는 판마다 하나를 만들어 계속 이어 쓴다.** 부를 때마다 새로 만들면 씨앗이 같으니
   * 늘 같은 값이 나온다. 판을 시작할 때만 뽑는 게임은 몰라도, **주사위처럼 판 중에 굴리는
   * 게임은 영원히 같은 눈**이 나온다. 그래서 rng 는 상태다.
   */
  private ctx(): GameCtx {
    return { seats: this.seats, rng: this.rand, now: this.now, round: this.round, opts: this.opts };
  }

  /** 봇에게 줄 자리. 난수만 다르다. */
  private botCtx(): GameCtx {
    return { seats: this.seats, rng: this.botRand, now: this.now, round: this.round, opts: this.opts };
  }

  /** 커널의 시계. 밖에서 준 시각이 아니라 **칸으로 옮긴** 값이다. */
  clock(): number {
    return this.now;
  }

  /**
   * 무르기. **사람이 누른 마지막 `drop` 줄을 지우고 처음부터 다시 돌린다.**
   *
   * 커널에 되돌리는 길은 없다. 대신 판은 씨앗 하나와 누른 줄로 재생 가능하다(`replay.ts`).
   * 그래서 무르기는 곧 짧은 재생이다: 같은 씨앗으로 새로 시작해 남긴 줄까지만 두고, 시계를
   * 지운 줄의 시각까지 밀어 그 사이 봇의 답(같은 씨앗이라 같은 수)을 다시 받음
   * 그러면 판은 내가 그 수를 두기 직전, 내 차례. 게임 파일은 아무것도 몰라도 됨
   */
  /**
   * 판 밖의 끝. 무승부 합의, 기권. 규칙은 이 사실을 모른다(오목 파일에 기권이 없다).
   * 점수를 주고 판을 닫음. 이미 끝난 판이면 아무 일도 없음
   */
  end(scores: number[], note?: Note): void {
    if (this.finished) return;
    scores.forEach((v, i) => {
      if (this.seats[i]) this.seats[i].score += v;
    });
    this.note = note;
    this.pending = [];
    this.roundOverAt = null;
    this.finished = true;
    this.emit();
  }

  rewind(drop = 1): void {
    if (drop <= 0 || !this.tape.length) return;
    const keep = this.tape.slice(0, Math.max(0, this.tape.length - drop));
    const until = this.tape[Math.max(0, this.tape.length - drop)]?.at ?? this.now;
    this.tape.length = 0;
    this.moves = 0;
    this.round = 0;
    this.finished = false;
    this.roundOverAt = null;
    this.note = undefined;
    this.now = 0;
    this.pending = [];
    this.rand = mulberry32(this.seed);
    this.botRand = mulberry32((this.seed ^ 0x5bf03635) >>> 0);
    for (const s of this.seats) s.score = 0;
    this.state = this.game.init(this.ctx());
    const runTo = (at: number): void => {
      /* step 은 한 번에 MAX_CATCHUP 칸만 간다. 다 갈 때까지 부른다 */
      while (this.now + TICK <= at && !this.finished) {
        const before = this.now;
        this.step(at);
        if (this.now === before) break;
      }
    };
    for (const mv of keep) {
      runTo(mv.at);
      this.dispatch(mv.seat, mv.action);
    }
    runTo(until);
    this.emit();
  }

  view(): MatchView<S> {
    return {
      round: this.round,
      rounds: this.game.rounds,
      state: this.state,
      seats: this.seats,
      finished: this.finished,
      roundOver: this.roundOverAt !== null,
      now: this.now,
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

  /**
   * 한 수 둔다. 못 두는 자리, 때면 조용히 흘린다(예외 X. 남의 창에서 오는 수다).
   *
   * **없는 수는 여기서 막는다.** 그물망 너머에서 `null` 이 오는 것은 사고가 아니라 정상이고,
   * 그때마다 게임 51개가 각자 `a?.cell` 을 쓰게 하면 한 곳만 빠져도 판이 통째로 죽는다.
   * 신뢰 경계는 커널이다. 게임은 무엇이 온다만 알면 된다.
   */
  dispatch(seat: number, action: A): void {
    if (action === null || action === undefined) return;
    /* 못 두는 수도 적는다. 되살릴 때 커널이 똑같이 흘리므로 결과가 같고,
       그때 이걸 눌렀는데 안 먹었다가 그대로 남는다(버그 재현에 필요한 것이 그것이다). */
    this.tape.push({ at: this.now, seat, action });
    if (this.finished || this.roundOverAt !== null) return;
    if (seat < 0 || seat >= this.seats.length) return;
    if (this.game.canAct && !this.game.canAct(this.state, seat)) return;
    const before = this.state;
    this.state = this.game.reduce(this.state, action, seat, this.ctx());
    if (this.state !== before) this.moves += 1;
    this.settle();
    this.emit();
  }

  /**
   * 시계를 여기까지 밀었다.
   *
   * **밖에서 준 시각을 그대로 안 쓴다.** 커널은 제 시계를 `TICK` 칸으로만 옮기고, 그 칸마다
   * 한 번씩 `tick` 을 돌린다. 이유는 하나다. 실시간 놀이 29개 중 여럿(탁구, 에어하키, 포탄)이
   * **한 프레임에 고정 거리**를 움직인다. 시각을 그대로 받으면 144Hz 화면이 60Hz 화면보다
   * 공을 2.4배 빠르게 굴린다. 같은 놀이가 기계마다 다른 놀이가 된다.
   *
   * 덤으로 **판이 재생 가능해진다**: 무엇을 언제 눌렀나만 적어 두면 화면 주사율과 상관없이
   * 같은 판이 다시 나온다(그리기 고리가 언제 불렀는지는 이제 판에 안 남는다).
   *
   * 한 번에 따라잡는 칸 수는 막아 둔다. 창을 한참 뒤에 뒀다 돌아오면 수만 칸이 밀려 있는데
   * 그걸 다 돌면 창이 굳는다. 시계가 조금 늦어지는 편이 굳는 것보다 낫다.
   */
  step(now: number): void {
    if (this.finished) return;
    let budget = MAX_CATCHUP;
    while (!this.finished && this.now + TICK <= now && budget-- > 0) {
      this.now += TICK;
      if (this.frame()) break;
    }
    /* 아직 한 칸도 안 찼으면 아무 일도 안 일어난다. 그래도 화면은 지금 것을 그려야 한다. */
    this.emit();
  }

  /** 한 칸. 판이 끝나 더 돌 것이 없으면 true. */
  private frame(): boolean {
    if (this.roundOverAt !== null) {
      if (this.now >= this.roundOverAt) this.nextRound();
      return this.finished;
    }

    if ((this.game.realtime || this.game.clocked) && this.game.tick) {
      this.state = this.game.tick(this.state, this.ctx());
      if (this.settle()) return false;
    }

    /* 예약된 봇의 수를 때가 된 것만 둔다. */
    const due = this.pending.filter((p) => p.at <= this.now);
    if (due.length) {
      this.pending = this.pending.filter((p) => p.at > this.now);
      for (const p of due) {
        if (this.roundOverAt !== null) break;
        if (this.game.canAct && !this.game.canAct(this.state, p.seat)) continue;
        const before = this.state;
        this.state = this.game.reduce(this.state, p.action, p.seat, this.ctx());
        if (this.state !== before) this.moves += 1;
        if (this.settle()) break;
      }
    }

    this.scheduleBots();
    return false;
  }

  private scheduleBots(): void {
    if (this.roundOverAt !== null || this.finished) return;
    for (const s of this.seats) {
      if (!s.bot) continue;
      if (this.pending.some((p) => p.seat === s.index)) continue;
      if (this.game.canAct && !this.game.canAct(this.state, s.index)) continue;
      const mv = this.game.bot(this.state, s.index, this.botCtx());
      if (!mv) continue;
      this.pending.push({ seat: s.index, action: mv.action, at: this.now + (mv.delayMs ?? 0) });
    }
  }

  /** 이번 판이 끝났나 보고, 끝났으면 점수를 붙인다. 끝났으면 true. */
  private settle(): boolean {
    const out: Outcome = this.game.outcome(this.state, this.ctx());
    if (!out.over) {
      /* **판이 안 끝나도 할 말은 나른다** (arcade-next 놀이마다의 소리).
         전에는 끝날 때만 말을 받아서, 화면도 소리도 끝났다밖에 못 했다. 화살이 항아리에
         든 순간, 배를 맞힌 순간이 아무 데도 안 남았다. 말이 없으면 지운다(옛말이 눌어붙지 않게). */
      this.note = out.note;
      return false;
    }
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
    this.rand = mulberry32(this.seed + this.round * 0x9e3779b9);
    this.botRand = mulberry32(((this.seed ^ 0x5bf03635) + this.round * 0x85ebca6b) >>> 0);
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
