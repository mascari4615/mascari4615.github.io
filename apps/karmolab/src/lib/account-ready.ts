/**
 * **계정 꾸러미를 기다렸다가 상태가 정해지면 부른다** — 한 곳 (2026-08-14)
 *
 * `js/account.js` 는 첫 화면 짐(41KB 천장)을 지키려고 **한가할 때 늦게** 실린다.
 * 그래서 화면이 그보다 먼저 열리면 `window.KarmoAccount` 가 아직 없다.
 *
 * 그때 「없으면 그냥 한 번 그리고 끝」으로 두면 화면이 **영영 그 모습으로 남는다**:
 * 「남이 만든 도구」는 목록을 요청조차 안 한 채 비어 있었고(실측: `kl/tools/user` 요청 0건),
 * 「흐름」도 같은 꼴이었다. 둘 다 로그인한 사람에게 로그인하라고 말하는 화면이 된다.
 *
 * 그래서 기다리는 방법을 **한 곳에** 둔다 — 복사본이 둘이면 한쪽만 고쳐진다.
 *
 * 쓰는 법:
 *   const off = onAccountSettled(() => 다시그리기());
 *   Toolbox.onDispose?.(off);
 *
 * 약속:
 *   · 상태가 「정해졌을 때」만 부른다 (`loading` 중에는 안 부른다)
 *   · **같은 사람으로 두 번 안 부른다** (핸들이 바뀔 때만)
 *   · 꾸러미가 끝내 안 오면(10초) **그래도 한 번은 부른다** — 멈춰 있는 것보다 낫다
 */
interface 계정상태 { loading?: boolean; account?: { handle?: string } | null }
interface 계정 { subscribe(fn: (s: 계정상태) => void): () => void }

export function onAccountSettled(draw: () => void): () => void {
  let 그린사람: string | null | undefined;
  let 풀기: (() => void) | null = null;
  let 타이머 = 0;

  const 붙이기 = (account: 계정): void => {
    풀기 = account.subscribe((state) => {
      if (state.loading) return;
      const key = state.account?.handle ?? null;
      if (그린사람 === key) return;
      그린사람 = key;
      draw();
    });
  };

  const 지금 = (window as unknown as { KarmoAccount?: 계정 }).KarmoAccount;
  if (지금) {
    붙이기(지금);
  } else {
    let 남은번 = 50; /* 200ms × 50 = 10초 */
    타이머 = window.setInterval(() => {
      const late = (window as unknown as { KarmoAccount?: 계정 }).KarmoAccount;
      if (!late) {
        if (--남은번 > 0) return;
        window.clearInterval(타이머);
        타이머 = 0;
        draw(); /* 끝내 안 오면 로그인 없이라도 그린다 */
        return;
      }
      window.clearInterval(타이머);
      타이머 = 0;
      붙이기(late);
    }, 200);
  }

  return () => {
    if (타이머) window.clearInterval(타이머);
    풀기?.();
  };
}
