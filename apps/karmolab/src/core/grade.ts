/**
 * GPA calculation core (TASK-KL-088 / S1)
 *
 * GPA must be credit-weighted, not a plain average.
 *
 * MCP exposes this because models often use a plain average, guess the wrong scale, or
 * misread the inverse "what average is needed" problem.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'grade',
  ops: {
    gpa: {
      desc:
        'Korean university GPA from "credits grade" lines, e.g. "3 A+\\n3 B0\\n2 A-" — credit-weighted,' +
        ' not a plain average. scale = 4.5 (default, the Korean norm) or 4.3.',
      in: { courses: 'string', scale: 'string?' },
      out: 'string'
    },
    needed: {
      desc:
        'What average the remaining credits must earn to reach a target GPA —' +
        ' and it says so plainly when even straight A+ cannot get there.',
      in: { courses: 'string', target: 'number', future: 'number', scale: 'string?' },
      out: 'string'
    }
  }
};

/** 4.5 scale (default). */
export const SCALE_45: Record<string, number> = {
  'A+': 4.5, A0: 4.0, 'A-': 3.7,
  'B+': 3.5, B0: 3.0, 'B-': 2.7,
  'C+': 2.5, C0: 2.0, 'C-': 1.7,
  'D+': 1.5, D0: 1.0, 'D-': 0.7,
  F: 0
};

/** 4.3 scale. */
export const SCALE_43: Record<string, number> = {
  'A+': 4.3, A0: 4.0, 'A-': 3.7,
  'B+': 3.3, B0: 3.0, 'B-': 2.7,
  'C+': 2.3, C0: 2.0, 'C-': 1.7,
  'D+': 1.3, D0: 1.0, 'D-': 0.7,
  F: 0
};

export const scaleOf = (name?: string): Record<string, number> => (String(name) === '43' ? SCALE_43 : SCALE_45);
export const maxOf = (scale: Record<string, number>): number => scale['A+'];

export interface GpaResult {
  /** Credit-weighted GPA. */
  gpa: number;
  /** Plain average for comparison. */
  simple: number;
  credits: number;
  points: number;
  counted: number;
  /** Unreadable lines. */
  bad: string[];
}

/**
 * One line per course, e.g. "3 A+". Separator can be spaces, tabs, or commas.
 * A single "A" is treated as "A0".
 */
export function parseCourses(text: string, scale: Record<string, number>): GpaResult {
  let credits = 0;
  let points = 0;
  let counted = 0;
  const dist: Record<string, number> = {};
  const bad: string[] = [];

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    const m = /^(\d+(?:\.\d+)?)[\s,\t]+([A-Fa-f][+\-0]?)$/.exec(line);
    if (m === null) {
      bad.push(line);
      continue;
    }
    const c = parseFloat(m[1]);
    let g = m[2].toUpperCase();
    if (g.length === 1 && g !== 'F') g += '0';
    if (scale[g] === undefined) {
      bad.push(line);
      continue;
    }
    credits += c;
    points += c * scale[g];
    counted++;
    dist[g] = (dist[g] ?? 0) + 1;
  }

  const simple = counted === 0 ? 0 : Object.keys(dist).reduce((a, g) => a + scale[g] * dist[g], 0) / counted;
  return { gpa: credits === 0 ? 0 : points / credits, simple, credits, points, counted, bad };
}

export interface NeededResult {
  required: number;
  possible: boolean;
  /** Already at or above target. */
  alreadyThere: boolean;
  /** GPA if remaining credits are all maxed out. */
  best: number;
}

/** Required average over the remaining credits. */
export function neededAverage(
  points: number,
  credits: number,
  target: number,
  future: number,
  max: number
): NeededResult {
  const required = (target * (credits + future) - points) / future;
  return {
    required,
    possible: required <= max,
    alreadyThere: required <= 0,
    best: (points + future * max) / (credits + future)
  };
}

export const run: ToolRunner = (op, args) => {
  const scale = scaleOf(args.scale === undefined ? undefined : String(args.scale));
  const max = maxOf(scale);
  const r = parseCourses(String(args.courses ?? ''), scale);
  if (r.counted === 0) throw new Error('No readable lines found - enter one course per line like "3 A+"');

  const head = [
    `GPA (credit-weighted): ${r.gpa.toFixed(2)} / ${max}`,
    `Credits: ${r.credits}  ·  Courses: ${r.counted}`,
    `Plain average: ${r.simple.toFixed(2)}  <- ignore credits and you get this. GPA is above.`,
    `Percent of max: ${((r.gpa / max) * 100).toFixed(1)}%`
  ];
  if (r.bad.length > 0) head.push(`Unreadable lines ${r.bad.length}: ${r.bad.slice(0, 3).join(' · ')}`);

  if (op === 'gpa') return head.join('\n');

  if (op === 'needed') {
    const target = Number(args.target);
    const future = Number(args.future);
    if (Number.isFinite(target) === false) throw new Error('Enter the target GPA as a number');
    if (Number.isFinite(future) === false || future <= 0) throw new Error('Enter remaining credits as a number greater than 0');
    const n = neededAverage(r.points, r.credits, target, future, max);
    head.push(
      n.alreadyThere
        ? `Target ${target}: already exceeded`
        : n.possible
          ? `To reach ${target}, the remaining ${future} credits need an average of ${n.required.toFixed(2)}`
          : `Target ${target} is impossible even with all remaining ${future} credits at max (need ${n.required.toFixed(2)} > max ${max})`,
      `If remaining credits are all maxed out: ${n.best.toFixed(2)}`
    );
    return head.join('\n');
  }

  throw new Error(`grade has no operation named "${op}"`);
};
