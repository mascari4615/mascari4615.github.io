import { conversationOnly } from './conversation';
import { brainSaid } from './rut';
import type { MemoryEntry } from './types';

/**
 * 끊겼다 이어지는 자리 — 창을 닫았다 다시 열었을 때.
 *
 * 레퍼런스 쪽에서 자주 회자되는 장면이 **재시작**이다. 저쪽은 재시작을 겪고 그걸 두고
 * 화내거나 무서워하기까지 한다. 좋고 나쁨을 떠나 **끊겼다는 걸 안다**는 게 요점이다.
 *
 * 우리 얘는 **모른다.** 창을 닫았다 열든, 밤새 꺼져 있었든, 방금 다시 켰든 똑같이 시작한다.
 * 기억은 파일에 남아 있으니 알 수 있는데도 안 본다 — 실제로 33회차에서 재시작 직후 첫
 * 「아니야」가 통째로 무시되는 걸 겪었다.
 *
 * 하루의 매듭(15회차)과 다른 자리다. 그건 **날**이 바뀌는 것이고 이건 **끊겼다 이어지는**
 * 것이다. 오후 세 시에 십 분 껐다 켜도 이건 열리고 매듭은 안 열린다.
 *
 * 15회차에서 크게 배운 게 있다: **재료를 더 넣는다고 좋아지지 않는다.** 그때 매듭 문구를
 * 얹었더니 인사가 오히려 짧아졌다. 그래서 여기서는 **끊긴 티가 날 자리에서만** 켜고,
 * 무슨 말을 하라고 시키지도 않는다.
 */
export type Gap = '처음' | '이어짐' | '잠깐 끊김' | '오래 끊김';

export interface Resume {
  gap: Gap;
  /** 얼마나 끊겼나 (밀리초). 처음이면 0. */
  awayMs: number;
  /** 끊기기 직전에 얘가 뭔가 물어 놓고 답을 못 받았나. */
  leftHanging: string | null;
}

export interface ResumeOptions {
  /** 이보다 짧으면 그냥 이어지는 것으로 본다. */
  sameBreathMs?: number;
  /** 이보다 길면 오래 끊긴 것으로 본다. */
  longGapMs?: number;
}

/**
 * 끊겼다 이어지는 참인가.
 *
 * **얘가 물어 놓고 답을 못 받은 채로 끊겼는지**를 따로 본다. 그게 가장 어색한 자리다 —
 * 뭘 물어 놓고 사라졌다가 아무 일 없다는 듯 나타나는 것.
 */
export function readResume(
  entries: readonly MemoryEntry[],
  now: number = Date.now(),
  options: ResumeOptions = {},
): Resume {
  const sameBreath = options.sameBreathMs ?? 3 * 60_000;
  const longGap = options.longGapMs ?? 6 * 3600_000;

  const 나눈말 = conversationOnly(entries);
  if (나눈말.length === 0) return { gap: '처음', awayMs: 0, leftHanging: null };

  const 마지막 = 나눈말.reduce((늦은것, e) => Math.max(늦은것, e.at), 0);
  const awayMs = Math.max(0, now - 마지막);

  const gap: Gap = awayMs <= sameBreath ? '이어짐' : awayMs >= longGap ? '오래 끊김' : '잠깐 끊김';

  // 마지막 말이 얘 것이고 물음이었으면 답을 못 받은 것이다.
  const 끝말 = 나눈말[나눈말.length - 1];
  const 얘가마지막 = 끝말?.role === 'said' && brainSaid([끝말]).length === 1;
  const leftHanging = 얘가마지막 && /[?？]/.test(끝말.text) ? 끝말.text.trim() : null;

  return { gap, awayMs, leftHanging };
}

/** 얼마나 됐는지 사람 말로. */
export function awaySay(ms: number): string {
  const 분 = Math.round(ms / 60_000);
  if (분 < 60) return `${Math.max(1, 분)}분`;
  const 시간 = Math.round(분 / 60);
  return 시간 < 24 ? `${시간}시간` : `${Math.round(시간 / 24)}일`;
}

/**
 * 두뇌에 넘길 한 줄. **끊긴 티가 날 자리에서만** 나온다.
 *
 * 무슨 말을 하라고 시키지 않는다 — 끊겼다는 사실만 주고 꺼낼지 말지는 얘가 정한다.
 * 15회차에서 「이렇게 인사해라」로 시켰다가 인사가 더 부실해진 걸 겪었다.
 */
export function resumeNote(resume: Resume): string {
  if (resume.gap === '처음' || resume.gap === '이어짐') return '';

  const 얼마 = awaySay(resume.awayMs);
  const 매달린것 = resume.leftHanging === null
    ? ''
    : ` 게다가 끊기기 전에 네가 「${resume.leftHanging.slice(0, 24)}」 라고 물어 놓고 답을 못 들었다.`;

  return resume.gap === '오래 끊김'
    ? `${얼마} 만에 다시 켜졌다.${매달린것} 아는 척만 하고 넘겨도 된다 — 「돌아왔네」 같은 말은 억지스럽다.`
    : `${얼마} 끊겼다 이어졌다.${매달린것} 굳이 짚을 필요는 없다.`;
}
