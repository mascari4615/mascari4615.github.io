/**
 * GitHub orphan 브랜치 부트스트랩 (TASK-KAR-CHARSTATE follow-up — 근본 self-heal)
 *
 * ★ 근본 버그 (2026-05-19 prod behavior 점검 확정, 정본 메모리
 *   `feedback_contents_api_cannot_create_branch`):
 *   heartbeat·char-state 둘 다 `Contents API GET ?ref=branch → 404=최초생성
 *   → PUT(+branch)` 패턴. **GitHub Contents API 는 *없는 브랜치 자체를
 *   생성하지 못한다*** — 파일 404 ≠ 브랜치 404. heartbeat 가 여태 동작한
 *   유일한 이유는 `yawnbot-heartbeat` 브랜치가 과거 수동으로 존재했기
 *   때문 (그 브랜치를 지우면 heartbeat 도 동일 파손 = 잠복 동일버그).
 *   char-state 는 신규라 브랜치가 없어 첫 PUT 이 영구 실패 → 2026-05-19
 *   `af1630b2` 수동 orphan ref 부트스트랩으로 임시 unblock 했으나, 수동
 *   시드는 fresh env / 브랜치 삭제 시 재발한다.
 *
 * 본 모듈 = 그 수동 부트스트랩의 코드화. heartbeat 의 수동 절차
 *   `git commit-tree $(git hash-object -t tree /dev/null)`
 *   `→ git push origin <sha>:refs/heads/<branch>`
 * 을 Git Data API 로 *동형* 재현 (평행 메커니즘 X — 같은 substrate:
 * empty-tree orphan root commit + ref 생성, 단일 writer = prod 봇).
 *
 * `git hash-object -t tree /dev/null` 의 결과 = 모든 git 저장소에서
 * 보편 상수인 빈 트리 SHA. GitHub Git Data API 도 이 SHA 를 인식하므로
 * `POST /git/commits { tree: <empty>, parents 생략 }` = orphan root commit.
 *
 * 순수 IO 만 — fetch 주입으로 단위 테스트 가능 (실 네트워크 무관).
 * 호출부는 Contents GET 이 404 일 때만 호출(스테디 경로 네트워크 무영향).
 */

const GITHUB_API = 'https://api.github.com';

/** `git hash-object -t tree /dev/null` — 모든 git 저장소 보편 빈 트리 SHA. */
export const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export interface OrphanBranchConfig {
  token: string;
  /** `owner/repo`. */
  repo: string;
  /** orphan 브랜치명 (단일 세그먼트 가정 — slash 없음). */
  branch: string;
}

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'yawnbot-orphan-branch',
  };
}

/**
 * orphan 브랜치 실재를 보장. 없으면 empty-tree root commit + ref 로 생성.
 *
 * 1) `GET /git/ref/heads/<branch>` — 200=존재(no-op) / 404=부재 / 그 외=throw.
 *    (Contents 404 와 달리 ref 엔드포인트 404 는 *브랜치 부재* 만 의미 —
 *     모호성 0 = 본 버그의 정확한 회피점.)
 * 2) `POST /git/commits { message, tree: EMPTY_TREE_SHA }` — parents 생략
 *    = orphan root commit (수동 `git commit-tree` 동형).
 * 3) `POST /git/refs { ref: refs/heads/<branch>, sha }`.
 *    422 = 동시 tick race 로 이미 생성 → 단일 writer 불변식상 드묾이나
 *    방어적으로 'exists' 취급(재발 alert 노이즈 방지).
 *
 * 반환 'exists' | 'created'. 실패는 throw (호출부가 상태 전이로 환산).
 */
export async function ensureOrphanBranch(
  cfg: OrphanBranchConfig,
  deps: {
    fetchImpl: typeof fetch;
    timeoutMs: number;
    logger?: Pick<Console, 'log' | 'warn' | 'error'>;
  },
): Promise<'exists' | 'created'> {
  const { fetchImpl, timeoutMs } = deps;
  const headers = ghHeaders(cfg.token);
  const apiRepo = `${GITHUB_API}/repos/${cfg.repo}`;

  const withTimeout = async (
    run: (signal: AbortSignal) => Promise<Response>,
  ): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await run(controller.signal);
    } finally {
      clearTimeout(timer);
    }
  };

  // 1) ref 존재 확인 (모호성 없는 브랜치-부재 판정).
  const refRes = await withTimeout((signal) =>
    fetchImpl(`${apiRepo}/git/ref/heads/${cfg.branch}`, { method: 'GET', headers, signal }),
  );
  if (refRes.ok) return 'exists';
  if (refRes.status !== 404) {
    throw new Error(`orphan 브랜치 ref 조회 실패 (HTTP ${refRes.status})`);
  }

  // 2) empty-tree orphan root commit (parents 생략).
  const commitRes = await withTimeout((signal) =>
    fetchImpl(`${apiRepo}/git/commits`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        message: `chore: bootstrap orphan branch ${cfg.branch}`,
        tree: EMPTY_TREE_SHA,
      }),
    }),
  );
  if (!commitRes.ok) {
    throw new Error(`orphan commit 생성 실패 (HTTP ${commitRes.status})`);
  }
  const commitSha = ((await commitRes.json()) as { sha?: string }).sha;
  if (!commitSha) {
    throw new Error('orphan commit 응답에 sha 없음');
  }

  // 3) ref 생성.
  const createRes = await withTimeout((signal) =>
    fetchImpl(`${apiRepo}/git/refs`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ ref: `refs/heads/${cfg.branch}`, sha: commitSha }),
    }),
  );
  if (createRes.ok) {
    deps.logger?.log(`[OrphanBranch] '${cfg.branch}' 부트스트랩 완료 (orphan ${commitSha.slice(0, 8)})`);
    return 'created';
  }
  if (createRes.status === 422) {
    // 동시 tick race — 다른 tick 이 먼저 만듦. 단일 writer 불변식상 드묾.
    deps.logger?.log(`[OrphanBranch] '${cfg.branch}' 이미 존재 (race, 422) — 진행`);
    return 'exists';
  }
  throw new Error(`orphan 브랜치 ref 생성 실패 (HTTP ${createRes.status})`);
}
