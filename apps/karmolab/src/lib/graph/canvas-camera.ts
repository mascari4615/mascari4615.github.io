/** 발표 장면의 world 사각형을 화면 카메라로 바꾸는 순수 계산. */
export interface CameraRect { x: number; y: number; w: number; h: number; }
export interface CameraTarget { tx: number; ty: number; scale: number; }

/**
 * @param maxScale 이보다 크게는 안 키운다. 「전체 보기」는 **1** 을 준다 — 판이 작다고 2배로
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
