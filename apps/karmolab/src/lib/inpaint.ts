/**
 * 칠한 자리 메우기 — 「지우개」 (흡혈 원장 15 cleanup.pictures / TASK-KL-335)
 *
 * ★ 정직하게 말하면 이건 **없던 그림을 그리는 게 아니라 주변 색으로 덮는 것**이다.
 * 큰 그림 모델을 하나 더 받으면 「지운 자리에 배경을 상상해서 그려 넣는」 것도 되지만,
 * 그건 수백 MB 짜리이고 이 도구가 실제로 쓰이는 자리(전깃줄·지나가는 사람·워터마크·먼지)는
 * 대개 **이어진 바탕** 위에 있다. 거기서는 이 방법이 즉시·무료·기기 안에서 끝난다.
 * 무늬가 있는 데서는 티가 난다 — 그래서 화면에도 그렇게 적는다.
 *
 * 화면도 캔버스도 없다. 순수 함수 하나뿐이라 Node 에서 그대로 잰다.
 */
import { t, loadNamespace } from './i18n';

if (typeof document !== 'undefined') void loadNamespace('aicutout');

/**
 * 칠한 자리를 메운다 — 「지우개」(원장 15 / cleanup.pictures).
 *
 * 남의 큰 그림 모델을 하나 더 받는 대신, **이미 받은 배경 빼기 결과**와 주변 색으로 메운다.
 * 정직하게 말하면 이건 「지운 자리를 주변으로 덮는」 것이지 없던 그림을 그리는 게 아니다.
 * 그래서 화면에도 그렇게 적는다 — 잔디·하늘·벽처럼 이어진 바탕에서 잘 되고, 무늬가 있으면 티가 난다.
 *
 * 방법: 칠한 자리를 구멍으로 두고 **가장자리 색을 안쪽으로 밀어 넣는다**(계속 번지게).
 * 한 판에 한 겹씩 먹어 들어가므로, 구멍이 클수록 판이 는다. 그래서 `rounds` 로 잘라 둔다 —
 * 안 자르면 큰 구멍 하나가 브라우저를 통째로 멈춘다.
 */
export function inpaint(
  rgba: Uint8ClampedArray,
  hole: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  rounds = 64
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  out.set(rgba);
  const todo = new Uint8Array(hole.length);
  todo.set(hole);

  for (let round = 0; round < rounds; round++) {
    /* 이번 판에 메울 자리를 **먼저 다 고른 뒤** 한꺼번에 쓴다. 고르면서 쓰면 방금 메운 색이
       바로 옆 자리의 재료가 되어 한 방향으로 죽 번진다 (왼쪽 위 색이 화면을 물들인다). */
    const filled: Array<{ i: number; r: number; g: number; b: number }> = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (todo[i] === 0) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const j = ny * width + nx;
            if (todo[j] !== 0) continue; // 아직 구멍인 자리는 재료가 못 된다
            r += out[j * 4];
            g += out[j * 4 + 1];
            b += out[j * 4 + 2];
            n++;
          }
        }
        if (n === 0) continue; // 사방이 다 구멍 — 다음 판에 가장자리가 다가온다
        filled.push({ i, r: r / n, g: g / n, b: b / n });
      }
    }
    if (filled.length === 0) break; // 더 메울 게 없거나, 메울 수가 없다
    for (const f of filled) {
      out[f.i * 4] = f.r;
      out[f.i * 4 + 1] = f.g;
      out[f.i * 4 + 2] = f.b;
      out[f.i * 4 + 3] = 255;
      todo[f.i] = 0;
    }
  }
  return out;
}
