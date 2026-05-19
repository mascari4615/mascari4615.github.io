/**
 * GitHub orphan 브랜치 자동 부트스트랩 (TASK-KAR-CHARSTATE follow-up).
 *
 * ## 근본 (prod 버그, 2026-05-19 실증)
 *
 * heartbeat / character-state 둘 다 「Contents API `GET ?ref=branch` →
 * 404 = 최초 생성 → `PUT(+branch)`」 패턴이다. 그런데 **GitHub Contents
 * API 는 *존재하지 않는 브랜치 자체를 생성하지 못한다*** — 파일 404 ≠
 * 브랜치 404. 그 둘이 prod 에서 동작한 건 `yawnbot-heartbeat` /
 * `yawnbot-character-state` 브랜치가 *과거에 수동 시드* 되어 이미
 * 존재했기 때문이다 (charstate 는 `af1630b2` 에서 로컬 git
 * `git commit-tree $(git hash-object -t tree /dev/null)` 로 수동 부트
 * 스트랩). 즉 두 서비스 모두 **그 orphan 브랜치가 삭제되거나 fresh
 * env(클린 클론) 이면 영영 파손** 되는 잠복 동일 버그를 안고 있었다.
 * 정본 메모리 = `feedback_contents_api_cannot_create_branch`.
 *
 * ## 해결 — Git Data API 로 self-heal
 *
 * Contents GET 이 404 일 때 (= 파일 부재, 브랜치 부재 가능성 포함),
 * PUT 직전에 `ensureOrphanBranch` 를 1회 호출한다:
 *
 *  1. `GET /git/ref/heads/<branch>` — 브랜치 ref 실재 확인.
 *     - 200 → 브랜치 존재(파일만 없음). no-op, 'exists' 반환.
 *     - 404 → 브랜치 부재. 아래 부트스트랩.
 *     - 그 외 → throw (호출부가 상태 전이로 환산).
 *  2. `POST /git/commits` `{ message, tree: EMPTY_TREE_SHA, parents: [] }`
 *     → 부모 없는 orphan 커밋 (수동 `af1630b2` 와 *동형* — empty tree).
 *  3. `POST /git/refs` `{ ref: 'refs/heads/<branch>', sha: <commit> }`
 *     → 진짜 orphan 브랜치 생성. 422(이미 존재 = 단일writer 위반 아닌
 *       경합/재시도) → 'exists' 로 흡수.
 *
 * 그 후 호출부가 기존 sha-없는 Contents PUT → *존재하는* 브랜치에
 * 첫 파일 생성. **steady-state 비용 0**: 파일이 한 번이라도 PUT 되면
 * 이후 Contents GET 은 200 → 본 함수는 호출조차 안 됨. 추가 ref-GET 은
 * 오직 파일-404 경로(클린 env / 브랜치 삭제 직후)에서만 1회 발생.
 *
 * **EMPTY_TREE_SHA** = git 의 보편 빈 트리 객체(`git hash-object -t tree
 * /dev/null`). 모든 git 레포에 개념적으로 존재하며 GitHub git DB 도
 * 인식. 수동 prod 부트스트랩(`af1630b2`)이 만든 것과 정확히 같은 값 →
 * codepath 결정성 + 검증 가능(트리 생성 round-trip 불요, POST 1회 절감).
 *
 * 순수 IO 함수 — fetch/timeout 주입으로 실 네트워크 없이 단위 테스트
 * (heartbeat.test / character-state-snapshot.test 패턴 정합).
 *
 * 평행 정의 금지(미션 §2.4): heartbeat·charstate 가 *동일* 부트스트랩을
 * 각자 복제하지 않고 본 단일 정본 모듈을 공유한다.
 */

const GITHUB_API = 'https://api.github.com';

/**
 * git 빈 트리 객체 SHA-1 (`git hash-object -t tree /dev/null`).
 * 모든 git 레포 불변 상수 — GitHub git DB 인식. 수동 prod 부트스트랩
 * (`af1630b2`)이 생성한 것과 동일 → API 경로의 결정적 등가물.
 */
export const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export interface OrphanBranchConfig {
  /** memo write 토큰 (heartbeat/charstate 와 동일 PAT). */
  token: string;
  /** `owner/repo`. */
  repo: string;
  /** 보장할 orphan 브랜치 이름 (refs/heads/ 접두 없이). */
  branch: string;
}

export type EnsureOrphanBranchResult = 'exists' | 'created';

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'yawnbot-orphan-bootstrap',
  };
}

/**
 * orphan 브랜치 ref 가 존재함을 보장 (없으면 empty-tree orphan 커밋으로
 * 부트스트랩). 호출부는 Contents GET 404 경로에서만 부른다 (steady-state
 * 비용 0). 실패는 throw — 호출부의 기존 상태 전이/alert 로 환산된다.
 *
 * @returns 'exists' = 이미 있었음(또는 경합으로 이미 생성됨) /
 *          'created' = 본 호출이 생성.
 */
export async function ensureOrphanBranch(
  cfg: OrphanBranchConfig,
  deps: {
    fetchImpl: typeof fetch;
    timeoutMs: number;
    /** 부트스트랩 orphan 커밋 메시지. */
    message?: string;
    /** 로그 sink (테스트 주입). 기본 console. */
    logger?: Pick<Console, 'log' | 'warn' | 'error'>;
    /** 로그 접두 (예 'Heartbeat' / 'CharState'). */
    label?: string;
  },
): Promise<EnsureOrphanBranchResult> {
  const { fetchImpl, timeoutMs } = deps;
  const logger = deps.logger ?? console;
  const label = deps.label ?? 'OrphanBranch';
  const headers = ghHeaders(cfg.token);
  const repoBase = `${GITHUB_API}/repos/${cfg.repo}`;

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

  // 1) ref 실재 확인. heads/<branch> 단일 ref 엔드포인트 (정확 매칭).
  const refPath = `heads/${cfg.branch}`;
  const refRes = await withTimeout((signal) =>
    fetchImpl(`${repoBase}/git/ref/${encodeURIComponent(refPath).replace(/%2F/g, '/')}`, {
      method: 'GET',
      headers,
      signal,
    }),
  );
  if (refRes.ok) {
    return 'exists';
  }
  if (refRes.status !== 404) {
    throw new Error(`orphan 브랜치 ref 조회 실패 (HTTP ${refRes.status})`);
  }

  // 2) 부모 없는 empty-tree orphan 커밋 (수동 af1630b2 동형).
  logger.warn(
    `[${label}] orphan 브랜치 '${cfg.branch}' 부재 — Git Data API 로 부트스트랩`,
  );
  const message =
    deps.message ?? `chore: bootstrap orphan branch ${cfg.branch} (empty tree)`;
  const commitRes = await withTimeout((signal) =>
    fetchImpl(`${repoBase}/git/commits`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ message, tree: EMPTY_TREE_SHA, parents: [] }),
    }),
  );
  if (!commitRes.ok) {
    throw new Error(`orphan 커밋 생성 실패 (HTTP ${commitRes.status})`);
  }
  const commitBody = (await commitRes.json()) as { sha?: string };
  const commitSha = commitBody.sha;
  if (!commitSha) {
    throw new Error('orphan 커밋 생성 응답에 sha 없음');
  }

  // 3) ref 생성 → 진짜 orphan 브랜치. 422 = 경합 등으로 이미 존재.
  const createRefRes = await withTimeout((signal) =>
    fetchImpl(`${repoBase}/git/refs`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ ref: `refs/heads/${cfg.branch}`, sha: commitSha }),
    }),
  );
  if (createRefRes.ok) {
    logger.log(`[${label}] orphan 브랜치 '${cfg.branch}' 부트스트랩 완료`);
    return 'created';
  }
  if (createRefRes.status === 422) {
    // 이미 존재 (경합/재시도) — 단일 writer 불변식 하에선 드물지만 멱등.
    logger.warn(
      `[${label}] orphan 브랜치 '${cfg.branch}' ref 생성 422 — 이미 존재로 흡수`,
    );
    return 'exists';
  }
  throw new Error(`orphan 브랜치 ref 생성 실패 (HTTP ${createRefRes.status})`);
}
