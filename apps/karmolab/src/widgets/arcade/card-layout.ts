/** 3D 카드 상에서 긴 줄과 첫 배분 시간을 정하는 순수 배치 함수. */

export function spreadRow(n: number, itemW: number, tight: boolean, tableW: number): number[] {
  if (n <= 0) return [];
  const gap = tight
    ? (n <= 4 ? itemW * 0.44 : (itemW * 1.9) / n)
    : n <= 5
      ? itemW * 1.24
      : Math.min(itemW * 1.1, (tableW * 0.78) / Math.max(1, n - 1));
  const start = -((n - 1) * gap) / 2;
  return Array.from({ length: n }, (_, i) => start + i * gap);
}

export function wrappedColumns(count: number, wrap?: number): number {
  return Math.min(count, Math.max(1, wrap ?? count));
}

/** 첫 판도 카드 수와 무관하게 마지막 카드가 1초 안에 출발한다. */
export function dealStaggerMs(total: number): number {
  return Math.min(130, 1000 / Math.max(1, total - 1));
}
