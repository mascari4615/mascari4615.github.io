/**
 * GitHub orphan 브랜치 자동 부트스트랩 (TASK-KAR-CHARSTATE follow-up).
 *
 * 근본 (prod 버그, 2026-05-19 실증): heartbeat·character-state-snapshot
 * 둘 다 `GET contents?ref=branch → 404=최초생성 → PUT(+branch)` 패턴인데,
 * **GitHub Contents API 는 *없는 브랜치 자체를 생성하지 못한다*** — 파일
 * 404 ≠ 브랜치 404. heartbeat 의 `yawnbot-heartbeat` 는 과거에 이미
 * 존재해 PUT 만 통했을 뿐(둘 다 ref 부트스트랩 코드 부재 = heartbeat 도
 * 잠복 동일버그: 그 브랜치 삭제 시 동일 파손). 수동으로 empty-tree orphan
 * ref 를 1회 시드(`af1630b2`, 2026-05-19)해 unblock 했으나, fresh
 * env/브랜치 삭제 시 재발 — 자가 self-heal 필요.
 *
 * 본 모듈 = 그 수동 시드의 코드화. Contents API PUT 직전, 대상 orphan
 * 브랜치 ref 존재를 보장한다(없으면 universal empty-tree 로 orphan
 * commit + ref 생성). 수동 절차
 *   `git commit-tree $(git hash-object -t tree /dev/null)`
 *   `git push origin <sha>:refs/heads/<branch>`
 * 와 정확히 동형 (진짜 orphan, 워킹트리 무손상, 단일-writer 불변식 보존).
 *
 * 호출 시점 = Contents GET 이 404 일 때만 (브랜치 존재+파일 존재 정상
 * 경로엔 추가 IO 0 — 최초 1회 또는 브랜치 부재 시에만 ref 확인/생성).
 *
 * 순수 IO 함수(fetch 주입) — heartbeat.test 동형으로 단위 테스트 가능.
 *
 * 정본 메모리: feedback_contents_api_cannot_create_branch.
 */

const GITHUB_API = 'https://api.github.com';

/**
 * git 의 보편 empty-tree SHA-1. 모든 git 레포 객체 모델에 내재하며
 * GitHub git database 가 인식한다(수동 부트스트랩의
 * `git hash-object -t tree /dev/null` 결과와 동일 값). 이 SHA 를 tree
 * 로 가리키는 parents:[] commit = 진짜 orphan 의 빈 루트.
 */
export const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export interface OrphanBranchConfig {
  /** GitHub write 토큰 (repo:contents + git refs). */
  token: string;
  /** `owner/repo`. */
  repo: string;
  /** 보장할 orphan 브랜치명 (refs/heads/ 접두 없이). */
  branch: string;
}

export interface OrphanBranchDeps {
  fetchImpl: typeof fetch;
  timeoutMs: number;
  /** UA 헤더 (호출 서비스 식별 — heartbeat/charstate 각자). */
  userAgent: string;
  /** 로그 sink. 기본 console (부트스트랩 실행 시에만 1줄). */
  logger?: Pick<Console, 'log' | 'warn' | 'error'>;
}

function ghHeaders(token: string, userAgent: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': userAgent,
  };
}

/**
 * 대상 orphan 브랜치 ref 가 존재하도록 보장.
 *  1) `GET /git/ref/heads/<branch>` — 200 이면 이미 존재(no-op, false).
 *  2) 404 면 부재 → empty-tree orphan commit 생성 →
 *     `POST /git/refs` 로 `refs/heads/<branch>` 생성.
 *  3) ref 생성이 422(이미 존재 = 레이스/타 writer)면 양성 처리
 *     (목표 = 브랜치 존재이며 이미 달성 — 단일-writer 불변식 하에선
 *     사실상 도달 불가하나 멱등성 방어).
 *
 * 반환 = 새로 부트스트랩했으면 true, 이미 존재했으면 false.
 * 실패는 throw (호출부가 Contents 흐름의 실패와 동일하게 상태전이 환산).
 */
export async function ensureOrphanBranch(
  cfg: OrphanBranchConfig,
  deps: OrphanBranchDeps,
): Promise<boolean> {
  const { fetchImpl, timeoutMs, userAgent } = deps;
  const logger = deps.logger ?? console;
  const headers = ghHeaders(cfg.token, userAgent);
  const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };

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

  // 1) 브랜치 ref 존재 확인 (파일 404 ≠ 브랜치 404 의 명시적 분기).
  const refUrl = `${GITHUB_API}/repos/${cfg.repo}/git/ref/heads/${cfg.branch
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
  const refRes = await withTimeout((signal) =>
    fetchImpl(refUrl, { method: 'GET', headers, signal }),
  );
  if (refRes.ok) return false; // 이미 존재 — Contents PUT 이 그대로 통함
  if (refRes.status !== 404) {
    throw new Error(`orphan 브랜치 ref 조회 실패 (HTTP ${refRes.status})`);
  }

  // 2) 부재 → universal empty-tree 로 orphan commit 생성.
  const commitRes = await withTimeout((signal) =>
    fetchImpl(`${GITHUB_API}/repos/${cfg.repo}/git/commits`, {
      method: 'POST',
      headers: jsonHeaders,
      signal,
      body: JSON.stringify({
        message: `chore: bootstrap orphan branch ${cfg.branch}`,
        tree: EMPTY_TREE_SHA,
        parents: [],
      }),
    }),
  );
  if (!commitRes.ok) {
    throw new Error(`orphan 브랜치 부트스트랩 commit 실패 (HTTP ${commitRes.status})`);
  }
  const commitBody = (await commitRes.json()) as { sha?: string };
  const commitSha = commitBody.sha;
  if (!commitSha) {
    throw new Error('orphan 브랜치 부트스트랩 commit sha 없음');
  }

  // 3) refs/heads/<branch> 생성.
  const createRefRes = await withTimeout((signal) =>
    fetchImpl(`${GITHUB_API}/repos/${cfg.repo}/git/refs`, {
      method: 'POST',
      headers: jsonHeaders,
      signal,
      body: JSON.stringify({ ref: `refs/heads/${cfg.branch}`, sha: commitSha }),
    }),
  );
  if (!createRefRes.ok && createRefRes.status !== 422) {
    throw new Error(`orphan 브랜치 ref 생성 실패 (HTTP ${createRefRes.status})`);
  }
  logger.log(
    `[OrphanBranch] '${cfg.branch}' 부트스트랩 완료 (empty-tree orphan, ${cfg.repo})`,
  );
  return true;
}
