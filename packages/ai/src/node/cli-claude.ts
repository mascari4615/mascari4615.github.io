import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';

/**
 * KAR-018-LT-W2-A: cli exit-1 시 full stderr/stdout 을 Error 객체에 부착.
 * message 는 chat 발화 cap 유지(1200/600), full 은 호출 측이 raw jsonl 적재용
 * 으로 추출 → 다음 세션 grep 으로 exit-1 진짜 원인(인증/quota/tool 거부 등)
 * 진단 가능. 부재 시(타임아웃·spawn 실패) undefined — caller duck-type 검사.
 */
export interface ClaudeCliError extends Error {
  exitCode?: number | null;
  stderrFull?: string;
  stdoutFull?: string;
}

/**
 * 로컬에 설치된 `claude` CLI (`claude --print`)로 텍스트 생성.
 * Claude Max 구독으로 인증된 환경에서 API 키 없이 사용 가능.
 *
 * 환경 변수:
 *   CLAUDE_CLI_COMMAND  : CLI 실행 파일 이름 (기본: claude)
 *   CLAUDE_CLI_TIMEOUT_MS : 타임아웃 ms (기본: 60000)
 */
export async function generateClaudeCliText(opts: {
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
}): Promise<string> {
  const cmd = process.env.CLAUDE_CLI_COMMAND?.trim() || 'claude';
  const timeout = opts.timeoutMs ?? parseInt(process.env.CLAUDE_CLI_TIMEOUT_MS || '60000', 10);
  const fixedSessionId = 'yawnbot-assistant';

  const runClaude = (useResume: boolean): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
      // 고정 세션: 항상 같은 세션 이름으로 영구 세션 유지
      // 첫 호출: --continue --name yawnbot-assistant (세션 생성 + 이름 지정)
      // 이후 호출: --resume yawnbot-assistant (이름으로 재개)
      // oneShot: 세션 미사용 단발(워커 — 공유세션 충돌 0).
      const args = opts.oneShot
        ? opts.cwd
          ? ['--print', '--no-session-persistence', '--dangerously-skip-permissions']
          : ['--print', '--no-session-persistence']
        : opts.cwd
          ? useResume
            ? ['--print', '--resume', fixedSessionId, '--dangerously-skip-permissions']
            : ['--print', '--continue', '--name', fixedSessionId, '--dangerously-skip-permissions']
          : useResume
            ? ['--print', '--resume', fixedSessionId]
            : ['--print', '--continue', '--name', fixedSessionId];

      const child = spawn(cmd, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        ...(opts.cwd ? { cwd: opts.cwd } : {}),
        // KAR-018-P: env 미전달=상속(불변) / 전달=이 자식만 격리 오버레이
        // (전역 process.env 변이 0 → 동시 워커 자격 비교차오염).
        ...(opts.env ? { env: { ...process.env, ...opts.env } } : {}),
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
      child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Claude CLI 타임아웃 (${timeout}ms)`));
      }, timeout);

      child.on('close', (code: number | null) => {
        clearTimeout(timer);
        // KAR-018-Y: agentic 모드(opts.cwd)는 도구로 파일·git 작업 →
        // stdout prose 가 비어도 exit 0 = 성공(산출물=git 커밋/브랜치,
        // stdout 아님). prod WM-109 실증: exit0+빈stdout 을 error 로
        // 오분류해 성공 agentic 실작업이 폐기·쿨다운됐음. text-gen
        // 모드(cwd 없음)는 빈 stdout=실패 유지(불변).
        if (code === 0 && (stdout.trim() || opts.cwd)) {
          resolve(stdout.trim());
        } else {
          // KAR-CLAUDE-DIAG: claude CLI 가 인증 실패 등 silent failure 시
          // stderr 비고 stdout 으로 'Not logged in · Please run /login' 박는
          // 케이스 실증(LocalSystem nssm 컨텍스트, 2026-05-20). stderr 만
          // 박으면 「종료 코드 1: 」 휑한 메시지 → 진단 12h 마비. stdout/cwd/
          // exit 함께 박아 silent failure 본문이 디스코드까지 도달하게.
          const stderrSnip = (stderr || '').trim().slice(0, 1200) || '<stderr empty>';
          const stdoutSnip = (stdout || '').trim().slice(0, 600) || '<stdout empty>';
          const err = new Error(`Claude CLI 종료 코드 ${code} (cwd=${opts.cwd ?? '<none>'}): stderr=${stderrSnip} | stdout=${stdoutSnip}`) as ClaudeCliError;
          err.exitCode = code;
          err.stderrFull = stderr;
          err.stdoutFull = stdout;
          reject(err);
        }
      });

      child.on('error', (err: Error) => {
        clearTimeout(timer);
        reject(new Error(`Claude CLI 실행 실패: ${err.message} (PATH에 '${cmd}'이 있는지 확인)`));
      });

      child.stdin.write(opts.prompt);
      child.stdin.end();
    });
  };

  // oneShot = 세션 폴백 무의미(무상태 단발). 그대로 1회.
  if (opts.oneShot) {
    return await runClaude(false);
  }

  // 첫 시도: 기존 세션 재개 (--resume)
  try {
    return await runClaude(true);
  } catch (e) {
    // 세션이 없으면 새로 생성 (--continue)
    const err = e instanceof Error ? e.message : String(e);
    if (err.includes('not found') || err.includes('No session') || err.includes('does not match') || err.includes('not a UUID')) {
      console.log(`[Claude CLI] 기존 세션 없음, 새 세션 생성...`);
      return await runClaude(false);
    }
    throw e;
  }
}

/**
 * ⑦' 자율 발굴 전용 *비-agentic* claude CLI 인자 (KAR-018-W 안전 근본).
 *
 * 황금의 정신 — 가설 X, 2026-05-17 실 dev 봇 관측 + 로컬 재현으로 확정:
 *  · `--bare` 채택 → **EXIT 1 "Not logged in"**: --bare 는 OAuth/keychain
 *    을 절대 안 읽음(help 명시). 사용자 환경=Claude Max OAuth(API키 없음)
 *    → 인증 불가. `--bare` *제거* 가 근본 (안전 요건 아니었음).
 *  · 그러나 --bare 없으면 claude 가 *프로젝트 CLAUDE.md(거대 karmoddrine
 *    거버넌스) 자동탐색* → 모델이 풀-에이전트로 거부·역질문(발굴 불성립).
 *  · 해소: cwd = **함수 내부 생성 빈 임시 디렉토리**. CLAUDE.md walk-up
 *    이 karmoddrine 트리 밖이라 오염 0 + OAuth 생존 + `--disallowedTools`
 *    + skip-perm 없음 → 빈 throwaway dir 라 agentic 불가(실측: 파일 0).
 * 결정적 하드 보장:
 *  · 시그니처에 cwd 파라미터 *부재* → caller 가 repo 를 못 가리킴 (임시
 *    dir 은 함수가 소유·생성·정리). 런타임 플래그 아닌 타입레벨 안전.
 *  · `--disallowedTools <쓰기·실행 전부>` → 도구 명시 거부
 *  · `--dangerously-skip-permissions` 미부여 (cwd=빈 dir 라 무의미)
 *  · `--no-session-persistence` → 공유 `yawnbot-assistant` 세션 경합 0
 *  · `--strict-mcp-config` (+ --mcp-config 미부여) → MCP 서버 spawn 0
 *  · `--continue`/`--resume`/`--name` 없음 → 무상태 단발
 */
const DISCOVERY_DISALLOWED_TOOLS =
  'Bash Edit Write Read NotebookEdit Glob Grep Task WebFetch WebSearch';

export function buildDiscoveryArgs(): string[] {
  return [
    '--print',
    '--no-session-persistence',
    '--strict-mcp-config',
    '--disallowedTools',
    DISCOVERY_DISALLOWED_TOOLS,
  ];
}

/**
 * 로컬 `claude` CLI 로 *비-agentic* 단발 텍스트 생성 (⑦' 발굴 전용).
 * cwd 인자가 시그니처에 *없다* — 함수가 빈 임시 디렉토리를 만들어 cwd 로
 * 쓰고(청정 컨텍스트 = CLAUDE.md 오염 차단, agentic 차단) 종료 시 정리.
 * 무상태 — resume/세션 저장 X (공유 세션 비경합).
 */
export async function generateDiscoveryText(opts: {
  prompt: string;
  timeoutMs?: number;
}): Promise<string> {
  const cmd = process.env.CLAUDE_CLI_COMMAND?.trim() || 'claude';
  const timeout =
    opts.timeoutMs ?? parseInt(process.env.CLAUDE_CLI_TIMEOUT_MS || '60000', 10);
  // 함수 소유 빈 임시 cwd — caller 불가침. 청정 컨텍스트 + agentic 차단.
  const cleanCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'yb-discovery-'));
  const cleanup = (): void => {
    try {
      fs.rmSync(cleanCwd, { recursive: true, force: true });
    } catch {
      /* best-effort — OS tmp 가 결국 회수 */
    }
  };

  return new Promise<string>((resolve, reject) => {
    const child = spawn(cmd, buildDiscoveryArgs(), {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      cwd: cleanCwd, // 빈 dir — 도구 거부 + skip-perm 없음 → agentic 불가
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    const timer = setTimeout(() => {
      child.kill();
      cleanup();
      reject(new Error(`Claude CLI(discovery) 타임아웃 (${timeout}ms)`));
    }, timeout);

    child.on('close', (code: number | null) => {
      clearTimeout(timer);
      cleanup();
      // 빈 출력 = 발굴 없음(정상, 날조 0) → 빈 문자열 resolve (파서가 폐기).
      if (code === 0) resolve(stdout.trim());
      else {
        // KAR-CLAUDE-DIAG: silent failure (stderr 빈) 대비 stdout 도 박기.
        const stderrSnip = (stderr || '').trim().slice(0, 1200) || '<stderr empty>';
        const stdoutSnip = (stdout || '').trim().slice(0, 600) || '<stdout empty>';
        reject(
          new Error(
            `Claude CLI(discovery) 종료 코드 ${code}: stderr=${stderrSnip} | stdout=${stdoutSnip}`,
          ),
        );
      }
    });
    child.on('error', (err: Error) => {
      clearTimeout(timer);
      cleanup();
      reject(
        new Error(
          `Claude CLI(discovery) 실행 실패: ${err.message} (PATH에 '${cmd}' 확인)`,
        ),
      );
    });

    child.stdin.write(opts.prompt);
    child.stdin.end();
  });
}
