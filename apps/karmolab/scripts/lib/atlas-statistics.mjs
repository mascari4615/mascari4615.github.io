// 좌표 중앙값. 짝수 표본은 가운데 두 값의 평균
export function coordinateMedian(values) {
  if (!values.length) throw new Error('중앙값 표본 부재');
  const sorted = values.toSorted((a, b) => a - b);
  const h = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[h] : (sorted[h - 1] + sorted[h]) / 2;
}

export function convergenceOf(at) {
  const valid = Array.isArray(at) && at.length >= 2 && at.every((p) => Number.isFinite(p.gap) && p.gap >= 0);
  if (!valid || !(at[0].gap > 0)) return { valid: false, drop: null, monotone: false, ok: false, minDrop: 0.5 };
  const drop = 1 - at.at(-1).gap / at[0].gap;
  const monotone = at.every((p, i) => !i || p.gap <= at[i - 1].gap + 1e-9);
  return { valid: true, drop, monotone, ok: monotone && drop >= 0.5, minDrop: 0.5 };
}
