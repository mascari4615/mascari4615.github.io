/**
 * 대출 상환표 — 알맹이 (TASK-KL-088 / S1)
 *
 * 이자 계산기에는 월 상환액만 있다. 실제로 궁금한 건 그 다음이다 —
 * **원금과 이자가 달마다 어떻게 갈리는지**, 조금 더 갚으면 얼마나 줄어드는지.
 * 초반 상환액이 거의 이자라는 사실은 표를 봐야 실감이 난다.
 *
 * MCP 로 내놓는 이유(B등급): 상환 방식이 셋이고 답이 전부 다르다. LLM 은 「대출 이자」를
 * 물으면 대개 원리금균등 하나로 답하고, 원금균등이 총이자가 더 적다는 것·거치기간이 붙으면
 * 총이자가 늘어난다는 것을 빠뜨린다. 표를 달마다 정확히 만드는 것도 못 한다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'loan',
  ops: {
    schedule: {
      desc:
        'Full amortization schedule. method = equal (equal payment, default) | principal (equal principal)' +
        ' | bullet (interest-only then lump sum). grace = interest-only months, extra = extra paid monthly.' +
        ' / 대출 상환표. 원리금균등·원금균등·만기일시, 거치·추가상환 포함.',
      in: {
        amount: 'number',
        rate: 'number',
        months: 'number',
        method: 'string?',
        grace: 'number?',
        extra: 'number?'
      },
      out: 'string'
    },
    compare: {
      desc:
        'Compare all three repayment methods side by side — total interest and first-month payment,' +
        ' the two numbers that actually decide the choice.' +
        ' / 세 상환 방식 비교. 총이자·첫 달 상환액.',
      in: { amount: 'number', rate: 'number', months: 'number' },
      out: 'string'
    }
  }
};

export interface Row {
  n: number;
  pay: number;
  interest: number;
  principal: number;
  left: number;
}

export const won = (n: number): string => Math.round(n).toLocaleString('ko-KR') + '원';

/** 원리금균등: 매달 갚는 금액이 같다. 초반엔 이자 비중이 크다. */
export function equalPayment(P: number, ratePercent: number, months: number): Row[] {
  const r = ratePercent / 100 / 12;
  const pay = r === 0 ? P / months : (P * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  const rows: Row[] = [];
  let left = P;
  for (let n = 1; n <= months; n++) {
    const interest = left * r;
    const principal = pay - interest;
    left = Math.max(0, left - principal);
    rows.push({ n, pay, interest, principal, left });
  }
  return rows;
}

/** 원금균등: 원금을 똑같이 나눠 갚아 상환액이 점점 줄어든다. **총이자는 더 적다.** */
export function equalPrincipal(P: number, ratePercent: number, months: number): Row[] {
  const r = ratePercent / 100 / 12;
  const principal = P / months;
  const rows: Row[] = [];
  let left = P;
  for (let n = 1; n <= months; n++) {
    const interest = left * r;
    left = Math.max(0, left - principal);
    rows.push({ n, pay: principal + interest, interest, principal, left });
  }
  return rows;
}

/** 만기일시: 이자만 내다 마지막에 원금을 한 번에. 총이자가 가장 많다. */
export function bullet(P: number, ratePercent: number, months: number): Row[] {
  const r = ratePercent / 100 / 12;
  const rows: Row[] = [];
  for (let n = 1; n <= months; n++) {
    const last = n === months;
    rows.push({ n, pay: P * r + (last ? P : 0), interest: P * r, principal: last ? P : 0, left: last ? 0 : P });
  }
  return rows;
}

/**
 * 거치기간 — 그동안은 **이자만** 낸다.
 * 국내 계산기(핀다·부동산계산기·은행 금융계산기)는 전부 거치기간을 받는다. 주담대에서 흔한 조건이다.
 */
export function withGrace(P: number, ratePercent: number, grace: number, rows: Row[]): Row[] {
  if (grace <= 0) return rows;
  const r = ratePercent / 100 / 12;
  const head: Row[] = [];
  for (let n = 1; n <= grace; n++) head.push({ n, pay: P * r, interest: P * r, principal: 0, left: P });
  return head.concat(rows.map((row) => ({ ...row, n: row.n + grace })));
}

/**
 * 매달 조금씩 더 갚으면 얼마나 줄어드나.
 * 수수료는 대출마다 달라 넣지 않는다 — 대신 **기간이 얼마나 짧아지고 이자가 얼마나 주는지**
 * 두 숫자를 준다. 그게 사람이 결정할 때 보는 값이다.
 */
export function withExtra(rows: Row[], ratePercent: number, extra: number): Row[] {
  if (extra <= 0) return rows;
  const r = ratePercent / 100 / 12;
  const out: Row[] = [];
  let left = rows[0] ? rows[0].left + rows[0].principal : 0;
  for (const base of rows) {
    if (left <= 0) break;
    const interest = left * r;
    const payPrincipal = Math.min(base.principal + extra, left);
    left = Math.max(0, left - payPrincipal);
    out.push({ n: base.n, pay: interest + payPrincipal, interest, principal: payPrincipal, left });
  }
  return out;
}

export type Method = 'equal' | 'principal' | 'bullet';

export function scheduleOf(P: number, ratePercent: number, months: number, method: Method = 'equal'): Row[] {
  if (method === 'principal') return equalPrincipal(P, ratePercent, months);
  if (method === 'bullet') return bullet(P, ratePercent, months);
  return equalPayment(P, ratePercent, months);
}

export const totalInterest = (rows: Row[]): number => rows.reduce((a, r) => a + r.interest, 0);

const METHOD_NAME: Record<Method, string> = {
  equal: '원리금균등',
  principal: '원금균등',
  bullet: '만기일시'
};

function num(args: Record<string, unknown>, key: string, label: string, fallback?: number): number {
  if (args[key] === undefined && fallback !== undefined) return fallback;
  const v = Number(args[key]);
  if (Number.isFinite(v) === false || v < 0) throw new Error(`${label}을(를) 0 이상의 숫자로 주세요`);
  return v;
}

export const run: ToolRunner = (op, args) => {
  const amount = num(args, 'amount', '빌린 금액');
  const rate = num(args, 'rate', '연이율(%)');
  const months = Math.max(1, Math.round(num(args, 'months', '개월 수')));

  if (op === 'compare') {
    const lines = (['equal', 'principal', 'bullet'] as Method[]).map((m) => {
      const rows = scheduleOf(amount, rate, months, m);
      return `${METHOD_NAME[m]}: 첫 달 ${won(rows[0].pay)} · 총이자 ${won(totalInterest(rows))}`;
    });
    return [
      `원금 ${won(amount)} · 연 ${rate}% · ${months}개월`,
      ...lines,
      '원금균등이 총이자가 가장 적고, 만기일시가 가장 많습니다 — 대신 매달 내는 돈이 다릅니다.'
    ].join('\n');
  }

  if (op === 'schedule') {
    const method = (String(args.method ?? 'equal') as Method) || 'equal';
    if (method in METHOD_NAME === false) {
      throw new Error(`모르는 상환 방식입니다: ${String(args.method)} (equal · principal · bullet)`);
    }
    const grace = Math.round(num(args, 'grace', '거치개월', 0));
    const extra = num(args, 'extra', '매달 더 갚는 금액', 0);

    const base = withGrace(amount, rate, grace, scheduleOf(amount, rate, months, method));
    const rows = withExtra(base, rate, extra);
    const baseInterest = totalInterest(base);
    const nowInterest = totalInterest(rows);

    const head = [
      `${METHOD_NAME[method]} · 원금 ${won(amount)} · 연 ${rate}% · ${months}개월` + (grace > 0 ? ` · 거치 ${grace}개월` : ''),
      `첫 달 상환액: ${won(rows[0].pay)}  (이자 ${won(rows[0].interest)} · 원금 ${won(rows[0].principal)})`,
      `총 상환액: ${won(rows.reduce((a, r) => a + r.pay, 0))}`,
      `총 이자: ${won(nowInterest)}`
    ];
    if (extra > 0) {
      head.push(
        `매달 ${won(extra)} 더 갚으면: ${base.length}개월 → ${rows.length}개월` +
          ` (${base.length - rows.length}개월 단축), 이자 ${won(baseInterest - nowInterest)} 절약`
      );
    }
    // 표 전체를 다 주면 에이전트 쪽이 길어진다 — 처음·중간·마지막만.
    const pick = [0, Math.floor(rows.length / 2), rows.length - 1].filter((v, i, a) => a.indexOf(v) === i);
    head.push('회차별(발췌): ' + pick.map((i) => `${rows[i].n}회 이자 ${won(rows[i].interest)} · 원금 ${won(rows[i].principal)}`).join(' / '));
    head.push('중도상환수수료·인지세 등 부대비용은 포함하지 않았습니다.');
    return head.join('\n');
  }

  throw new Error(`loan 에 「${op}」 는 없습니다`);
};
