/**
 * 로컬에 설치된 `claude` CLI (`claude --print`)로 텍스트 생성.
 * Claude Max 구독으로 인증된 환경에서 API 키 없이 사용 가능.
 *
 * 환경 변수:
 *   CLAUDE_CLI_COMMAND  : CLI 실행 파일 이름 (기본: claude)
 *   CLAUDE_CLI_TIMEOUT_MS : 타임아웃 ms (기본: 60000)
 */
export declare function generateClaudeCliText(opts: {
    prompt: string;
    timeoutMs?: number;
    /** 에이전트 모드: cwd 지정 시 파일 읽기/편집/명령 실행 가능 */
    cwd?: string;
    /**
     * 단발 무상태 (KAR-018-Y). true = 공유 세션(yawnbot-assistant) 미사용,
     * `--no-session-persistence` 단일 실행. bounded 워커 autopilot 전용 —
     * 봇 대화 assistant 세션 & N 동시 워커의 --continue/--resume 충돌 회피
     * (코드 정독상 자명한 설계 결함이었음). cwd 와 함께 = skip-perm agentic.
     */
    oneShot?: boolean;
    /**
     * per-spawn 환경변수 오버레이 (KAR-018-P). 미전달 = 자식이 부모
     * process.env 그대로 상속(불변). 전달 시 `{...process.env,...env}` 로
     * *이 자식만* 격리 주입 — 전역 process.env 변이 없이 동시 워커가
     * 각자 자격(GH_TOKEN 등) 보유 → 직렬화 강제 결합 제거(병렬 안전).
     */
    env?: Record<string, string>;
}): Promise<string>;
export declare function buildDiscoveryArgs(): string[];
/**
 * 로컬 `claude` CLI 로 *비-agentic* 단발 텍스트 생성 (⑦' 발굴 전용).
 * cwd 인자가 시그니처에 *없다* — 함수가 빈 임시 디렉토리를 만들어 cwd 로
 * 쓰고(청정 컨텍스트 = CLAUDE.md 오염 차단, agentic 차단) 종료 시 정리.
 * 무상태 — resume/세션 저장 X (공유 세션 비경합).
 */
export declare function generateDiscoveryText(opts: {
    prompt: string;
    timeoutMs?: number;
}): Promise<string>;
