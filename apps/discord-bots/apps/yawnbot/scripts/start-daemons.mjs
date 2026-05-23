#!/usr/bin/env node
// agent-daemon 8코어 동시 기동 — TASK-KL-081 (Option A 배치 기동).
// 사용: npm run start:daemons-all (devProfile 버튼 또는 터미널).
// 각 코어는 독립 child_process 로 병렬 실행. 부모 종료 시 SIGINT/SIGTERM 전파.

import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DAEMON_SCRIPT = resolve(__dirname, '..', 'dist', 'src', 'agent-daemon.js');

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

const children = [];

for (const coreId of CORE_IDS) {
  const child = spawn(
    process.execPath,
    [DAEMON_SCRIPT, '--core-id', coreId],
    { stdio: ['ignore', 'inherit', 'inherit'], env: process.env }
  );
  child.on('exit', (code) => {
    console.error(`[daemons] ${coreId} exited with code ${code}`);
  });
  children.push({ coreId, child });
  console.log(`[daemons] started ${coreId} (pid=${child.pid})`);
}

function shutdown(signal) {
  console.log(`[daemons] ${signal} — stopping all cores`);
  for (const { coreId, child } of children) {
    child.kill(signal);
    console.log(`[daemons] sent ${signal} to ${coreId}`);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
