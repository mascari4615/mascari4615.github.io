#!/usr/bin/env node
/**
 * tier3 detached 워커 wrapper — TASK-KAR-094 후속 (2026-05-22).
 *
 * 봇이 죽어도 claude CLI 워커가 살아남게 하는 substrate.
 * 봇이 본 스크립트를 `spawn(detached:true, stdio:'ignore')` 로 띄우고 unref →
 * 봇 프로세스가 죽어도 본 wrapper + claude CLI 자식은 계속 돌아감.
 *
 * 흐름:
 *   1. argv 에서 outDir, cmd, args(json), env(json), promptFile, cwd 받음
 *   2. outDir 생성, stdout/stderr 파일 핸들 open
 *   3. claude CLI 자식 spawn (stdio: pipe stdout/stderr → 파일)
 *   4. promptFile 내용을 자식 stdin 에 write
 *   5. 자식 종료 시 outDir/done.json 원자적 write (exit code + meta)
 *      → 봇의 reaper 가 done.json 존재 = 완료 신호로 후처리
 *   6. claude CLI 가 에러 발생해도 done.json 은 항상 쓰여짐 (silent fail 방지)
 *
 * 봇이 죽으면 본 wrapper 의 stdout/stderr 는 닫히나 자식 claude CLI 는 자기
 * 파일 핸들 유지 → 작업 계속. done.json 쓰고 본 wrapper 정상 종료.
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const [outDir, cmd, argsJson, envJson, promptFile, cwdArg] = process.argv.slice(2);

if (!outDir || !cmd) {
  console.error('[run-tier3-detached] usage: <outDir> <cmd> <argsJson> <envJson> <promptFile> [cwd]');
  process.exit(2);
}

const args = JSON.parse(argsJson || '[]');
const envOverlay = JSON.parse(envJson || '{}');
const env = { ...process.env, ...envOverlay };
const cwd = (cwdArg && cwdArg.trim()) || undefined;

fs.mkdirSync(outDir, { recursive: true });
const stdoutPath = path.join(outDir, 'stdout.log');
const stderrPath = path.join(outDir, 'stderr.log');
const donePath = path.join(outDir, 'done.json');
const stdoutFd = fs.openSync(stdoutPath, 'w');
const stderrFd = fs.openSync(stderrPath, 'w');

let prompt = '';
try {
  prompt = fs.readFileSync(promptFile, 'utf-8');
} catch (e) {
  const result = {
    exitCode: -1,
    error: `prompt read fail: ${e.message}`,
    finishedAt: new Date().toISOString(),
  };
  fs.writeFileSync(donePath, JSON.stringify(result, null, 2));
  process.exit(1);
}

const startedAt = Date.now();
const child = spawn(cmd, args, {
  stdio: ['pipe', stdoutFd, stderrFd],
  env,
  cwd,
  windowsHide: true,
});

const writeDone = (payload) => {
  const tmp = donePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n');
  fs.renameSync(tmp, donePath);
};

child.on('close', (code, signal) => {
  writeDone({
    exitCode: code,
    signal: signal || null,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    stdoutPath,
    stderrPath,
  });
  process.exit(0);
});

child.on('error', (err) => {
  writeDone({
    exitCode: -1,
    error: `spawn error: ${err.message}`,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    stdoutPath,
    stderrPath,
  });
  process.exit(1);
});

try {
  child.stdin.write(prompt);
  child.stdin.end();
} catch (e) {
  // stdin 닫힘 race — 자식이 빨리 죽었으면 'close' 핸들러가 done.json 쓰니 무시
}
