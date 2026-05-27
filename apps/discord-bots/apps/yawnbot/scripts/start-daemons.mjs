#!/usr/bin/env node
/**
 * Agent Daemon 일괄 기동 — TASK-KL-081.
 *
 * 8개 active 코어(atlas/echo/kar-worker/kl-worker/wm-scout/wm-support/initiator/auditor)를
 * 각각 독립 process 로 spawn. stdout/stderr 는 `[daemon:<coreId>]` prefix 로 relay.
 * SIGTERM/SIGINT = 전체 자식 종료.
 *
 * 사용: node scripts/start-daemons.mjs
 * env: agent-daemon.ts 와 동일 (LAPTOP_AGENT_BUS_ROOT / LAPTOP_MEMO_ROOT / etc.)
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DAEMON = resolve(__dirname, '..', 'dist', 'src', 'agent-daemon.js');

const CORE_IDS = [
  'atlas',
  'echo',
  'kar-worker',
  'kl-worker',
  'wm-scout',
  'wm-support',
  'initiator',
  'auditor',
];

if (!existsSync(DIST_DAEMON)) {
  console.error(
    `[daemons] dist 산출물 없음: ${DIST_DAEMON}\n  먼저 npm run build 후 재실행.`,
  );
  process.exit(1);
}

/** @type {Array<{coreId: string, child: import('child_process').ChildProcess}>} */
const children = [];

for (const coreId of CORE_IDS) {
  const child = spawn(process.execPath, [DIST_DAEMON, '--core-id', coreId], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, AGENT_DAEMON_CORE_ID: coreId },
  });

  const tag = `[daemon:${coreId}]`;

  child.stdout.on('data', (buf) => {
    for (const line of buf.toString().trimEnd().split('\n')) {
      if (line) console.log(`${tag} ${line}`);
    }
  });
  child.stderr.on('data', (buf) => {
    for (const line of buf.toString().trimEnd().split('\n')) {
      if (line) console.error(`${tag} ${line}`);
    }
  });
  child.on('close', (code, signal) => {
    console.log(`${tag} 종료 code=${code ?? '?'} signal=${signal ?? '-'}`);
  });
  child.on('error', (err) => {
    console.error(`${tag} spawn 오류: ${err.message}`);
  });

  children.push({ coreId, child });
  console.log(`[daemons] ${coreId} 기동 pid=${child.pid}`);
}

console.log(`[daemons] ${CORE_IDS.length}개 코어 기동 완료`);

function killAll(sig) {
  console.log(`[daemons] ${sig} 수신 — 전체 종료 중...`);
  for (const { child } of children) {
    try {
      child.kill(sig);
    } catch {
      // 이미 종료된 경우 무시
    }
  }
}

process.on('SIGTERM', () => killAll('SIGTERM'));
process.on('SIGINT', () => killAll('SIGINT'));
