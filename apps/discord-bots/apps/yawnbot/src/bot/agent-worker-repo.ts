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
  // wm-support = WM 보좌 모델 (TASK-KAR-018-WMS). teamScope = WM Unity-GUI
  // 불요 substrate (context.md drift sync / headless 부팅 스모크 / 툴링·schema /
  // docs·data·JSON 성격 분) — WitchMendokusai repo. 매핑 누락 시 wt 실패 →
  // 비-agentic 폴백 → 매 사이클 domain-unresolved 메시지 폭주 (2026-05-20 실증).
  'wm-support': 'WitchMendokusai',
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
 * LT 워커 브랜치명. agent-team-graduate.yml 이 화이트리스트 prefix
 * head 를 졸업시키므로 prefix 고정. taskId 소문자 = deterministic, ts X
 * (KAR-018, 2026-05-21 사용자 진단: ts 접미 시 매 워커 호출마다 새 브랜치
 * = 진행 상황 무손실 0. 같은 TASK = 같은 브랜치, setup 측이 reuse).
 * 정본 = TASK-KAR-018-LT-RENAME R-1/R-3 (substrate⊥skin 정합 — autopilot
 * skill 과 LT 워커 정체성 분리).
 */
export function workerBranchName(taskId: string, _now?: Date): string {
  const slug = taskId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `feature/agent-team-${slug}`;
}

/**
 * 격리 worktree 절대 경로. umbrella/.worktrees/ 는 이미 gitignore 패턴.
 * deterministic (ts X) → 같은 TASK 재진입 시 기존 worktree 재사용.
 * 동시 충돌 = claim 파일이 차단 (같은 TASK 동시 claim 불가).
 */
export function workerWorktreeDir(
  umbrellaRoot: string,
  coreId: string,
  taskId: string,
  _now?: Date,
): string {
  const root = umbrellaRoot.replace(/[\\/]+$/, '');
  const slug = taskId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${root}/.worktrees/aw-${coreId}-${slug}`;
}
