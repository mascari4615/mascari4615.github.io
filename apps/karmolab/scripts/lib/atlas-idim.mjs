// 같은 이웃 거리에서 나온 무한 추정치와 측정 누락의 구별
export function mleEstimate(near, k) {
  let sum = 0; let count = 0; let total = 0; let samples = 0; let singular = 0;
  for (const row of near) {
    const tk = row[k - 1];
    if (!(tk > 0) || !Number.isFinite(tk)) continue;
    let logs = 0; let used = 0;
    for (let j = 0; j < k - 1; j += 1) {
      const tj = row[j];
      if (!(tj > 0) || !Number.isFinite(tj)) continue;
      logs += Math.log(tk / tj); used += 1;
    }
    if (!used) continue;
    sum += logs; count += used; samples += 1;
    if (logs === 0) singular += 1;
    total += used / logs;
  }
  return { corrected: count ? count / sum : 0, uncorrected: samples ? total / samples : 0, samples, singular };
}

export const mleId = (near, k, inv = true) => {
  const result = mleEstimate(near, k);
  return inv ? result.corrected : result.uncorrected;
};

export function naiveId(near, k) {
  const r = mleEstimate(near, k);
  const infinite = r.uncorrected === Infinity && r.singular > 0;
  return { naive: Number.isFinite(r.uncorrected) && r.samples ? Number(r.uncorrected.toFixed(2)) : null,
    naiveState: !r.samples ? 'unavailable' : infinite ? 'infinite' : Number.isFinite(r.uncorrected) ? 'finite' : 'invalid',
    naiveSamples: r.samples, naiveSingular: r.singular };
}
