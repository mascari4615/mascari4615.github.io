/**
 * **뜻으로 가까운 것 k 개** — 벡터만 받고, 자리 번호와 닮은 정도만 돌려준다.
 *
 * 부른 쪽의 자료 모양을 모른다(글이든 그림이든 상품이든). 그래서 문서 객체를 건드리지 않고
 * 번호로만 답한다 — 지도는 그 번호를 제 글에 붙이고, 다른 쓰임은 다르게 붙이면 된다.
 *
 * 셈: 길이를 1 로 맞춘 뒤의 내적 = 코사인. 한 줄로 늘어놓은 배열(`Float32Array`)에 담는다 —
 * 중첩 배열로 두면 읽는 데만 몇 배 걸린다. 상위 k 만 삽입 정렬로 남긴다(전부 정렬하면
 * n log n 이 n 번 돈다).
 */
export function nearest(vectors, k = 8) {
  const n = vectors.length;
  const idx = Array.from({ length: n }, () => []);
  const sim = Array.from({ length: n }, () => []);
  if (n < 2) return { idx, sim };
  const dim = vectors[0].length;
  const M = new Float32Array(n * dim);
  for (let i = 0; i < n; i += 1) {
    const v = vectors[i];
    let s = 0;
    for (let j = 0; j < dim; j += 1) s += v[j] * v[j];
    s = Math.sqrt(s) || 1;
    for (let j = 0; j < dim; j += 1) M[i * dim + j] = v[j] / s;
  }
  const K = Math.min(k, n - 1);
  for (let i = 0; i < n; i += 1) {
    const bs = new Float64Array(K).fill(-2);
    const bi = new Int32Array(K).fill(-1);
    for (let j = 0; j < n; j += 1) {
      if (j === i) continue;
      let dot = 0;
      const a = i * dim; const b = j * dim;
      for (let t = 0; t < dim; t += 1) dot += M[a + t] * M[b + t];
      if (dot <= bs[K - 1]) continue;
      let p = K - 1;
      while (p > 0 && bs[p - 1] < dot) { bs[p] = bs[p - 1]; bi[p] = bi[p - 1]; p -= 1; }
      bs[p] = dot; bi[p] = j;
    }
    idx[i] = [...bi].filter((x) => x >= 0);
    sim[i] = [...bs].slice(0, idx[i].length);
  }
  return { idx, sim };
}
