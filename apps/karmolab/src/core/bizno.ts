/**
 * Business registration number and corporate registration number checks — core (TASK-KL-088 / S1)
 *
 * The last digit of a 10-digit number is a **check digit** computed from the first nine digits.
 * Most typos are caught by math alone, but this cannot tell you whether the number is actually registered.
 *
 * MCP exposes this because LLMs often invent plausible-looking numbers and miss the check-digit rule.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'bizno',
  ops: {
    check: {
      desc:
        'Validate a Korean business registration number (10 digits) or corporate registration number' +
        ' (13 digits) against its check-digit rule. Format only — it cannot tell you whether the number is' +
        ' actually registered (that needs the National Tax Service lookup).',
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

/** Korean business registration check-digit rule (10 digits). */
export function checkBiz(digits: string): CheckResult | null {
  if (/^\d{10}$/.test(digits) === false) return null;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(digits[i]) * WEIGHT[i];
  sum += Math.floor((Number(digits[8]) * 5) / 10);
  const expect = (10 - (sum % 10)) % 10;
  return { ok: expect === Number(digits[9]), expect, got: Number(digits[9]) };
}

/** Corporate registration number check (13 digits) — alternating 1,2 weights. */
export function checkCorp(digits: string): CheckResult | null {
  if (/^\d{13}$/.test(digits) === false) return null;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 2);
  const expect = (10 - (sum % 10)) % 10;
  return { ok: expect === Number(digits[12]), expect, got: Number(digits[12]) };
}

/** Business type marker only. Readers attach their own labels. */
export type BizKind = 'individual' | 'religious' | 'corpHq' | 'nonprofit' | 'taxFree' | 'unknown';

/** The middle two digits encode the business type. */
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
  individual: 'Individual taxable business',
  religious: 'Religious organization',
  corpHq: 'For-profit corporation HQ',
  nonprofit: 'Non-profit corporation HQ/branch',
  taxFree: 'Individual tax-free business / non-profit',
  unknown: 'Unknown'
};

/** Text form used by MCP. The widget uses `kindKeyOf` and localizes separately. */
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
  if (op !== 'check') throw new Error(`bizno has no operation named "${op}"`);
  const digits = onlyDigits(String(args.number ?? ''));

  if (digits.length === 10) {
    const r = checkBiz(digits) as CheckResult;
    return [
      `Type: business registration number (10 digits)`,
      `Format: ${formatBiz(digits)}`,
      `Business type: ${kindOf(digits.slice(3, 5))}`,
      r.ok
        ? `Check digit: valid (check digit ${r.got})`
        : `Check digit: invalid - last digit is ${r.got} but the rule expects ${r.expect}`,
      'Note: format only. Actual registration status requires a National Tax Service lookup.'
    ].join('\n');
  }
  if (digits.length === 13) {
    const r = checkCorp(digits) as CheckResult;
    return [
      `Type: corporate registration number (13 digits)`,
      `Format: ${formatCorp(digits)}`,
      r.ok
        ? `Check digit: valid (check digit ${r.got})`
        : `Check digit: invalid - last digit is ${r.got} but the rule expects ${r.expect}`
    ].join('\n');
  }
  throw new Error(`${digits.length} digits supplied - business registration numbers must be 10 digits and corporate registration numbers must be 13 digits`);
};
