/**
 * **줄마다 셈하는 공책** 엔진 (TASK-KL-264)
 *
 * 수, 돈은 다른 재료와 다르다. 파일로도 붙여넣기로도 오지 않는다. **쓰면서 생긴다.**
 * 바깥에서 이걸 제대로 하는 것이 Soulver, Numi 다: 공책에 한 줄씩 적으면 **그 줄 옆에 답**이
 * 서고, 25% of 400, 3km in mi 같은 사람 말이 그대로 통하고, 앞 줄을 이름으로 부른다.
 *
 * 우리 수, 돈 도구는 열둘인데 전부 **칸 채우는 양식**이었다(부가세: 금액 넣고 누르기).
 * 양식은 이 하나를 셀 때는 빠르지만, **여러 개를 이어서** 셀 때 무너진다 . 
 * 합계 구하고 → 거기서 부가세 빼고 → 셋으로 나누면 1인당 은 양식 세 번이다.
 *
 * 그래서 공책을 엔진으로 둔다. 도구들은 그대로 있다(정확한 계산, 표는 그쪽이 낫다).
 * 여기 있는 것은 **이어서 셈하는 자리**다.
 *
 * 바깥 것에 기대지 않는다. 환율처럼 밖에서 받아 와야 하는 것은 **넣지 않았다**
 * (사용자 룰: 바깥 API 에 기대는 도구는 만들지 않는다). 단위, 퍼센트, 시간은 전부 여기서 판정한다.
 */

export interface CalcLine {
  /** 원래 줄 */
  raw: string;
  /** 셈한 값 (못 셌으면 null) */
  value: number | null;
  /** 보일 답. 단위, 통화가 붙는다 */
  text: string;
  /** 이 줄이 이름을 매겼으면 그 이름 */
  name?: string;
  /** 못 센 이유 (있으면 조용히 비운다. 주석, 빈 줄은 흠이 아니다) */
  error?: string;
  /** 방정식이면 그 뿌리들 (TASK-KL-238 / 13) */
  roots?: number[];
  /** 그림을 그릴 줄이면 그 표본 (TASK-KL-238 / 13) */
  plot?: Plot;
}

/** 그림 한 장 분량의 표본. 그리는 일은 화면 몫이고, **재는 일은 여기서** 끝낸다. */
export interface Plot {
  expr: string;
  from: number;
  to: number;
  points: Array<[number, number]>;
  minY: number;
  maxY: number;
}

/* ── 단위 (환산 계수는 **하나의 기준 단위**로 모은다) ───────────────── */

type UnitTable = Record<string, number>;

const LENGTH: UnitTable = {
  mm: 0.001, cm: 0.01, m: 1, km: 1000,
  in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344,
  '인치': 0.0254, '피트': 0.3048, '마일': 1609.344, '미터': 1, '킬로미터': 1000, '센티미터': 0.01
};
const MASS: UnitTable = {
  mg: 0.000001, g: 0.001, kg: 1, t: 1000,
  oz: 0.0283495, lb: 0.453592,
  '그램': 0.001, '킬로그램': 1, '근': 0.6, '돈': 0.00375, '냥': 0.0375, '파운드': 0.453592
};
const DATA: UnitTable = {
  b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4
};
const TIME: UnitTable = {
  ms: 0.001, s: 1, sec: 1, min: 60, h: 3600, hr: 3600, d: 86400, day: 86400,
  '초': 1, '분': 60, '시간': 3600, '일': 86400, '주': 604800
};
const AREA: UnitTable = {
  'm2': 1, 'km2': 1e6, 'cm2': 0.0001, 'ha': 10000, '평': 3.305785, '평방미터': 1
};
const TABLES: UnitTable[] = [LENGTH, MASS, DATA, TIME, AREA];

/** 두 단위가 같은 표에 있으면 그 표를 준다. 다른 표끼리는 못 바꾼다(kg 를 km 로 X). */
function tableFor(a: string, b: string): UnitTable | null {
  for (const t of TABLES) if (a in t && b in t) return t;
  return null;
}

/* ── 셈 ─────────────────────────────────────────────────────────── */

/** 1,234.5, 1_000 처럼 사람이 쓰는 숫자를 받는다. */
function num(s: string): number {
  return Number(s.replace(/[,_\s]/g, ''));
}

/**
 * 아주 작은 식 계산기. `+ - * / ^ ( )` 와 `%`.
 *
 * `eval` 을 쓰지 않는다. 사람이 적은 줄이 곧 코드가 되면, 붙여넣기 한 번에 무슨 일이든 일어난다.
 * 계산기는 계산만 해야 한다.
 */
function evaluate(src: string, vars: Map<string, number>): number {
  const tokens = src
    .replace(/\*\*/g, '^')
    .match(/[0-9][0-9_,.]*|[A-Za-z가-힣_][A-Za-z0-9가-힣_]*|[()+\-*/^%]/g);
  if (!tokens) throw new Error('빈 식');
  let i = 0;
  const peek = (): string | undefined => tokens[i];
  const eat = (t?: string): string => {
    const v = tokens[i++];
    if (t && v !== t) throw new Error(`${t} 가 있어야 합니다`);
    return v;
  };

  const primary = (): number => {
    const t = peek();
    if (t === undefined) throw new Error('식이 끊겼습니다');
    if (t === '(') {
      eat('(');
      const v = expr();
      eat(')');
      return v;
    }
    if (t === '-') {
      eat('-');
      return -primary();
    }
    if (/^[0-9]/.test(t)) return num(eat());
    const name = eat();
    if (vars.has(name)) return vars.get(name) as number;
    throw new Error(`${name} 가 뭔지 모릅니다`);
  };
  const power = (): number => {
    const base = primary();
    if (peek() === '^') {
      eat('^');
      return base ** power();
    }
    return base;
  };
  const term = (): number => {
    let v = power();
    for (;;) {
      const t = peek();
      if (t === '*') {
        eat();
        v *= power();
      } else if (t === '/') {
        eat();
        const d = power();
        if (d === 0) throw new Error('0 으로 나눌 수 없습니다');
        v /= d;
      } else return v;
    }
  };
  const expr = (): number => {
    let v = term();
    for (;;) {
      const t = peek();
      if (t === '+') {
        eat();
        v += term();
      } else if (t === '-') {
        eat();
        v -= term();
      } else return v;
    }
  };
  const out = expr();
  if (i < tokens.length) throw new Error(`${tokens[i]} 를 못 읽었습니다`);
  return out;
}

/* ── 풀이, 그림 (TASK-KL-238 / 13 wolframalpha) ────────────────────────
 *
 * wolframalpha 의 알맹이는 **거대한 지식 창고 + 기호 대수**라 통째로는 못 짓는다. 그런데 사람이
 * 거기서 실제로 두드리는 것의 큰 몫은 둘이다: **x 구해 줘**와 **그려 줘**.
 * 그 둘은 창고가 없어도 된다. 재기만 하면 되기 때문이다.
 *
 * 기호로 풀지 않고 **재서 푼다**: 직선이면 두 점으로, 이차면 세 점으로 계수를 뽑고(그리고 네
 * 번째 점으로 *검산*한다. 검산 없이 맞췄다고 하면 삼차를 이차로 우겨 답을 지어낸다), 아니면
 * 부호가 바뀌는 자리를 찾아 좁힌다. 지어낸 값을 정확한 답인 척하지 않는 것이 이 코드의 규율이다.
 */

/** 사람이 적는 `2x` 를 `2*x` 로. 셈틀은 곱셈 기호를 안 적은 것을 모른다. */
export function implicitMul(src: string): string {
  return src
    .replace(/(\d)\s*([A-Za-z가-힣_(])/g, '$1*$2')
    .replace(/\)\s*([A-Za-z가-힣_0-9(])/g, ')*$1');
}

/** 식을 x 자리에 값을 넣어 잰다. 못 재면 NaN. 던지지 않는다(그리는 쪽은 구간을 훑는다). */
export function evalAt(expr: string, x: number, name = 'x'): number {
  const vars = new Map<string, number>([[name, x]]);
  try {
    return evaluate(implicitMul(expr), vars);
  } catch {
    return NaN;
  }
}

const near = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));

export interface Solved {
  /** 어떻게 풀었나. 화면이 정확과 대략을 다르게 말해야 한다. */
  kind: 'linear' | 'quadratic' | 'numeric';
  roots: number[];
}

/**
 * `f(x) = 0` 의 뿌리. `f` 는 왼쪽 − 오른쪽이다.
 * 못 찾으면 null. **없는 답을 만들지 않는다**(허근은 없다고 말한다).
 */
export function solveZero(f: (x: number) => number): Solved | null {
  const y = (x: number): number => f(x);
  const [y0, y1, y2, y3] = [y(0), y(1), y(2), y(3)];
  if (![y0, y1, y2, y3].every(Number.isFinite)) return scan(y);

  // 직선인가. 기울기가 일정한가(그리고 네 번째 점으로 검산)
  const a = y1 - y0;
  if (near(y2 - y1, a) && near(y3 - y2, a)) {
    if (near(a, 0)) return null; // 기울기가 0 = 뿌리가 없거나 전부다. 지어내지 않는다.
    return { kind: 'linear', roots: [-y0 / a] };
  }

  // 이차인가. 세 점으로 계수, 네 번째 점으로 검산
  const c = y0;
  const qa = (y2 - 2 * y1 + y0) / 2;
  const qb = y1 - y0 - qa;
  if (!near(qa * 9 + qb * 3 + c, y3, 1e-6)) return scan(y);
  const disc = qb * qb - 4 * qa * c;
  if (disc < 0) return null; // 실수 뿌리 없음
  const rootA = (-qb + Math.sqrt(disc)) / (2 * qa);
  const rootB = (-qb - Math.sqrt(disc)) / (2 * qa);
  const roots = near(rootA, rootB) ? [rootA] : [rootA, rootB].sort((p, q) => p - q);
  return { kind: 'quadratic', roots };
}

/** 부호가 바뀌는 자리를 훑어 좁힌다. 대략이라고 말할 값이다. */
function scan(y: (x: number) => number, from = -100, to = 100, step = 0.05): Solved | null {
  const roots: number[] = [];
  let prevX = from;
  let prevY = y(from);
  for (let x = from + step; x <= to && roots.length < 4; x += step) {
    const cur = y(x);
    if (Number.isFinite(prevY) && Number.isFinite(cur)) {
      if (cur === 0) roots.push(x);
      else if (prevY * cur < 0) {
        let lo = prevX;
        let hi = x;
        for (let i = 0; i < 60; i++) {
          const mid = (lo + hi) / 2;
          if (y(lo) * y(mid) <= 0) hi = mid;
          else lo = mid;
        }
        roots.push((lo + hi) / 2);
      }
    }
    prevX = x;
    prevY = cur;
  }
  return roots.length > 0 ? { kind: 'numeric', roots } : null;
}

/** 그릴 표본. 구간 안에서 못 재는 자리(0으로 나누기 등)는 **건너뛴다**. 0 으로 채우면 없는 골짜기가 생긴다. */
export function plotSamples(expr: string, from = -10, to = 10, n = 240): Plot | null {
  const points: Array<[number, number]> = [];
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i <= n; i++) {
    const x = from + ((to - from) * i) / n;
    const v = evalAt(expr, x);
    if (!Number.isFinite(v) || Math.abs(v) > 1e9) continue;
    points.push([x, v]);
    if (v < minY) minY = v;
    if (v > maxY) maxY = v;
  }
  if (points.length < 2) return null;
  if (near(minY, maxY)) {
    // 납작한 직선도 보이게. 위아래로 1 씩 벌린다(안 벌리면 높이 0 인 그림이 된다)
    minY -= 1;
    maxY += 1;
  }
  return { expr, from, to, points, minY, maxY };
}

/** 보기 좋은 숫자. 소수점은 필요한 만큼만. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '. ';
  const abs = Math.abs(n);
  const digits = abs >= 100 ? 0 : abs >= 1 ? 2 : 4;
  return n.toLocaleString('ko-KR', { maximumFractionDigits: digits });
}

/**
 * 공책 한 장을 센다. **줄 순서가 곧 문맥**이다. 앞 줄에서 매긴 이름과 값을 뒤가 쓴다.
 *
 * 알아듣는 말:
 *   - `1234 + 5678`            사칙연산, 괄호, 거듭제곱
 *   - `밥값 = 32000`           이름 매기기 (뒤 줄에서 `밥값` 으로 부른다)
 *   - `25% of 400` / `400의 25%`  ~의 몇 퍼센트
 *   - `50000 + 10%` / `- 10%`  얼마에서 몇 퍼센트 더하기, 빼기 (부가세, 할인)
 *   - `3km in mi` / `3km to 마일`  단위 바꾸기
 *   - `sum` / `합계`            여태 셈한 값들의 합
 *   - `prev` / `앞`             바로 앞 줄의 값
 *   - `# 메모` / 빈 줄          셈하지 않는다 (흠이 아니다)
 */
export function calcSheet(text: string): CalcLine[] {
  const out: CalcLine[] = [];
  const vars = new Map<string, number>();
  let last: number | null = null;
  const running: number[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) {
      out.push({ raw, value: null, text: '' });
      continue;
    }
    try {
      const r = one(line, vars, last, running);
      out.push({ raw, ...r });
      if (r.value !== null) {
        last = r.value;
        running.push(r.value);
        if (r.name) vars.set(r.name, r.value);
      }
    } catch (e) {
      out.push({ raw, value: null, text: '', error: (e as Error).message });
    }
  }
  return out;
}

function one(
  line: string,
  vars: Map<string, number>,
  last: number | null,
  running: number[]
): { value: number | null; text: string; name?: string; roots?: number[]; plot?: Plot } {
  /* ⓪ **x 구하기, 그리기** (TASK-KL-238 / 13 wolframalpha)
   *
   * 이름 매기기(`밥값 = 32000`)보다 **먼저** 본다. 2x + 3 = 11 의 왼쪽은 이름이 아니라 식이라,
   * 이름 매기기가 먼저 집으면 2x + 3 이라는 이상한 이름이 생기고 답은 영영 안 나온다.
   * 가르는 규칙 하나: **왼쪽이 맨 이름이 아니거나, 어느 한쪽에 미지수 x 가 있으면 방정식이다.** */
  const drawing = line.match(/^(?:plot|graph|그래프|그려)\s+(.+)$/i) || line.match(/^y\s*=\s*(.+)$/i);
  if (drawing && HAS_X.test(drawing[1])) {
    const plot = plotSamples(drawing[1]);
    if (plot === null) throw new Error('이 식은 못 그립니다');
    return { value: null, text: '', plot };
  }

  const eqn = line.replace(/^solve\s+/i, '').match(/^([^=]+)=([^=].*)$/);
  if (eqn && (HAS_X.test(eqn[1]) || HAS_X.test(eqn[2])) && !/^[A-Za-z가-힣_][A-Za-z0-9가-힣_ ]*$/.test(eqn[1].trim())) {
    return solvedLine(eqn[1], eqn[2]);
  }
  if (eqn && HAS_X.test(eqn[2]) && /^\s*x\s*$/i.test(eqn[1])) {
    // `x = 2x - 3` 도 방정식이다 (오른쪽에 x 가 또 있으면 값 매기기가 아니다)
    return solvedLine(eqn[1], eqn[2]);
  }

  /* ① 이름 매기기. `밥값 = 32000` (`==` 는 아니다) */
  const named = line.match(/^([A-Za-z가-힣_][A-Za-z0-9가-힣_ ]*?)\s*=\s*(.+)$/);
  let name: string | undefined;
  let body = line;
  if (named && !named[2].startsWith('=')) {
    name = named[1].trim().replace(/\s+/g, '_');
    body = named[2].trim();
  }

  const put = (v: number, unit = ''): { value: number; text: string; name?: string } => ({
    value: v,
    text: unit ? `${fmt(v)} ${unit}` : fmt(v),
    name
  });

  /* ② 앞 줄, 여태 합은 **이름처럼** 쓴다 (`prev + 8`, `앞 / 5`).
   *
   * 처음엔 줄 전체가 `sum` 일 때만 받았는데, 그러면 앞 값에서 나누기가 안 된다 . 
   * 공책의 값어치는 **앞 줄을 이어받는 데** 있으므로 이름 자리에 넣는 게 맞다. */
  const total = running.reduce((a, b) => a + b, 0);
  for (const k of ['sum', '합계', '총합']) vars.set(k, total);
  if (last !== null) for (const k of ['prev', '앞', '이전']) vars.set(k, last);

  /* ③ 단위 바꾸기. `3km in mi`, `3 km to 마일` (**퍼센트보다 먼저** 볼 이유는 없다;
   *    다만 `in`, `to` 가 든 줄은 여기서만 처리되므로 순서가 겹치지 않는다) */
  const conv = body.match(/^(.+?)\s*([A-Za-z가-힣²2]+)\s+(?:in|to|→|->)\s+([A-Za-z가-힣²2]+)$/i);
  if (conv) {
    const from = conv[2].toLowerCase();
    const to = conv[3].toLowerCase();
    const table = tableFor(from, to);
    if (!table) throw new Error(`${conv[2]} 를 ${conv[3]} 로는 못 바꿉니다`);
    const v = evaluate(conv[1], vars) * table[from];
    return put(v / table[to], conv[3]);
  }

  /* ④ ~의 몇 퍼센트. `25% of 400`, `400의 25%` */
  const pOf = body.match(/^(.+?)\s*%\s*(?:of|의)\s*(.+)$/i);
  if (pOf) return put((evaluate(pOf[1], vars) / 100) * evaluate(pOf[2], vars));
  const ofP = body.match(/^(.+?)\s*의\s*(.+?)\s*%$/);
  if (ofP) return put((evaluate(ofP[2], vars) / 100) * evaluate(ofP[1], vars));

  /* ⑤ 몇 퍼센트 더하기, 빼기. `50000 + 10%` (부가세), `19800 - 10%` (할인) */
  const pm = body.match(/^(.+?)\s*([+\-])\s*([\d.,]+)\s*%$/);
  if (pm) {
    const base = evaluate(pm[1], vars);
    const rate = num(pm[3]) / 100;
    return put(pm[2] === '+' ? base * (1 + rate) : base * (1 - rate));
  }

  /* ⑥ 그냥 식.
   *
   * 세는 말(`원`, `개`, `명`)은 **숫자에 붙어 있을 때만** 세는 말이다. 떼고 셈한 뒤 답에 도로
   * 붙인다(`1200원 * 3` → `3,600 원`). 앞엔 이게 끝에 붙은 글자면 단위였는데, 그러면
   * `a * b` 의 `b` 까지 단위로 떼어 가 식이 끊겼다. **이름을 단위로 오해하면 안 된다.** */
  const money = body.match(/(\d)\s*(원|개|명|won)/);
  const tail = money ? (money[2] === 'won' ? '원' : money[2]) : '';
  const cleaned = body.replace(/(\d)\s*(원|개|명|won)/g, '$1');
  const v = evaluate(cleaned, vars);
  return put(v, tail);
}

/** 미지수가 든 식인가. 이름 안의 x(`box`, `x2`)는 미지수가 아니다. 다만 `2x` 의 x 는 미지수다
 *  (숫자가 앞에 붙는 것은 곱셈이지 이름이 아니다). */
const HAS_X = /(^|[^A-Za-z가-힣_])x([^A-Za-z0-9가-힣_]|$)/i;

/** 방정식 한 줄 → 뿌리. 못 찾으면 없다고 말한다(지어내지 않는다). */
function solvedLine(lhs: string, rhs: string): { value: number | null; text: string; roots?: number[] } {
  const solved = solveZero((x) => evalAt(lhs, x) - evalAt(rhs, x));
  if (solved === null) throw new Error('x 를 못 찾았습니다 (실수 답이 없을 수 있습니다)');
  const approx = solved.kind === 'numeric';
  const shown = solved.roots.map((r) => fmt(Math.abs(r) < 1e-9 ? 0 : r)).join(', ');
  return {
    value: solved.roots.length === 1 ? solved.roots[0] : null,
    text: `x = ${approx ? '≈ ' : ''}${shown}`,
    roots: solved.roots
  };
}
