/**
 * 오늘의 규칙 (TASK-KL-211)
 *
 * 규칙은 **9칸**(무어 이웃 3×3)이 읽는 것이다. 이웃 몇이면 태어나고(B), 몇이면 살아남나(S).
 * 그 조합은 어마어마하게 많지만, 그중 거의 전부는 **첫 몇 세대에 죽거나 화면을 새까맣게 덮는다**.
 * 그래서 완전 무작위로 뽑지 않는다 — 사람들이 오래 굴려 보고 「이건 살아있다」고 이름까지 붙여
 * 둔 규칙들이 있고, 그 목록에서 날짜로 하나를 꺼낸다.
 *
 * 날짜로 뽑는 이유: **같은 날 연 사람은 같은 세계를 본다.** 새로고침할 때마다 딴 게 나오면
 * 그건 구경거리가 아니라 뽑기다.
 *
 * `wild` = 이름 없는 규칙. 열흘에 하루쯤 섞는다 — 아무도 안 가 본 자리를 보는 날.
 */

export type SeedMode = 'soup' | 'point';

export interface Rule {
  /** 이웃이 이 수면 빈 칸에 태어난다 */
  birth: number[];
  /** 이웃이 이 수면 살아남는다 */
  survive: number[];
  /** 사람들이 붙여 둔 이름 (없으면 낯선 규칙) */
  name: string;
  /** B3/S23 같은 표기 */
  code: string;
  /** 말 묶음 열쇠 뒤에 붙는 짧은 id — 규칙마다 성격을 한 줄로 말해 준다 */
  id: string;
  /** 이 규칙에 맞는 씨앗 밀도 */
  density: number;
  /** 씨앗을 뿌리는 방식 */
  seed: SeedMode;
}

interface Named {
  id: string;
  name: string;
  b: number[];
  s: number[];
  /** 이 규칙이 살아나는 씨앗 밀도. 규칙마다 「너무 많으면 잡음, 너무 적으면 절멸」 지점이 다르다. */
  d: number;
  /** 씨앗을 어떻게 뿌리나 — 온 판에(soup) / 가운데 한 점에서(point) */
  seed: SeedMode;
}

/**
 * 이름 있는 규칙들. 성격이 서로 확실히 다른 것만 골랐다 —
 * 비슷한 규칙을 잔뜩 넣으면 날마다 열어도 같은 그림으로 보인다.
 *
 * `d`(씨앗 밀도)는 **짐작이 아니라 돌려 보고 정했다.** 200×120 격자에서 400세대를 밀도 8단계로
 * 돌려 ① 살아남은 비율 ② 계속 바뀌는 양 ③ 오래 버틴 칸의 비율을 재고 가장 볼만한 값을 골랐다.
 * 처음엔 전부 0.28 로 뒀는데, 그 값이 맞는 규칙이 거의 없어서 화면이 **잡음**이 됐다(실측).
 *
 * 두 번째로 걸린 것: 밀도를 맞춰도 **매 세대 40% 가 뒤집히는 규칙**은 그냥 잡음이다(오래 버틴 칸이
 * 0 이었다 — 무엇이 새것인지 볼 수가 없다). 그래서 남기는 기준을 「구조가 남는가」로 바꿨고,
 * 살아남지 못한 규칙(Maze·Anneal·Move·Stains·Walled Cities·Serviettes·Long Life·Pseudo Life)은 뺐다.
 * 대신 Gnarl·Replicator·Seeds·34 Life 는 **한 점에서 키운다** — 이들은 수프에 뿌리면 잡음이지만,
 * 씨앗 하나에서는 무늬가 퍼져 나가는 것이 그대로 보인다.
 */
const NAMED: Named[] = [
  // 수프에서 구조가 남는 것들 (struct = 25세대 넘게 버틴 칸의 비율)
  { id: 'life', name: 'Conway’s Life', b: [3], s: [2, 3], d: 0.16, seed: 'soup' },
  { id: 'highlife', name: 'HighLife', b: [3, 6], s: [2, 3], d: 0.45, seed: 'soup' },
  { id: 'daynight', name: 'Day & Night', b: [3, 6, 7, 8], s: [3, 4, 6, 7, 8], d: 0.45, seed: 'soup' },
  { id: 'mazectric', name: 'Mazectric', b: [3], s: [1, 2, 3, 4], d: 0.34, seed: 'soup' },
  { id: 'coral', name: 'Coral', b: [3], s: [4, 5, 6, 7, 8], d: 0.6, seed: 'soup' },
  { id: 'diamoeba', name: 'Diamoeba', b: [3, 5, 6, 7, 8], s: [5, 6, 7, 8], d: 0.45, seed: 'soup' },
  { id: 'assimilation', name: 'Assimilation', b: [3, 4, 5], s: [4, 5, 6, 7], d: 0.16, seed: 'soup' },
  { id: 'amoeba', name: 'Amoeba', b: [3, 5, 7], s: [1, 3, 5, 8], d: 0.16, seed: 'soup' },
  // 한 점에서 자라는 것들. 수프로 뿌리면 온 화면이 잡음이 되지만, 씨앗 하나면 무늬가 퍼져 나간다
  { id: 'gnarl', name: 'Gnarl', b: [1], s: [1], d: 0.5, seed: 'point' },
  { id: 'replicator', name: 'Replicator', b: [1, 3, 5, 7], s: [1, 3, 5, 7], d: 0.5, seed: 'point' },
  { id: 'seeds', name: 'Seeds', b: [2], s: [], d: 0.5, seed: 'point' },
  { id: 'life34', name: '34 Life', b: [3, 4], s: [3, 4], d: 0.5, seed: 'point' }
];

/** 날짜 문자열 하나에서 뽑아 쓰는 잡음. 같은 날은 항상 같은 값이 나온다. */
function hash32(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 씨앗 하나로 도는 난수 (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const toCode = (b: number[], s: number[]): string => `B${b.join('')}/S${s.join('')}`;

/**
 * 낯선 규칙 하나. 완전 무작위는 거의 다 죽거나 폭발하므로 **살 만한 자리**만 고른다:
 * 적은 이웃에서 태어나고(2~4), 살아남는 폭은 좁게. 그래도 무슨 일이 날지는 아무도 모른다.
 */
function wildRule(rand: () => number): Rule {
  const birth: number[] = [];
  const survive: number[] = [];
  const bCount = 1 + Math.floor(rand() * 2);
  for (let i = 0; i < bCount; i++) {
    const n = 2 + Math.floor(rand() * 4);
    if (!birth.includes(n)) birth.push(n);
  }
  const sCount = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < sCount; i++) {
    const n = 1 + Math.floor(rand() * 6);
    if (!survive.includes(n)) survive.push(n);
  }
  birth.sort();
  survive.sort();
  return { birth, survive, name: '', code: toCode(birth, survive), id: 'wild', density: 0.12 + rand() * 0.3, seed: 'soup' };
}

/** 그날의 규칙. `day` 는 `YYYY-MM-DD`. */
export function ruleForDay(day: string): Rule {
  const seed = hash32('garden:' + day);
  const rand = rng(seed);
  // 열흘에 하루쯤은 아무도 안 가 본 자리로
  if (rand() < 0.1) return wildRule(rand);
  const pick = NAMED[Math.floor(rand() * NAMED.length)];
  return { birth: pick.b, survive: pick.s, name: pick.name, code: toCode(pick.b, pick.s), id: pick.id, density: pick.d, seed: pick.seed };
}

/** 규칙을 「이웃 수 → 될까 말까」 표로 편다 (매 칸마다 배열을 뒤지지 않게). */
export function ruleTable(r: Rule): { born: Uint8Array; stay: Uint8Array } {
  const born = new Uint8Array(9);
  const stay = new Uint8Array(9);
  for (const n of r.birth) if (n >= 0 && n <= 8) born[n] = 1;
  for (const n of r.survive) if (n >= 0 && n <= 8) stay[n] = 1;
  return { born, stay };
}

export const NAMED_COUNT = NAMED.length;
