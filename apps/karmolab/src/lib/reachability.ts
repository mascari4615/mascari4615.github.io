/**
 * 「나만 안 되나?」 — 판정만 (TASK-KL-238 / 45 downdetector)
 *
 * downdetector 의 알맹이 절반은 **남들의 제보**(수백만 명이 「나도 안 돼요」를 누른 기록)라
 * 우리가 지을 수 없다. 나머지 절반은 사람이 진짜 알고 싶은 것 하나다: **내 문제인가, 저쪽
 * 문제인가.** 그건 남의 창고 없이도 답할 수 있다 — *대조군*을 같이 재면 된다.
 *
 * 그래서 이렇게 잰다: 대상 하나 + 늘 살아 있는 곳 몇(대조군). 그리고 **네 갈래**로 가른다.
 *   ① 대상 됨 → 지금은 된다 (느리면 느리다고)
 *   ② 대상 X · 대조군 전부 X → **내 쪽**이다 (인터넷·와이파이·DNS)
 *   ③ 대상 X · 대조군 전부 됨 → **저쪽**이다
 *   ④ 대상 X · 대조군 반반 → 모른다고 말한다 (지어내지 않는다)
 *
 * ★ 브라우저가 재는 것의 한계를 판정에 박아 둔다: 다른 출처에 보낸 요청의 답은 **불투명**해서
 *   200 인지 500 인지 못 본다. 그래서 이 도구가 말하는 「된다」는 *서버가 응답한다*는 뜻이지
 *   *서비스가 멀쩡하다*는 뜻이 아니다. 화면도 그렇게 말해야 한다.
 */

export type Verdict = 'up' | 'slow' | 'mine' | 'theirs' | 'unclear';

export interface Probe {
  /** 어디를 쟀나 (화면에 그대로 보여 준다). */
  name: string;
  ok: boolean;
  /** 걸린 시간(ms). 실패면 재지 않는다. */
  ms?: number;
}

export interface Reading {
  target: Probe;
  controls: Probe[];
}

/** 이보다 오래 걸리면 「된다」가 아니라 「느리다」로 말한다 — 사람은 그 차이를 겪고 있다. */
export const SLOW_MS = 2500;

export function verdict(r: Reading): Verdict {
  if (r.target.ok) return (r.target.ms ?? 0) >= SLOW_MS ? 'slow' : 'up';
  if (r.controls.length === 0) return 'unclear';
  const alive = r.controls.filter((c) => c.ok).length;
  if (alive === 0) return 'mine';
  if (alive === r.controls.length) return 'theirs';
  return 'unclear';
}

/**
 * 사람이 적은 것을 주소로 만든다. `naver.com`·`www.naver.com/`·`https://naver.com/x` 전부 받는다.
 * 못 만들면 null — 「형식이 틀렸다」는 재기 전에 말해야 한다(재고 나서 「안 된다」고 하면 거짓말이다).
 */
export function toUrl(raw: string): string | null {
  const text = String(raw ?? '').trim();
  if (text === '') return null;
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  // 점이 없는 이름(`localhost` 빼고)은 주소가 아니라 오타일 때가 훨씬 많다.
  if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null;
  return url.origin + (url.pathname === '/' ? '' : url.pathname);
}

/** 화면에 크게 쓸 이름 = 호스트. 주소 전체를 큰 글씨로 쓰면 무엇을 잰 건지 오히려 안 보인다. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
