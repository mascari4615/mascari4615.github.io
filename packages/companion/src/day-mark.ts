import { conversationOnly, type ConversationOptions } from './conversation';
import type { MemoryEntry } from './types';

/**
 * 하루의 매듭 — 오늘 처음 만나는 순간과 하루를 닫는 순간.
 *
 * 오래 쓰는 사람들에게 공통으로 나타나는 건 「매일 하는 짧은 의례」였다. 하루를 열고 닫는
 * 가벼운 인사가 그 자체로 붙잡아 둔다.
 *
 * 우리 얘는 그게 없었다. 컴퓨터를 켜고 처음 만나는 순간이 낮 세 시의 아무 순간과
 * 똑같았다. 매일 만나는데 매번 「그 중간부터」 시작하면 하루가 이어지지 않는다.
 *
 * 새로 저장하는 것은 없다 — 이미 쌓인 대화에서 「오늘 처음인가」와 「어제 뭘 했나」를 읽는다.
 */
export interface DayMark {
  kind: '첫인사' | '마무리';
  /** 두뇌에 그대로 넘어가는 한 줄. */
  note: string;
}

export interface DayMarkOptions extends ConversationOptions {
  now?: () => number;
  /** 이 시각 이후를 「하루 끝」으로 본다. */
  closingHour?: number;
  /** 하루를 닫자고 하려면 오늘 최소 이만큼은 얘기했어야 한다. */
  minTurnsForClosing?: number;
}

const 날 = (at: number): string => new Date(at).toDateString();

/**
 * 지금이 하루의 매듭인가.
 *
 * 첫인사가 마무리보다 먼저다 — 오늘 처음 만났으면 그게 지금 가장 큰 사실이다.
 */
export function dayMark(entries: readonly MemoryEntry[], options: DayMarkOptions = {}): DayMark | null {
  const now = options.now ?? (() => Date.now());
  const closingHour = options.closingHour ?? 23;
  const minTurns = options.minTurnsForClosing ?? 4;

  const at = now();
  const today = 날(at);
  // 화면에서 주워 온 것은 「나눈 얘기」가 아니다. 이걸 안 가르면 첫인사가
  // 「마지막으로 나눈 얘기: 「화면을 봤다. 창은 …」」이 된다 (실측 15회차).
  const fromPerson = conversationOnly(entries, options).filter((e) => e.role === 'sensed');
  const todays = fromPerson.filter((e) => 날(e.at) === today);
  const before = fromPerson.filter((e) => 날(e.at) !== today);

  // 오늘 아직 아무 말도 안 나눴고, 전에 만난 적이 있다면 — 오늘 처음이다.
  if (todays.length === 0 && before.length > 0) {
    const lastDay = 날(before[before.length - 1]?.at ?? at);
    const 그날 = before.filter((e) => 날(e.at) === lastDay).slice(-2).map((e) => e.text.slice(0, 50));
    const 며칠 = Math.max(1, Math.round((at - (before[before.length - 1]?.at ?? at)) / 86_400_000));
    return {
      kind: '첫인사',
      note:
        `오늘 조수님을 처음 만났다 (${며칠}일 만이다). 마지막으로 나눈 얘기: ${그날.map((t) => `「${t}」`).join(', ')}. ` +
        '그중 **한 조각만 집어서** 안부를 물어라 — 그게 어제와 오늘을 잇는다. ' +
        '「응」 한 마디로 넘기지 말고, 요약해 늘어놓지도 마라.',
    };
  }

  // 늦은 시간이고 오늘 제법 얘기했다면 — 하루를 닫을 만하다.
  const hour = new Date(at).getHours();
  const 늦었다 = hour >= closingHour || hour < 4;
  if (늦었다 && todays.length >= minTurns) {
    const 오늘거리 = todays.slice(-2).map((e) => e.text.slice(0, 50));
    return {
      kind: '마무리',
      note:
        `오늘 하루가 저물었다. 오늘 나눈 얘기: ${오늘거리.map((t) => `「${t}」`).join(', ')}. ` +
        '오늘 있었던 것 중 **하나만 집어서** 한마디 해라. 정리하거나 훈수 두지 말고, ' +
        '「수고했어」 같은 빈말로 때우지도 마라.',
    };
  }

  return null;
}
