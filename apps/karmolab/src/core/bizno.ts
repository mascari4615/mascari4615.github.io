/**
 * 사업자등록번호 · 법인등록번호 검사 — 알맹이 (TASK-KL-088 / S1)
 *
 * 열 자리 중 마지막 한 자리는 앞 아홉 자리에서 계산되는 **검증 숫자**다.
 * 그래서 오타는 대부분 계산만으로 걸러진다 — 국세청에 묻지 않아도 「형식상 불가능한 번호」를 안다.
 * 다만 계산이 맞아도 실제로 등록된 번호인지는 알 수 없다. 그 경계를 값으로도 분명히 낸다.
 *
 * MCP 로 내놓는 이유(A/B등급): LLM 은 자릿수만 맞춰 그럴듯한 번호를 지어내고 「유효하다」고 말한다.
 * 가중치 [1,3,7,1,3,7,1,3,5] 와 아홉째 자리 × 5 / 10 의 몫을 더하는 규칙까지 맞히지 못한다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'bizno',
  ops: {
    check: {
      desc:
        '한국 사업자등록번호(10자리) 또는 법인등록번호(13자리)가 검증 숫자 규칙에 맞는지 계산한다.' +
        ' 형식 유효성만 본다 — 실제 등록 여부는 국세청 조회가 필요하다.',
      in: { number: 'string' },
      out: 'string'
    }
  }
};

const WEIGHT = [1, 3, 7, 1, 3, 7, 1, 3, 5];

export interface CheckResult {
  ok: boolean;
  /** 마지막 자리가 이 값이어야 한다. */
  expect: number;
  got: number;
}

/** 국세청 사업자등록번호 검증 규칙 (10자리). */
export function checkBiz(digits: string): CheckResult | null {
  if (/^\d{10}$/.test(digits) === false) return null;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(digits[i]) * WEIGHT[i];
  sum += Math.floor((Number(digits[8]) * 5) / 10);
  const expect = (10 - (sum % 10)) % 10;
  return { ok: expect === Number(digits[9]), expect, got: Number(digits[9]) };
}

/** 법인등록번호 검증 (13자리) — 가중치 1,2 반복. */
export function checkCorp(digits: string): CheckResult | null {
  if (/^\d{13}$/.test(digits) === false) return null;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 2);
  const expect = (10 - (sum % 10)) % 10;
  return { ok: expect === Number(digits[12]), expect, got: Number(digits[12]) };
}

/** 사업자 종류 — 이름 말고 **표식**. 이름은 읽는 쪽이 붙인다 (TASK-KL-203). */
export type BizKind = 'individual' | 'religious' | 'corpHq' | 'nonprofit' | 'taxFree' | 'unknown';

/** 가운데 두 자리는 사업자 종류를 뜻한다 — 번호만 보고도 알 수 있는 정보. */
export function kindKeyOf(mid: string): BizKind {
  const n = Number(mid);
  if (n >= 1 && n <= 79) return 'individual';
  if (n === 80) return 'religious';
  if (n >= 81 && n <= 88) return 'corpHq';
  if (n === 89) return 'nonprofit';
  if (n >= 90 && n <= 99) return 'taxFree';
  return 'unknown';
}

const KIND_KO: Record<BizKind, string> = {
  individual: '개인 과세사업자',
  religious: '법인이 아닌 종교단체',
  corpHq: '영리법인 본점',
  nonprofit: '비영리법인 본점·지점',
  taxFree: '개인 면세사업자·비영리',
  unknown: '알 수 없음'
};

/** 글로 답하는 쪽(MCP)이 쓰는 한국어 이름. 화면은 `kindKeyOf` 로 자기 말을 붙인다. */
export function kindOf(mid: string): string {
  return KIND_KO[kindKeyOf(mid)];
}

export const onlyDigits = (raw: string): string => raw.replace(/\D/g, '');

export function formatBiz(digits: string): string {
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}
export function formatCorp(digits: string): string {
  return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}

export const run: ToolRunner = (op, args) => {
  if (op !== 'check') throw new Error(`bizno 에 「${op}」 는 없습니다`);
  const digits = onlyDigits(String(args.number ?? ''));

  if (digits.length === 10) {
    const r = checkBiz(digits) as CheckResult;
    return [
      `종류: 사업자등록번호 (10자리)`,
      `표기: ${formatBiz(digits)}`,
      `사업자 구분: ${kindOf(digits.slice(3, 5))}`,
      r.ok
        ? `검증: 형식상 올바름 (검증 숫자 ${r.got})`
        : `검증: 형식 오류 — 마지막 자리가 ${r.got} 인데 계산상 ${r.expect} 이어야 합니다`,
      '주의: 형식만 봅니다. 실제 등록 여부는 국세청 조회가 필요합니다.'
    ].join('\n');
  }
  if (digits.length === 13) {
    const r = checkCorp(digits) as CheckResult;
    return [
      `종류: 법인등록번호 (13자리)`,
      `표기: ${formatCorp(digits)}`,
      r.ok
        ? `검증: 형식상 올바름 (검증 숫자 ${r.got})`
        : `검증: 형식 오류 — 마지막 자리가 ${r.got} 인데 계산상 ${r.expect} 이어야 합니다`
    ].join('\n');
  }
  throw new Error(`${digits.length}자리입니다 — 사업자등록번호는 10자리, 법인등록번호는 13자리입니다`);
};
