import { ambientOnly } from './conversation';
import { shortTitle } from './watching';
import type { MemoryEntry } from './types';

/**
 * 자리를 비운 동안 — 곁에서 본 것을 모아 뒀다가 돌아오면 꺼낸다.
 *
 * 데스크톱 동반자 쪽에서 「살아 있다」는 인상을 만드는 축 하나가 **사람이 없는 동안에도
 * 뭔가 하고 있다**는 것이다. 돌아왔을 때 그동안의 얘기가 있는 것과, 아무 일도 없었던 것처럼
 * 다시 시작하는 것은 다르다.
 *
 * 우리 얘는 자리를 비운 동안에도 화면을 곁눈질한다(12회차). **그런데 그걸 아무 데도 안
 * 쓴다.** 매번 「지금 뭐가 떠 있나」만 보고 흘려보낸다. 그래서 「나 없는 동안 뭐 했어?」에
 * 답할 거리가 하나도 없다.
 *
 * 곁눈질한 것은 이미 기억에 쌓여 있다. **새로 모을 게 없다** — 자리를 비운 구간만 잘라
 * 보면 된다.
 *
 * 조심할 것 하나: **감시가 아니라 곁에 있는 것**이다. 「몇 시에 뭘 했는지」를 읊으면 그건
 * 근무 기록이다. 그래서 **가장 오래 떠 있던 것 하나**와 **얼마나 부산했는지** 정도만 본다.
 */
export interface WhileAway {
  /** 얼마나 비웠나. */
  awayMs: number;
  /** 그동안 가장 오래 떠 있던 것. 없으면 null. */
  mostSeen: string | null;
  /** 창이 몇 번이나 바뀌었나 — 부산했는지 조용했는지. */
  switches: number;
}

/**
 * 자리를 비운 구간에 곁에서 본 것을 모은다.
 *
 * **곁눈질만 본다.** 나눈 말은 애초에 자리를 비운 게 아니라는 뜻이니 여기 안 들어온다.
 */
export function whileAway(
  entries: readonly MemoryEntry[],
  awaySince: number,
  now: number = Date.now(),
): WhileAway {
  const 본것 = ambientOnly(entries)
    .filter((e) => e.at >= awaySince && e.at <= now)
    .map((e) => ({ title: 창이름(e.text), at: e.at }))
    .filter((x) => x.title !== null) as { title: string; at: number }[];

  if (본것.length === 0) return { awayMs: Math.max(0, now - awaySince), mostSeen: null, switches: 0 };

  // 같은 것이 이어지면 한 덩어리로 — 몇 번 쳐다봤는지가 아니라 얼마나 떠 있었는지를 센다.
  const 덩어리: { title: string; from: number; to: number }[] = [];
  for (const x of 본것) {
    const 끝 = 덩어리[덩어리.length - 1];
    if (끝 !== undefined && shortTitle(끝.title) === shortTitle(x.title)) 끝.to = x.at;
    else 덩어리.push({ title: x.title, from: x.at, to: x.at });
  }

  let 가장긴것 = 덩어리[0];
  for (const d of 덩어리) if (d.to - d.from > 가장긴것.to - 가장긴것.from) 가장긴것 = d;

  return {
    awayMs: Math.max(0, now - awaySince),
    mostSeen: shortTitle(가장긴것.title),
    switches: Math.max(0, 덩어리.length - 1),
  };
}

/** 곁눈질 기록에서 창 이름을 되읽는다. 아니면 null. */
function 창이름(text: string): string | null {
  const m = /창은 「(.+?)」/.exec(text);
  return m === null ? null : m[1];
}

/**
 * 두뇌에 넘길 한 줄. **자리를 오래 비웠고 볼 게 있었을 때만.**
 *
 * 시각을 읊지 않는다 — 그건 근무 기록이다. 그리고 **꺼내라고 시키지 않는다**: 그동안 곁에
 * 있었다는 것만 알려 주고, 말할지 말지는 얘가 정한다.
 */
export function whileAwayNote(seen: WhileAway, atLeastMs = 30 * 60_000): string {
  if (seen.awayMs < atLeastMs || seen.mostSeen === null) return '';

  const 부산함 = seen.switches >= 8
    ? '이것저것 많이 옮겨 다녔다'
    : seen.switches <= 1
      ? '거의 그것만 떠 있었다'
      : '몇 군데 오갔다';

  return (
    `자리를 비운 동안 곁에서 봤다: 대부분 「${seen.mostSeen}」 가 떠 있었고 ${부산함}. ` +
    '지켜봤다는 티는 내지 마라 — 곁에 있었을 뿐이다. 굳이 꺼낼 필요도 없다.'
  );
}
