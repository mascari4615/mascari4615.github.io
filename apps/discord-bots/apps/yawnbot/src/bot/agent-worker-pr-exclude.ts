/**
 * agent-worker-pr-exclude — 워커가 *이미 Draft PR 가 열려있는* TASK 를
 * 재선택하지 않도록 차단 (TASK-KAR-018-X prod 선결, status-drift 회피).
 *
 * 근본 (dev 관측 2026-05-17, kl-worker→TASK-KL-053 재선택 사고):
 *   `sync-task-status.mjs scanCommits` 가 `git log`(--all X) = *master 만*
 *   스캔 → autopilot 산출이 unmerged feature 브랜치/Draft PR 에 있으면
 *   status 영영 `ready` (PR merge 전 drift). → 워커가 *이미 끝난 일에 비용*.
 *
 * fix = scan IO 셸이 후보 회수 후 `gh pr list --state open` 의 title /
 *       headRefName 에서 TASK id 추출 → excludeIds 로 필터. 순수 selectCandidates
 *       불변(여전히 결정적, excludeIds 만 확장). board 제외와 동형 best-effort.
 *
 * gh 부재·timeout·비-repo = graceful (빈 Set 반환 = 워커 평소처럼 스캔 진행).
 */
import { execSync } from 'child_process';
import fs from 'fs';

/**
 * TASK id 패턴. PR 제목(`feat: TASK-WM-119 ...`)과 worker 브랜치명
 * (`feature/autopilot-task-kl-053-2605171306` — 마지막 10자리 = ts)
 * 모두서 매치. 대소문자 무관 → 항상 대문자 normalize.
 *
 * 형태:
 *   - `TASK-<PREFIX>-<NNN>`            (예: TASK-KL-053)
 *   - `TASK-<PREFIX>-<NNN>-<SUFFIX>`   (예: TASK-KAR-018-X / TASK-KAR-019-MOD)
 *   - `TASK-<PREFIX>-<WORD>`           (예: TASK-KAR-MEMOSYNC)
 *
 * 결정적 분리: 워커 브랜치의 ts 접미(`-2605171306`)는 *숫자만* — 그래서 TASK
 * suffix 슬롯은 **반드시 letter-starting** (`[A-Z][A-Z0-9]*`) 으로 제약.
 * 이러면 `task-kl-053-2605171306` → `TASK-KL-053` (ts 미흡수),
 *       `task-kl-055-b-2605171306` → `TASK-KL-055-B` (B 만 흡수, ts 미흡수).
 * PREFIX 최소 2자(`[A-Z][A-Z0-9]+`) — 단문자 위양성(`TASK-x-1`) 차단.
 */
const TASK_ID_RE = /TASK-[A-Z][A-Z0-9]+-(?:\d+(?:-[A-Z][A-Z0-9]*)?|[A-Z][A-Z0-9]*)/gi;

/**
 * 한 문자열(제목 또는 headRef)에서 TASK id 들을 추출(대문자 normalize).
 * 순수 — IO 무관. 매치 없음 = 빈 배열.
 */
export function parseTaskIdsFromText(s: string | undefined | null): string[] {
  if (!s) return [];
  const out = new Set<string>();
  for (const m of String(s).matchAll(TASK_ID_RE)) {
    out.add(m[0].toUpperCase());
  }
  return [...out];
}

/** gh pr list 출력 1건 (title + headRefName 만 필요). */
export interface PrSummary {
  title?: string;
  headRefName?: string;
}

/**
 * PR 목록에서 TASK id 집합 추출 (순수). title·headRefName 둘 다 스캔 →
 * dedupe. worker branch slug 가 소문자라도 정규식이 대소문자 무관·결과는
 * 대문자 normalize 라 selectCandidates 의 candidate.id 와 직접 비교 가능.
 */
export function extractTaskIds(prs: readonly PrSummary[]): Set<string> {
  const out = new Set<string>();
  for (const p of prs) {
    for (const id of parseTaskIdsFromText(p.title)) out.add(id);
    for (const id of parseTaskIdsFromText(p.headRefName)) out.add(id);
  }
  return out;
}

/** runGh 의 결과 — out = stdout, fail = 호출 자체 실패(timeout·미설치 등). */
export interface GhResult {
  out: string;
  fail: boolean;
}

/**
 * repo 1개 기준 `gh pr list --state open` (best-effort, 5s timeout).
 * 비-디렉토리 cwd 면 spawn 자체 skip (execSync 오버헤드 제거 — 테스트 환경
 * /tmp 경로 등에서 매 tick 3× spawn 부담 회피, 동작은 동일 = 빈 결과).
 */
function defaultRunGh(repoRoot: string): GhResult {
  try {
    if (!fs.existsSync(repoRoot)) return { out: '', fail: true };
  } catch {
    return { out: '', fail: true };
  }
  try {
    const out = execSync(
      `gh pr list --state open --json title,headRefName --limit 200`,
      {
        cwd: repoRoot,
        timeout: 5_000,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
    return { out, fail: false };
  } catch {
    return { out: '', fail: true };
  }
}

/**
 * 다중 repo 의 open PR TASK id 집합 (best-effort). gh 부재·timeout·비-repo =
 * 해당 repo 빈 결과 (전체는 다른 repo 결과로 계속). 한 곳 실패가 워커 tick
 * 비차단 (board 제외 동형 — board 없어도 워커 진행).
 */
export function fetchOpenPRTaskIds(
  repoRoots: readonly string[],
  runGh: (repoRoot: string) => GhResult = defaultRunGh,
): Set<string> {
  const ids = new Set<string>();
  for (const root of repoRoots) {
    if (!root) continue;
    const { out, fail } = runGh(root);
    if (fail || !out.trim()) continue;
    let prs: PrSummary[] = [];
    try {
      const parsed = JSON.parse(out);
      if (Array.isArray(parsed)) prs = parsed;
    } catch {
      continue;
    }
    for (const id of extractTaskIds(prs)) ids.add(id);
  }
  return ids;
}
