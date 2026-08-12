/**
 * lib/graph/canvas-raf.ts — **한 프레임에 한 번만** (2026-08-12).
 *
 * 왜: 카드를 끄는 동안 포인터 사건은 초당 100~1000번 온다(고주사율 마우스·펜). 그때마다 선
 * 전부와 작은 판을 다시 그리면 그림이 커질수록 손이 무거워진다 — 실측 2026-08-12, 카드 600장:
 * 한 걸음에 107ms(초당 9프레임). 화면은 어차피 프레임마다 한 번만 바뀌므로, 무거운 다시
 * 그리기는 **다음 프레임에 한 번**으로 모은다.
 *
 * 가벼운 것(끄는 카드 자체의 자리)은 모으지 않는다 — 그건 손끝을 따라가야 한다.
 */
export function frameCoalesced(fn: () => void): () => void {
  let pending = 0;
  return () => {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      fn();
    });
  };
}
