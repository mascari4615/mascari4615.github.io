// 워커 tier3 = 도메인 TASK 를 *실제로* 수행(코드+commit+push+Draft PR).
// KAR-018-Y 근본: buildTier3Deps.run 이 비-agentic generateAssistantText
// (cwd 없는 공유 세션 = 도구거부·텍스트 폐기)라 워커가 "착수"만 외치고
// 산출 0(theater)이었음. 정답 = 도메인별 *격리 worktree* 를 cwd 로
// generateClaudeCliText(agentic, --dangerously-skip-permissions) 호출.
//
// 본 파일 = 순수 결정 로직만(FS·git·spawn 무관, 전수 단위검증 가능).
// 부수효과(worktree add/remove·spawn)는 agent-cadence 가 본 함수 결과로 수행.

/** 워커 코어 → 도메인 타겟 repo (umbrella 하위 디렉토리명). */
const CORE_DOMAIN_REPO: Record<string, string> = {
  'wm-worker': 'WitchMendokusai',
  'kl-worker': 'Mascari4615.github.io',
  // KAR = 에이전트 팀 인프라·자가개선. yawnbot 코드가 github.io 안 →
  // 타겟 repo = Mascari4615.github.io (노트북 prod 존재 = agentic 가능).
  'kar-worker': 'Mascari4615.github.io',
};

export interface DomainRepo {
  /** 타겟 repo 절대 경로 (umbrella/<dir>). */
  repoRoot: string;
  /** repo 디렉토리명 (=git worktree -C 대상). */
  repoDir: string;
}

/**
 * 워커 coreId + umbrella 루트 → 도메인 타겟 repo 경로.
 * 미지원 코어(producer/cadence 등) = null → caller 가 비-agentic 폴백.
 * 순수: 경로 문자열 조립만(존재 검사는 caller).
 */
export function resolveDomainRepo(
  coreId: string,
  umbrellaRoot: string,
): DomainRepo | null {
  const dir = CORE_DOMAIN_REPO[coreId];
  if (!dir || !umbrellaRoot) return null;
  // POSIX/Win 혼용 안전: 항상 '/' 결합(Node fs 는 양쪽 수용, git -C 도).
  const root = umbrellaRoot.replace(/[\\/]+$/, '');
  return { repoRoot: `${root}/${dir}`, repoDir: dir };
}

/** ISO ts → 결정적 yyMMddHHmm (worktree·branch 유니크 접미). */
export function tsStamp(now: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return (
    String(now.getUTCFullYear()).slice(2) +
    p(now.getUTCMonth() + 1) +
    p(now.getUTCDate()) +
    p(now.getUTCHours()) +
    p(now.getUTCMinutes())
  );
}

/**
 * autopilot 안전 룰셋 브랜치명. autopilot-graduate.yml 이 `feature/*`
 * head 를 졸업시키므로 prefix 고정. taskId 소문자 + ts = 재실행 충돌 0.
 */
export function workerBranchName(taskId: string, now: Date): string {
  const slug = taskId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `feature/autopilot-${slug}-${tsStamp(now)}`;
}

/**
 * 격리 worktree 절대 경로. umbrella/.worktrees/ 는 이미 gitignore 패턴
 * (race-only worktree 관례). 코어+ts = 동시 wm/kl + 재실행 충돌 0.
 */
export function workerWorktreeDir(
  umbrellaRoot: string,
  coreId: string,
  taskId: string,
  now: Date,
): string {
  const root = umbrellaRoot.replace(/[\\/]+$/, '');
  const slug = taskId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${root}/.worktrees/aw-${coreId}-${slug}-${tsStamp(now)}`;
}
