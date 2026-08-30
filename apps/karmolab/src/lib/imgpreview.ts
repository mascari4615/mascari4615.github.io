/**
 * 이 화질이면 어떻게 보이나. 자르기, 판정 (TASK-KL-238 / 17 squoosh)
 *
 * squoosh 의 알맹이는 **누르기 전에 결과를 보는 것**이다. 우리 일괄 변환에는 화질 다이얼이
 * 이미 있었지만, 그 숫자가 무엇을 뜻하는지는 **바꾸고 나서야** 알 수 있었다. 스무 장을 다
 * 바꾼 뒤에 너무 뭉갰네를 알면 처음부터 다시 해야 한다.
 *
 * 그래서 두 가지를 미리 준다: **얼마나 줄어드나**(용량)와 **어떻게 보이나**(확대해서 나란히).
 * 겹쳐 보는 손잡이는 이미 `comparepic` 이 한다. 여기서 필요한 건 다른 것이다 . 
 * 압축 자국은 **확대해야** 보이므로, 같은 자리를 같은 배율로 잘라 나란히 두는 쪽이 정직하다.
 *
 * 이 파일은 **자르는 자리와 판정만** 갖는다(그리는 일은 화면 몫). 그래야 검사가 돈다.
 */

export interface Crop {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * 가운데를 잘라 낼 자리. `zoom` 이 2 면 보이는 칸의 절반 크기만큼만 원본에서 떼어 2배로 본다.
 *
 * 원본이 보이는 칸보다 작으면 **떼어 낼 수 있는 만큼만** 뗀다. 넘겨서 요구하면 캔버스가
 * 빈 자리를 검게 채우고, 사람은 그 검은 띠를 압축이 망가뜨린 것으로 읽는다.
 */
export function centerCrop(w: number, h: number, boxW: number, boxH: number, zoom = 2): Crop {
  const sw = Math.min(w, Math.max(1, Math.round(boxW / zoom)));
  const sh = Math.min(h, Math.max(1, Math.round(boxH / zoom)));
  return {
    sx: Math.max(0, Math.round((w - sw) / 2)),
    sy: Math.max(0, Math.round((h - sh) / 2)),
    sw,
    sh
  };
}

export type SavingKind = 'smaller' | 'bigger' | 'same';

export interface Saving {
  kind: SavingKind;
  /** 늘 **양수**다. 방향은 `kind` 가 말한다. -559% 줄었다 같은 말이 나오면 안 된다. */
  pct: number;
}

/** 얼마나 줄었나. 0 바이트 원본은 나눌 수 없으니 같다로 둔다(모르는 것을 지어내지 않는다). */
export function saving(before: number, after: number): Saving {
  if (before <= 0 || after === before) return { kind: 'same', pct: 0 };
  const pct = Math.round(Math.abs(1 - after / before) * 100);
  if (pct === 0) return { kind: 'same', pct: 0 };
  return { kind: after < before ? 'smaller' : 'bigger', pct };
}

/**
 * 한 장으로 **여러 장의 결과를 어림**한다. 같은 규칙으로 바꾸므로 줄어드는 비율은 비슷하다 . 
 * 다만 이건 어림이라 화면이 어림이라고 말해야 한다(정확한 수는 바꿔 봐야 안다).
 */
export function estimateTotal(totalBefore: number, sampleBefore: number, sampleAfter: number): number | null {
  if (sampleBefore <= 0 || totalBefore <= 0) return null;
  return Math.round(totalBefore * (sampleAfter / sampleBefore));
}
