#!/usr/bin/env node
/**
 * start-daemons — 8 agent-daemon child process 배치 기동 (TASK-KL-081).
 *
 * KarmoLab ServerMonitor 카드 1개 = 8 코어 daemon. prod NSSM 배포 (8 독립
 * 서비스: agent-ambient-<core>-prod) 의 local dev 대응. 같은 dist/src/agent-daemon.js
 * binary 를 AGENT_DAEMON_CORE_ID env 로 정체성 분기 — 정합 .github/workflows/
 * deploy-discord-bots.yml § NSSM upsert + restart agent-ambient-*.
 *
 * 정합 룰:
 *  - CORES 목록 = deploy workflow 의 `$ambients` 와 동기 (CLAUDE.md Note 12 — 새 코어
 *    daemon 추가 = 양쪽 동시 갱신).
 *  - inactive 코어 (wm-worker 등) = daemon 이 자기 status 체크 후 exit(3) → 다른
 *    daemon 영향 0 (agent-daemon.ts main()).
 *  - 하나 crash = 자기 exit 만 (이 launcher 는 살아있음). prod 는 NSSM auto-restart
 *    이지만 dev 는 사용자가 카드 restart.
 *
 * 진입:
 *  - `node scripts/start-daemons.mjs` (apps/discord-bots/apps/yawnbot cwd)
 *  - dist/src/agent-daemon.js 선행 build 필요 — `npm run build` (워크스페이스 루트)
 *
 * 환경:
 *  - AGENT_DAEMON_CORE_ID = 각 child 마다 자동 override (env override 무시)
 *  - 나머지 env (LAPTOP_AGENT_BUS_ROOT, KARMOLAB_AI_SURFACE, MEMO_REPO_PATH 등) =
 *    부모 process.env 그대로 상속 → daemon 의 load-env.ts 가 yawnbot/.env 추가 로드.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const yawnbotDir = path.resolve(__dirname, '..');
const mainJs = path.join(yawnbotDir, 'dist', 'src', 'agent-daemon.js');

// deploy-discord-bots.yml `$ambients` 와 정합 (drift 시 양쪽 동시 갱신).
const CORES = [
  'atlas',
  'echo',
  'kar-worker',
  'kl-worker',
  'wm-scout',
  'wm-support',
  'initiator',
  'auditor',
];

if (!existsSync(mainJs)) {
  console.error(
    `[start-daemons] X ${path.relative(process.cwd(), mainJs)} 없음 — ` +
      `먼저 워크스페이스 루트에서 'npm run build' (또는 'npm run build:yawnbot') 실행.`,
  );
  process.exit(2);
}

console.log(`[start-daemons] ${CORES.length} 코어 daemon 기동: ${CORES.join(', ')}`);

/** @type {{ coreId: string, child: import('node:child_process').ChildProcess }[]} */
const children = CORES.map((coreId) => {
  const env = { ...process.env, AGENT_DAEMON_CORE_ID: coreId };
  const child = spawn(process.execPath, [mainJs], {
    cwd: yawnbotDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tag = `[${coreId}]`;
  const tagStream = (stream, sink) => {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        sink.write(`${tag} ${buf.slice(0, idx + 1)}`);
        buf = buf.slice(idx + 1);
      }
    });
    stream.on('end', () => {
      if (buf.length > 0) sink.write(`${tag} ${buf}\n`);
    });
  };
  tagStream(child.stdout, process.stdout);
  tagStream(child.stderr, process.stderr);
  child.on('exit', (code, signal) => {
    console.log(`${tag} exit code=${code} signal=${signal}`);
  });
  child.on('error', (e) => {
    console.error(`${tag} spawn error: ${e.message}`);
  });
  return { coreId, child };
});

let shuttingDown = false;
function shutdown(sig) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[start-daemons] ${sig} 수신 — ${children.length} daemon 종료`);
  for (const { child } of children) {
    try {
      child.kill(sig);
    } catch {
      // already dead — skip
    }
  }
  // 마지막 child 살아있어도 5초 후 강제 종료 (server monitor stop 응답성).
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// 모든 child exit 시 launcher 도 종료 (server monitor 카드 상태 정합).
let exited = 0;
for (const { child } of children) {
  child.on('exit', () => {
    exited += 1;
    if (exited === children.length && !shuttingDown) {
      console.log('[start-daemons] 모든 daemon 종료됨 — launcher 종료');
      process.exit(0);
    }
  });
}
