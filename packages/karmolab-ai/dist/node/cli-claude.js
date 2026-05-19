"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateClaudeCliText = generateClaudeCliText;
exports.buildDiscoveryArgs = buildDiscoveryArgs;
exports.generateDiscoveryText = generateDiscoveryText;
const fs = require("fs");
const os = require("os");
const path = require("path");
const child_process_1 = require("child_process");
/**
 * 로컬에 설치된 `claude` CLI (`claude --print`)로 텍스트 생성.
 * Claude Max 구독으로 인증된 환경에서 API 키 없이 사용 가능.
 *
 * 환경 변수:
 *   CLAUDE_CLI_COMMAND  : CLI 실행 파일 이름 (기본: claude)
 *   CLAUDE_CLI_TIMEOUT_MS : 타임아웃 ms (기본: 60000)
 */
async function generateClaudeCliText(opts) {
    const cmd = process.env.CLAUDE_CLI_COMMAND?.trim() || 'claude';
    const timeout = opts.timeoutMs ?? parseInt(process.env.CLAUDE_CLI_TIMEOUT_MS || '60000', 10);
    const fixedSessionId = 'yawnbot-assistant';
    const runClaude = (useResume) => {
        return new Promise((resolve, reject) => {
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
            const child = (0, child_process_1.spawn)(cmd, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true,
                ...(opts.cwd ? { cwd: opts.cwd } : {}),
                // KAR-018-P: env 미전달=상속(불변) / 전달=이 자식만 격리 오버레이
                // (전역 process.env 변이 0 → 동시 워커 자격 비교차오염).
                ...(opts.env ? { env: { ...process.env, ...opts.env } } : {}),
            });
            let stdout = '';
            let stderr = '';
            child.stdout.on('data', (data) => { stdout += data.toString(); });
            child.stderr.on('data', (data) => { stderr += data.toString(); });
            const timer = setTimeout(() => {
                child.kill();
                reject(new Error(`Claude CLI 타임아웃 (${timeout}ms)`));
            }, timeout);
            child.on('close', (code) => {
                clearTimeout(timer);
                // KAR-018-Y: agentic 모드(opts.cwd)는 도구로 파일·git 작업 →
                // stdout prose 가 비어도 exit 0 = 성공(산출물=git 커밋/브랜치,
                // stdout 아님). prod WM-109 실증: exit0+빈stdout 을 error 로
                // 오분류해 성공 agentic 실작업이 폐기·쿨다운됐음. text-gen
                // 모드(cwd 없음)는 빈 stdout=실패 유지(불변).
                if (code === 0 && (stdout.trim() || opts.cwd)) {
                    resolve(stdout.trim());
                }
                else {
                    reject(new Error(`Claude CLI 종료 코드 ${code}: ${stderr.slice(0, 400)}`));
                }
            });
            child.on('error', (err) => {
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
    }
    catch (e) {
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
const DISCOVERY_DISALLOWED_TOOLS = 'Bash Edit Write Read NotebookEdit Glob Grep Task WebFetch WebSearch';
function buildDiscoveryArgs() {
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
async function generateDiscoveryText(opts) {
    const cmd = process.env.CLAUDE_CLI_COMMAND?.trim() || 'claude';
    const timeout = opts.timeoutMs ?? parseInt(process.env.CLAUDE_CLI_TIMEOUT_MS || '60000', 10);
    // 함수 소유 빈 임시 cwd — caller 불가침. 청정 컨텍스트 + agentic 차단.
    const cleanCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'yb-discovery-'));
    const cleanup = () => {
        try {
            fs.rmSync(cleanCwd, { recursive: true, force: true });
        }
        catch {
            /* best-effort — OS tmp 가 결국 회수 */
        }
    };
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(cmd, buildDiscoveryArgs(), {
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
            cwd: cleanCwd, // 빈 dir — 도구 거부 + skip-perm 없음 → agentic 불가
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => {
            stdout += d.toString();
        });
        child.stderr.on('data', (d) => {
            stderr += d.toString();
        });
        const timer = setTimeout(() => {
            child.kill();
            cleanup();
            reject(new Error(`Claude CLI(discovery) 타임아웃 (${timeout}ms)`));
        }, timeout);
        child.on('close', (code) => {
            clearTimeout(timer);
            cleanup();
            // 빈 출력 = 발굴 없음(정상, 날조 0) → 빈 문자열 resolve (파서가 폐기).
            if (code === 0)
                resolve(stdout.trim());
            else
                reject(new Error(`Claude CLI(discovery) 종료 코드 ${code}: ${stderr.slice(0, 400)}`));
        });
        child.on('error', (err) => {
            clearTimeout(timer);
            cleanup();
            reject(new Error(`Claude CLI(discovery) 실행 실패: ${err.message} (PATH에 '${cmd}' 확인)`));
        });
        child.stdin.write(opts.prompt);
        child.stdin.end();
    });
}
