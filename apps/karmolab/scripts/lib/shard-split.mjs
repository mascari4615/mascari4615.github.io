/**
 * 검사 목록을 **시간으로** 조각내는 자 (2026-08-16).
 *
 * 왜 따로 있나: 이 셈이 틀리면 조각 하나가 제한 시간에 걸려 **통째로 취소**되고, 그 조각의
 * 검사 스무 개는 판정이 아예 안 나온다. 실제로 그날 그렇게 됐다. 표에 없던 검사 하나를
 * 중앙값(13초)으로 쳤는데 그게 하필 **955초짜리**였다.
 * 셈만 따로 떼어 두면 시험을 붙일 수 있다(`shard-split.test.mjs`). 밖에 안 닿는다.
 */

/** 표에 없는 검사에 매길 무게. **위쪽 값**(90퍼센타일). 모르는 것은 무겁다고 친다. */
export function unknownWeight(measuredSeconds) {
  const sortedValues = Object.values(measuredSeconds).sort((a, b) => a - b);
  return sortedValues.length ? sortedValues[Math.floor(sortedValues.length * 0.9)] : 60;
}

/**
 * 무거운 것부터 가장 한가한 바구니에 담는다(LPT). 바구니마다 `{ 합, 것 }`.
 * `이름` 은 검사에서 이름을 꺼내는 함수. 검사 모양에 안 묶이게.
 */
export function splitIntoShards(gates, shardCount, measuredSeconds, nameOf = (c) => c.name) {
  const fallbackWeight = unknownWeight(measuredSeconds);
  const weightOf = (c) => measuredSeconds[nameOf(c)] ?? fallbackWeight;
  const buckets = Array.from({ length: shardCount }, () => ({ sum: 0, items: [] }));
  for (const c of [...gates].sort((a, b) => weightOf(b) - weightOf(a))) {
    const lightest = buckets.reduce((a, b) => (b.sum < a.sum ? b : a));
    lightest.items.push(c);
    lightest.sum += weightOf(c);
  }
  return buckets;
}
