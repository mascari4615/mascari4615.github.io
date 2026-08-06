import type { MemoryEntry } from './types';

/**
 * 사이 — 얼마나 가까워졌나.
 *
 * 뉴로사마와 만든 사람의 결은 고정이 아니다. 쌓이면서 변했다(친근한 농담에서
 * 티격태격으로). 우리 얘는 첫날이나 백일째나 거리가 똑같았다 — 그건 관계가 아니라 설정이다.
 *
 * 새로 저장하는 것은 없다. 이미 쌓인 대화에서 읽어낸다 — **며칠에 걸쳐 몇 번 만났나**.
 * 하루에 몰아서 백 마디 한 것과 백 일 동안 하루 한 마디씩 한 것은 다르다.
 */
export interface Rapport {
  /** 함께한 날 수 (대화가 있었던 서로 다른 날). */
  days: number;
  /** 사람이 건넨 말의 총 수. */
  turns: number;
  /** 0(방금 만남) ~ 1(오래 봤다). */
  level: number;
  /** 두뇌에 그대로 넘어가는 한 줄. */
  note: string;
}

export interface RapportOptions {
  /** 이 날 수쯤 지나면 「오래 봤다」로 본다. */
  matureDays?: number;
  /** 이만큼 오래 안 보면 다시 서먹해진다(ms). */
  coolAfterMs?: number;
  now?: () => number;
}

/**
 * 쌓인 대화에서 사이를 읽는다.
 *
 * 날 수를 주로 본다 — 함께 지낸 시간은 말수로 사는 게 아니다.
 * 오래 안 보면 조금 식는다. 다시 만나면 처음부터는 아니지만 살짝 서먹하다.
 */
export function readRapport(entries: readonly MemoryEntry[], options: RapportOptions = {}): Rapport {
  const matureDays = options.matureDays ?? 21;
  const coolAfterMs = options.coolAfterMs ?? 14 * 86_400_000;
  const now = options.now ?? (() => Date.now());

  const fromPerson = entries.filter((e) => e.role === 'sensed');
  const days = new Set(fromPerson.map((e) => new Date(e.at).toDateString())).size;
  const turns = fromPerson.length;

  const lastAt = fromPerson.length > 0 ? Math.max(...fromPerson.map((e) => e.at)) : null;
  const away = lastAt === null ? 0 : Math.max(0, now() - lastAt);

  // 날 수가 주, 말수는 거들 뿐. 하루에 몰아 떠든 것으로 오래 본 사이가 되지는 않는다.
  const byDays = Math.min(1, days / matureDays);
  const byTurns = Math.min(1, turns / (matureDays * 8));
  let level = byDays * 0.75 + byTurns * 0.25;

  // 오래 안 보면 식는다. 다만 밑바닥까지 가지는 않는다 — 함께 지낸 시간이 없던 일이 되진 않는다.
  if (away > coolAfterMs) level *= 0.6;

  return { days, turns, level, note: describe(level, days, away > coolAfterMs) };
}

function describe(level: number, days: number, cooled: boolean): string {
  const bits: string[] = [];

  if (days === 0) {
    return '이 사람과는 아직 아무것도 나눈 게 없다. 조심스럽게, 말수 적게.';
  }

  if (level < 0.2) {
    bits.push('아직 서먹한 사이다. 말수를 아끼고, 넘겨짚지 마라');
  } else if (level < 0.5) {
    bits.push('조금 편해진 사이다. 가벼운 농담 정도는 해도 된다');
  } else if (level < 0.8) {
    bits.push('꽤 오래 본 사이다. 툭 던져도 되고, 챙기는 티를 내도 된다');
  } else {
    bits.push('아주 오래 본 사이다. 말 안 해도 아는 것들이 있다는 듯이 굴어도 된다');
  }

  if (cooled) bits.push('다만 한참 못 봤다 — 반가움 반, 어색함 반');

  return `${bits.join('. ')}. 사이를 말로 설명하지는 마라 — 말투에만 배게.`;
}
