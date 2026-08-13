/**
 * 가장 좋은 수 고르기 — **동점이면 그중 아무거나** (TASK-KL-264 G1)
 *
 * 저울이 잡아낸 것: 오목·사목·리버시·여우와사냥개·미니장기에서 봇끼리 두면 **1번 자리가
 * 100% 이긴다.** 원인은 수읽기의 세기가 아니라 이 한 줄이었다 —
 *
 *     if (v > bestScore) { bestScore = v; best = c; }
 *
 * `>` 는 **같은 점수면 먼저 훑은 칸**을 남긴다. 칸을 0번부터 훑으므로 봇은 늘 왼쪽 위를
 * 고르고, 두 봇이 같은 함수를 쓰니 후수는 매번 똑같은 진 자리로 끌려간다. 판이 씨앗마다
 * 달라도 결과는 늘 같았다(그래서 「밸런스」로 보였다).
 *
 * 봇에게는 왼쪽 위를 좋아할 이유가 없다. 같은 값이면 **고르게 아무거나** 고른다.
 * 씨앗에서 나온 난수라 판은 여전히 되살릴 수 있다.
 *
 * 저수지 뽑기(reservoir) — 목록을 두 번 훑지 않고 한 번에 고른다. 동점이 k개면 각각 1/k.
 */
export function bestOf<T>(items: readonly T[], score: (item: T) => number, rng: () => number): T | undefined {
  let best: T | undefined;
  let bestV = -Infinity;
  let tied = 0;
  for (const item of items) {
    const v = score(item);
    if (v > bestV) {
      bestV = v;
      best = item;
      tied = 1;
    } else if (v === bestV) {
      tied += 1;
      /* k 번째 동점은 1/k 확률로 자리를 뺏는다 — 그래야 k 개가 고르게 된다. */
      if (rng() * tied < 1) best = item;
    }
  }
  return best;
}
