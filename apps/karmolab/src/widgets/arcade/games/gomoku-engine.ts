/**
 * 오목 엔진. 단계 다섯 (change.arcade-redesign)
 *
 * 레퍼런스: Allis(1993)가 위협 공간 탐색(VCF, VCT)으로 오목을 풀었고, 이후 엔진(Yixin, Rapfi 계열)은
 * 패턴 평가 + 알파베타 + VCF 를 기본 뼈대로 쓴다. 신경망 엔진(katagomo)은 브라우저에서 모델 파일
 * 없이는 못 돌리므로 여기서는 고전 뼈대만. 단계는 폭과 VCF 와 예산으로 가름
 *
 * 규율 둘.
 *  ① **시간이 아니라 노드 수로 자른다.** 시간으로 자르면 같은 씨앗이 다른 판이 되어 다시보기와
 *     무르기가 깨짐. 노드 예산은 어느 기계에서나 같은 답
 *  ② 난수는 동점 가르기에만(`bestOf`). 그것도 커널이 준 것만
 *
 * 값어치 표(패턴 -> 점수)는 오목 엔진들이 쓰는 대략의 비율을 따른다: 다섯 >> 열린 넷 >> 넷 ≈ 열린 셋 * 4
 * >> 닫힌 셋 >> 열린 둘. 넷 하나에 열린 셋 하나(사삼)나 넷 둘(사사)이 곧 이김이라, 그 합이
 * 상대의 무엇보다 커야 함. 아래 WEIGHT 가 그 관계
 */
import { bestOf } from '../pick-best';

export type Level = 1 | 2 | 3 | 4 | 5;
export const LEVELS: readonly Level[] = [1, 2, 3, 4, 5];

/**
 * 단계별 깊이(플라이), 후보 수, 노드 예산, VCF 깊이, 상대 VCF 막기.
 *
 * 실측(봇 리그 20판씩, 2026-08-30): 옛 평가로는 깊이 4 가 깊이 2 보다 **약했다**(폭 7 에서 10%, 폭 14 에서 같음).
 * 대신 **폭과 VCF** 가 힘을 갈랐다(VCF 붙이면 85%). 3, 4단계는 그대로.
 * 5단계는 겹침 평가(combo)를 켜니 깊이 4 가 힘이 됐다. 아래 PLAN 의 5 주석
 */
export const PLAN: Record<Level, { depth: number; width: number; nodes: number; vcf: number; guard: boolean; vct: number; safe: boolean; combo: boolean }> = {
  1: { depth: 0, width: 6, nodes: 0, vcf: 0, guard: false, vct: 0, safe: false, combo: false },
  2: { depth: 1, width: 12, nodes: 0, vcf: 0, guard: false, vct: 0, safe: false, combo: false },
  3: { depth: 2, width: 8, nodes: 600, vcf: 0, guard: false, vct: 0, safe: false, combo: false },
  4: { depth: 2, width: 12, nodes: 2000, vcf: 8, guard: false, vct: 0, safe: false, combo: false },
  /* 5 (2026-08-30 실측, 40판 리그): 깊이 4 + 사삼/삼삼 겹침 평가(combo) + 두고 난 뒤 상대 VCF 가 없는 수 고르기(safe).
     4 상대 85%, 3 상대 65%, 한 수 평균 88ms 최대 265ms. 셋까지 잇는 위협 탐색(vct)은 붙이니 오히려 약해져(4 상대 40%) 꺼 둠.
     예전엔 깊이가 잡음이었는데 겹침 평가가 붙자 깊이가 힘이 됐다(깊이 2 는 4 상대 65%, 깊이 4 는 85%) */
  5: { depth: 4, width: 12, nodes: 4000, vcf: 14, guard: false, vct: 0, safe: true, combo: true }
};

const DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [0, 1], [1, 1], [1, -1]];

/* ── 줄 ── 판 크기마다 네 방향의 모든 줄(칸 번호 배열). 한 번 만들어 둔다 */
const LINES = new Map<number, number[][]>();
function linesOf(n: number): number[][] {
  let ls = LINES.get(n);
  if (ls) return ls;
  ls = [];
  for (let y = 0; y < n; y += 1) ls.push(Array.from({ length: n }, (_, x) => y * n + x));
  for (let x = 0; x < n; x += 1) ls.push(Array.from({ length: n }, (_, y) => y * n + x));
  for (let s = -(n - 5); s <= n - 5; s += 1) {
    const a: number[] = [];
    const b: number[] = [];
    for (let x = 0; x < n; x += 1) {
      const y1 = x - s;
      const y2 = n - 1 - x + s;
      if (y1 >= 0 && y1 < n) a.push(y1 * n + x);
      if (y2 >= 0 && y2 < n) b.push(y2 * n + x);
    }
    if (a.length >= 5) ls.push(a);
    if (b.length >= 5) ls.push(b);
  }
  LINES.set(n, ls);
  return ls;
}

/* ── 패턴 ── 줄을 글자로 옮겨 정규식으로 센다. x = 내 돌, o = 남의 돌이나 벽, _ = 빈 칸 */
const WEIGHT = {
  five: 10_000_000,
  open4: 1_000_000,
  four: 60_000,
  open3: 15_000,
  closed3: 900,
  open2: 400,
  closed2: 40,
  one: 6
};
const P_FIVE = /xxxxx/g;
const P_OPEN4 = /_xxxx_/g;
const P_FOUR = /oxxxx_|_xxxxo|xxx_x|x_xxx|xx_xx/g;
const P_OPEN3 = /__xxx_|_xxx__|_xx_x_|_x_xx_/g;
const P_CLOSED3 = /oxxx__|__xxxo|oxx_x_|_x_xxo|ox_xx_|_xx_xo|xx__x|x__xx|x_x_x/g;
const P_OPEN2 = /__xx__|_x_x_|_x__x_/g;
const P_CLOSED2 = /oxx___|___xxo|ox_x__|__x_xo/g;
const P_ONE = /_x_/g;

function count(re: RegExp, s: string): number {
  let c = 0;
  re.lastIndex = 0;
  while (re.exec(s)) c += 1;
  return c;
}

/** 줄 글자 -> 값. 같은 줄이 수천 번 나오므로 기억해 둔다. 판 크기 15면 종류가 몇만을 안 넘는다 */
const MEMO = new Map<string, number>();
function lineValue(s: string): number {
  const hit = MEMO.get(s);
  if (hit !== undefined) return hit;
  const v = lineValueRaw(s);
  if (MEMO.size < 200000) MEMO.set(s, v);
  return v;
}

/** 한 줄의 값어치 (한 색 기준) */
function lineValueRaw(s: string): number {
  if (s.indexOf('xxxxx') >= 0) return WEIGHT.five;
  let v = 0;
  const o4 = count(P_OPEN4, s);
  v += o4 * WEIGHT.open4;
  v += count(P_FOUR, s) * WEIGHT.four;
  v += count(P_OPEN3, s) * WEIGHT.open3;
  v += count(P_CLOSED3, s) * WEIGHT.closed3;
  v += count(P_OPEN2, s) * WEIGHT.open2;
  v += count(P_CLOSED2, s) * WEIGHT.closed2;
  v += count(P_ONE, s) * WEIGHT.one;
  return v;
}

/** 겹침 평가를 켜나. 단계가 정한다(`think` 가 매번 놓음). 3, 4단계는 옛 평가가 더 셌다(실측: 켜니 4 대 3 이 77 -> 47) */
let comboOn = false;

/** 줄 하나의 위협 수. 겹침(사삼, 삼삼)을 보려면 줄마다 넷과 열린 셋이 몇인지 알아야 한다 */
const THREATS = new Map<string, number>();
function lineThreats(s: string): number {
  const hit = THREATS.get(s);
  if (hit !== undefined) return hit;
  const fours = count(P_OPEN4, s) + count(P_FOUR, s);
  const threes = count(P_OPEN3, s);
  const v = fours * 16 + threes;
  if (THREATS.size < 200000) THREATS.set(s, v);
  return v;
}

/**
 * 판 전체를 한 색의 눈으로 매긴 값. 줄마다 글자로 옮겨 잼
 * 줄 너머 겹침을 더한다: 넷 둘(사사)이나 넷 하나에 열린 셋 하나(사삼)는 막을 수 없으니 열린 넷값,
 * 열린 셋 둘(삼삼)은 그 절반. 줄 하나의 합만 보면 이 겹침이 안 보여 5단계가 4단계를 못 이겼다(실측 63%)
 */
function sideValue(b: number[], n: number, who: number): number {
  let total = 0;
  let fours = 0;
  let threes = 0;
  const ls = linesOf(n);
  for (const line of ls) {
    let s = 'o';
    for (let i = 0; i < line.length; i += 1) {
      const c = b[line[i]];
      s += c === 0 ? '_' : c === who ? 'x' : 'o';
    }
    s += 'o';
    if (s.indexOf('x') < 0) continue;
    total += lineValue(s);
    if (!comboOn) continue;
    const th = lineThreats(s);
    fours += th >> 4;
    threes += th & 15;
  }
  if (comboOn && total < WEIGHT.open4) {
    if (fours >= 2 || (fours >= 1 && threes >= 1)) total += WEIGHT.open4 * 0.8;
    else if (threes >= 2) total += WEIGHT.open4 * 0.4;
  }
  return total;
}

/**
 * 판의 값. `who` 의 눈으로. 둘 차례인 쪽의 패턴이 조금 더 값지다(그 사람이 먼저 완성하니까).
 */
function evaluate(b: number[], n: number, who: number, toMove: number): number {
  const mine = sideValue(b, n, who);
  const theirs = sideValue(b, n, 3 - who);
  return toMove === who ? mine * 1.15 - theirs : mine - theirs * 1.15;
}

function at(b: number[], n: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= n || y >= n) return -1;
  return b[y * n + x];
}

/** 이 칸에 두면 이어진 길이(놓은 칸 포함). 다섯이면 이김 */
function runLen(b: number[], n: number, cell: number, who: number, dx: number, dy: number): number {
  const x = cell % n;
  const y = Math.floor(cell / n);
  let total = 1;
  for (const sgn of [1, -1]) {
    for (let k = 1; ; k += 1) {
      if (at(b, n, x + dx * k * sgn, y + dy * k * sgn) !== who) break;
      total += 1;
    }
  }
  return total;
}

function winsAt(b: number[], n: number, cell: number, who: number, renju: boolean): boolean {
  const exact = renju && who === 1;
  b[cell] = who;
  let ok = false;
  for (const [dx, dy] of DIRS) {
    const len = runLen(b, n, cell, who, dx, dy);
    if (exact ? len === 5 : len >= 5) {
      ok = true;
      break;
    }
  }
  b[cell] = 0;
  return ok;
}

/** 이 칸 둘레 r 안에 돌이 있나 */
function near(b: number[], n: number, cell: number, r: number): boolean {
  const x = cell % n;
  const y = Math.floor(cell / n);
  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      if ((dx || dy) && at(b, n, x + dx, y + dy) > 0) return true;
    }
  }
  return false;
}

/** 이 칸 둘레의 값. 내 줄과 남의 줄 넷 방향만 재서 후보를 줄 세운다(전체 평가보다 100배 싸다) */
function pointValue(b: number[], n: number, cell: number, who: number): number {
  const x = cell % n;
  const y = Math.floor(cell / n);
  let v = 0;
  for (const side of [who, 3 - who]) {
    for (const [dx, dy] of DIRS) {
      let s = '';
      for (let k = -4; k <= 4; k += 1) {
        const c = k === 0 ? side : at(b, n, x + dx * k, y + dy * k);
        s += c === 0 ? '_' : c === side ? 'x' : 'o';
      }
      const lv = lineValue('o' + s + 'o');
      v += side === who ? lv : lv * 0.9;
    }
  }
  return v;
}

export interface Ask {
  board: number[];
  n: number;
  who: number;
  renju: boolean;
  /** 흑이 못 두는 자리(렌주). 백 차례면 빈 배열 */
  banned: number[];
  level: Level;
  rng: () => number;
}

/** 이 칸 둘레의 돌 수. 가까울수록, 많을수록 크다. 후보를 값으로 재기 전에 싸게 거르는 체 */
function heat(b: number[], n: number, cell: number): number {
  const x = cell % n;
  const y = Math.floor(cell / n);
  let h = 0;
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      if (!dx && !dy) continue;
      const c = at(b, n, x + dx, y + dy);
      if (c > 0) h += Math.abs(dx) <= 1 && Math.abs(dy) <= 1 ? 3 : 1;
    }
  }
  return h;
}

/** 둘 만한 자리. 돌 둘레 두 칸, 금수 제외. 체로 2배를 거르고 값으로 줄 세운다 */
function candidates(b: number[], n: number, who: number, banned: Set<number>, width: number): number[] {
  const warm: Array<[number, number]> = [];
  for (let c = 0; c < n * n; c += 1) {
    if (b[c] !== 0 || banned.has(c)) continue;
    const h = heat(b, n, c);
    if (h > 0) warm.push([c, h]);
  }
  warm.sort((p, q) => q[1] - p[1]);
  const open = warm.slice(0, width * 2).map(([c]) => [c, pointValue(b, n, c, who)] as [number, number]);
  open.sort((p, q) => q[1] - p[1]);
  return open.slice(0, width).map((p) => p[0]);
}

/**
 * VCF. 넷을 연달아 만들어 이기는 길이 있나. 공격자는 넷을 만드는 수만, 수비자는 막는 수만.
 * 가지가 좁아 깊이 14 도 몇천 노드. 있으면 그 첫 수를 돌려줌
 */
function vcf(b: number[], n: number, who: number, renju: boolean, depth: number, budget: { left: number }): number {
  if (depth <= 0 || budget.left <= 0) return -1;
  const foe = 3 - who;
  for (let c = 0; c < n * n; c += 1) {
    if (b[c] !== 0 || !near(b, n, c, 1)) continue;
    if (renju && who === 1 && isBanned(b, n, c)) continue;
    budget.left -= 1;
    if (winsAt(b, n, c, who, renju)) return c;
    /* 이 수가 넷을 만드나: 둔 뒤 다섯이 되는 빈 칸이 있나 */
    b[c] = who;
    const fives: number[] = [];
    for (let e = 0; e < n * n && fives.length < 3; e += 1) {
      if (b[e] !== 0 || !near(b, n, e, 1)) continue;
      if (renju && who === 1 && isBanned(b, n, e)) continue;
      if (winsAt(b, n, e, who, renju)) fives.push(e);
    }
    if (fives.length >= 2) {
      b[c] = 0;
      return c; /* 열린 넷이나 사사. 못 막는다 */
    }
    if (fives.length === 1) {
      const block = fives[0];
      /* 상대가 막는 수로 자기가 이기면 이 길은 없다 */
      if (winsAt(b, n, block, foe, renju)) {
        b[c] = 0;
        continue;
      }
      b[block] = foe;
      /* 막는 수가 상대의 넷이 되면 내가 먼저 막아야 한다. 이 길은 이기는 길이 아니다(맞넷) */
      let counter = false;
      for (let e = 0; e < n * n && !counter; e += 1) {
        if (b[e] === 0 && near(b, n, e, 1) && winsAt(b, n, e, foe, renju)) counter = true;
      }
      const deeper = counter ? -1 : vcf(b, n, who, renju, depth - 2, budget);
      b[block] = 0;
      b[c] = 0;
      if (deeper >= 0) return c;
      continue;
    }
    b[c] = 0;
  }
  return -1;
}

/** 이 칸에 두면 상대가 막아야 하는 다섯 자리(넷)가 몇인가. 놓았다 거둔다 */
function fivesAfter(b: number[], n: number, cell: number, who: number, renju: boolean, cap = 3): number[] {
  b[cell] = who;
  const out: number[] = [];
  for (let e = 0; e < n * n && out.length < cap; e += 1) {
    if (b[e] !== 0 || !near(b, n, e, 1)) continue;
    if (renju && who === 1 && isBanned(b, n, e)) continue;
    if (winsAt(b, n, e, who, renju)) out.push(e);
  }
  b[cell] = 0;
  return out;
}

/** 이 칸에 두면 열린 셋(다음에 열린 넷이 되는 자리가 있는 셋)이 생기나. 생기면 그 자리들 */
function open4After(b: number[], n: number, cell: number, who: number, renju: boolean): number[] {
  b[cell] = who;
  const out: number[] = [];
  for (let e = 0; e < n * n && out.length < 3; e += 1) {
    if (b[e] !== 0 || !near(b, n, e, 1)) continue;
    if (renju && who === 1 && isBanned(b, n, e)) continue;
    if (fivesAfter(b, n, e, who, renju, 2).length >= 2) out.push(e);
  }
  b[cell] = 0;
  return out;
}

/**
 * VCT. 넷과 열린 셋을 이어 이기는 길. VCF 보다 가지가 넓어 깊이 8 안팎, 예산으로 자름
 * 공격자는 넷이나 열린 셋을 만드는 수만. 수비자는 넷이면 막는 한 수, 열린 셋이면 막는 자리들과
 * 자기 넷 만들기(맞불). 어느 수비에도 이기는 길이 남으면 그 첫 수
 */
function vct(b: number[], n: number, who: number, renju: boolean, depth: number, budget: { left: number }): number {
  if (depth <= 0 || budget.left <= 0) return -1;
  const foe = 3 - who;
  /* 넷을 잇는 길이 있으면 그게 곧 답 */
  const quick = vcf(b, n, who, renju, Math.min(depth + 4, 12), budget);
  if (quick >= 0) return quick;
  for (let c = 0; c < n * n; c += 1) {
    if (b[c] !== 0 || !near(b, n, c, 1) || budget.left <= 0) continue;
    if (renju && who === 1 && isBanned(b, n, c)) continue;
    budget.left -= 1;
    const fives = fivesAfter(b, n, c, who, renju, 2);
    let replies: number[];
    if (fives.length >= 2) return c;
    if (fives.length === 1) replies = fives;
    else {
      const o4 = open4After(b, n, c, who, renju);
      if (!o4.length) continue;
      /* 열린 셋의 수비: 열린 넷이 될 자리들, 그리고 그 셋의 양 끝 너머. 더해서 상대의 맞불(넷 만들기) */
      replies = o4.slice();
      b[c] = who;
      for (let e = 0; e < n * n && replies.length < 8; e += 1) {
        if (b[e] !== 0 || !near(b, n, e, 1) || replies.indexOf(e) >= 0) continue;
        if (fivesAfter(b, n, e, foe, renju, 1).length >= 1) replies.push(e);
      }
      b[c] = 0;
    }
    b[c] = who;
    let holds = true;
    for (const r of replies) {
      if (winsAt(b, n, r, foe, renju)) { holds = false; break; }
      b[r] = foe;
      /* 수비가 상대의 넷이면 나는 그걸 막아야 하고, 그 뒤가 곧 이 길의 끝 */
      let counter = -1;
      for (let e = 0; e < n * n; e += 1) if (b[e] === 0 && near(b, n, e, 1) && winsAt(b, n, e, foe, renju)) { counter = e; break; }
      let win: number;
      if (counter >= 0) {
        win = -1;
      } else {
        win = vct(b, n, who, renju, depth - 2, budget);
      }
      b[r] = 0;
      if (win < 0) { holds = false; break; }
    }
    b[c] = 0;
    if (holds && replies.length) return c;
  }
  return -1;
}

/** 렌주 금수(장목, 사사, 삼삼). 흑만. 게임 파일의 판정과 같은 기준, 탐색용으로 가볍게 */
function isBanned(b: number[], n: number, cell: number): boolean {
  b[cell] = 1;
  let five = false;
  let over = false;
  let fours = 0;
  let threes = 0;
  for (const [dx, dy] of DIRS) {
    const len = runLen(b, n, cell, 1, dx, dy);
    if (len === 5) five = true;
    else if (len > 5) over = true;
  }
  if (!five && !over) {
    const x = cell % n;
    const y = Math.floor(cell / n);
    for (const [dx, dy] of DIRS) {
      let s = '';
      for (let k = -4; k <= 4; k += 1) {
        const c = at(b, n, x + dx * k, y + dy * k);
        s += c === 0 ? '_' : c === 1 ? 'x' : 'o';
      }
      const t = 'o' + s + 'o';
      if (count(P_OPEN4, t) + count(P_FOUR, t) > 0) fours += 1;
      else if (count(P_OPEN3, t) > 0) threes += 1;
    }
  }
  b[cell] = 0;
  if (five) return false;
  return over || fours >= 2 || threes >= 2;
}

/** 알파베타. `who` 의 눈으로 값을 돌려준다. 노드 예산이 다하면 그 자리 값으로 끊는다 */
function search(
  b: number[], n: number, who: number, toMove: number, renju: boolean,
  depth: number, alpha: number, beta: number, width: number, budget: { left: number }
): number {
  budget.left -= 1;
  if (depth <= 0 || budget.left <= 0) {
    /* 잎이라도 코앞의 다섯은 본다. 둘 차례가 이기면 그 값, 상대가 넷을 들고 있고 내가 못 이기면 진 값 */
    const foeOf = 3 - toMove;
    let mineFive = false;
    let foeFives = 0;
    for (let c = 0; c < n * n; c += 1) {
      if (b[c] !== 0 || !near(b, n, c, 1)) continue;
      if (!mineFive && winsAt(b, n, c, toMove, renju)) mineFive = true;
      if (foeFives < 2 && winsAt(b, n, c, foeOf, renju)) foeFives += 1;
    }
    const sign = toMove === who ? 1 : -1;
    if (mineFive) return sign * WEIGHT.five * 5;
    /* 상대의 넷 하나는 막으면 그만이다. 둘(열린 넷, 사사)은 못 막는다. 하나를 진 것으로 치면 넷만 보면 도망친다(실측: 4단계가 2단계에 25%) */
    if (foeFives >= 2) return -sign * WEIGHT.five * 5;
    return evaluate(b, n, who, toMove);
  }
  const banned = new Set<number>();
  if (renju && toMove === 1) {
    for (let c = 0; c < n * n; c += 1) if (b[c] === 0 && near(b, n, c, 2) && isBanned(b, n, c)) banned.add(c);
  }
  const moves = candidates(b, n, toMove, banned, width);
  if (!moves.length) return evaluate(b, n, who, toMove);
  const mine = toMove === who;
  let best = mine ? -Infinity : Infinity;
  for (const c of moves) {
    if (winsAt(b, n, c, toMove, renju)) return mine ? WEIGHT.five * 10 + depth : -(WEIGHT.five * 10 + depth);
    b[c] = toMove;
    const v = search(b, n, who, 3 - toMove, renju, depth - 1, alpha, beta, width, budget);
    b[c] = 0;
    if (mine) {
      if (v > best) best = v;
      if (best > alpha) alpha = best;
    } else {
      if (v < best) best = v;
      if (best < beta) beta = best;
    }
    if (beta <= alpha) break;
  }
  return best;
}

/** 한 수. 없으면 -1 */
export function think(ask: Ask): number {
  const { n, who, renju, level, rng } = ask;
  const b = ask.board.slice();
  const plan = PLAN[level];
  comboOn = plan.combo;
  const banned = new Set(ask.banned);
  const foe = 3 - who;

  /* 첫 수는 한가운데 */
  if (b.every((v) => v === 0)) {
    const mid = Math.floor(n / 2);
    return mid * n + mid;
  }

  const open: number[] = [];
  for (let c = 0; c < n * n; c += 1) {
    if (b[c] === 0 && !banned.has(c) && near(b, n, c, 2)) open.push(c);
  }
  if (!open.length) {
    for (let c = 0; c < n * n; c += 1) if (b[c] === 0 && !banned.has(c)) open.push(c);
    return bestOf(open, () => 0, rng) ?? -1;
  }

  /* 견습. 둘레 아무 데나. 이기는 수만 안 놓친다 */
  if (level === 1) {
    for (const c of open) if (winsAt(b, n, c, who, renju)) return c;
    const pool = candidates(b, n, who, banned, plan.width);
    return bestOf(pool, () => 0, rng) ?? open[0];
  }

  /* 지금 이기나, 지금 막아야 하나. 어느 단계든 이 둘은 본다(초보도 코앞의 다섯은 본다) */
  for (const c of open) if (winsAt(b, n, c, who, renju)) return c;
  const mustBlock: number[] = [];
  for (const c of open) if (winsAt(b, n, c, foe, renju)) mustBlock.push(c);
  if (mustBlock.length) return bestOf(mustBlock, (c) => pointValue(b, n, c, who), rng) ?? mustBlock[0];

  /* 초보. 한 수 앞 값만 */
  if (level === 2) {
    return bestOf(open, (c) => pointValue(b, n, c, who), rng) ?? open[0];
  }

  /* 넷을 이어 이기는 길 */
  if (plan.vcf > 0) {
    const w = vcf(b, n, who, renju, plan.vcf, { left: 3000 });
    if (w >= 0) return w;
  }
  /* 셋까지 이어 이기는 길 */
  if (plan.vct > 0) {
    const w = vct(b, n, who, renju, plan.vct, { left: 4000 });
    if (w >= 0 && !banned.has(w)) return w;
  }
  /* 상대에게 그 길이 있으면 그 첫 수 자리를 먼저 차지한다. 공격의 시작점을 막는 것이 제일 싼 수비 */
  if (plan.guard) {
    const danger = vcf(b, n, foe, renju, plan.vcf, { left: 3000 });
    if (danger >= 0 && b[danger] === 0 && !banned.has(danger)) return danger;
  }

  /* 알파베타. 뿌리에서는 후보를 조금 더 넓게 */
  const moves = candidates(b, n, who, banned, plan.width + 2);
  /**
   * 반복 심화. 2, 4, ... 깊이로 올라가며, **뿌리 후보마다 예산을 똑같이** 나눔.
   * 한 예산을 나눠 쓰면 앞 후보가 다 먹고 뒤 후보는 얕은 값으로 비교돼 엉뚱한 수가 뽑힘
   * (실측: 5단계가 4단계에 5% 로 짐). 예산이 바닥난 깊이는 버리고 그 앞 깊이 답
   */
  let scored: Array<[number, number]> = moves.map((c) => [c, pointValue(b, n, c, who)]);
  for (let d = 2; d <= plan.depth; d += 2) {
    const per = Math.max(50, Math.floor(plan.nodes / Math.max(1, moves.length)));
    let starved = false;
    const round: Array<[number, number]> = moves.map((c) => {
      const budget = { left: per };
      b[c] = who;
      const v = search(b, n, who, foe, renju, d - 1, -Infinity, Infinity, plan.width, budget);
      b[c] = 0;
      if (budget.left <= 0) starved = true;
      return [c, v];
    });
    if (starved && d > 2) break;
    scored = round;
    if (starved) break;
  }
  /* 안전 고르기. 값 높은 순으로, 두고 난 뒤 상대에게 VCF 가 없는 첫 수. 전부 위험하면 값대로 */
  if (plan.safe) {
    const order = scored.slice().sort((p, q) => q[1] - p[1]);
    for (const [c] of order.slice(0, 4)) {
      b[c] = who;
      const threat = vcf(b, n, foe, renju, plan.vcf, { left: 800 });
      b[c] = 0;
      if (threat < 0) return c;
    }
  }
  const top = scored.reduce((m, p) => Math.max(m, p[1]), -Infinity);
  /* 동점은 난수로. 늘 앞칸을 고르면 같은 판이 반복된다 */
  const ties = scored.filter((p) => p[1] === top).map((p) => p[0]);
  return bestOf(ties, () => 0, rng) ?? moves[0];
}
