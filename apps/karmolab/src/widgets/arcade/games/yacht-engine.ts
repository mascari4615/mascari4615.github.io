/**
 * 주사위 요트 봇 머리. 단계 1~5 (change.arcade-redesign, 오목 봇 단계와 같은 틀)
 *
 * 레퍼런스(memo `reference/yacht-anatomy.md`): 열두 칸 Yacht 의 혼자 최적 기대 점수는 191.77
 * (ho94949/yacht-dice, 판 전체 역진 계산). Yahtzee 는 254.59(Verhoeff 2017). 여기서는 **한 차례 안**만
 * 정확히 계산한다(남은 굴림 1~2번을 끝까지 내다봄). 판 전체를 내다보는 것은 칸 열두 개의 2^12 상태를 더 끼워야
 * 하는데, 그 대신 단계 4 부터 칸의 값을 손질한다(덤 63 관리, 요트와 스트레이트 0점 버리기 벌점)
 *
 * 단계
 *  1 아무렇게나. 남길 것을 대충 고르고, 적을 칸도 자주 헛짚음
 *  2 제일 많은 눈만 남기고, 지금 제일 큰 칸에 적음 (전의 유일한 봇)
 *  3 한 굴림 앞 기대값. 남길 조합 32가지를 다 재서 다음 굴림 뒤 최고 칸의 기대값이 제일 큰 것
 *  4 3 + 칸 값 손질. 위 여섯은 덤(63)을 향해 세고, 요트, 큰 스트레이트, 포카드에 0을 적는 것은 벌점
 *  5 남은 굴림을 끝까지 내다봄(두 굴림 앞). **보류**: 리그 실측(혼자 300판) 4 단계 171.4, 5 단계 169.5 로 더 낫지
 *    않고 60배 느렸다(600ms/판). 손질한 칸 값이 두 굴림 앞에서는 오히려 헛짚는다. 지금은 4 와 같은 머리(`LOOK2`)
 *
 * 리그 실측 2026-08-30 (혼자 12라운드 평균, 씨앗 고정): 1 59.2, 2 108.4, 3 162.9, 4 171.4. 최적 191.77 의 89%
 *
 * 규칙은 `yacht.ts` 의 `scoreOf` 가 정본. 여기는 그 값을 두고 고르기만 함
 */
import { CATS, scoreOf, type Cat } from './yacht';

export type Level = 1 | 2 | 3 | 4 | 5;
const LOOK2 = false;
export type Sheet = Record<Cat, number | null>;

export interface Decision {
  /** 남길 자리. 굴리기 전 keep 이 이것과 같아야 한다 */
  keep: boolean[];
  /** 지금 적을 칸. 있으면 굴리지 않고 적는다 */
  write: Cat | null;
}

const UPPER: Cat[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
const FACE: Record<string, number> = { ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6 };

/* ── 눈 묶음 ── 순서 없는 다섯 눈을 눈별 개수(6칸)로 다룬다. 같은 묶음은 같은 값이라 표로 외운다 */
type Counts = number[]; /* [n1..n6] */
const key = (c: Counts): string => c.join('');
const toDice = (c: Counts): number[] => {
  const out: number[] = [];
  for (let v = 1; v <= 6; v += 1) for (let n = 0; n < c[v - 1]; n += 1) out.push(v);
  return out;
};
const countsOf = (dice: number[]): Counts => {
  const c = [0, 0, 0, 0, 0, 0];
  for (const v of dice) c[v - 1] += 1;
  return c;
};

/** k 개를 굴렸을 때 나오는 묶음과 확률. k = 0..5. 처음 부를 때 한 번 만든다 */
const rollDist: Array<Array<{ c: Counts; p: number }>> = [];
function distOf(k: number): Array<{ c: Counts; p: number }> {
  if (rollDist[k]) return rollDist[k];
  const acc = new Map<string, { c: Counts; n: number }>();
  const total = 6 ** k;
  const c = [0, 0, 0, 0, 0, 0];
  const walk = (left: number, from: number): void => {
    if (left === 0) {
      const k2 = key(c);
      const hit = acc.get(k2);
      /* 같은 묶음이 몇 가지 순서로 나오나 = 다항계수 */
      let ways = 1;
      let f = 1;
      for (let i = 1; i <= k; i += 1) f *= i;
      let d = 1;
      for (const n of c) for (let i = 1; i <= n; i += 1) d *= i;
      ways = f / d;
      if (hit) hit.n += ways;
      else acc.set(k2, { c: c.slice(), n: ways });
      return;
    }
    for (let v = from; v < 6; v += 1) {
      c[v] += 1;
      walk(left - 1, v);
      c[v] -= 1;
    }
  };
  walk(k, 0);
  rollDist[k] = Array.from(acc.values()).map((e) => ({ c: e.c, p: e.n / total }));
  return rollDist[k];
}

/** 묶음의 부분 묶음 전부 (남길 수 있는 것들) */
function subsets(c: Counts): Counts[] {
  const out: Counts[] = [];
  const cur = [0, 0, 0, 0, 0, 0];
  const walk = (i: number): void => {
    if (i === 6) {
      out.push(cur.slice());
      return;
    }
    for (let n = 0; n <= c[i]; n += 1) {
      cur[i] = n;
      walk(i + 1);
    }
  };
  walk(0);
  return out;
}

/**
 * 칸의 값. 단계 4 부터 손질. 규칙 점수에 앞으로의 손해를 더함
 *  덤: 위 칸에 눈 3개 이상이면 63 을 향한 진도라 웃돈, 2개 이하면 덤이 멀어져 깎음
 *  낭비: 요트, 큰 스트레이트, 포카드, 풀하우스에 0 은 그 칸을 영영 잃는 것
 *  아무거나: 나중을 위해 아끼는 값. 25 넘게 쓸 때만 제값
 */
function valueOf(cat: Cat, dice: number[], sheet: Sheet, level: Level): number {
  const raw = scoreOf(cat, dice);
  if (level < 4) return raw;
  let v = raw;
  const face = FACE[cat];
  if (face) {
    /* 덤은 눈마다 셋(par)씩 모으면 정확히 63. par 와의 차이를 값에 얹고, 63 을 넘기는 순간 35 를 그대로 */
    const upperSoFar = UPPER.reduce((a, c) => a + (sheet[c] ?? 0), 0);
    if (upperSoFar < 63) {
      /* 아직 덤이 닿나. 잣대는 남은 위 칸을 다섯 개씩 채웠을 때의 최대치.
         못 닿으면 웃돈 없음. 닿지도 않을 덤 때문에 낮은 눈을 붙들고 있었음
         닿으면 여유가 적을수록 절박하게. 고치기 전 실측은 위 합 55.9, 덤 23.5% */
      const need = 63 - upperSoFar;
      const most = UPPER.reduce((a, c) => a + (sheet[c] === null ? 5 * FACE[c] : 0), 0);
      if (most >= need) {
        const slack = most - need;
        const over = raw - 3 * face;
        /* 미달과 초과는 다른 잣대. par 를 밑도는 칸은 덤을 통째로 날리는 쪽이라 더 아프게 */
        const w = over >= 0 ? Math.max(1, Math.min(2.6, 2.6 - slack / 30)) : Math.max(4.5, Math.min(9, 9 - slack / 12));
        v += over * w;
        if (upperSoFar + raw >= 63) v += 35;
      }
    }
    return v;
  }
  if (raw === 0) {
    if (cat === 'yacht') v -= 28;
    else if (cat === 'lstraight') v -= 18;
    else if (cat === 'sstraight') v -= 10;
    else if (cat === 'fourkind') v -= 12;
    else if (cat === 'fullhouse') v -= 10;
    else if (cat === 'choice') v -= 14;
    return v;
  }
  if (cat === 'choice') v = raw >= 24 ? raw : raw - 8;
  return v;
}

function bestCat(dice: number[], sheet: Sheet, level: Level): { cat: Cat; v: number } {
  let best: { cat: Cat; v: number } | null = null;
  for (const cat of CATS) {
    if (sheet[cat] !== null) continue;
    const v = valueOf(cat, dice, sheet, level);
    if (!best || v > best.v) best = { cat, v };
  }
  return best ?? { cat: 'choice', v: 0 };
}

/**
 * 남은 굴림이 r 번일 때 이 묶음의 가치. 지금 적는 것과, 부분 묶음을 남기고 굴려 다음 가치를 기대하는 것 중 큰 쪽
 * `memo` 는 한 결정 안에서만 산다(칸이 바뀌면 값이 바뀜)
 */
function value(c: Counts, r: number, sheet: Sheet, level: Level, memo: Map<string, number>): number {
  const k = key(c) + '|' + r;
  const hit = memo.get(k);
  if (hit !== undefined) return hit;
  const dice = toDice(c);
  let best = bestCat(dice, sheet, level).v;
  if (r > 0) {
    for (const keepC of subsets(c)) {
      const kept = keepC.reduce((a, b) => a + b, 0);
      if (kept === 5) continue; /* 다 남기면 굴리는 뜻이 없다. 지금 적는 값과 같다 */
      let ev = 0;
      for (const o of distOf(5 - kept)) {
        const merged = keepC.map((n, i) => n + o.c[i]);
        ev += o.p * value(merged, r - 1, sheet, level, memo);
      }
      if (ev > best) best = ev;
    }
  }
  memo.set(k, best);
  return best;
}

/** 지금 눈에서 무엇을 남기고 굴릴까, 아니면 적을까. `rollsLeft` 는 0..2 */
const lastDecision: { key: string; d: Decision } = { key: '', d: { keep: [], write: null } };
export function decide(dice: number[], sheet: Sheet, rollsLeft: number, level: Level, rng: () => number): Decision {
  /* 남기기를 하나씩 맞추는 동안 같은 결정을 다섯 번 부른다. 단계 3 이상은 계산이 무거워 한 번만 잰다 */
  const sig = level >= 3 ? dice.join('') + '|' + rollsLeft + '|' + level + '|' + CATS.map((k) => (sheet[k] === null ? '-' : sheet[k])).join(',') : '';
  if (sig && sig === lastDecision.key) return lastDecision.d;
  const d = decideNow(dice, sheet, rollsLeft, level, rng);
  if (sig) { lastDecision.key = sig; lastDecision.d = d; }
  return d;
}

function decideNow(dice: number[], sheet: Sheet, rollsLeft: number, level: Level, rng: () => number): Decision {
  const c = countsOf(dice);
  const open = CATS.filter((cat) => sheet[cat] === null);
  if (!open.length) return { keep: dice.map(() => true), write: null };

  if (level === 1) {
    /* 아무렇게나. 주사위마다 반반으로 남기고, 셋 중 하나는 대충 적는다 */
    if (rollsLeft === 0 || rng() < 0.25) {
      const pick = rng() < 0.5 ? bestCat(dice, sheet, level).cat : open[Math.floor(rng() * open.length)];
      return { keep: dice.map(() => true), write: pick };
    }
    return { keep: dice.map(() => rng() < 0.5), write: null };
  }

  if (level === 2) {
    if (rollsLeft === 0) return { keep: dice.map(() => true), write: bestCat(dice, sheet, level).cat };
    let face = 1;
    for (let v = 2; v <= 6; v += 1) if (c[v - 1] >= c[face - 1]) face = v;
    const keep = dice.map((v) => v === face);
    /* 이미 넷 이상 모였으면 굴려도 얻을 게 적다. 그냥 적는다 */
    if (c[face - 1] >= 4 && rng() < 0.5) return { keep: dice.map(() => true), write: bestCat(dice, sheet, level).cat };
    return { keep, write: null };
  }

  /* 3, 4, 5. 기대값. 두 굴림 앞(`LOOK2`)은 보류. 위 주석의 실측 */
  const look = Math.min(rollsLeft, level >= 5 && LOOK2 ? 2 : 1);
  /* 두 굴림 앞은 **손질하지 않은 점수**로 훑기(2026-08-31 시도). 그래도 171.4 를 못 넘음
     5단계는 판 전체 기대값 표(칸 2^12 상태)가 있어야 함. 지금은 4단계와 같은 머리(`LOOK2`) */
  const scanLevel: Level = look >= 2 ? 3 : level;
  if (rollsLeft === 0) return { keep: dice.map(() => true), write: bestCat(dice, sheet, level).cat };
  const memo = new Map<string, number>();
  const now = bestCat(dice, sheet, level);
  let bestKeep: Counts | null = null;
  let bestEv = now.v;
  for (const keepC of subsets(c)) {
    const kept = keepC.reduce((a, b) => a + b, 0);
    if (kept === 5) continue;
    let ev = 0;
    for (const o of distOf(5 - kept)) {
      const merged = keepC.map((n, i) => n + o.c[i]);
      ev += o.p * value(merged, look - 1, sheet, level, memo);
    }
    /* 같은 값이면 덜 굴리는 쪽(더 많이 남기는 쪽). 사람 손처럼 */
    if (ev > bestEv + 1e-9 || (bestKeep && Math.abs(ev - bestEv) < 1e-9 && kept > bestKeep.reduce((a, b) => a + b, 0))) {
      bestEv = ev;
      bestKeep = keepC;
    }
  }
  if (!bestKeep) return { keep: dice.map(() => true), write: now.cat };
  /* 부분 묶음을 자리로 옮긴다. 같은 눈이 여럿이면 앞에서부터 남긴다 */
  const left = bestKeep.slice();
  const keep = dice.map((v) => {
    if (left[v - 1] > 0) {
      left[v - 1] -= 1;
      return true;
    }
    return false;
  });
  return { keep, write: null };
}

/** 단계 값 정리. 밖에서 온 값은 뭐든 올 수 있다 */
export function clampLevel(v: unknown): Level {
  const n = Math.round(Number(v));
  if (n >= 1 && n <= 5) return n as Level;
  return 3;
}
