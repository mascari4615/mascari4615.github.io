/**
 * 월급에서 실제로 받는 돈 (TASK-KL-316 / 34)
 *
 * 「연봉 5천이면 통장에 얼마 들어오나」는 검색으로 늘 나오는데, 답이 사이트마다 다르다.
 * 갈리는 이유는 셋이다: **비과세를 빼고 세느냐 · 보험료 상·하한을 아느냐 · 세금을 어떻게 어림하느냐.**
 * 그래서 여기서는 그 셋을 **화면에 드러내 놓고** 센다.
 *
 * ⚠ **회사는 「간이세액표」로 뗀다.** 그 표는 수백 줄짜리라 여기 안 싣는다 — 대신 세법 그대로
 * (근로소득공제 → 인적공제 → 세율구간) 계산해 **어림값**을 낸다. 연말정산에서 맞춰지는 그 금액이다.
 * 표에 적힌 해(`YEAR`)도 같이 돌려준다 — 요율은 해마다 바뀌고, **낡은 값으로 답하는 게 제일 나쁘다.**
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'payslip',
  ops: {
    monthly: {
      desc:
        'Work out take-home pay from a monthly salary (Korea): pension, health, long-term care,' +
        ' employment insurance and income tax, with the tax-free allowance excluded.',
      in: { salary: 'number', taxFree: 'number?', family: 'number?', children: 'number?' },
      out: 'string'
    },
    yearly: {
      desc: 'Same, starting from a yearly salary.',
      in: { salary: 'number', taxFree: 'number?', family: 'number?', children: 'number?' },
      out: 'string'
    }
  }
};

/** 이 표가 어느 해 기준인가 — 화면이 반드시 같이 보여 준다. */
export const YEAR = 2025;

export const RATES = {
  /** 국민연금 — 근로자 몫 */
  pension: 0.045,
  /** 소득월액 상·하한 (이 밖은 잘린다) */
  pensionMax: 6170000,
  pensionMin: 390000,
  /** 건강보험 — 근로자 몫 */
  health: 0.03545,
  /** 장기요양 — **건강보험료의** 몇 % (월급의 %가 아니다. 여기서 자주 틀린다) */
  care: 0.1295,
  /** 고용보험 — 근로자 몫 */
  employment: 0.009,
  /** 지방소득세 — 소득세의 10% */
  localTax: 0.1
};

/** 근로소득공제 — 총급여 구간별. */
export function earnedIncomeDeduction(yearly: number): number {
  if (yearly <= 5000000) return yearly * 0.7;
  if (yearly <= 15000000) return 3500000 + (yearly - 5000000) * 0.4;
  if (yearly <= 45000000) return 7500000 + (yearly - 15000000) * 0.15;
  if (yearly <= 100000000) return 12000000 + (yearly - 45000000) * 0.05;
  return Math.min(20000000, 14750000 + (yearly - 100000000) * 0.02);
}

const BRACKETS: Array<[limit: number, rate: number, subtract: number]> = [
  [14000000, 0.06, 0],
  [50000000, 0.15, 1260000],
  [88000000, 0.24, 5760000],
  [150000000, 0.35, 15440000],
  [300000000, 0.38, 19940000],
  [500000000, 0.4, 25940000],
  [1000000000, 0.42, 35940000],
  [Infinity, 0.45, 65940000]
];

/** 과세표준 → 산출세액. 구간마다 「빼는 값」을 두는 게 세법의 셈법이다. */
export function incomeTax(base: number): number {
  if (base <= 0) return 0;
  const found = BRACKETS.find(([limit]) => base <= limit) ?? BRACKETS[BRACKETS.length - 1];
  return Math.max(0, base * found[1] - found[2]);
}

/** 근로소득세액공제 — 산출세액에서 한 번 더 깎는다(작은 월급일수록 크다). */
export function taxCredit(computed: number, yearly: number): number {
  const raw = computed <= 1300000 ? computed * 0.55 : 715000 + (computed - 1300000) * 0.3;
  const cap = yearly <= 33000000 ? 740000 : yearly <= 70000000 ? Math.max(660000, 740000 - (yearly - 33000000) * 0.008) : Math.max(500000, 660000 - (yearly - 70000000) * 0.5);
  return Math.min(raw, cap);
}

export interface Input {
  /** 세전 월급 (원) */
  monthly: number;
  /** 비과세 (식대 등) — 세금·보험료를 안 매긴다 */
  taxFree?: number;
  /** 본인 포함 부양가족 수 */
  family?: number;
  /** 그중 8~20세 자녀 수 */
  children?: number;
}

export interface Slip {
  gross: number;
  taxFree: number;
  /** 보험료·세금을 매기는 월급 */
  taxable: number;
  pension: number;
  health: number;
  care: number;
  employment: number;
  incomeTax: number;
  localTax: number;
  /** 떼는 것 전부 */
  deductions: number;
  /** 통장에 들어오는 돈 */
  net: number;
  year: number;
}

/*
 * 원 단위 절사(회사 계산과 같은 결). **먼저 1원으로 반올림하고** 자른다 —
 * 2,800,000 × 0.009 는 컴퓨터 안에서 25,199.999… 라, 그냥 자르면 25,190 원이 된다(실측).
 */
const won = (n: number): number => Math.floor(Math.round(n) / 10) * 10;

export function monthly(input: Input): Slip {
  const gross = Math.max(0, Math.round(input.monthly));
  const taxFree = Math.max(0, Math.min(gross, Math.round(input.taxFree ?? 0)));
  const taxable = gross - taxFree;

  /* 국민연금은 **상·하한이 있다** — 월급이 아무리 많아도 더 안 뗀다(여기서 계산이 자주 어긋난다). */
  const pensionBase = Math.min(RATES.pensionMax, Math.max(RATES.pensionMin, taxable));
  const pension = won(pensionBase * RATES.pension);
  const health = won(taxable * RATES.health);
  /* 장기요양은 **건강보험료의** 비율이다 — 월급의 비율로 잡으면 열 배쯤 틀린다. */
  const care = won(health * RATES.care);
  const employment = won(taxable * RATES.employment);

  const yearly = taxable * 12;
  const afterEarned = Math.max(0, yearly - earnedIncomeDeduction(yearly));
  const family = Math.max(1, Math.round(input.family ?? 1));
  const children = Math.max(0, Math.round(input.children ?? 0));
  /* 인적공제 150만/인 + 보험료는 그대로 공제(연금은 전액, 건강·고용은 소득공제 대상) */
  const personal = family * 1500000;
  const insuranceYear = (pension + health + care + employment) * 12;
  const base = Math.max(0, afterEarned - personal - insuranceYear);
  const computed = incomeTax(base);
  /* 자녀세액공제 — 첫째 15만, 둘째 20만, 셋째부터 30만 (연간) */
  const childCredit = children <= 0 ? 0 : children === 1 ? 150000 : children === 2 ? 350000 : 350000 + (children - 2) * 300000;
  const finalTax = Math.max(0, computed - taxCredit(computed, yearly) - childCredit);
  const incomeTaxMonthly = won(finalTax / 12);
  const localTaxMonthly = won(incomeTaxMonthly * RATES.localTax);

  const deductions = pension + health + care + employment + incomeTaxMonthly + localTaxMonthly;
  return {
    gross,
    taxFree,
    taxable,
    pension,
    health,
    care,
    employment,
    incomeTax: incomeTaxMonthly,
    localTax: localTaxMonthly,
    deductions,
    net: gross - deductions,
    year: YEAR
  };
}

export function fromYearly(input: Input & { yearly: number }): Slip {
  return monthly({ ...input, monthly: Math.round(input.yearly / 12) });
}

export const run: ToolRunner = (op, args) => {
  const salary = Number(args.salary ?? 0);
  const shared = {
    taxFree: args.taxFree === undefined ? undefined : Number(args.taxFree),
    family: args.family === undefined ? undefined : Number(args.family),
    children: args.children === undefined ? undefined : Number(args.children)
  };
  const slip = op === 'yearly' ? fromYearly({ ...shared, yearly: salary, monthly: 0 }) : monthly({ ...shared, monthly: salary });
  if (op !== 'monthly' && op !== 'yearly') throw new Error('payslip: 모르는 연산 ' + op);
  const line = (name: string, value: number): string => name.padEnd(12, ' ') + value.toLocaleString('en-US');
  return [
    line('gross', slip.gross),
    line('pension', -slip.pension),
    line('health', -slip.health),
    line('care', -slip.care),
    line('employment', -slip.employment),
    line('income tax', -slip.incomeTax),
    line('local tax', -slip.localTax),
    line('net', slip.net),
    '(' + slip.year + ' rates, tax is an estimate — payroll uses the withholding table)'
  ].join('\n');
};
