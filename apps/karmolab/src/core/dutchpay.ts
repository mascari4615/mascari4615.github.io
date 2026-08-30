/**
 * 나눠 내기. 누가 누구에게 얼마 (TASK-KL-316 / 33)
 *
 * 여럿이 먹고 나면 계산이 두 번 어긋난다. **첫째,** 1/N 이 딱 안 떨어진다(1원이 남는다).
 * **둘째,** 서로 주고받다 보면 송금이 쓸데없이 많아진다. A→B, B→C 를 A→C 하나로 줄일 수 있다.
 *
 * 그래서 여기서는 ① 남는 1원까지 **누가 더 내는지 정해서** 총합을 딱 맞추고
 * ② 갚는 횟수를 **가장 적게** 만든다(큰 빚과 큰 몫부터 맞물린다).
 *
 * 돈은 소수로 세지 않는다. 원 단위 정수로만 센다(부동소수점은 0.1 을 못 담는다).
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'dutchpay',
  ops: {
    settle: {
      desc:
        'Split expenses between people and return the fewest transfers that settle up.' +
        ' expenses = lines like "이름:금액" or "이름:금액:대상1,대상2".',
      in: { people: 'string', expenses: 'string' },
      out: 'string'
    }
  }
};

export interface Expense {
  /** 낸 사람 */
  by: string;
  /** 원 단위 정수 */
  amount: number;
  /** 이 돈을 나눠 낼 사람들. 비면 **모두** */
  forWhom?: string[];
  what?: string;
}

export interface Share {
  name: string;
  /** 낸 돈 */
  paid: number;
  /** 내야 할 돈 */
  owed: number;
  /** 양수면 받을 돈, 음수면 낼 돈 */
  balance: number;
}

/**
 * 한 줄씩 읽는다: `이름:금액`, `이름:금액:대상1,대상2`, `이름:금액:대상:무엇`.
 * 금액의 쉼표(1,000)와 원은 떼고 읽는다. 사람은 그렇게 적는다.
 */
export function parseExpenses(text: string): Expense[] {
  const out: Expense[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const parts = line.split(':').map((p) => p.trim());
    const by = parts[0];
    const amount = Math.round(Number((parts[1] ?? '').replace(/[,\s원won]/gi, '')));
    if (by === '' || !Number.isFinite(amount) || amount === 0) continue;
    const forWhom = (parts[2] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '');
    out.push({ by, amount, forWhom: forWhom.length > 0 ? forWhom : undefined, what: parts[3] });
  }
  return out;
}

/**
 * 몫을 나눈다. **남는 1원은 버리지 않는다**. 앞사람부터 1원씩 더 낸다.
 * (버리면 총합이 안 맞아 1원이 비었다가 생긴다. 그 1원이 계산을 다시 하게 만든다.)
 */
export function splitAmount(amount: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(amount / count);
  const left = amount - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < left ? 1 : 0));
}

export function balances(people: string[], expenses: Expense[]): Share[] {
  const paid = new Map<string, number>();
  const owed = new Map<string, number>();
  for (const name of people) {
    paid.set(name, 0);
    owed.set(name, 0);
  }
  for (const expense of expenses) {
    if (!paid.has(expense.by)) {
      paid.set(expense.by, 0);
      owed.set(expense.by, 0);
    }
    paid.set(expense.by, (paid.get(expense.by) ?? 0) + expense.amount);
    const targets = (expense.forWhom ?? people).filter((n) => n !== '');
    const list = targets.length > 0 ? targets : [expense.by];
    const shares = splitAmount(expense.amount, list.length);
    list.forEach((name, i) => {
      if (!owed.has(name)) {
        paid.set(name, paid.get(name) ?? 0);
        owed.set(name, 0);
      }
      owed.set(name, (owed.get(name) ?? 0) + shares[i]);
    });
  }
  return [...owed.keys()].map((name) => ({
    name,
    paid: paid.get(name) ?? 0,
    owed: owed.get(name) ?? 0,
    balance: (paid.get(name) ?? 0) - (owed.get(name) ?? 0)
  }));
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

/**
 * 갚기. **가장 많이 낼 사람과 가장 많이 받을 사람부터** 맞물린다 . 
 * 그러면 한 번에 한 사람은 셈이 끝나서, 송금 횟수가 사람 수보다 적어진다.
 */
export function settle(shares: Share[]): Transfer[] {
  const owe = shares.filter((s) => s.balance < 0).map((s) => ({ name: s.name, left: -s.balance })).sort((a, b) => b.left - a.left);
  const get = shares.filter((s) => s.balance > 0).map((s) => ({ name: s.name, left: s.balance })).sort((a, b) => b.left - a.left);
  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < owe.length && j < get.length) {
    const amount = Math.min(owe[i].left, get[j].left);
    if (amount > 0) out.push({ from: owe[i].name, to: get[j].name, amount });
    owe[i].left -= amount;
    get[j].left -= amount;
    if (owe[i].left === 0) i++;
    if (get[j].left === 0) j++;
  }
  return out;
}

/** 주소로 나눠 갖기. 서버에 안 맡긴다(주소 자체가 저장소다). */
export function encode(people: string[], expenses: Expense[]): string {
  const payload = JSON.stringify({ p: people, e: expenses.map((x) => [x.by, x.amount, x.forWhom ?? [], x.what ?? '']) });
  const bytes = new TextEncoder().encode(payload);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const g = globalThis as unknown as { btoa?: (s: string) => string; Buffer?: { from: (s: string, e: string) => { toString: (e: string) => string } } };
  const base64 = typeof g.btoa === 'function' ? g.btoa(binary) : (g.Buffer?.from(payload, 'utf8').toString('base64') ?? '');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decode(text: string): { people: string[]; expenses: Expense[] } {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const g = globalThis as unknown as { atob?: (s: string) => string; Buffer?: { from: (s: string, e: string) => Uint8Array } };
  let json: string;
  if (typeof g.atob === 'function') {
    const binary = g.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    json = new TextDecoder().decode(bytes);
  } else if (g.Buffer !== undefined) {
    json = new TextDecoder().decode(g.Buffer.from(base64, 'base64'));
  } else {
    throw new Error('주소를 못 읽습니다');
  }
  const parsed = JSON.parse(json) as { p: string[]; e: Array<[string, number, string[], string]> };
  return {
    people: parsed.p,
    expenses: parsed.e.map(([by, amount, forWhom, what]) => ({
      by,
      amount,
      forWhom: forWhom.length > 0 ? forWhom : undefined,
      what: what === '' ? undefined : what
    }))
  };
}

export const run: ToolRunner = (op, args) => {
  if (op !== 'settle') throw new Error('dutchpay: 모르는 연산 ' + op);
  const people = String(args.people ?? '')
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s !== '');
  const expenses = parseExpenses(String(args.expenses ?? ''));
  const shares = balances(people, expenses);
  const transfers = settle(shares);
  return [
    ...shares.map((s) => s.name + ': ' + t(s.paid) + ' paid, ' + t(s.owed) + ' owed → ' + (s.balance >= 0 ? '+' : '') + t(s.balance)),
    '',
    ...transfers.map((x) => x.from + ' → ' + x.to + '  ' + t(x.amount))
  ].join('\n');
};

const t = (n: number): string => n.toLocaleString('en-US');
