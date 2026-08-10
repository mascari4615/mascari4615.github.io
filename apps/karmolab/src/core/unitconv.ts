/**
 * Unit conversion core (TASK-KL-088 / S1)
 *
 * MCP exposes this because models often blur traditional units or guess round values.
 *
 * This file keeps numbers only; callers label them.
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
        ' No currency here: that would need live rates.',
      in: { value: 'number', from: 'string', to: 'string', category: 'string?' },
      out: 'string'
    },
    list: {
      desc: 'List available units by category.',
      in: { category: 'string?' },
      out: 'string'
    }
  }
};

/** Conversion factors by category. */
export const FACTORS: Record<string, Record<string, number>> = {
  // length
  length: { mm: 0.001, cm: 0.01, m: 1, km: 1000, inch: 0.0254, ft: 0.3048, yd: 0.9144, mile: 1609.344, ja: 0.303, ri: 392.7 },
  // weight
  weight: { mg: 0.000001, g: 0.001, kg: 1, t: 1000, lb: 0.45359237, oz: 0.028349523125, geun: 0.6, don: 0.00375, nyang: 0.0375 },
  // area
  area: { cm2: 0.0001, m2: 1, km2: 1000000, pyeong: 3.3057851, ha: 10000, acre: 4046.8564224, ft2: 0.09290304 },
  // volume
  volume: { ml: 0.001, l: 1, m3: 1000, cup: 0.24, floz: 0.0295735295625, gal: 3.785411784, doe: 1.8039, mal: 18.039 },
  // data
  data: { b: 1, kb: 1024, mb: 1048576, gb: 1073741824, tb: 1099511627776, kbit: 128, mbit: 131072 },
  // speed
  speed: { ms: 1, kmh: 1000 / 3600, mph: 0.44704, knot: 1852 / 3600, mach: 340.29 },
  // time
  time: { ms: 0.001, sec: 1, min: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 }
};

/** Temperature is nonlinear. */
export const TEMP: Record<string, { toC: (v: number) => number; fromC: (v: number) => number }> = {
  c: { toC: (v) => v, fromC: (v) => v },
  f: { toC: (v) => ((v - 32) * 5) / 9, fromC: (v) => (v * 9) / 5 + 32 },
  k: { toC: (v) => v - 273.15, fromC: (v) => v + 273.15 }
};

export const CATEGORIES = [...Object.keys(FACTORS), 'temp'];

/** Infer the category from a unit id. */
export function categoryOf(unit: string): string | null {
  const hits = CATEGORIES.filter((c) => (c === 'temp' ? unit in TEMP : unit in FACTORS[c]));
  return hits.length === 1 ? hits[0] : null;
}

export function convert(value: number, from: string, to: string, category?: string): number {
  const cat = category ?? categoryOf(from) ?? categoryOf(to);
  if (cat === null || cat === undefined) {
    throw new Error(`Cannot infer the category for ${from} -> ${to}; please provide category`);
  }
  if (cat === 'temp') {
    if (from in TEMP === false || to in TEMP === false) throw new Error(`Temperature units are c, f, and k (${from} -> ${to})`);
    return TEMP[to].fromC(TEMP[from].toC(value));
  }
  const table = FACTORS[cat];
  if (table === undefined) throw new Error(`Unknown category: ${cat} (${CATEGORIES.join(', ')})`);
  if (from in table === false) throw new Error(`${cat} has no unit named "${from}" (${Object.keys(table).join(', ')})`);
  if (to in table === false) throw new Error(`${cat} has no unit named "${to}" (${Object.keys(table).join(', ')})`);
  return (value * table[from]) / table[to];
}

/** Render a numeric value without forcing a fixed decimal place. */
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
    if (units.length === 0) throw new Error(`Unknown category: ${cat} (${CATEGORIES.join(', ')})`);
    return `${cat}: ${units.join(' · ')}`;
  }

  if (op === 'convert') {
    const value = Number(args.value);
    if (Number.isFinite(value) === false) throw new Error('Enter the value as a number');
    const from = String(args.from ?? '');
    const to = String(args.to ?? '');
    const category = args.category === undefined ? undefined : String(args.category);
    const out = convert(value, from, to, category);
    const lines = [`${format(value)} ${from} = ${format(out)} ${to}`];
    if (from === 'pyeong' || to === 'pyeong') lines.push('Note: 1 pyeong = 3.3057851 m²');
    if (from === 'don' || to === 'don') lines.push('Note: 1 don = 3.75 g');
    if (categoryOf(from) === 'time' || category === 'time') lines.push('Note: months and years here are rough 30-day / 365-day values; use datecalc for calendar math.');
    return lines.join('\n');
  }

  throw new Error(`unitconv has no operation named "${op}"`);
};
