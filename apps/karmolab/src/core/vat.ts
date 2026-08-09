/**
 * 부가세 계산 — 알맹이 (TASK-KL-088 / S1)
 *
 * 「11만원에서 부가세는 1만원」인데 「10만원의 10%도 1만원」이라 헷갈린다 —
 * 공급가에서 **더할 때**와 총액에서 **빼낼 때** 나누는 수가 다르기 때문이다(1.1 로 나눠야 한다).
 *
 * MCP 로 내놓는 이유(B등급): LLM 은 「총액에서 부가세 빼 줘」에 **총액 × 10% 를 빼** 답한다.
 * 110,000 → 공급가 100,000 이 정답인데 99,000 이라 답하는 식이다. 게다가 1원 미만 처리
 * (실무는 절사)와 「공급가 + 세액 = 합계」가 맞아떨어지게 맞추는 것까지는 거의 못 한다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'vat',
  ops: {
    add: {
      desc:
        'Add Korean VAT to a net amount (net × 1.1). Rounds so that net + VAT equals the total exactly —' +
        ' rounding the three lines separately makes them disagree by a won.' +
        ' / 공급가에 부가세를 더한다. 세 줄이 서로 맞게 반올림.',
      in: { amount: 'number', rate: 'number?', rounding: 'string?' },
      out: 'string'
    },
    extract: {
      desc:
        'Extract the net amount and VAT from a VAT-inclusive total (total ÷ 1.1), which is NOT the same as' +
        ' subtracting 10% — that common shortcut gives 99,000 instead of 100,000 for a 110,000 total.' +
        ' / 총액에서 공급가·세액을 빼낸다. 10% 를 빼는 것과 다르다.',
      in: { amount: 'number', rate: 'number?', rounding: 'string?' },
      out: 'string'
    }
  }
};

export type Rounding = 'floor' | 'round';

export interface VatResult {
  supply: number;
  tax: number;
  total: number;
}

/**
 * ★ 소수로 나누면 안 된다 (2026-08-09 시험이 잡음).
 *
 * `110000 / 1.1` 은 컴퓨터에서 **99999.99999999999** 다. 여기에 절사를 걸면 공급가가
 * **99,999원**으로 나온다 — 이 도구에서 가장 흔한 예시가 1원 틀리는 것이다.
 * (원래 화면 코드가 그렇게 하고 있었다. 눈으로 보면 「거의 맞는 값」이라 안 걸린다.)
 *
 * 그래서 **정수끼리 나눈다**: 세율을 10배 해서 정수로 만들고 `총액 × 1000 ÷ (1000 + 세율×10)`.
 * 110000×1000 ÷ 1100 = 100000 — 딱 떨어진다.
 */
const scaleRate = (ratePercent: number): number => Math.round(ratePercent * 10);

/**
 * 1원 미만을 어떻게 하느냐로 답이 갈린다. 세금계산서는 보통 **절사**다.
 * 게다가 세 줄을 따로 반올림하면 「공급가 + 세액 ≠ 합계」가 되어, 그대로 옮겨 적은 사람이
 * 1원 때문에 다시 계산하게 된다. 그래서 **두 줄을 확정한 뒤 나머지 한 줄을 맞춘다.**
 */
export function vatAdd(supply: number, ratePercent = 10, rounding: Rounding = 'floor'): VatResult {
  const r10 = scaleRate(ratePercent);
  const cut = rounding === 'floor' ? Math.floor : Math.round;
  const s = cut(supply);
  const tax = cut((s * r10) / 1000);
  return { supply: s, tax, total: s + tax };
}

export function vatExtract(total: number, ratePercent = 10, rounding: Rounding = 'floor'): VatResult {
  const r10 = scaleRate(ratePercent);
  const cut = rounding === 'floor' ? Math.floor : Math.round;
  const t = cut(total);
  const supply = cut((t * 1000) / (1000 + r10));
  return { supply, tax: t - supply, total: t };
}

export const won = (n: number): string => Math.round(n).toLocaleString('ko-KR') + '원';

function report(r: VatResult, ratePercent: number, how: string): string {
  return [
    `공급가액: ${won(r.supply)}`,
    `부가세액: ${won(r.tax)}`,
    `합계금액: ${won(r.total)}`,
    `세율: ${ratePercent}%  ·  ${how}`,
    `확인: 공급가 + 세액 = ${won(r.supply + r.tax)} (합계와 같아야 합니다)`
  ].join('\n');
}

export const run: ToolRunner = (op, args) => {
  const amount = Number(args.amount);
  if (Number.isFinite(amount) === false) throw new Error('금액을 숫자로 주세요');
  const rate = args.rate === undefined ? 10 : Number(args.rate);
  if (Number.isFinite(rate) === false || rate < 0) throw new Error('세율은 0 이상의 숫자여야 합니다 (퍼센트)');
  const rounding: Rounding = args.rounding === 'round' ? 'round' : 'floor';

  if (op === 'add') return report(vatAdd(amount, rate, rounding), rate, `공급가 × ${(1 + rate / 100).toFixed(2)}`);
  if (op === 'extract') return report(vatExtract(amount, rate, rounding), rate, `총액 ÷ ${(1 + rate / 100).toFixed(2)}`);
  throw new Error(`vat 에 「${op}」 는 없습니다`);
};
