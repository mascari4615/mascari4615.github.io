/**
 * 버전 범위 셈 — `^1.2.3` 이 진짜로 무엇을 받나 (TASK-KL-316 / 13)
 *
 * `^` 와 `~` 는 **읽는 사람마다 다르게 안다**. 특히 0.x 는 규칙이 다르다(`^0.2.3` 은 0.3.0 을 안 받는다).
 * 그래서 여기서는 범위를 **경계 두 개**로 펴서 보여 준다 — 「이상 · 미만」으로 적히면 다툴 일이 없다.
 *
 * 겹치는지도 본다: 두 곳이 같은 꾸러미를 `^1.2.0` 과 `~1.1.0` 으로 잡고 있으면 **겹치는 판이 없다** —
 * 설치는 되는데 하나가 두 벌 깔리는 그 상황이다. 여기서 미리 말한다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'semver',
  ops: {
    explain: {
      desc: 'Expand a semver range (^1.2.3, ~1.2, 1.x, >=1 <2, a || b) into plain lower/upper bounds.',
      in: { range: 'string' },
      out: 'string'
    },
    satisfies: {
      desc: 'Say whether a version falls inside a range.',
      in: { version: 'string', range: 'string' },
      out: 'boolean'
    },
    overlap: {
      desc: 'Check whether two ranges have any version in common (dependency conflict check).',
      in: { a: 'string', b: 'string' },
      out: 'string'
    }
  }
};

export interface Version {
  major: number;
  minor: number;
  patch: number;
  /** `1.2.3-beta.1` 의 뒷부분 */
  pre?: string;
}

export function parse(text: string): Version {
  const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/.exec(text.trim());
  if (m === null) throw new Error('버전으로 안 읽힙니다: ' + text);
  return { major: Number(m[1]), minor: Number(m[2] ?? 0), patch: Number(m[3] ?? 0), pre: m[4] };
}

export function compare(a: Version, b: Version): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  /* 미리보기(-beta)는 정식보다 **낮다** — 이걸 반대로 알면 `^1.0.0` 이 1.0.0-beta 를 받는다고 착각한다. */
  if (a.pre === undefined && b.pre === undefined) return 0;
  if (a.pre === undefined) return 1;
  if (b.pre === undefined) return -1;
  return a.pre < b.pre ? -1 : a.pre > b.pre ? 1 : 0;
}

export const show = (v: Version): string => v.major + '.' + v.minor + '.' + v.patch + (v.pre === undefined ? '' : '-' + v.pre);

/** 한 덩이 범위 = 「이 위 · 이 아래」. 위는 **미만**(exclusive) 이 기본이다. */
export interface Bound {
  from?: Version;
  fromInclusive: boolean;
  to?: Version;
  toInclusive: boolean;
}

const bump = (v: Version, part: 'major' | 'minor' | 'patch'): Version =>
  part === 'major'
    ? { major: v.major + 1, minor: 0, patch: 0 }
    : part === 'minor'
      ? { major: v.major, minor: v.minor + 1, patch: 0 }
      : { major: v.major, minor: v.minor, patch: v.patch + 1 };

/** 조각 하나(`^1.2.3` · `>=2` · `1.x`)를 경계로 편다. */
function oneBound(piece: string): Bound {
  const text = piece.trim();
  if (text === '' || text === '*' || text === 'x' || text === 'latest') return { fromInclusive: true, toInclusive: false };

  const caret = /^\^\s*(.+)$/.exec(text);
  if (caret !== null) {
    const v = parse(caret[1]);
    /* 0.x 는 **다르다** — 0.2.3 은 0.3.0 을 안 받고, 0.0.3 은 0.0.4 도 안 받는다. */
    const upper = v.major > 0 ? bump(v, 'major') : v.minor > 0 ? bump(v, 'minor') : bump(v, 'patch');
    return { from: v, fromInclusive: true, to: upper, toInclusive: false };
  }

  const tilde = /^~\s*(.+)$/.exec(text);
  if (tilde !== null) {
    const raw = tilde[1];
    const v = parse(raw);
    const hasMinor = /^v?\d+\.\d+/.test(raw.trim());
    return { from: v, fromInclusive: true, to: hasMinor ? bump(v, 'minor') : bump(v, 'major'), toInclusive: false };
  }

  const cmp = /^(>=|<=|>|<|=)\s*(.+)$/.exec(text);
  if (cmp !== null) {
    const v = parse(cmp[2]);
    if (cmp[1] === '>=') return { from: v, fromInclusive: true, toInclusive: false };
    if (cmp[1] === '>') return { from: v, fromInclusive: false, toInclusive: false };
    if (cmp[1] === '<=') return { to: v, toInclusive: true, fromInclusive: true };
    if (cmp[1] === '<') return { to: v, toInclusive: false, fromInclusive: true };
    return { from: v, fromInclusive: true, to: v, toInclusive: true };
  }

  const wild = /^v?(\d+)\.(x|\*)(\.(x|\*))?$/i.exec(text);
  if (wild !== null) {
    const v: Version = { major: Number(wild[1]), minor: 0, patch: 0 };
    return { from: v, fromInclusive: true, to: bump(v, 'major'), toInclusive: false };
  }
  const wild2 = /^v?(\d+)\.(\d+)\.(x|\*)$/i.exec(text);
  if (wild2 !== null) {
    const v: Version = { major: Number(wild2[1]), minor: Number(wild2[2]), patch: 0 };
    return { from: v, fromInclusive: true, to: bump(v, 'minor'), toInclusive: false };
  }

  /* 그냥 `1.2.3` 은 딱 그 판. `1.2` 는 1.2.x 로 읽는다(npm 과 같다). */
  const v = parse(text);
  if (/^v?\d+\.\d+\.\d+/.test(text)) return { from: v, fromInclusive: true, to: v, toInclusive: true };
  if (/^v?\d+\.\d+$/.test(text)) return { from: v, fromInclusive: true, to: bump(v, 'minor'), toInclusive: false };
  return { from: v, fromInclusive: true, to: bump(v, 'major'), toInclusive: false };
}

/** `>=1.2 <2` 처럼 빈칸으로 이어진 것은 **둘 다** 만족해야 한다 → 좁은 쪽으로 모은다. */
function andBounds(list: Bound[]): Bound {
  let out: Bound = { fromInclusive: true, toInclusive: false };
  for (const b of list) {
    if (b.from !== undefined && (out.from === undefined || compare(b.from, out.from) > 0)) {
      out = { ...out, from: b.from, fromInclusive: b.fromInclusive };
    }
    if (b.to !== undefined && (out.to === undefined || compare(b.to, out.to) < 0)) {
      out = { ...out, to: b.to, toInclusive: b.toInclusive };
    }
  }
  return out;
}

/** 범위 하나 = 「또는」으로 이어진 덩이들. */
export function bounds(range: string): Bound[] {
  return range
    .split('||')
    .map((part) => andBounds(part.trim().split(/\s+/).filter((s) => s !== '').map(oneBound)))
    .filter((b) => b.from !== undefined || b.to !== undefined || true);
}

export function satisfies(version: string, range: string): boolean {
  const v = parse(version);
  return bounds(range).some((b) => {
    if (b.from !== undefined) {
      const c = compare(v, b.from);
      if (c < 0 || (c === 0 && !b.fromInclusive)) return false;
    }
    if (b.to !== undefined) {
      const c = compare(v, b.to);
      if (c > 0 || (c === 0 && !b.toInclusive)) return false;
    }
    /* 미리보기 판은 **적어 준 쪽에만** 들어간다 (npm 과 같은 규칙) */
    if (v.pre !== undefined) {
      const named = b.from !== undefined && b.from.pre !== undefined && b.from.major === v.major && b.from.minor === v.minor && b.from.patch === v.patch;
      if (!named) return false;
    }
    return true;
  });
}

/** 두 경계가 겹치나 */
function twoOverlap(a: Bound, b: Bound): boolean {
  const lowA = a.from;
  const lowB = b.from;
  const hiA = a.to;
  const hiB = b.to;
  if (lowA !== undefined && hiB !== undefined) {
    const c = compare(lowA, hiB);
    if (c > 0 || (c === 0 && !(a.fromInclusive && b.toInclusive))) return false;
  }
  if (lowB !== undefined && hiA !== undefined) {
    const c = compare(lowB, hiA);
    if (c > 0 || (c === 0 && !(b.fromInclusive && a.toInclusive))) return false;
  }
  return true;
}

export function overlaps(a: string, b: string): boolean {
  const left = bounds(a);
  const right = bounds(b);
  return left.some((x) => right.some((y) => twoOverlap(x, y)));
}

/** 목록 중 그 범위에 드는 가장 높은 판 */
export function maxSatisfying(versions: string[], range: string): string | undefined {
  const ok = versions.filter((v) => satisfies(v, range));
  if (ok.length === 0) return undefined;
  return ok.sort((x, y) => compare(parse(x), parse(y)))[ok.length - 1];
}

/** 사람이 읽는 「이상 · 미만」 (말은 화면이 붙이고, 여기선 수만 낸다) */
export function edges(range: string): Array<{ from?: string; fromInclusive: boolean; to?: string; toInclusive: boolean }> {
  return bounds(range).map((b) => ({
    from: b.from === undefined ? undefined : show(b.from),
    fromInclusive: b.fromInclusive,
    to: b.to === undefined ? undefined : show(b.to),
    toInclusive: b.toInclusive
  }));
}

export const run: ToolRunner = (op, args) => {
  if (op === 'explain') {
    return edges(String(args.range ?? ''))
      .map((e) => (e.from === undefined ? '' : (e.fromInclusive ? '>= ' : '> ') + e.from) + (e.to === undefined ? '' : (e.from === undefined ? '' : '  ') + (e.toInclusive ? '<= ' : '< ') + e.to))
      .join('  ||  ');
  }
  if (op === 'satisfies') return satisfies(String(args.version ?? ''), String(args.range ?? ''));
  if (op === 'overlap') return overlaps(String(args.a ?? ''), String(args.b ?? '')) ? 'overlap' : 'conflict';
  throw new Error('semver: 모르는 연산 ' + op);
};
