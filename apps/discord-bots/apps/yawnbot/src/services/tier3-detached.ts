/**
 * tier3 detached 워커 — TASK-KAR-094 후속 (2026-05-22 사용자 진단).
 *
 * 사용자 요구: 봇이 죽어도 워커가 안 죽게.
 * 기존: claude CLI = 봇 subprocess → 봇 죽으면 같이 죽음.
 * 변경: claude CLI 를 wrapper script 로 감싸 detached spawn → 봇 무관 생존.
 *
 * 흐름:
 *   1. 봇이 spawnTier3Detached(...) → wrapper 가 detached 로 뜸 + unref
 *      → 봇은 즉시 return (await 없음)
 *   2. wrapper 가 claude CLI 자식 spawn, stdout/stderr 파일로 받음
 *   3. wrapper 가 자식 종료 시 done.json 원자 write
 *   4. 봇이 다음 cadence tick 또는 startup 에서 reapInFlight() 호출
 *      → done.json 있으면 후처리 (voicedWorkerSpeak + 클레임 해제 등)
 *      → 없고 PID 살아있으면 skip (계속 작업 중)
 *      → 없고 PID 죽었으면 reap (crash, 다음 워커가 재시도)
 *
 * 평행 파이프 0 — 기존 claim 파일에 inFlight 필드 확장.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { PKG_ROOT } from '../paths';

/** claim 파일 schema 확장: per-task `inFlight` 필드. */
export interface InFlightMarker {
  pid: number;
  outDir: string; // tier3 결과 파일 dir (memoRoot 기준 상대)
  startedAt: string; // ISO timestamp
  coreId: string;
  taskId: string;
  branch?: string;
  /** worktree cwd — postProcess 시 branchPushed 체크용. */
  cwd?: string;
}

export interface ClaimEntry {
  by?: string;
  at?: number;
  inFlight?: InFlightMarker;
}

export interface Tier3DoneResult {
  exitCode: number | null;
  signal?: string | null;
  error?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  stdoutPath: string;
  stderrPath: string;
}

const CLAIMS_REL = path.join('.claude', 'task-claims.json');
const TIER3_REL = path.join('.claude', 'tier3');
const WRAPPER_REL = path.join('scripts', 'run-tier3-detached.mjs');

/** claim 파일 절대 경로. */
export function claimsFilePath(memoRoot: string): string {
  return path.join(memoRoot, CLAIMS_REL);
}

/** tier3 out dir 절대 경로. */
export function tier3OutDir(memoRoot: string, taskId: string): string {
  return path.join(memoRoot, TIER3_REL, taskId);
}

/** wrapper script 절대 경로 (yawnbot 패키지 안). */
export function wrapperScriptPath(): string {
  return path.join(PKG_ROOT, WRAPPER_REL);
}

/** claim 파일 읽기 — 부재/손상 = {}. */
export function readClaims(memoRoot: string): Record<string, ClaimEntry> {
  try {
    const raw = fs.readFileSync(claimsFilePath(memoRoot), 'utf-8');
    const o = JSON.parse(raw);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch { return {}; }
}

/** claim 파일 쓰기 (atomic). */
export function writeClaims(memoRoot: string, claims: Record<string, ClaimEntry>): void {
  const file = claimsFilePath(memoRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(claims, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

/** PID 살아있나 (cross-platform). signal=0 = 존재 체크만. */
export function isProcessAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    const err = e as { code?: string };
    // ESRCH = no such process. EPERM = exists 하나 권한 없음 = alive.
    return err.code === 'EPERM';
  }
}

/** done.json 절대 경로. */
function donePath(outDir: string): string {
  return path.join(outDir, 'done.json');
}

/** done.json 읽기. */
export function readDoneResult(outDir: string): Tier3DoneResult | null {
  try {
    const raw = fs.readFileSync(donePath(outDir), 'utf-8');
    return JSON.parse(raw);
  } catch { return null; }
}

/** tier3 out dir 의 stdout/stderr 일부 읽기 (최대 N bytes). */
export function readTier3Output(outDir: string, maxBytes = 8000): { stdout: string; stderr: string } {
  const read = (p: string): string => {
    try {
      const stat = fs.statSync(p);
      if (stat.size <= maxBytes) return fs.readFileSync(p, 'utf-8');
      const fd = fs.openSync(p, 'r');
      const buf = Buffer.alloc(maxBytes);
      fs.readSync(fd, buf, 0, maxBytes, Math.max(0, stat.size - maxBytes));
      fs.closeSync(fd);
      return '[... truncated]\n' + buf.toString('utf-8');
    } catch { return ''; }
  };
  return {
    stdout: read(path.join(outDir, 'stdout.log')),
    stderr: read(path.join(outDir, 'stderr.log')),
  };
}

export interface SpawnTier3DetachedOpts {
  memoRoot: string;
  taskId: string;
  coreId: string;
  branch?: string;
  cwd?: string;
  cmd: string; // claude CLI 경로 (보통 'claude')
  args: string[]; // claude CLI 인자
  prompt: string;
  env?: Record<string, string>;
}

export interface SpawnTier3DetachedResult {
  pid: number;
  outDir: string;
  marker: InFlightMarker;
}

/**
 * tier3 자식을 detached + unref 로 spawn. 봇이 죽어도 wrapper + claude CLI
 * 생존. 봇이 done.json 폴링으로 완료 인지.
 */
export function spawnTier3Detached(opts: SpawnTier3DetachedOpts): SpawnTier3DetachedResult {
  const outDir = tier3OutDir(opts.memoRoot, opts.taskId);
  fs.mkdirSync(outDir, { recursive: true });
  const promptFile = path.join(outDir, 'prompt.txt');
  fs.writeFileSync(promptFile, opts.prompt);

  const wrapper = wrapperScriptPath();
  const child = spawn(
    process.execPath, // node
    [
      wrapper,
      outDir,
      opts.cmd,
      JSON.stringify(opts.args),
      JSON.stringify(opts.env || {}),
      promptFile,
      opts.cwd || '',
    ],
    {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    },
  );
  if (typeof child.pid !== 'number') {
    throw new Error('spawnTier3Detached: child.pid undefined');
  }
  child.unref();

  const marker: InFlightMarker = {
    pid: child.pid,
    outDir: path.relative(opts.memoRoot, outDir),
    startedAt: new Date().toISOString(),
    coreId: opts.coreId,
    taskId: opts.taskId,
    branch: opts.branch,
    cwd: opts.cwd,
  };
  return { pid: child.pid, outDir, marker };
}

/** 한 in-flight 의 상태 분류. reaper 가 분기 처리. */
export type InFlightStatus =
  | { kind: 'alive' } // 작업 중
  | { kind: 'completed'; result: Tier3DoneResult; output: { stdout: string; stderr: string } } // done.json 있음
  | { kind: 'crashed' }; // PID 죽었는데 done.json 없음 (wrapper 가 crash)

export function classifyInFlight(memoRoot: string, marker: InFlightMarker): InFlightStatus {
  if (isProcessAlive(marker.pid)) return { kind: 'alive' };
  const outDirAbs = path.isAbsolute(marker.outDir)
    ? marker.outDir
    : path.join(memoRoot, marker.outDir);
  const result = readDoneResult(outDirAbs);
  if (result) {
    return { kind: 'completed', result, output: readTier3Output(outDirAbs) };
  }
  return { kind: 'crashed' };
}

export interface ReaperDeps {
  /** 완료된 in-flight 후처리 콜백. caller 가 voicedWorkerSpeak/release/escalate 등 결정. */
  onCompleted?: (
    taskId: string,
    marker: InFlightMarker,
    result: Tier3DoneResult,
    output: { stdout: string; stderr: string },
  ) => void | Promise<void>;
  /** PID 죽었는데 결과 없음 (wrapper crash) 콜백. */
  onCrashed?: (taskId: string, marker: InFlightMarker) => void | Promise<void>;
  /** alive 인 in-flight 콜백 (관측용, 옵션). */
  onAlive?: (taskId: string, marker: InFlightMarker) => void;
}

export interface ReaperSummary {
  total: number;
  alive: number;
  completed: string[];
  crashed: string[];
  errors: string[];
}

/**
 * claim 파일 스캔 후 in-flight 마커 분류 + 후처리. completed/crashed 는 claim 에서
 * 제거 (다음 워커가 재진입 가능). alive 는 보존.
 */
export async function reapInFlight(
  memoRoot: string,
  deps: ReaperDeps = {},
): Promise<ReaperSummary> {
  const summary: ReaperSummary = {
    total: 0,
    alive: 0,
    completed: [],
    crashed: [],
    errors: [],
  };
  if (!memoRoot) return summary;
  const claims = readClaims(memoRoot);
  const toRemove: string[] = [];

  for (const [taskId, entry] of Object.entries(claims)) {
    if (!entry?.inFlight) continue;
    summary.total += 1;
    const marker = entry.inFlight;
    try {
      const status = classifyInFlight(memoRoot, marker);
      if (status.kind === 'alive') {
        summary.alive += 1;
        deps.onAlive?.(taskId, marker);
      } else if (status.kind === 'completed') {
        await deps.onCompleted?.(taskId, marker, status.result, status.output);
        toRemove.push(taskId);
        summary.completed.push(taskId);
      } else {
        await deps.onCrashed?.(taskId, marker);
        toRemove.push(taskId);
        summary.crashed.push(taskId);
      }
    } catch (e) {
      summary.errors.push(`${taskId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (toRemove.length > 0) {
    const next: Record<string, ClaimEntry> = {};
    for (const [k, v] of Object.entries(claims)) {
      if (!toRemove.includes(k)) next[k] = v;
    }
    try { writeClaims(memoRoot, next); }
    catch (e) {
      summary.errors.push(`writeClaims: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return summary;
}

/** in-flight 가 잡고 있는 taskId 들 (워커 scan 제외용). PID 살아있는 것만. */
export function activeInFlightTaskIds(memoRoot: string): Set<string> {
  const out = new Set<string>();
  const claims = readClaims(memoRoot);
  for (const [taskId, entry] of Object.entries(claims)) {
    if (entry?.inFlight && isProcessAlive(entry.inFlight.pid)) {
      out.add(taskId);
    }
  }
  return out;
}
