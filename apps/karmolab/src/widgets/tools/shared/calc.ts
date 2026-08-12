/**
 * **줄마다 셈하는 공책** 엔진 (TASK-KL-264)
 *
 * 수·돈은 다른 재료와 다르다 — 파일로도 붙여넣기로도 오지 않는다. **쓰면서 생긴다.**
 * 바깥에서 이걸 제대로 하는 것이 Soulver·Numi 다: 공책에 한 줄씩 적으면 **그 줄 옆에 답**이
 * 서고, 「25% of 400」·「3km in mi」 같은 사람 말이 그대로 통하고, 앞 줄을 이름으로 부른다.
 *
 * 우리 수·돈 도구는 열둘인데 전부 **칸 채우는 양식**이었다(부가세: 금액 넣고 누르기).
 * 양식은 「이 하나」를 셀 때는 빠르지만, **여러 개를 이어서** 셀 때 무너진다 —
 * 「합계 구하고 → 거기서 부가세 빼고 → 셋으로 나누면 1인당」 은 양식 세 번이다.
 *
 * 그래서 공책을 엔진으로 둔다. 도구들은 그대로 있다(정확한 계산·표는 그쪽이 낫다).
 * 여기 있는 것은 **이어서 셈하는 자리**다.
 *
 * 바깥 것에 기대지 않는다 — 환율처럼 밖에서 받아 와야 하는 것은 **넣지 않았다**
 * (사용자 룰: 바깥 API 에 기대는 도구는 만들지 않는다). 단위·퍼센트·시간은 전부 여기서 판정한다.
 */

export interface CalcLine {
  /** 원래 줄 */
  raw: string;
  /** 셈한 값 (못 셌으면 null) */
  value: number | null;
  /** 보일 답 — 단위·통화가 붙는다 */
  text: string;
  /** 이 줄이 이름을 매겼으면 그 이름 */
  name?: string;
  /** 못 센 이유 (있으면 조용히 비운다 — 주석·빈 줄은 흠이 아니다) */
  error?: string;
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

/** 두 단위가 같은 표에 있으면 그 표를 준다 — 다른 표끼리는 못 바꾼다(kg 를 km 로 X). */
function tableFor(a: string, b: string): UnitTable | null {
  for (const t of TABLES) if (a in t && b in t) return t;
  return null;
}

/* ── 셈 ─────────────────────────────────────────────────────────── */

/** 「1,234.5」·「1_000」 처럼 사람이 쓰는 숫자를 받는다. */
function num(s: string): number {
  return Number(s.replace(/[,_\s]/g, ''));
}

/**
 * 아주 작은 식 계산기 — `+ - * / ^ ( )` 와 `%`.
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
    if (t && v !== t) throw new Error(`「${t}」 가 있어야 합니다`);
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
    throw new Error(`「${name}」 가 뭔지 모릅니다`);
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
  if (i < tokens.length) throw new Error(`「${tokens[i]}」 를 못 읽었습니다`);
  return out;
}

/** 보기 좋은 숫자 — 소수점은 필요한 만큼만. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const digits = abs >= 100 ? 0 : abs >= 1 ? 2 : 4;
  return n.toLocaleString('ko-KR', { maximumFractionDigits: digits });
}

/**
 * 공책 한 장을 센다. **줄 순서가 곧 문맥**이다 — 앞 줄에서 매긴 이름과 값을 뒤가 쓴다.
 *
 * 알아듣는 말:
 *   - `1234 + 5678`            사칙연산·괄호·거듭제곱
 *   - `밥값 = 32000`           이름 매기기 (뒤 줄에서 `밥값` 으로 부른다)
 *   - `25% of 400` / `400의 25%`  ~의 몇 퍼센트
 *   - `50000 + 10%` / `- 10%`  얼마에서 몇 퍼센트 더하기·빼기 (부가세·할인)
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
): { value: number | null; text: string; name?: string } {
  /* ① 이름 매기기 — `밥값 = 32000` (`==` 는 아니다) */
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

  /* ② 앞 줄·여태 합은 **이름처럼** 쓴다 (`prev + 8` · `앞 / 5`).
   *
   * 처음엔 줄 전체가 `sum` 일 때만 받았는데, 그러면 「앞 값에서 나누기」가 안 된다 —
   * 공책의 값어치는 **앞 줄을 이어받는 데** 있으므로 이름 자리에 넣는 게 맞다. */
  const total = running.reduce((a, b) => a + b, 0);
  for (const k of ['sum', '합계', '총합']) vars.set(k, total);
  if (last !== null) for (const k of ['prev', '앞', '이전']) vars.set(k, last);

  /* ③ 단위 바꾸기 — `3km in mi` · `3 km to 마일` (**퍼센트보다 먼저** 볼 이유는 없다;
   *    다만 `in`·`to` 가 든 줄은 여기서만 처리되므로 순서가 겹치지 않는다) */
  const conv = body.match(/^(.+?)\s*([A-Za-z가-힣²2]+)\s+(?:in|to|→|->)\s+([A-Za-z가-힣²2]+)$/i);
  if (conv) {
    const from = conv[2].toLowerCase();
    const to = conv[3].toLowerCase();
    const table = tableFor(from, to);
    if (!table) throw new Error(`${conv[2]} 를 ${conv[3]} 로는 못 바꿉니다`);
    const v = evaluate(conv[1], vars) * table[from];
    return put(v / table[to], conv[3]);
  }

  /* ④ ~의 몇 퍼센트 — `25% of 400` · `400의 25%` */
  const pOf = body.match(/^(.+?)\s*%\s*(?:of|의)\s*(.+)$/i);
  if (pOf) return put((evaluate(pOf[1], vars) / 100) * evaluate(pOf[2], vars));
  const ofP = body.match(/^(.+?)\s*의\s*(.+?)\s*%$/);
  if (ofP) return put((evaluate(ofP[2], vars) / 100) * evaluate(ofP[1], vars));

  /* ⑤ 몇 퍼센트 더하기·빼기 — `50000 + 10%` (부가세) · `19800 - 10%` (할인) */
  const pm = body.match(/^(.+?)\s*([+\-])\s*([\d.,]+)\s*%$/);
  if (pm) {
    const base = evaluate(pm[1], vars);
    const rate = num(pm[3]) / 100;
    return put(pm[2] === '+' ? base * (1 + rate) : base * (1 - rate));
  }

  /* ⑥ 그냥 식.
   *
   * 세는 말(`원`·`개`·`명`)은 **숫자에 붙어 있을 때만** 세는 말이다 — 떼고 셈한 뒤 답에 도로
   * 붙인다(`1200원 * 3` → `3,600 원`). 앞엔 이게 「끝에 붙은 글자면 단위」였는데, 그러면
   * `a * b` 의 `b` 까지 단위로 떼어 가 식이 끊겼다. **이름을 단위로 오해하면 안 된다.** */
  const money = body.match(/(\d)\s*(원|개|명|won)/);
  const tail = money ? (money[2] === 'won' ? '원' : money[2]) : '';
  const cleaned = body.replace(/(\d)\s*(원|개|명|won)/g, '$1');
  const v = evaluate(cleaned, vars);
  return put(v, tail);
}
