/**
 * 스무고개. 예/아니오로 좁힌다 (TASK-KL-242, change.arcade-absorbs-play 단계 2)
 *
 * 갈래 둘. 시작 옵션 `mode`
 *  - 사람 (0): 한 사람이 낱말 목록의 답을 쥐고 나머지가 묻는 **역할 비대칭 놀이**.
 *    커널이 감당하는 법: 답 쥔 자리를 상태에 두고 `redact` 로 그 사람만 답을 보게 함.
 *    묻는 사람이 맞히면 묻는 쪽 승, 스무 번 안에 못 맞히면 답 쥔 쪽 승, 판마다 역할 교대
 *  - 컴퓨터 (1): 내가 표(내 표, 남의 표)의 하나를 마음에 정하고 봇이 묻는 갈래. 질문은 손으로 안 적음.
 *    표의 칸에서 저절로(타입에 전기가 있나요, 키가 1m 보다 큰가요). 후보를 가장 반으로
 *    가르는 질문부터. 놀이터의 스무고개를 옮겨 온 것(사용자 결정 2026-09-05, 하나로 합침)
 *
 * 표는 규칙이 모름. 첫 수 `load` 가 실음(월드컵과 같은 문). 질문은 글자가 아니라 **데이터**
 * (칸, 갈래, 값)로 상태에 남고 글자는 화면 몫. 규칙 파일에 한국어가 들어가면 세 나라 말로 못 돎
 */
import type { GameDef, BotMove, Outcome, GameCtx } from '../types';

const MAX_ASKS = 20;
/** 컴퓨터 갈래에서 상태에 싣는 항목 상한. 천 장짜리 표를 통째로 실으면 방과 다시보기가 무겁다 */
export const POOL_CAP = 400;

export interface TwField {
  key: string;
  label: string;
  kind?: 'number' | 'set' | 'category';
  unit?: string;
}
export interface TwItem {
  name: string;
  img?: string;
  [k: string]: string | string[] | number | undefined;
}
/** 컴퓨터 갈래의 질문 하나. 글자가 아니라 값. `gt` 는 숫자 칸이 n 보다 큰가, `is` 는 그 값인가, `has` 는 그 값을 품나 */
export interface TwAsk {
  key: string;
  kind: 'gt' | 'is' | 'has';
  v: string | number;
}

export interface TwentyState {
  /** 정답 번호 (낱말 목록 차례, 컴퓨터 갈래면 표 항목 번호). **답 쥔 사람만 본다**. 사람이 마음에만 정했으면 -1 */
  answer: number;
  /** 후보 개수. 화면이 넣어 준다 */
  pool: number;
  /** 답을 쥔 자리 */
  keeper: number;
  /** 지금까지 오간 것 (사람 갈래) */
  log: Array<{ q: number; yes: boolean }>;
  /** 지금 걸려 있는 질문 (답을 기다리는 중이면 번호, 아니면 -1) */
  pending: number;
  /** 누가 물었나 */
  asker: number;
  /** 이긴 자리 (아직이면 -1) */
  won: number;
  round: number;
  /* ── 컴퓨터 갈래 ── */
  mode: 0 | 1;
  pack: { title: string; fields: TwField[]; items: TwItem[] } | null;
  /** 남은 후보 (항목 번호) */
  cands: number[];
  /** 오간 질문. `yes` 가 null 이면 모르겠어요 */
  asks: Array<{ ask: TwAsk; yes: boolean | null }>;
  /** 걸려 있는 질문 */
  pendingAsk: TwAsk | null;
  /** 찍어 본 항목 번호. 답 쥔 사람이 맞다 아니다를 준다. 없으면 -1 */
  guess: number;
  refused: number[];
}

export type TwentyAction =
  | { kind: 'ask'; q: number }
  | { kind: 'answer'; yes: boolean }
  | { kind: 'guess'; pick: number }
  | { kind: 'load'; title: string; fields: TwField[]; items: TwItem[] }
  | { kind: 'askq'; ask: TwAsk }
  | { kind: 'reply'; say: 'yes' | 'no' | 'skip' }
  | { kind: 'guessq'; pick: number }
  | { kind: 'confirm'; yes: boolean };

/**
 * 낱말, 질문, **사실표**를 화면(번역 파일)이 넣어 준다 (사람 갈래).
 *
 * 사실표가 왜 여기 있어야 하나: 봇이 답을 쥐면 예/아니오를 **진짜로** 내야 한다. 대충 지어내면
 * 살아 있나요?에 아무 답이나 나오고, 그러면 좁혀 갈 수가 없어 놀이가 성립하지 않는다.
 * 낱말이 말마다 다르니 사실도 번역 파일에. 규칙 파일은 무엇이 참인지 모름
 */
let POOL = 12;
let QUESTIONS = 10;
/** 사실표 `facts[낱말][질문]` 이 '1' 이면 예 */
let FACTS: string[] = [];
export function useTwentyPack(pool: number, questions: number, facts: string[]): void {
  POOL = Math.max(2, pool);
  QUESTIONS = Math.max(1, questions);
  FACTS = facts;
}
/** 그 낱말에 대해 그 질문의 답이 예인가. 표가 없으면 늘 아니오(놀이는 굴러가되 재미는 없다). */
export function factOf(answer: number, q: number): boolean {
  return FACTS[answer]?.[q] === '1';
}

/* ── 컴퓨터 갈래의 셈. 전부 순수 함수 ── */

/**
 * 몸무게가 28kg 보다 큰가요?로 시작하면 사람이 답을 못 함. 눈에 보이는 것(타입, 색, 원소, 무기)이
 * 먼저고, 세대, 등급처럼 어렴풋이 아는 것이 그다음, 정확한 수치는 맨 뒤 (0 이면 보이는 것, 1 이면 외워야 하는 것)
 */
const HARD: Record<string, number> = { height: 1, weight: 1, hp: 1, armor: 1, damage: 1, gen: 0.35, stage: 0.35, rarity: 0.3, tier: 0.3 };

/** 그 항목이 그 질문에 예인가 */
export function hits(it: TwItem, a: TwAsk): boolean {
  const x = it[a.key];
  if (a.kind === 'gt') return typeof x === 'number' && x > Number(a.v);
  if (Array.isArray(x)) return x.map(String).indexOf(String(a.v)) >= 0;
  return x !== undefined && String(x) === String(a.v);
}

const sameAsk = (a: TwAsk, b: TwAsk): boolean => a.key === b.key && a.kind === b.kind && String(a.v) === String(b.v);

/**
 * 남은 후보만 보고 질문 만들기. 전기 타입인가요?를 물어도 남은 후보에 전기가 하나도
 * 없으면 아무것도 못 가름. 그런 질문은 애초에 후보 밖
 */
export function asksFor(items: TwItem[], fields: TwField[]): Array<{ ask: TwAsk; hard: number }> {
  const out: Array<{ ask: TwAsk; hard: number }> = [];
  for (const f of fields) {
    const kind = f.kind || 'category';
    if (kind === 'number') {
      const nums = items.map((it) => it[f.key]).filter((v): v is number => typeof v === 'number').sort((a, b) => a - b);
      if (nums.length < 2) continue;
      const mid = nums[Math.floor(nums.length / 2)];
      if (mid === nums[0]) continue;
      out.push({ ask: { key: f.key, kind: 'gt', v: mid }, hard: HARD[f.key] ?? 0.5 });
      continue;
    }
    const seen = new Map<string, number>();
    for (const it of items) {
      const v = it[f.key];
      const list = Array.isArray(v) ? v : v === undefined ? [] : [String(v)];
      for (const one of list) seen.set(String(one), (seen.get(String(one)) || 0) + 1);
    }
    for (const [v, n] of seen) {
      if (n === items.length) continue;
      out.push({ ask: { key: f.key, kind: kind === 'set' ? 'has' : 'is', v }, hard: HARD[f.key] ?? 0 });
    }
  }
  return out;
}

/**
 * 후보를 반으로 가르되, **사람이 답할 수 있는** 질문을 먼저. 잘 가르는 정도만 보면 늘 수치 질문이
 * 이김(경계를 딱 반으로 놓을 수 있으니까). 그런데 답을 못 하면 아무리 잘 가르는 질문도 쓸모 없음.
 * 후보가 많은 초반에는 눈에 보이는 것만, 어려운 것은 후보가 줄어 정말 필요할 때
 */
export function bestAsk(s: TwentyState): TwAsk | null {
  if (!s.pack) return null;
  const pool = s.cands.map((i) => s.pack!.items[i]).filter(Boolean);
  const all = asksFor(pool, s.pack.fields).filter((c) => !s.asks.some((x) => sameAsk(x.ask, c.ask)));
  const ceiling = pool.length > 200 ? 0 : pool.length > 40 ? 0.4 : 1;
  const easy = all.filter((c) => c.hard <= ceiling);
  const cand = easy.length ? easy : all;
  let best: TwAsk | null = null;
  let bestCost = Infinity;
  for (const c of cand) {
    let yes = 0;
    for (const it of pool) if (hits(it, c.ask)) yes++;
    if (yes === 0 || yes === pool.length) continue;
    const cost = Math.abs(pool.length / 2 - yes) + c.hard * pool.length * 0.42;
    if (cost < bestCost) {
      bestCost = cost;
      best = c.ask;
    }
  }
  return best;
}

const isField = (v: unknown): v is TwField => !!v && typeof v === 'object' && typeof (v as TwField).key === 'string';
const isItem = (v: unknown): v is TwItem => !!v && typeof v === 'object' && typeof (v as TwItem).name === 'string';
const isAsk = (v: unknown): v is TwAsk => {
  const a = v as TwAsk | null;
  return !!a && typeof a === 'object' && typeof a.key === 'string' && (a.kind === 'gt' || a.kind === 'is' || a.kind === 'has') && (typeof a.v === 'string' || typeof a.v === 'number');
};

const modeOf = (ctx: GameCtx): 0 | 1 => (ctx.opts.mode === 1 ? 1 : 0);

export const twenty: GameDef<TwentyState, TwentyAction> = {
  id: 'twenty',
  /* 사람 갈래는 둘부터. 자리 하나로 열리면(컴퓨터 갈래) 봇이 묻는 쪽에 앉는다 */
  seats: [1, 4],
  rounds: 2,
  roundsOf(opts) {
    return opts.mode === 1 ? 1 : 2;
  },
  init(ctx) {
    const mode = modeOf(ctx);
    /* 사람 갈래는 판마다 답 쥔 사람이 바뀐다. 컴퓨터 갈래는 늘 첫 자리(나)가 쥔다 */
    const keeper = mode === 1 ? 0 : ctx.round % ctx.seats.length;
    return {
      answer: mode === 1 ? -1 : Math.floor(ctx.rng() * POOL),
      pool: POOL,
      keeper,
      log: [],
      pending: -1,
      asker: -1,
      won: -1,
      round: ctx.round,
      mode,
      pack: null,
      cands: [],
      asks: [],
      pendingAsk: null,
      guess: -1,
      refused: []
    };
  },
  /** 답은 쥔 사람만 본다. */
  redact(s, seat) {
    return seat === s.keeper ? s : { ...s, answer: -1 };
  },
  canAct(s, seat) {
    if (s.won !== -1) return false;
    if (s.mode === 1) {
      if (!s.pack) return seat === s.keeper;
      if (s.pendingAsk || s.guess >= 0) return seat === s.keeper;
      return seat !== s.keeper;
    }
    if (s.pending >= 0) return seat === s.keeper;
    return seat !== s.keeper;
  },
  reduce(s, a, seat, ctx) {
    if (s.won !== -1 || !a || typeof a !== 'object') return s;
    if (s.mode === 1) return reducePack(s, a, seat, ctx);
    if (s.pending >= 0) {
      /* 답 쥔 사람이 예/아니오를 준다. */
      if (seat !== s.keeper || a.kind !== 'answer') return s;
      return { ...s, log: [...s.log, { q: s.pending, yes: !!a.yes }], pending: -1, asker: -1 };
    }
    if (seat === s.keeper) return s;
    if (a.kind === 'ask') {
      if (s.log.length >= MAX_ASKS) return s;
      const q = a.q;
      if (!Number.isInteger(q) || q < 0 || q >= QUESTIONS) return s;
      if (s.log.some((l) => l.q === q)) return s; /* 같은 걸 두 번 묻지 않는다 */
      return { ...s, pending: q, asker: seat };
    }
    if (a.kind === 'guess') {
      const pick = a.pick;
      if (!Number.isInteger(pick) || pick < 0 || pick >= s.pool) return s;
      if (pick === s.answer) return { ...s, won: seat };
      /* 틀리면 질문 하나를 쓴 셈 친다. 스무 번을 다 쓰면 답 쥔 쪽이 이긴다. */
      const log = [...s.log, { q: -1, yes: false }];
      return { ...s, log, won: log.length >= MAX_ASKS ? s.keeper : -1 };
    }
    return s;
  },
  outcome(s, ctx): Outcome {
    const asked = s.mode === 1 ? s.asks.length : s.log.length;
    if (s.won === -1) {
      if (s.mode === 0 && s.log.length >= MAX_ASKS) {
        return {
          over: true,
          scores: ctx.seats.map((_, i) => (i === s.keeper ? 1 : 0)),
          note: { key: 'arcade.twenty.kept', params: { who: ctx.seats[s.keeper]?.name ?? '' } }
        };
      }
      return { over: false };
    }
    return {
      over: true,
      scores: ctx.seats.map((_, i) => (i === s.won ? 1 : 0)),
      note: {
        key: s.won === s.keeper ? 'arcade.twenty.kept' : 'arcade.twenty.found',
        params: { who: ctx.seats[s.won]?.name ?? '', n: String(asked) },
        sound: s.won === s.keeper ? 'lose' : 'win'
      }
    };
  },
  bot(s, seat, ctx): BotMove<TwentyAction> | null {
    if (s.won !== -1) return null;
    if (s.mode === 1) return botPack(s, seat, ctx);
    if (s.pending >= 0) {
      if (seat !== s.keeper) return null;
      /* 봇이 답을 쥐었다. **사실표대로** 답한다. 지어내면 좁혀 갈 수가 없어 놀이가 안 된다. */
      const yes = factOf(s.answer, s.pending);
      return { action: { kind: 'answer', yes }, delayMs: 700 + ctx.rng() * 500 };
    }
    if (seat === s.keeper) return null;
    /* 아직 안 물은 것 중 하나. 열 번쯤 물었으면 찍어 본다. */
    if (s.log.length >= 8 && ctx.rng() < 0.4) {
      return { action: { kind: 'guess', pick: Math.floor(ctx.rng() * s.pool) }, delayMs: 900 };
    }
    const asked = new Set(s.log.map((l) => l.q));
    for (let q = 0; q < QUESTIONS; q++) {
      if (!asked.has(q)) return { action: { kind: 'ask', q }, delayMs: 800 + ctx.rng() * 600 };
    }
    return { action: { kind: 'guess', pick: Math.floor(ctx.rng() * s.pool) }, delayMs: 900 };
  }
};

/* ── 컴퓨터 갈래 ── */

function reducePack(s: TwentyState, a: TwentyAction, seat: number, ctx: GameCtx): TwentyState {
  if (!s.pack) {
    /* 표는 답 쥔 자리(나)만 싣는다 */
    if (seat !== s.keeper || a.kind !== 'load') return s;
    if (typeof a.title !== 'string' || !Array.isArray(a.fields) || !Array.isArray(a.items)) return s;
    const fields = a.fields.filter(isField);
    let items = a.items.filter(isItem);
    if (items.length < 2 || !fields.length) return s;
    /* 큰 표는 씨앗으로 뽑아 상한 안으로. 같은 씨앗이면 같은 후보 */
    if (items.length > POOL_CAP) {
      const order = items.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(ctx.rng() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      items = order.slice(0, POOL_CAP).map((i) => items[i]);
    }
    /* 답 쥔 자리가 봇이면(봇끼리 검사) 답을 씨앗으로 정한다. 사람이면 마음속(-1) */
    const answer = ctx.seats[seat]?.bot ? Math.floor(ctx.rng() * items.length) : -1;
    return { ...s, answer, pool: items.length, pack: { title: a.title, fields, items }, cands: items.map((_, i) => i) };
  }
  const live = s.cands.filter((i) => s.refused.indexOf(i) < 0);
  if (s.guess >= 0) {
    if (seat !== s.keeper || a.kind !== 'confirm') return s;
    if (a.yes) return { ...s, won: s.asker >= 0 ? s.asker : 1 - 0 };
    const refused = s.refused.concat([s.guess]);
    const left = live.filter((i) => i !== s.guess);
    /* 남은 것이 없으면 표에 없는 것. 답 쥔 쪽이 이긴 것으로 친다 */
    return { ...s, refused, guess: -1, asker: -1, won: left.length ? -1 : s.keeper };
  }
  if (s.pendingAsk) {
    if (seat !== s.keeper || a.kind !== 'reply') return s;
    const say = a.say;
    if (say !== 'yes' && say !== 'no' && say !== 'skip') return s;
    const ask = s.pendingAsk;
    let cands = s.cands;
    if (say !== 'skip') {
      const keep = s.cands.filter((i) => {
        const it = s.pack!.items[i];
        return it && (say === 'yes' ? hits(it, ask) : !hits(it, ask));
      });
      /* 대답이 표와 어긋나 후보가 0 이 되면 놀이가 죽는다. 그 대답만 흘려보낸다 */
      if (keep.length) cands = keep;
    }
    return { ...s, cands, asks: s.asks.concat([{ ask, yes: say === 'skip' ? null : say === 'yes' }]), pendingAsk: null };
  }
  if (seat === s.keeper) return s;
  if (a.kind === 'askq') {
    if (!isAsk(a.ask) || s.asks.length >= MAX_ASKS) return s;
    if (s.asks.some((x) => sameAsk(x.ask, a.ask))) return s;
    return { ...s, pendingAsk: { key: a.ask.key, kind: a.ask.kind, v: a.ask.v }, asker: seat };
  }
  if (a.kind === 'guessq') {
    const pick = a.pick;
    if (!Number.isInteger(pick) || live.indexOf(pick) < 0) return s;
    /* 답 쥔 자리가 봇이면 바로 판정. 사람이면 맞아요 아니에요를 기다린다 */
    if (s.answer >= 0) {
      if (pick === s.answer) return { ...s, won: seat, asker: seat };
      const refused = s.refused.concat([pick]);
      const left = live.filter((i) => i !== pick);
      return { ...s, refused, won: left.length ? -1 : s.keeper };
    }
    return { ...s, guess: pick, asker: seat };
  }
  return s;
}

function botPack(s: TwentyState, seat: number, ctx: GameCtx): BotMove<TwentyAction> | null {
  if (!s.pack) {
    /* 봇이 답을 쥔 채 표가 없으면(봇끼리 검사) 이름과 칸 하나뿐인 표를 싣는다 */
    if (seat !== s.keeper) return null;
    const items: TwItem[] = ['a', 'b', 'c', 'd'].map((n, i) => ({ name: n, kind: i % 2 ? 'x' : 'y', size: i }));
    return { action: { kind: 'load', title: 'bot', fields: [{ key: 'kind', label: 'kind', kind: 'category' }, { key: 'size', label: 'size', kind: 'number' }], items }, delayMs: 200 };
  }
  const live = s.cands.filter((i) => s.refused.indexOf(i) < 0);
  if (s.guess >= 0) {
    if (seat !== s.keeper) return null;
    return { action: { kind: 'confirm', yes: s.guess === s.answer }, delayMs: 600 };
  }
  if (s.pendingAsk) {
    if (seat !== s.keeper) return null;
    const it = s.pack.items[s.answer];
    return { action: { kind: 'reply', say: it && hits(it, s.pendingAsk) ? 'yes' : 'no' }, delayMs: 700 + ctx.rng() * 400 };
  }
  if (seat === s.keeper) return null;
  /* 후보가 둘 이하거나 물을 게 없거나 스무 번을 다 썼으면 찍는다 */
  const ask = live.length > 2 && s.asks.length < MAX_ASKS ? bestAsk(s) : null;
  if (ask) return { action: { kind: 'askq', ask }, delayMs: 900 + ctx.rng() * 500 };
  if (!live.length) return null;
  return { action: { kind: 'guessq', pick: live[0] }, delayMs: 900 };
}
