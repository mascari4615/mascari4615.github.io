/**
 * 블로그 서비스워커가 우리 주소를 캐시에서 빼 두었는지 읽는다 (TASK-KAR-202).
 *
 * 루트 Chirpy 서비스워커는 **cache-first** 다 — 한 번 담은 주소는 새로 안 받아 온다.
 * 우리 페이지가 거기 걸리면 **어제 문제가 계속 나온다.** 화면은 멀쩡해 보여서 아무도 못 알아챈다.
 *
 * 읽는 일만 여기 둔다 — 그래야 진짜 설정 파일을 건드리지 않고 시험할 수 있다.
 */

/** `pwa.cache.deny_paths` 에 든 경로들. 주석과 따옴표는 걷어낸다. */
export function deniedPaths(configText) {
  const block = String(configText).match(/deny_paths:\n((?:[ \t]*(?:#.*)?\n|[ \t]*-[ \t]*.*\n)*)/)?.[1] ?? '';
  return [...block.matchAll(/^\s*-\s*["']?([^"'\s#]+)/gm)].map((m) => m[1]);
}

export function assertDenied(configText, base) {
  const denied = deniedPaths(configText);
  if (denied.includes(base)) return;
  throw new Error(
    `블로그 서비스워커가 ${base} 를 캐시에 담는다 — 방문자에게 어제 문제가 계속 나온다. ` +
      `apps/blog/_config.yml 의 pwa.cache.deny_paths 에 "${base}" 를 넣어라. (지금 든 것: ${denied.join(', ') || '없음'})`,
  );
}
