import { conversationOnly } from './conversation';
import { stripParticle, worthWondering } from './curiosity';
import { isTouch } from './touch';
import type { MemoryEntry } from './types';

/**
 * 자꾸 나오는 얘기 — 「우리끼리 그거」.
 *
 * 오래 보는 사이의 표시 하나가 **되부르기**다. 예전에 나온 얘기를 다시 꺼내면 그건 「기억이
 * 좋다」가 아니라 **같이 지냈다**는 뜻이 된다. 레퍼런스 쪽 재미의 큰 축도 이것이다 — 몇 달째
 * 이어지는 농담, 서로 아는 얘기.
 *
 * 우리 얘는 옛 대화를 찾아 붙이긴 한다(12회차). 그런데 그건 **지금 얘기와 관련된 것**을
 * 찾는 것이고, **자꾸 되풀이되는 것**은 모른다. 「우리 사이에 자주 나오는 얘기」라는 게 없다.
 *
 * 39회차의 놀리기와 다른 자리다. 그건 **방금 같은 걸 또 물은 것**(그 자리)이고, 이건
 * **여러 날에 걸쳐 자꾸 나오는 것**이다.
 *
 * 조심할 것 = **자주 나온다고 웃긴 게 아니다.** 거리만 주고 농담으로 만들라고 시키지 않는다.
 */
export interface Recurring {
  what: string;
  times: number;
  firstAt: number;
  lastAt: number;
  /** 며칠에 걸쳐 나왔나. */
  days: number;
}

export interface RecurringOptions {
  /** 몇 번 넘게 나와야 「자주」인가. */
  atLeast?: number;
  /** 몇 개까지 들고 올지. */
  keep?: number;
  /** 하루에 몰아 나온 것도 셀까. 기본은 **아니오** — 여러 날 걸쳐야 「우리끼리」다. */
  needDays?: number;
}

const 날 = (at: number): string => new Date(at).toDateString();

/**
 * 자꾸 나오는 얘깃거리를 찾는다.
 *
 * **조수님이 한 말만** 본다. 얘가 한 말까지 세면 제가 자주 쓰는 낱말을 「우리끼리 그거」로
 * 착각한다. 그리고 **닿은 것**(쿡 찌르기 같은)은 뺀다 — 그건 대화가 아니라 몸짓이고,
 * 「조수님이 나를 쿡 찔렀다」가 스물아홉 번 쌓여 있으면 그게 1등이 된다(실측 48회차).
 */
export function recurringThings(
  entries: readonly MemoryEntry[],
  options: RecurringOptions = {},
): Recurring[] {
  const atLeast = options.atLeast ?? 3;
  const needDays = options.needDays ?? 2;

  const 사람말 = conversationOnly(entries)
    .filter((e) => e.role === 'sensed' && isTouch(e) === false);

  const 모은것 = new Map<string, { times: number; firstAt: number; lastAt: number; days: Set<string> }>();
  for (const e of 사람말) {
    const 본낱말 = new Set<string>(); // 한 말에서 같은 낱말을 두 번 안 센다
    for (const raw of e.text.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)) {
      const w = stripParticle(raw.trim());
      if (worthWondering(w) === false || 본낱말.has(w)) continue;
      본낱말.add(w);

      const 있던것 = 모은것.get(w);
      if (있던것 === undefined) {
        모은것.set(w, { times: 1, firstAt: e.at, lastAt: e.at, days: new Set([날(e.at)]) });
      } else {
        있던것.times += 1;
        있던것.lastAt = Math.max(있던것.lastAt, e.at);
        있던것.firstAt = Math.min(있던것.firstAt, e.at);
        있던것.days.add(날(e.at));
      }
    }
  }

  return [...모은것.entries()]
    .filter(([, v]) => v.times >= atLeast && v.days.size >= needDays)
    .map(([what, v]) => ({ what, times: v.times, firstAt: v.firstAt, lastAt: v.lastAt, days: v.days.size }))
    .sort((a, b) => (b.days - a.days) || (b.times - a.times))
    .slice(0, options.keep ?? 4);
}

/**
 * 두뇌에 넘길 한 줄.
 *
 * **농담으로 만들라고 시키지 않는다.** 자주 나온다고 웃긴 게 아니고, 시키면 억지 개그가
 * 나온다(39회차에서 배웠다). 「우리끼리 자주 나오는 얘기」라는 사실만 준다.
 */
export function runningGagNote(things: readonly Recurring[]): string {
  if (things.length === 0) return '';
  const 줄 = things.map((t) => `「${t.what}」(${t.days}일에 걸쳐 ${t.times}번)`).join(', ');
  return (
    `조수님과 자꾸 나오는 얘기: ${줄}. ` +
    '억지로 농담으로 만들지 마라 — 그냥 우리 사이에 익숙한 얘기라는 것만 알아 둬라.'
  );
}
