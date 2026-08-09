/**
 * 단위 변환 — 알맹이 (TASK-KL-088 / S1)
 *
 * MCP 로 내놓는 이유(B등급): **한국·일본 전통 단위**다. 평·근·돈·냥·되·말·자·리는 LLM 이
 * 어림값으로 답하거나 서로 다른 환산을 섞어 쓴다. 1평 = 3.3㎡ 라고 답하는데 정확히는 3.3057851 이고,
 * 부동산 면적처럼 큰 수에 곱하면 그 차이가 눈에 보이는 금액이 된다. 금 한 돈(3.75g)도 마찬가지다.
 * 온도는 비선형이라(0이 아니라 32에서 만난다) 또 다른 자리에서 틀린다.
 *
 * 이름은 여기 없다 — **읽는 쪽이 붙인다**(화면은 자기 말로, MCP 는 id 그대로). 이 파일은 **수**만 갖는다.
 * 환율은 여기 없다 — 그건 실시간 값이라 알맹이가 가질 수 없다(흡수계획 S4 어댑터 몫).
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'unitconv',
  ops: {
    convert: {
      desc:
        'Convert units, including Korean/Japanese traditional ones — pyeong(평), geun(근), don(돈),' +
        ' nyang(냥), doe(되), mal(말), ja(자), ri(리). Models answer these with rounded folklore' +
        ' (1 pyeong is 3.3057851 m², not 3.3 — on an apartment that gap is visible money).' +
        ' No currency here: that would need live rates.' +
        ' / 단위 변환. 한국·일본 전통 단위 포함. 환율은 없다.',
      in: { value: 'number', from: 'string', to: 'string', category: 'string?' },
      out: 'string'
    },
    list: {
      desc: '쓸 수 있는 단위 목록을 갈래별로 낸다.',
      in: { category: 'string?' },
      out: 'string'
    }
  }
};

/** 기준단위 배수. 온도만 비선형이라 따로 둔다. */
export const FACTORS: Record<string, Record<string, number>> = {
  // 기준 = m
  length: { mm: 0.001, cm: 0.01, m: 1, km: 1000, inch: 0.0254, ft: 0.3048, yd: 0.9144, mile: 1609.344, ja: 0.303, ri: 392.7 },
  // 기준 = kg. geun(근) · don(돈) · nyang(냥) = 한국 전통
  weight: { mg: 0.000001, g: 0.001, kg: 1, t: 1000, lb: 0.45359237, oz: 0.028349523125, geun: 0.6, don: 0.00375, nyang: 0.0375 },
  // 기준 = ㎡. pyeong(평) = 한국·일본 坪, 같은 크기
  area: { cm2: 0.0001, m2: 1, km2: 1000000, pyeong: 3.3057851, ha: 10000, acre: 4046.8564224, ft2: 0.09290304 },
  // 기준 = L. doe(되) · mal(말) = 한국 전통
  volume: { ml: 0.001, l: 1, m3: 1000, cup: 0.24, floz: 0.0295735295625, gal: 3.785411784, doe: 1.8039, mal: 18.039 },
  // 기준 = 바이트 (1KB = 1024B 기준)
  data: { b: 1, kb: 1024, mb: 1048576, gb: 1073741824, tb: 1099511627776, kbit: 128, mbit: 131072 },
  // 기준 = m/s
  /* 잘린 소수를 쓰면 1m/s → 3.5999999997km/h 가 나온다 — 눈에 거슬리고, 큰 수에 곱하면 벌어진다.
     그래서 **나눗셈을 그대로** 적는다 (1km/h = 1000m ÷ 3600s). */
  speed: { ms: 1, kmh: 1000 / 3600, mph: 0.44704, knot: 1852 / 3600, mach: 340.29 },
  // 기준 = 초. month 는 30일 · year 는 365일 어림 (달력 계산은 datecalc)
  time: { ms: 0.001, sec: 1, min: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 }
};

/** 온도는 **비선형**이다 — 배수 하나로 안 되고 0 에서 만나지도 않는다(32°F = 0°C). */
export const TEMP: Record<string, { toC: (v: number) => number; fromC: (v: number) => number }> = {
  c: { toC: (v) => v, fromC: (v) => v },
  f: { toC: (v) => ((v - 32) * 5) / 9, fromC: (v) => (v * 9) / 5 + 32 },
  k: { toC: (v) => v - 273.15, fromC: (v) => v + 273.15 }
};

export const CATEGORIES = [...Object.keys(FACTORS), 'temp'];

/** 단위 id 가 어느 갈래인지 (갈래를 안 줘도 찾아 준다). 여러 갈래에 같은 id 가 있으면 null. */
export function categoryOf(unit: string): string | null {
  const hits = CATEGORIES.filter((c) => (c === 'temp' ? unit in TEMP : unit in FACTORS[c]));
  return hits.length === 1 ? hits[0] : null;
}

export function convert(value: number, from: string, to: string, category?: string): number {
  const cat = category ?? categoryOf(from) ?? categoryOf(to);
  if (cat === null || cat === undefined) {
    throw new Error(`${from} → ${to} 가 어느 갈래인지 모르겠습니다 — category 를 함께 주세요`);
  }
  if (cat === 'temp') {
    if (from in TEMP === false || to in TEMP === false) throw new Error(`온도 단위는 c · f · k 입니다 (${from} → ${to})`);
    return TEMP[to].fromC(TEMP[from].toC(value));
  }
  const table = FACTORS[cat];
  if (table === undefined) throw new Error(`모르는 갈래입니다: ${cat} (${CATEGORIES.join(' · ')})`);
  if (from in table === false) throw new Error(`${cat} 에 「${from}」 는 없습니다 (${Object.keys(table).join(' · ')})`);
  if (to in table === false) throw new Error(`${cat} 에 「${to}」 는 없습니다 (${Object.keys(table).join(' · ')})`);
  return (value * table[from]) / table[to];
}

/** 자릿수를 억지로 자르지 않는다 — 부동산·금처럼 큰 수는 뒷자리가 돈이다. */
export function format(n: number): string {
  if (Number.isFinite(n) === false) return String(n);
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 1e-4 || abs >= 1e15)) return n.toExponential(6);
  return String(Math.round(n * 1e10) / 1e10);
}

export const run: ToolRunner = (op, args) => {
  if (op === 'list') {
    const cat = args.category === undefined ? null : String(args.category);
    if (cat === null) {
      return CATEGORIES.map((c) => `${c}: ${(c === 'temp' ? Object.keys(TEMP) : Object.keys(FACTORS[c])).join(' · ')}`).join('\n');
    }
    const units = cat === 'temp' ? Object.keys(TEMP) : Object.keys(FACTORS[cat] ?? {});
    if (units.length === 0) throw new Error(`모르는 갈래입니다: ${cat} (${CATEGORIES.join(' · ')})`);
    return `${cat}: ${units.join(' · ')}`;
  }

  if (op === 'convert') {
    const value = Number(args.value);
    if (Number.isFinite(value) === false) throw new Error('바꿀 값을 숫자로 주세요');
    const from = String(args.from ?? '');
    const to = String(args.to ?? '');
    const category = args.category === undefined ? undefined : String(args.category);
    const out = convert(value, from, to, category);
    const lines = [`${format(value)} ${from} = ${format(out)} ${to}`];
    if (from === 'pyeong' || to === 'pyeong') lines.push('※ 1평 = 3.3057851㎡ (3.3 으로 어림하면 큰 면적에서 어긋납니다)');
    if (from === 'don' || to === 'don') lines.push('※ 1돈 = 3.75g (금·은 무게)');
    if (categoryOf(from) === 'time' || category === 'time') lines.push('※ 달·해는 30일·365일 어림입니다. 달력 계산은 datecalc 를 쓰세요.');
    return lines.join('\n');
  }

  throw new Error(`unitconv 에 「${op}」 는 없습니다`);
};
