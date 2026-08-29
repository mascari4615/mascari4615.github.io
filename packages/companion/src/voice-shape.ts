/**
 * **목소리의 결**. 문턱 판정에만 쓰고 버리던 값 (TASK-KAR-244).
 *
 * 우리는 소리를 글자로 바꾼 뒤에만 본다. 같은 괜찮아도 지친 목소리인지 밝은 목소리인지
 * 모른다. 밖에서는 그걸 동반자의 핵심으로 꼽는다(원장 2026-08-21: EVI 는 감정 단서를 듣고
 * 그 결에 맞춰 답한다).
 *
 * 감정 모델을 새로 까는 건 사용자 영역이다(디스크, 시간). 그런데 **창은 이미 소리 크기를
 * 재고 있고** 서버는 말소리가 얼마나 있었나를 받는다. 그걸 **문턱 판정에만 쓰고 버렸다.**
 * 여기서는 그 두 값만으로 짧고 조용하게 말했다 정도를 말한다.
 *
 * 두 가지를 지킨다:
 *
 * - **관측한 것만 적는다.** 기뻐 보인다 같은 해석은 안 한다. 53회차에 안 보고 아는
 *   척하지 않기를 세웠다. 우리가 아는 건 길이와 크기뿐이다.
 * - **절대값이 아니라 평소 대비.** 마이크, 방, 기계마다 크기가 다르다. 그 사람의 최근 평균과
 *   견딘다. 평소값이 없으면 **아무 말도 안 한다**(첫 판은 견줄 것이 없다).
 */
export interface VoiceShape {
  /** 말소리가 있던 시간(ms). 마이크를 안 썼으면 null. */
  spokenMs: number | null;
  /** 그 구간의 소리 크기(0~1). 창이 재서 보낸다. */
  loudness: number | null;
}

export interface VoiceShapeOptions {
  /** 이 배수를 넘게 길거나 짧으면 말한다. */
  lengthRatio?: number;
  /** 이 배수를 넘게 크거나 작으면 말한다. */
  loudRatio?: number;
}

export function voiceShape(
  now: VoiceShape | null,
  usual: VoiceShape | null,
  options: VoiceShapeOptions = {},
): string {
  if (now === null || usual === null) return '';
  if (typeof now.spokenMs !== 'number' || typeof usual.spokenMs !== 'number') return '';
  if (usual.spokenMs <= 0) return '';

  const lengthRatio = options.lengthRatio ?? 1.6;
  const loudRatio = options.loudRatio ?? 1.6;
  const bits: string[] = [];

  const longer = now.spokenMs / usual.spokenMs;
  if (longer >= lengthRatio) bits.push('평소보다 길게');
  else if (longer <= 1 / lengthRatio) bits.push('평소보다 짧게');

  if (typeof now.loudness === 'number' && typeof usual.loudness === 'number' && usual.loudness > 0) {
    const louder = now.loudness / usual.loudness;
    if (louder >= loudRatio) bits.push('크게');
    else if (louder <= 1 / loudRatio) bits.push('조용히');
  }

  if (bits.length === 0) return '';
  return `방금 조수님이 ${bits.join(' ')} 말했다. (목소리 결만 본 것이다. 무슨 기분인지는 모른다.)`;
}

/**
 * 최근 판들의 평균. 견줄 평소.
 *
 * 몇 판 안 쌓였으면 null 을 돌려준다. 표본이 적으면 아무 말이나 하게 된다(130회차와 같은 규율).
 */
export function usualVoice(recent: readonly VoiceShape[], atLeast = 3): VoiceShape | null {
  const real = recent.filter(
    (one) => typeof one.spokenMs === 'number' && (one.spokenMs as number) > 0,
  );
  if (real.length < atLeast) return null;
  const sum = (pick: (one: VoiceShape) => number | null): number => real
    .reduce((total, one) => total + (typeof pick(one) === 'number' ? (pick(one) as number) : 0), 0);
  return {
    spokenMs: sum((one) => one.spokenMs) / real.length,
    loudness: sum((one) => one.loudness) / real.length,
  };
}
