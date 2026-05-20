/**
 * TASK status PR-머지 자동 sync — TASK-KAR-092.
 *
 * PR merged webhook 수신 시:
 *   1. PR title + body 에서 TASK-XXX id 정규식 추출
 *   2. memo 하위 (tasks/ · wm/tasks/ · life/tasks/ · projects/*\/tasks/) 에서
 *      해당 TASK 파일 lookup
 *   3. frontmatter status 가 active (ready/seed/in_progress/active) 면 done 으로 갱신
 *   4. 파일별 commitAndPushMemoFile + #team-bus 알림 1줄
 *
 * 평행 파이프 0 — webhook 수신·memo-push 기존 substrate 위에 핸들러 1개.
 *
 * 직전 (v1, 2026-05-20): sync-task-status.mjs 호출 — 그 스크립트는
 * 'done' 명시 토큰만 감지 → 'feat(TASK-X)' 패턴 머지 시 누락 (LT-W1/W2 실증).
 * v2 (2026-05-21): PR merge = 정의상 done. PR title 에 적힌 TASK id 직접 처리.
 * 더 넓은 drift 검출은 별도 (sync-task-status.mjs 가 daily-stat 에 그대로 유지).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { commitAndPushMemoFile, type MemoPushResult } from './memo-push';

/** TASK id 정규식 — TASK-PREFIX-NNN[-suffix]. memo task-queue.mjs 와 정합. */
const TASK_ID_REGEX = /TASK-(?:KAR|WM|KL|YB|LIFE|HOBBY|LEARN)-[A-Z0-9][A-Z0-9-]*/g;

/** PR 머지 시 done 으로 승격 가능한 시작 상태. */
const ACTIVE_STATUSES = new Set(['ready', 'seed', 'in_progress', 'active', 'in-progress']);

/** memo 하위 TASK 디렉토리 후보 (standalone memo 기준). */
const TASK_DIRS = [
  'tasks',
  'wm/tasks',
  'life/tasks',
  'projects/karmolab/tasks',
  'projects/yawnbot/tasks',
];

export interface TaskStatusUpdate {
  id: string;
  /** memoRoot 기준 상대 경로. */
  file: string;
  /** 갱신 전 status (PR 머지로 done 으로 바뀐 값). */
  previousStatus: string;
}

export interface TaskStatusSyncResult {
  outcome:
    | 'no-memo-root'
    | 'no-task-mentioned'
    | 'no-active'
    | 'synced'
    | 'partial';
  updates: TaskStatusUpdate[];
  pushed: number;
  skipped: number;
  errors: string[];
  /** #team-bus 알림용 1줄 라인 (변경 0 = 빈 문자열). */
  summaryLine: string;
}

export interface TaskStatusSyncDeps {
  push?: (env: NodeJS.ProcessEnv, absPath: string, message: string) => Promise<MemoPushResult>;
  /** 테스트용 — FS 주입. 기본 = node:fs. */
  fs?: {
    existsSync: (p: string) => boolean;
    readdirSync: (p: string) => string[];
    readFileSync: (p: string, enc: 'utf-8') => string;
    writeFileSync: (p: string, data: string, enc: 'utf-8') => void;
  };
  logger?: Pick<Console, 'log' | 'warn'>;
}

/** 자유 텍스트에서 TASK id 추출 (중복 제거, 순서 보존). */
export function extractTaskIds(text: string): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(TASK_ID_REGEX)) {
    if (!seen.has(m[0])) {
      seen.add(m[0]);
      out.push(m[0]);
    }
  }
  return out;
}

/** memoRoot 하위에서 TASK 파일 찾기. 못 찾으면 null. */
export function findTaskFile(
  memoRoot: string,
  taskId: string,
  fsImpl: TaskStatusSyncDeps['fs'] = fs,
): string | null {
  for (const dir of TASK_DIRS) {
    const full = path.join(memoRoot, dir);
    if (!fsImpl!.existsSync(full)) continue;
    try {
      const files = fsImpl!.readdirSync(full);
      const match = files.find((f) =>
        f === `${taskId}.md` || f.startsWith(`${taskId}-`) || f.startsWith(`${taskId}.`),
      );
      if (match) return path.join(dir, match);
    } catch { /* skip dir */ }
  }
  return null;
}

/** TASK 파일 frontmatter status 읽기. 못 읽으면 null. */
export function readTaskStatus(
  absPath: string,
  fsImpl: TaskStatusSyncDeps['fs'] = fs,
): string | null {
  try {
    const content = fsImpl!.readFileSync(absPath, 'utf-8');
    const m = content.match(/^status\s*:\s*(\S+)/m);
    return m ? m[1].trim() : null;
  } catch { return null; }
}

/** frontmatter status 를 done 으로 in-place 갱신. 성공 시 true. */
export function setTaskStatusDone(
  absPath: string,
  fsImpl: TaskStatusSyncDeps['fs'] = fs,
): boolean {
  try {
    const content = fsImpl!.readFileSync(absPath, 'utf-8');
    const next = content.replace(/^(status\s*:\s*)\S+/m, '$1done');
    if (next === content) return false;
    fsImpl!.writeFileSync(absPath, next, 'utf-8');
    return true;
  } catch { return false; }
}

/**
 * PR merge 후 1회 sync 실행.
 * - PR title + body 에서 TASK id 추출 → 파일 lookup → status:done 갱신 →
 *   파일별 push. 어떤 단계 실패도 throw X.
 */
export async function syncTaskStatusOnPrMerge(
  env: NodeJS.ProcessEnv,
  prContext: { prNumber?: number; prTitle?: string; prBody?: string },
  deps: TaskStatusSyncDeps = {},
): Promise<TaskStatusSyncResult> {
  const memoRoot = env.MEMO_REPO_PATH?.trim() || '';
  if (!memoRoot) {
    return { outcome: 'no-memo-root', updates: [], pushed: 0, skipped: 0, errors: [], summaryLine: '' };
  }

  const push = deps.push ?? commitAndPushMemoFile;
  const fsImpl = deps.fs ?? fs;
  const logger = deps.logger ?? console;

  const idsText = `${prContext.prTitle || ''}\n${prContext.prBody || ''}`;
  const ids = extractTaskIds(idsText);
  if (ids.length === 0) {
    return { outcome: 'no-task-mentioned', updates: [], pushed: 0, skipped: 0, errors: [], summaryLine: '' };
  }

  const updates: TaskStatusUpdate[] = [];
  for (const id of ids) {
    const rel = findTaskFile(memoRoot, id, fsImpl);
    if (!rel) continue;
    const absPath = path.join(memoRoot, rel);
    const current = readTaskStatus(absPath, fsImpl);
    if (!current || !ACTIVE_STATUSES.has(current)) continue;
    if (setTaskStatusDone(absPath, fsImpl)) {
      updates.push({ id, file: rel, previousStatus: current });
    }
  }

  if (updates.length === 0) {
    return { outcome: 'no-active', updates: [], pushed: 0, skipped: 0, errors: [], summaryLine: '' };
  }

  let pushed = 0;
  let skipped = 0;
  const errors: string[] = [];
  const pushedIds: string[] = [];

  for (const u of updates) {
    const absPath = path.join(memoRoot, u.file);
    const prefix = prContext.prNumber ? `PR #${prContext.prNumber}` : 'PR merge';
    const msg = `chore(tasks): ${u.id} ${u.previousStatus} -> done (auto ${prefix} merge)`;
    try {
      const res = await push(env, absPath, msg);
      if (res.outcome === 'pushed') {
        pushed += 1;
        pushedIds.push(`${u.id} ${u.previousStatus}→done`);
      } else if (res.outcome.startsWith('skipped:')) {
        skipped += 1;
        logger.log(`[task-status-sync] ${u.id} skip ${res.outcome}: ${res.detail ?? ''}`);
      } else {
        errors.push(`${u.id}: ${res.outcome} ${res.detail ?? ''}`.trim().slice(0, 200));
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      errors.push(`${u.id}: throw ${m.slice(0, 160)}`);
    }
  }

  const outcome: TaskStatusSyncResult['outcome'] =
    errors.length > 0 || skipped > 0 ? 'partial' : 'synced';

  const headIds = pushedIds.slice(0, 5).join(', ');
  const more = pushedIds.length > 5 ? ` 외 ${pushedIds.length - 5}건` : '';
  const summaryLine = pushed > 0
    ? `📝 TASK status 자동 갱신 ${pushed}건: ${headIds}${more}` +
      (skipped > 0 ? ` · skip ${skipped}` : '') +
      (errors.length > 0 ? ` · 오류 ${errors.length}` : '')
    : '';

  return { outcome, updates, pushed, skipped, errors, summaryLine };
}
