/**
 * 학점 계산 — 알맹이 (TASK-KL-088 / S1)
 *
 * 학점은 단순 평균이 아니라 **학점 수로 가중한 평균**이다. 3학점 과목의 A와 1학점 과목의 A는
 * 무게가 다른데, 그냥 더해 나누면 그 차이가 사라진다.
 *
 * MCP 로 내놓는 이유(B등급): ① LLM 은 「평점 계산해 줘」에 **단순 평균**을 내는 경우가 많다.
 * ② 4.5 만점과 4.3 만점이 섞여 있는데(둘 다 국내에서 쓴다) 어느 쪽인지 안 묻고 답한다.
 * ③ 「목표 학점 맞추려면 남은 학기에 얼마 필요?」는 식이 뒤집힌 문제라 특히 자주 틀린다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'grade',
  ops: {
    gpa: {
      desc:
        '과목별 「학점수 성적」 줄들로 평점(학점 가중 평균)을 낸다. 예: "3 A+\\n3 B0\\n2 A-".' +
        ' scale 은 45(기본) 또는 43.',
      in: { courses: 'string', scale: 'string?' },
      out: 'string'
    },
    needed: {
      desc:
        '목표 평점을 맞추려면 남은 학점에서 평균 얼마가 필요한지 계산한다.' +
        ' 만점으로도 불가능하면 그렇다고 말한다.',
      in: { courses: 'string', target: 'number', future: 'number', scale: 'string?' },
      out: 'string'
    }
  }
};

/** 4.5 만점 기준 (국내 대부분) */
export const SCALE_45: Record<string, number> = {
  'A+': 4.5, A0: 4.0, 'A-': 3.7,
  'B+': 3.5, B0: 3.0, 'B-': 2.7,
  'C+': 2.5, C0: 2.0, 'C-': 1.7,
  'D+': 1.5, D0: 1.0, 'D-': 0.7,
  F: 0
};

/** 4.3 만점 기준 */
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
  /** 학점 가중 평균 — 이게 진짜 평점. */
  gpa: number;
  /** 단순 평균 — 참고용. 위와 다르다는 걸 보여 주려고 함께 낸다. */
  simple: number;
  credits: number;
  points: number;
  counted: number;
  /** 못 읽은 줄. 조용히 버리지 않는다. */
  bad: string[];
}

/**
 * 「3 A+」 처럼 한 줄에 학점 수와 성적. 사이 구분은 공백·탭·쉼표 아무거나.
 * `A` 처럼 한 글자로 적으면 `A0` 로 본다 (사람들이 그렇게 적는다).
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
  /** 이미 목표를 넘었으면 true. */
  alreadyThere: boolean;
  /** 남은 학점을 전부 만점 받으면 나올 평점. */
  best: number;
}

/** 목표를 채우려면 남은 학점에서 평균 얼마가 필요한가. 식을 뒤집는 자리라 자주 틀린다. */
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
  if (r.counted === 0) throw new Error('읽을 수 있는 줄이 없습니다 — 「3 A+」 처럼 학점과 성적을 한 줄에 적어 주세요');

  const head = [
    `평점(학점 가중): ${r.gpa.toFixed(2)} / ${max}`,
    `이수 학점: ${r.credits}  ·  과목 수: ${r.counted}`,
    `단순 평균(참고): ${r.simple.toFixed(2)}  ← 학점 수를 무시하면 이 값이 나옵니다. 평점은 위쪽입니다.`,
    `백분위 환산: ${((r.gpa / max) * 100).toFixed(1)}점`
  ];
  if (r.bad.length > 0) head.push(`못 읽은 줄 ${r.bad.length}개: ${r.bad.slice(0, 3).join(' · ')}`);

  if (op === 'gpa') return head.join('\n');

  if (op === 'needed') {
    const target = Number(args.target);
    const future = Number(args.future);
    if (Number.isFinite(target) === false) throw new Error('목표 평점을 숫자로 주세요');
    if (Number.isFinite(future) === false || future <= 0) throw new Error('남은 학점을 0보다 큰 숫자로 주세요');
    const n = neededAverage(r.points, r.credits, target, future, max);
    head.push(
      n.alreadyThere
        ? `목표 ${target}: 이미 넘었습니다`
        : n.possible
          ? `목표 ${target} 을(를) 맞추려면 남은 ${future}학점에서 평균 ${n.required.toFixed(2)} 필요`
          : `목표 ${target} 은 남은 ${future}학점을 전부 만점 받아도 불가능합니다 (필요 ${n.required.toFixed(2)} > 만점 ${max})`,
      `남은 학점을 전부 만점 받으면: ${n.best.toFixed(2)}`
    );
    return head.join('\n');
  }

  throw new Error(`grade 에 「${op}」 는 없습니다`);
};
