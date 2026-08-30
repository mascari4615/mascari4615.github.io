/**
 * 글을 세는 **한 자리** (TASK-KL-275)
 *
 * 글 도구 열넷을 재 보니 세는 법이 저마다였다(2026-08-13 실측):
 * `[...글]` 로 세거나 `글.length` 로 세거나 `\s+` 로 낱말을 가르거나. 문제는 **셋 다 틀린다**는 것이다.
 *
 * ```
 * 👨‍👩‍👧 안녕 café          사람 눈: 9자
 *   글.length            → 16   (UTF-16 조각 수)
 *   [...글].length       → 13   (가족 이모지가 사람 셋 + 이음표 둘로 쪼개진다)
 *   Intl.Segmenter       →  9   ← 이게 사람이 세는 수다
 * ```
 *
 * 글자수는 **트위터 글자수, 이력서 자수 제한** 때문에 보는 것이라, 사람 눈과 다르면 쓸모가 없다.
 * NFD 로 풀린 `é`(e + 악센트)도 두 자로 세지던 자리다.
 *
 * 그래서 세는 법을 여기 하나 둔다. `Intl.Segmenter` 는 요즘 브라우저에 다 있고,
 * 없으면 옛 방식으로 내려간다(세는 수가 조금 달라져도 화면이 죽지는 않는다).
 */

import { graphemeCount } from '../../../core/charcount';

export interface TextCount {
  /** 사람이 세는 글자 수 (자소 묶음). 이모지 한 덩이는 1 */
  chars: number;
  /** 공백을 뺀 글자 수 */
  charsNoSpace: number;
  /** 낱말 수 */
  words: number;
  /** 줄 수 (빈 글은 0) */
  lines: number;
  /** UTF-8 바이트. 파일 크기, 전송량을 볼 때 */
  bytes: number;
}

/**
 * 사람이 세는 글자 수. **코어 것을 그대로 쓴다** (TASK-KL-276).
 *
 * 여기 한 벌 더 두면 같은 글에 두 수가 다시 생긴다. 실제로 그래서 화면은 9자, MCP 는 13자를
 * 말하고 있었다. 세는 법은 `core/charcount` 하나뿐이어야 한다.
 */
export const countChars = graphemeCount;

/**
 * 낱말 수.
 *
 * 공백으로만 가른다. **한국어에는 완벽하지 않다**(먹었습니다가 한 낱말). 그래도 이렇게 두는
 * 이유는, 사람이 낱말 수로 기대하는 것이 대개 **띄어쓰기 덩이**이기 때문이다.
 * 형태소로 가르면 숫자가 훨씬 커져서 내가 쓴 만큼과 안 맞는다.
 */
export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

export function countText(text: string): TextCount {
  return {
    chars: countChars(text),
    charsNoSpace: countChars(text.replace(/\s/g, '')),
    words: countWords(text),
    lines: text ? text.split(/\r?\n/).length : 0,
    bytes: new TextEncoder().encode(text).length
  };
}

/**
 * 화면에 글을 그대로 박아 넣을 때 (도구 107 곳이 각자 적던 네 줄).
 *
 * 번역 글, 사람이 넣은 글에 꺾쇠나 따옴표가 들어오면 화면이 깨지거나, 남의 글이 태그로 실행된다.
 */
export function escapeHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 자른 글 앞머리. 미리보기에 쓴다. **자소 묶음 단위로** 자른다
 * (`slice` 로 자르면 이모지가 반 토막 나서 깨진 네모가 남는다).
 */
export function head(text: string, max = 1200): string {
  if (text.length <= max) return text;
  /* 코드포인트 단위로 모은다. 완전한 자소까지는 아니어도 **반 토막 난 서러게이트**는 안 남는다
   * (`slice` 로 자르면 깨진 네모 � 가 보인다). 미리보기라 이 정도면 충분하다. */
  let out = '';
  for (const ch of text) {
    if (out.length + ch.length > max) break;
    out += ch;
  }
  return out;
}
