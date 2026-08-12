/**
 * 씨앗 난수 (TASK-KL-242)
 *
 * `Math.random` 을 쓰면 같은 방에 있는 두 사람이 다른 문제를 본다. 씨앗 하나에서 뽑으면
 * 같은 판이 되고, 터진 판을 씨앗만 적어 두고 그대로 되살릴 수 있다.
 *
 * mulberry32 — 32비트 하나로 상태가 끝나서 그물망에 씨앗만 흘려보내면 된다.
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function (): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 방 이름 같은 글자에서 씨앗을 만든다 — 같은 방 = 같은 판. */
export function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pick<T>(rng: () => number, xs: readonly T[]): T {
  return xs[Math.floor(rng() * xs.length)];
}

export function shuffle<T>(rng: () => number, xs: readonly T[]): T[] {
  const out = xs.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
