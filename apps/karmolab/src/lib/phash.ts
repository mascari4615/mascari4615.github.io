/**
 * 지각 해시 — 「이 두 장이 같은 사진인가」 (TASK-KL-238 / 46 tineye)
 *
 * tineye 가 하는 일의 절반은 **찾기**(수억 장 색인)이고 절반은 **같은가**다. 앞쪽은 우리가
 * 못 짓는다 — 알맹이가 코드가 아니라 남의 창고이기 때문이다. 뒤쪽은 순수 계산이라 브라우저
 * 안에서 끝난다. 그래서 여기서는 **같은가만** 한다.
 *
 * 왜 파일 해시(SHA-256)로는 안 되나: 같은 사진을 한 번 다시 저장하기만 해도(JPEG 재압축·
 * 크기 변경·워터마크) 파일 해시는 **완전히 달라진다.** 사람 눈에는 같은 사진인데 기계는
 * 「전혀 다른 파일」이라고 답한다 — 그게 `filehash` 의 일이고, 이건 그 반대쪽 일이다.
 *
 * 방식 = dHash(차이 해시). 9×8 로 줄인 뒤 **가로로 이웃한 두 칸 중 어느 쪽이 밝은가**만
 * 64개 담는다. 밝기 전체가 오르내려도(노출·감마) 이웃 사이의 대소는 그대로라서, 재압축·
 * 크기 변경에 잘 견딘다. 평균값 기준(aHash)은 밝기가 통째로 밀리면 흔들린다.
 *
 * ★ 한계를 답에 적는다: 좌우 뒤집기·90도 회전·심한 자르기는 **다른 사진으로 나온다.**
 *   여기서 「같다」는 *눈으로 봐서 같은 장면*이지 *같은 피사체*가 아니다.
 */

/** 줄여서 담을 격자. 가로가 하나 더 넓은 이유 = 이웃끼리 비교하면 한 칸이 줄기 때문. */
export const HASH_W = 9;
export const HASH_H = 8;
/** 담기는 비트 수 = (9-1) × 8. */
export const HASH_BITS = (HASH_W - 1) * HASH_H;

/** 색 → 밝기. 사람 눈이 초록에 가장 민감한 비율(BT.601)을 그대로 쓴다. */
export const luma = (r: number, g: number, b: number): number => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * 밝기 격자(9×8, 왼→오 · 위→아래) → 16자리 16진수.
 *
 * 격자 길이가 안 맞으면 **던진다.** 조용히 0 으로 채우면 「모든 사진이 비슷하다」는 답이
 * 나오는데, 그건 틀렸다고 말해 주지도 않아서 가장 나쁘다.
 */
export function dhash(gray: number[] | Float64Array | Uint8Array): string {
  if (gray.length !== HASH_W * HASH_H) {
    throw new Error(`밝기 격자는 ${HASH_W}×${HASH_H} = ${HASH_W * HASH_H}칸이어야 합니다 (받은 것 ${gray.length})`);
  }
  let bits = '';
  for (let y = 0; y < HASH_H; y++) {
    for (let x = 0; x < HASH_W - 1; x++) {
      const here = gray[y * HASH_W + x];
      const next = gray[y * HASH_W + x + 1];
      bits += here > next ? '1' : '0';
    }
  }
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

/** 두 해시가 **몇 비트 다른가**. 같은 길이가 아니면 던진다(길이가 다르면 견줄 수 없다). */
export function hamming(a: string, b: string): number {
  if (a.length !== b.length) throw new Error('길이가 다른 해시는 견줄 수 없습니다');
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    if (Number.isNaN(x)) throw new Error(`16진수가 아닙니다: ${a[i]}${b[i]}`);
    while (x > 0) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

export type Verdict = 'same' | 'likely' | 'maybe' | 'different';

/**
 * 몇 비트 다른가 → 사람이 읽는 판정. 열쇠만 낸다(말은 화면이 고른다 — 언어가 셋이다).
 *
 * 경계값은 실측이 아니라 **널리 쓰이는 값**이다(64비트 dHash 기준 ≤10 이 관례).
 * 그래서 「같다」가 아니라 「거의 같다」로 말한다 — 우리가 못 재 본 것을 잰 척하지 않는다.
 */
export function verdict(distance: number): Verdict {
  if (distance === 0) return 'same';
  if (distance <= 5) return 'likely';
  if (distance <= 10) return 'maybe';
  return 'different';
}

/** 64비트 중 몇 비트가 같은가 = 닮은 정도(%). 화면이 숫자 하나로 보여 줄 때 쓴다. */
export function similarity(distance: number, bits = HASH_BITS): number {
  return Math.round(((bits - distance) / bits) * 1000) / 10;
}
