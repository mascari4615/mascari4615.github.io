/**
 * **모두가 공유하는 쏠림을 빼낸다** (평균 빼기 + 다시 정규화).
 *
 * 왜: 뜻이 아니라 **글 길이**로 뭉치고 있었다. 실측 — 벡터가 거의 다 한 방향으로 쏠려 있고
 * (평균 벡터 길이 0.832), 그 쏠림이 글 길이와 상관 0.526. 그래서 짧은 글이 서로 완전 다른
 * 주제인데도 한 덩어리가 됐다.
 *
 * 빼면 쏠림은 거의 사라진다(0.832 → 0.037). **다만 절반만 푼다** — 짧은 글끼리 더 닮는
 * 성질이 완전히 없어지진 않는다. 그러니 넣고 끝내지 말고 자로 전후를 재라.
 *
 * ⚠ **한 번으로 0 이 되지는 않는다.** 빼고 나서 길이를 다시 1 로 맞추는데, 그 재정규화가
 * 새 평균을 만든다 (실측: 0.7181 → 0.0708 → 한 번 더 빼면 0.0086). 그래도 **한 번만 뺀다** —
 * 두 번째부터 줄어드는 양이 뜻을 바꿀 만큼이 아니고, 「0 까지 민다」는 목표 자체가 근거 없다.
 *
 * 표본이 적으면(20 미만) 평균이 곧 그 표본이라 빼면 뜻까지 지운다 — 그때는 그대로 둔다.
 */
export function removeSharedBias(vectors, { min = 20 } = {}) {
  const ok = vectors.filter(Boolean);
  if (ok.length < min) return { vectors, before: null, applied: false, mean: null };
  const dim = ok[0].length;
  const mean = new Float64Array(dim);
  for (const v of ok) for (let i = 0; i < dim; i += 1) mean[i] += v[i] / ok.length;
  const before = Math.sqrt(mean.reduce((s, x) => s + x * x, 0));
  const out = vectors.map((v) => {
    if (!v) return v;
    const w = v.map((x, i) => x - mean[i]);
    const n = Math.sqrt(w.reduce((s, x) => s + x * x, 0)) || 1;
    return w.map((x) => Number((x / n).toFixed(6)));
  });
  return { vectors: out, before, applied: true, mean: Array.from(mean, (x) => Number(x.toFixed(6))) };
}

/**
 * **나중에 온 벡터를 같은 공간으로** 옮긴다.
 *
 * 쏠림을 뺀 판에서 고른 문턱을, 나중에 원 벡터로 잰 값과 견주면 **다른 공간을 견주는** 것이다
 * (원 벡터 쪽 닮음이 통째로 부풀어 있다 — 그래서 남남도 0.9 를 넘겨 버린다. 2026-08-23 실측).
 * 그래서 평균을 산출물에 실어 보내고, 자·화면이 새 벡터를 이 손으로 옮겨 재게 한다.
 */
export function toBiasedSpace(vectors, mean) {
  if (!mean) return vectors;
  return vectors.map((v) => {
    if (!v) return v;
    const w = v.map((x, i) => x - mean[i]);
    const n = Math.sqrt(w.reduce((s, x) => s + x * x, 0)) || 1;
    return w.map((x) => Number((x / n).toFixed(6)));
  });
}
