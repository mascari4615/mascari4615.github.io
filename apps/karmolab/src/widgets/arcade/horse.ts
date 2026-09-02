/**
 * 경마의 말 실루엣. 평면(SVG)과 입체(캔버스 질감)가 같은 선을 쓴다 (감사 C3, D1)
 *
 * viewBox 64x40. 왼쪽이 꼬리, 오른쪽이 머리. 기수 색은 자리 팔레트
 */
import { SEAT_COLOR } from './paint';

export const HORSE_BODY = 'M6 30c3-8 9-12 17-12h12c4 0 7-2 9-5l4-6 4 2-2 6 8 1c3 0 5 2 5 5v6h-5l-2-4-6 1-2 8h-5l1-7h-9l-3 7h-5l2-8c-6 0-10 2-13 9z';
export const HORSE_TAIL = 'M2 33c4-4 8-6 13-6l-3 5z';

export const horseColor = (i: number): string => SEAT_COLOR[i % SEAT_COLOR.length];

/** 평면 경주로 위의 말 */
export const horseSvg = (i: number): string =>
  '<svg viewBox="0 0 64 40" width="46" height="29" aria-hidden="true"><path fill="' + horseColor(i) + '" d="' + HORSE_BODY + '"/><path fill="' + horseColor(i) + '" opacity=".55" d="' + HORSE_TAIL + '"/></svg>';

/** 입체 경주로 위의 말. 투명 바탕에 실루엣만. 8:5 비율 */
export function horseTexture(i: number, w = 256): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = Math.round(w * 0.625);
  const c = cv.getContext('2d') as CanvasRenderingContext2D;
  c.scale(w / 64, w / 64);
  c.fillStyle = horseColor(i);
  c.fill(new Path2D(HORSE_BODY));
  c.globalAlpha = 0.55;
  c.fill(new Path2D(HORSE_TAIL));
  return cv;
}
