/** 발표 장면의 world 사각형을 화면 카메라로 바꾸는 순수 계산. */
export interface CameraRect { x: number; y: number; w: number; h: number; }
export interface CameraTarget { tx: number; ty: number; scale: number; }

/**
 * @param maxScale 이보다 크게는 안 키운다. 전체 보기는 **1** 을 준다. 판이 작다고 2배로
 *   부풀리면 카드 여섯 장이 화면을 가득 채워 그림이 아니라 확대경이 된다(실측 2026-08-12:
 *   견본을 깔면 200% 로 열렸다). 발표 카메라는 장면을 당겨야 하므로 기본값(2) 그대로 쓴다.
 */
export function cameraForRect(
  rect: CameraRect, screenWidth: number, screenHeight: number, pad = 0, maxScale = 2,
): CameraTarget {
  const width = Math.max(1, rect.w);
  const height = Math.max(1, rect.h);
  const scale = Math.max(0.1, Math.min(maxScale, Math.min((screenWidth - pad * 2) / width, (screenHeight - pad * 2) / height)));
  return {
    scale,
    tx: screenWidth / 2 - (rect.x + width / 2) * scale,
    ty: screenHeight / 2 - (rect.y + height / 2) * scale,
  };
}

/**
 * 이 상자가 화면 안에 들어오게 살짝 밀 만큼. **얼마나 밀지**만 셈한다 (2026-08-13).
 *
 * canvas.ts 에 있던 열 몇 줄을 여기로 옮겼다. 그 파일은 2865줄짜리 한 덩이를 조각내는 중이고
 * 자물쇠(1900줄)가 걸려 있다. 기능이 하나 늘 때마다 그만큼 조각을 떼어 내야 자물쇠가 산다.
 * 카메라를 어떻게 움직일지는 원래 이 파일이 아는 일이기도 하다.
 */
export function nudgeIntoView(
  box: { x: number; y: number; w: number; h: number },
  view: { w: number; h: number },
  state: { scale: number; tx: number; ty: number },
  pad = 40
): { tx: number; ty: number } {
  const s = state.scale;
  const left = box.x * s + state.tx;
  const top = box.y * s + state.ty;
  const right = left + box.w * s;
  const bottom = top + box.h * s;
  let { tx, ty } = state;
  if (left < pad) tx += pad - left;
  else if (right > view.w - pad) tx -= right - (view.w - pad);
  if (top < pad) ty += pad - top;
  else if (bottom > view.h - pad) ty -= bottom - (view.h - pad);
  return { tx, ty };
}
