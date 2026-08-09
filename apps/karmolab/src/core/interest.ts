/**
 * 예금·적금·대출 이자 — 알맹이 (TASK-KL-088 / S1)
 *
 * 광고 문구의 「연 4%」와 손에 들어오는 금액이 다른 이유는 두 가지다 —
 * ① **적금은 매달 넣은 돈이 각각 다른 기간만 굴러간다** ② **이자소득세 15.4%** 가 떼인다.
 *
 * MCP 로 내놓는 이유(B등급): 「월 50만원씩 1년 넣으면 4% 면 이자 얼마?」에 LLM 은 흔히
 * `600만 × 4% = 24만원`이라 답한다. 실제로는 먼저 넣은 돈만 오래 굴러 **13만원**(세전) 언저리다.
 * 여기에 이자소득세까지 떼이므로 체감은 더 적다. 이 두 가지가 이 파일이 존재하는 이유다.
 */
import type { ToolRunner, ToolSpec } from './types';

/** 이자소득세 15.4% = 소득세 14% + 지방소득세 1.4% */
export const TAX_RATE = 0.154;

export const spec: ToolSpec = {
  id: 'interest',
  ops: {
    deposit: {
      desc: '정기예금(단리) — 목돈을 맡겼을 때 만기 이자와 세후 수령액. 이자소득세 15.4% 반영.',
      in: { amount: 'number', rate: 'number', months: 'number' },
      out: 'string'
    },
    saving: {
      desc:
        '정기적금(단리) — 매달 넣을 때. 먼저 넣은 돈만 오래 굴러서 「총액 × 연이율」보다 훨씬 적다.' +
        ' 그 차이를 함께 보여 준다.',
      in: { monthly: 'number', rate: 'number', months: 'number' },
      out: 'string'
    },
    loan: {
      desc: '원리금균등 대출 — 매달 갚는 금액, 총 상환액, 총 이자.',
      in: { amount: 'number', rate: 'number', months: 'number' },
      out: 'string'
    }
  }
};

export const won = (n: number): string => Math.round(n).toLocaleString('ko-KR') + '원';

/** 예금 — 목돈을 맡기고 만기에 원금+이자. 단리 기준. */
export function depositInterest(principal: number, ratePercent: number, months: number): number {
  return principal * (ratePercent / 100) * (months / 12);
}

/**
 * 적금 — n 번째 납입금은 `(months - n + 1)` 개월만 굴러간다.
 * 이 한 줄이 「왜 광고 이율보다 적나요」의 답이다.
 */
export function savingInterest(monthly: number, ratePercent: number, months: number): number {
  let interest = 0;
  for (let n = 1; n <= months; n++) interest += monthly * (ratePercent / 100) * ((months - n + 1) / 12);
  return interest;
}

/** 원리금균등 — 매달 갚는 금액이 같도록 맞춘 상환액. 무이자면 그냥 나눈다. */
export function annuityPayment(principal: number, ratePercent: number, months: number): number {
  const r = ratePercent / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

export interface SavingsResult {
  principal: number;
  gross: number;
  tax: number;
  net: number;
  /** 세후 실수령. */
  payout: number;
}

export function afterTax(principal: number, gross: number): SavingsResult {
  const tax = gross * TAX_RATE;
  return { principal, gross, tax, net: gross - tax, payout: principal + gross - tax };
}

function guard(args: Record<string, unknown>, key: string, label: string): number {
  const v = Number(args[key]);
  if (Number.isFinite(v) === false || v < 0) throw new Error(`${label}을(를) 0 이상의 숫자로 주세요`);
  return v;
}

export const run: ToolRunner = (op, args) => {
  const rate = guard(args, 'rate', '연이율(%)');
  const months = Math.max(1, Math.round(guard(args, 'months', '개월 수')));

  if (op === 'loan') {
    const amount = guard(args, 'amount', '빌린 금액');
    const monthly = annuityPayment(amount, rate, months);
    const total = monthly * months;
    return [
      `월 상환액: ${won(monthly)}`,
      `총 상환액: ${won(total)}`,
      `총 이자: ${won(total - amount)}`,
      `첫 달 이자: ${won((amount * rate) / 100 / 12)}`,
      `상환 방식: 원리금균등 (${months}개월, 연 ${rate}%)`,
      '주의: 중도상환수수료·인지세 등 부대비용은 포함하지 않았습니다.'
    ].join('\n');
  }

  if (op === 'deposit') {
    const amount = guard(args, 'amount', '맡길 금액');
    const r = afterTax(amount, depositInterest(amount, rate, months));
    return [
      `세후 수령액: ${won(r.payout)}`,
      `원금: ${won(r.principal)}`,
      `세전 이자: ${won(r.gross)}`,
      `이자소득세(15.4%): -${won(r.tax)}`,
      `세후 이자: ${won(r.net)}`,
      '단리 기준입니다 — 복리 상품이면 더 큽니다.'
    ].join('\n');
  }

  if (op === 'saving') {
    const monthly = guard(args, 'monthly', '매달 넣을 금액');
    const principal = monthly * months;
    const gross = savingInterest(monthly, rate, months);
    const r = afterTax(principal, gross);
    // 「총액 × 연이율」로 오해한 값도 같이 보여 준다 — 그 차이가 이 도구의 값이다.
    const naive = principal * (rate / 100);
    return [
      `세후 수령액: ${won(r.payout)}`,
      `원금 합계: ${won(r.principal)} (${won(monthly)} × ${months}개월)`,
      `세전 이자: ${won(r.gross)}`,
      `이자소득세(15.4%): -${won(r.tax)}`,
      `세후 이자: ${won(r.net)}`,
      `참고: 「원금 합계 × 연 ${rate}%」로 계산하면 ${won(naive)} 이지만 그건 틀립니다 —` +
        ' 먼저 넣은 돈만 오래 굴러가기 때문입니다.'
    ].join('\n');
  }

  throw new Error(`interest 에 「${op}」 는 없습니다`);
};
