/**
 * 되풀이 시계. **보이는 동안만 돈다**.
 *
 * 왜: 앰비언트 화면은 켜 두는 것이 전제다. 그런데 `setInterval` 은 탭을 덮어도 (느려질 뿐)
 * 계속 돈다. 사용자는 이 사이트 켜두면 노트북이 뜨겁다로만 느낀다. 오류도 안 뜨고
 * 화면도 멀쩡해서 아무도 못 찾는다.
 *
 * `requestAnimationFrame` 은 브라우저가 숨은 탭에서 스스로 멈춰 주지만 `setInterval` 은 아니다.
 * 그래서 숨으면 끄고, 돌아오면 다시 건다를 **한 자리**에 둔다. 위젯마다 적으면 위젯마다
 * 다르게 잊는다(`audit:hidden-tab` 이 세 보니 30곳 중 21곳이 아예 안 보고 있었다).
 *
 * ```ts
 * const stop = intervalWhileVisible(update, 1000);
 * Toolbox.onDispose?.(stop);
 * ```
 */
export function intervalWhileVisible(fn: () => void, ms: number): () => void {
  let timer: number | null = null;

  const start = (): void => {
    if (timer !== null) return;
    timer = window.setInterval(fn, ms);
  };
  const stopTimer = (): void => {
    if (timer === null) return;
    window.clearInterval(timer);
    timer = null;
  };
  const onVisibility = (): void => {
    if (document.hidden) {
      stopTimer();
      return;
    }
    // 돌아온 순간 **한 번 바로** 돌린다. 안 그러면 덮어 둔 사이 멈춰 있던 화면이
    // 다음 tick(최대 ms) 까지 옛 값을 그대로 보여 준다. 시계라면 그게 곧 틀린 시각이다.
    fn();
    start();
  };

  document.addEventListener('visibilitychange', onVisibility);
  if (!document.hidden) start();

  return (): void => {
    document.removeEventListener('visibilitychange', onVisibility);
    stopTimer();
  };
}
