"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCodexCliText = generateCodexCliText;
const fs = require("fs");
const os = require("os");
const path = require("path");
const child_process_1 = require("child_process");
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
async function generateCodexCliText(opts) {
    const effectiveEnv = opts.env ? { ...process.env, ...opts.env } : process.env;
    const cmd = effectiveEnv.CODEX_CLI_COMMAND?.trim() || 'codex';
    const timeout = opts.timeoutMs ?? parseInt(effectiveEnv.CODEX_CLI_TIMEOUT_MS || '600000', 10);
    const rawBypass = effectiveEnv.CODEX_CLI_BYPASS_PERMISSIONS?.trim().toLowerCase();
    // Claude adapter parity: cwd 지정 agentic 모드에서는 기본 bypass. 필요하면 env=0 으로 끈다.
    const bypass = rawBypass === '1' || rawBypass === 'true' || rawBypass === 'yes'
        ? true
        : rawBypass === '0' || rawBypass === 'false' || rawBypass === 'no'
            ? false
            : Boolean(opts.cwd);
    const sandbox = effectiveEnv.CODEX_CLI_SANDBOX?.trim() || 'workspace-write';
    const approvalPolicy = effectiveEnv.CODEX_CLI_APPROVAL_POLICY?.trim() || 'never';
    const model = effectiveEnv.CODEX_CLI_MODEL?.trim();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'karmolab-codex-'));
    const outputPath = path.join(tempDir, 'last-message.txt');
    const cleanup = () => {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        catch {
            /* best-effort */
        }
    };
    return new Promise((resolve, reject) => {
        const args = [
            'exec',
            '--ephemeral',
            '--color',
            'never',
            '--output-last-message',
            outputPath,
        ];
        if (model) {
            args.push('--model', model);
        }
        if (opts.cwd) {
            args.push('--cd', opts.cwd);
        }
        else {
            // 텍스트 생성 용도에서 서비스 cwd가 git repo 밖이어도 실패하지 않게 한다.
            args.push('--skip-git-repo-check');
        }
        if (bypass) {
            args.push('--dangerously-bypass-approvals-and-sandbox');
        }
        else {
            args.push('--sandbox', sandbox, '--ask-for-approval', approvalPolicy);
        }
        args.push('-');
        const child = (0, child_process_1.spawn)(cmd, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
            ...(opts.cwd ? { cwd: opts.cwd } : {}),
            ...(opts.env ? { env: effectiveEnv } : {}),
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        const timer = setTimeout(() => {
            child.kill();
            cleanup();
            reject(new Error(`Codex CLI 타임아웃 (${timeout}ms)`));
        }, timeout);
        child.on('close', (code) => {
            clearTimeout(timer);
            let lastMessage = '';
            try {
                if (fs.existsSync(outputPath)) {
                    lastMessage = fs.readFileSync(outputPath, 'utf-8').trim();
                }
            }
            catch {
                lastMessage = '';
            }
            cleanup();
            if (code === 0 && (lastMessage || stdout.trim() || opts.cwd)) {
                resolve(lastMessage || stdout.trim());
            }
            else {
                reject(new Error(`Codex CLI 종료 코드 ${code}: ${stderr.slice(0, 400)}`));
            }
        });
        child.on('error', (err) => {
            clearTimeout(timer);
            cleanup();
            reject(new Error(`Codex CLI 실행 실패: ${err.message} (PATH에 '${cmd}'이 있는지 확인)`));
        });
        child.stdin.write(opts.prompt);
        child.stdin.end();
    });
}
