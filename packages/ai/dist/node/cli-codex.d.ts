/**
 * 로컬에 설치된 `codex` CLI (`codex exec`)로 텍스트/agentic 작업 실행.
 *
 * 환경 변수:
 *   CODEX_CLI_COMMAND     : CLI 실행 파일 이름/경로 (기본: codex)
 *   CODEX_CLI_TIMEOUT_MS  : 타임아웃 ms (기본: 600000)
 *   CODEX_CLI_MODEL       : 선택 모델 override
 *   CODEX_CLI_BYPASS_PERMISSIONS : 1/true면 --dangerously-bypass-approvals-and-sandbox
 *                                  0/false면 sandbox/approval 정책 사용
 *   CODEX_CLI_SANDBOX     : bypass off일 때 sandbox 모드 (기본: workspace-write)
 *   CODEX_CLI_APPROVAL_POLICY : bypass off일 때 approval 정책 (기본: never)
 */
export declare function generateCodexCliText(opts: {
    prompt: string;
    timeoutMs?: number;
    /** 에이전트 모드: cwd 지정 시 파일 읽기/편집/명령 실행 가능 */
    cwd?: string;
    env?: Record<string, string>;
}): Promise<string>;
