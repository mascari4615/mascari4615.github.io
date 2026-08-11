/** 발표 장면의 world 사각형을 화면 카메라로 바꾸는 순수 계산. */
export interface CameraRect { x: number; y: number; w: number; h: number; }
export interface CameraTarget { tx: number; ty: number; scale: number; }

export function cameraForRect(rect: CameraRect, screenWidth: number, screenHeight: number, pad = 0): CameraTarget {
  const width = Math.max(1, rect.w);
  const height = Math.max(1, rect.h);
  const scale = Math.max(0.1, Math.min(2, Math.min((screenWidth - pad * 2) / width, (screenHeight - pad * 2) / height)));
  return {
    scale,
    tx: screenWidth / 2 - (rect.x + width / 2) * scale,
    ty: screenHeight / 2 - (rect.y + height / 2) * scale,
  };
}
