/**
 * 「이번 판에 **어떤 도구를 열어 봐야 하나**」를 가르는 셈 (2026-08-17).
 *
 * 왜 따로 있나: 도구 234개를 다 열면 8분이고, 그게 매 빌드에 붙으면 배포가 그만큼 늦는다.
 * 그래서 바뀐 파일로 범위를 좁히는데 — **이 셈이 틀리면 죽은 도구를 지나친다.**
 * 브라우저·git 을 부르는 자리에 박혀 있으면 시험을 못 붙이므로 셈만 떼어 둔다.
 *
 * 규율: 모르면 **넓게** 본다(null = 전부). 좁히는 쪽이 틀리면 못 잡고 지나가기 때문이다.
 */

/** 껍데기를 건드렸으면 어느 도구든 죽을 수 있다 — 그때는 전부 본다. */
const SHELL_PATHS = /apps[/]karmolab[/](index[.]html|src[/]toolbox[.]ts|src[/]lib[/]|src[/]widgets-lazy-meta[.]ts)/;

/**
 * @param {string[]|null} changedFiles - 이번 판에서 바뀐 경로들. null = 못 물어봤다.
 * @returns {string[]|null} 열어 볼 도구 이름들. null = 전부 열어야 한다.
 */
export function toolsToOpen(changedFiles) {
  if (!Array.isArray(changedFiles)) return null;          // 못 물어봤으면 좁히지 않는다
  if (changedFiles.some((f) => SHELL_PATHS.test(f))) return null; // 껍데기가 바뀌었으면 전부
  const toolNames = new Set();
  for (const f of changedFiles) {
    const m = /apps[/]karmolab[/]src[/]widgets[/]([a-z0-9-]+)[/]/.exec(String(f));
    if (m) toolNames.add(m[1]);
  }
  const picked = [...toolNames];
  /* ★ **아무 신호도 없으면 좁히지 않는다** (2026-08-17). CI 는 갓 꺼낸 체크아웃이라
     `origin/main...HEAD` 가 비어 있다 — 그걸 「손댄 것 0개」로 읽으면 이 검사가 **CI 에서
     한 번도 안 돈다**(못 돌림으로만 끝난다). 빈 신호는 「없다」가 아니라 「모른다」다. */
  if (picked.length === 0 && changedFiles.length === 0) return null;
  return picked;
}
