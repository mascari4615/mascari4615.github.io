import { conversationOnly } from './conversation';
import { stripParticle, worthWondering } from './curiosity';
import type { MemoryEntry } from './types';

/**
 * 놀릴 거리 — 재미는 저절로 생기지 않는다.
 *
 * 레퍼런스에서 가장 자주 짚이는 것: 저쪽은 **재미가 설계 목표**다. 「사람 같음」보다 「재밌음」을
 * 앞에 두고 만들었고, 무표정하게 딱 잘라 말하는 농담과 **가벼운 놀리기**가 그 축이다.
 *
 * 우리 얘한테는 재미를 위한 장치가 **하나도 없었다.** 진지하고 짧다. 그런데 웃기라고 지시만
 * 늘리면 억지 개그가 나온다 — 필요한 건 지시가 아니라 **놀릴 거리**다. 그리고 우리는 이미
 * 조수님에 대해 꽤 안다.
 *
 * 기계로 정확히 잴 수 있는 것만 고른다. 지어내면 그건 놀리는 게 아니라 트집이다.
 * - **같은 걸 또 물었다** — 기록에 그대로 남아 있다.
 * - **잔다고 하고 안 잤다** — 말과 시각이 어긋난다.
 *
 * 선 하나: **놀리는 것과 비난은 다르다.** 그리고 조수님이 힘들어 보이면 안 놀린다 —
 * 그 자리에서 놀리는 건 재미가 아니라 무례다.
 */
export interface Tease {
  /** 무엇을 놀릴 만한가 (사람이 읽는 말). */
  what: string;
  /** 어디서 나온 거리인가 (진단용). */
  from: '또 물음' | '잔다더니';
}

const 힘든말 = /(힘들|지쳤|짜증|화나|우울|속상|안 좋|최악|망했|죽겠)/;

/** 지금 놀릴 자리가 아닌가 — 힘들어 보이면 안 놀린다. */
export function tooSoreToTease(entries: readonly MemoryEntry[], howMany = 3): boolean {
  return conversationOnly(entries)
    .filter((e) => e.role === 'sensed')
    .slice(-howMany)
    .some((e) => 힘든말.test(e.text));
}

/** 물음에서 알맹이 낱말들을 뽑는다 — 「그 셰이더 어떻게 됐어?」 → 셰이더. */
function 알맹이(text: string): string[] {
  return text
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((w) => stripParticle(w.trim()))
    .filter((w) => worthWondering(w));
}

/**
 * 전에도 같은 걸 물었나. 그 물음을 돌려준다.
 *
 * **똑같은 문장**이 아니라 **같은 알맹이**를 본다 — 사람은 같은 걸 물어도 매번 다르게 말한다.
 * 그리고 **너무 오래된 건 안 센다** — 두 달 전에 물은 걸 「또 물었네」 하면 그건 놀리는 게
 * 아니라 소름이다.
 */
export function askedBefore(
  said: string,
  entries: readonly MemoryEntry[],
  options: { withinMs?: number; now?: number; minWords?: number } = {},
): MemoryEntry | null {
  const withinMs = options.withinMs ?? 7 * 86_400_000;
  const now = options.now ?? Date.now();
  const 지금알맹이 = 알맹이(said);
  if (지금알맹이.length < (options.minWords ?? 1)) return null;

  const 옛것 = conversationOnly(entries)
    .filter((e) => e.role === 'sensed' && now - e.at <= withinMs && e.text.trim() !== said.trim());

  for (let i = 옛것.length - 1; i >= 0; i -= 1) {
    const 겹침 = 알맹이(옛것[i].text).filter((w) => 지금알맹이.includes(w));
    // 알맹이가 **다** 겹쳐야 같은 물음이다. 하나 겹쳤다고 같은 얘기는 아니다.
    if (겹침.length >= 지금알맹이.length && 겹침.length > 0) return 옛것[i];
  }
  return null;
}

const 잔다는말 = /(잘게|자야지|잔다|잠들|이제 자|자러|굿나잇|잘 자)/;

/**
 * 잔다고 해 놓고 아직 있나.
 *
 * 「이제 잘게」라고 한 지 한참 지났는데 또 말을 걸면, 그건 놀릴 자리다.
 */
export function stayedUp(
  entries: readonly MemoryEntry[],
  options: { afterMs?: number; now?: number } = {},
): MemoryEntry | null {
  const afterMs = options.afterMs ?? 20 * 60_000;
  const now = options.now ?? Date.now();

  const 사람말 = conversationOnly(entries).filter((e) => e.role === 'sensed');
  for (let i = 사람말.length - 1; i >= 0; i -= 1) {
    const e = 사람말[i];
    if (잔다는말.test(e.text) === false) continue;
    const 지난시간 = now - e.at;
    // 오늘 안에, 그리고 한참 지났을 때만.
    return 지난시간 >= afterMs && 지난시간 <= 6 * 3600_000 ? e : null;
  }
  return null;
}

/** 지금 놀릴 거리 하나. 없으면 null. */
export function findTease(
  said: string,
  entries: readonly MemoryEntry[],
  now: number = Date.now(),
): Tease | null {
  if (tooSoreToTease(entries)) return null;

  const 또물음 = askedBefore(said, entries, { now });
  if (또물음 !== null) {
    const 언제 = new Date(또물음.at);
    return { from: '또 물음', what: `조수님이 「${또물음.text.slice(0, 24)}」 를 ${언제.getMonth() + 1}월 ${언제.getDate()}일에도 물었다` };
  }

  const 안잠 = stayedUp(entries, { now });
  if (안잠 !== null) {
    const 분 = Math.round((now - 안잠.at) / 60_000);
    return { from: '잔다더니', what: `조수님이 ${분}분 전에 「${안잠.text.slice(0, 20)}」 라고 해 놓고 아직 있다` };
  }

  return null;
}

/**
 * 두뇌에 넘길 한 줄.
 *
 * **꼭 놀리라고 시키지 않는다.** 시키면 매번 놀리는 애가 되고 그건 피곤하다. 거리를 주고
 * 쓸지 말지는 얘가 정한다. 그리고 **비난이 아니라 놀리기**라고 선을 긋는다.
 */
export function teaseNote(tease: Tease | null): string {
  if (tease === null) return '';
  return (
    `놀릴 만한 거리: ${tease.what}. ` +
    '쓸지 말지는 네가 정해라 — 매번 놀리면 피곤하다. ' +
    '쓴다면 **가볍게 한 마디**, 비난이 아니라 놀리기다.'
  );
}
