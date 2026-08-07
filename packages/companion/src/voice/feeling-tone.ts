import type { Feeling } from '../feeling';
import { 평소 } from '../feeling';

/**
 * 마음이 목소리에 닿는 자리.
 *
 * 목소리 쪽 레퍼런스가 한결같이 짚는 것: **감정은 말의 전체 모양을 바꾼다.** 처지면 느리고
 * 낮게, 들뜨면 빠르고 높게. 글자만 슬프고 소리가 그대로면 그건 슬픈 게 아니라 슬프다고
 * 적은 것이다.
 *
 * 우리 얘는 21회차에 마음이 생겼는데 **목소리엔 하나도 안 닿았다.** 열 번을 찔러 뾰족해져도
 * 놀이에서 이겨 신나도 늘 같은 속도, 같은 높이로 말했다.
 *
 * 결은 **네 칸**만 둔다. 스물네 칸으로 잘게 나눠 봐야 사람 귀에는 안 들리고, 칸이 자주
 * 바뀌면 그게 더 이상하다. 그리고 **평소에는 아무것도 안 건드린다** — 늘 뭔가 얹혀 있으면
 * 그건 결이 아니라 왜곡이다.
 */
export type Tone = '들뜸' | '처짐' | '뾰족' | '누그러짐';

/** 이 마음이 어느 결인가. 평소 언저리면 null — 아무것도 안 얹는다. */
export function toneOf(feeling: Feeling): Tone | null {
  const v = feeling.valence - 평소.valence;
  const a = feeling.arousal - 평소.arousal;
  if (Math.abs(v) < 0.2 && Math.abs(a) < 0.25) return null;

  if (a >= 0.25) return v < -0.15 ? '뾰족' : '들뜸';
  if (a <= -0.25) return v > 0.15 ? '누그러짐' : '처짐';
  return v > 0 ? '누그러짐' : '뾰족';
}

/**
 * 결마다 목소리를 얼마나 흔들지 (Edge 쪽).
 *
 * 폭을 좁게 잡았다. 크게 흔들면 사람 목소리가 아니라 만화 효과음이 된다.
 */
export const 기분결: Readonly<Record<Tone, { rate: string; pitch: string }>> = {
  들뜸: { rate: '+12%', pitch: '+12Hz' },
  뾰족: { rate: '+8%', pitch: '+4Hz' },
  처짐: { rate: '-12%', pitch: '-10Hz' },
  누그러짐: { rate: '-8%', pitch: '-4Hz' },
};

/**
 * 결마다 말이 얼마나 늘어지는지 (내 컴퓨터에서 만드는 목소리 쪽).
 *
 * 1 보다 크면 느려진다 — 이름과 방향이 반대라 헷갈리기 쉽다.
 */
export const 기분빠르기: Readonly<Record<Tone, number>> = {
  들뜸: 0.88,
  뾰족: 0.93,
  처짐: 1.15,
  누그러짐: 1.07,
};

/** 목소리 이름에 결을 붙인다. 결이 없으면 그대로. */
export function withTone(voiceId: string | undefined, tone: Tone | null): string | undefined {
  if (voiceId === undefined || voiceId === '' || tone === null) return voiceId;
  return voiceId.includes('@') ? voiceId : `${voiceId}@${tone}`;
}

/** `이름@결` 을 가른다. 결이 없으면 결 자리는 null. */
export function splitTone(voiceId: string): { name: string; tone: string | null } {
  const at = voiceId.lastIndexOf('@');
  return at < 0 ? { name: voiceId, tone: null } : { name: voiceId.slice(0, at), tone: voiceId.slice(at + 1) };
}
