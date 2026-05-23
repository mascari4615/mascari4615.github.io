/**
 * task-forum-reconciler — memo TASK md status 변화를 #team-work forum-post
 * status 태그·embed 에 단방향 sync (md=정본, forum=파생).
 *
 * TASK-YB-039 P5-flavor (cadence/dialogue 미터치 — foreign session 안전).
 *
 * 비전: TASK 가 `seed → ready → in_progress → done` 진화하면 같은 forum-post
 * 의 status 태그 + embed 가 그대로 따라간다. 사용자 시점 = 디코 카드만
 * 봐도 진척 보임.
 *
 * 호출 = 부팅 1회 + 주기 setInterval (default 5분). 멱등 — last-applied
 * 캐시 (`.claude/task-forum-status-state.json`) 비교 후 drift 만 Discord
 * API 호출. 캐시 미존재 = 첫 sync (모든 entry 한 번 push).
 *
 * 가시 로그 (no-news-is-bad-news):
 *   [TaskForumReconciler] scanned=N drifted=K skipped=M missing=X errors=E
 */
import fs from 'fs';
import path from 'path';
import { evolveForumPost, type ClientLike } from './forum-post';
import {
  readAllLatestTaskForumLinks,
  type TaskForumLink,
} from './task-forum-bridge';
import {
  tagStatusFromTaskStatus,
  parseTaskFile,
} from './task-forum-backfill';

const TASK_DIRS = [
  'tasks',
  'wm/tasks',
  'life/tasks',
  'projects/karmolab/tasks',
  'projects/yawnbot/tasks',
];

export interface ReconcilerResult {
  scanned: number;
  drifted: number;
  skipped: number;
  /** ledger 에 있지만 md 못 찾음 (TASK 파일 rename 또는 삭제) — 알림용. */
  missing: number;
  errors: number;
}

export interface ReconcilerDeps {
  fs?: {
    existsSync: (p: string) => boolean;
    readdirSync: (p: string) => string[];
    readFileSync: (p: string, enc: 'utf-8') => string;
    writeFileSync: (p: string, data: string, enc: 'utf-8') => void;
    mkdirSync: (p: string, opts: { recursive: boolean }) => void;
  };
  logger?: Pick<Console, 'log' | 'warn'>;
}

/** state 캐시 경로 — last applied forum status per taskId. */
export function statusStatePath(env: NodeJS.ProcessEnv): string {
  const root = env.MEMO_REPO_PATH?.trim() || '';
  return root ? path.join(root, '.claude', 'task-forum-status-state.json') : '';
}

export function readStatusState(
  env: NodeJS.ProcessEnv,
  fsImpl: ReconcilerDeps['fs'] = fs,
): Record<string, string> {
  const p = statusStatePath(env);
  if (!p || !fsImpl!.existsSync(p)) return {};
  try {
    const text = fsImpl!.readFileSync(p, 'utf-8');
    const obj = JSON.parse(text);
    return obj && typeof obj === 'object' ? (obj as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function writeStatusState(
  env: NodeJS.ProcessEnv,
  state: Record<string, string>,
  fsImpl: ReconcilerDeps['fs'] = fs,
): void {
  const p = statusStatePath(env);
  if (!p) return;
  try {
    fsImpl!.mkdirSync(path.dirname(p), { recursive: true });
    fsImpl!.writeFileSync(p, JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    /* best-effort */
  }
}

/** memoRoot 하위 TASK_DIRS 에서 taskId 의 md 파일 찾기. 미존재 = null. */
function findTaskMdAbs(
  memoRoot: string,
  taskId: string,
  fsImpl: ReconcilerDeps['fs'] = fs,
): string | null {
  for (const dir of TASK_DIRS) {
    const dirAbs = path.join(memoRoot, dir);
    if (!fsImpl!.existsSync(dirAbs)) continue;
    let files: string[];
    try {
      files = fsImpl!.readdirSync(dirAbs);
    } catch {
      continue;
    }
    const match = files.find(
      (f) => f === `${taskId}.md` || f.startsWith(`${taskId}-`) || f.startsWith(`${taskId}.`),
    );
    if (match) return path.join(dirAbs, match);
  }
  return null;
}

/**
 * 1회 reconcile. 각 ledger entry 에 대해:
 *  - md status 읽음 → tagStatus 산출
 *  - last-applied 와 비교 → 다르면 evolveForumPost(statusTag + threadMessage)
 *  - state 캐시 갱신
 *
 * client 없음 = dry-run (drift 만 카운트, Discord API 미호출). 테스트용.
 */
export async function reconcileTaskForumStatusOnce(
  client: ClientLike | null,
  env: NodeJS.ProcessEnv,
  deps: ReconcilerDeps = {},
): Promise<ReconcilerResult> {
  const logger = deps.logger ?? console;
  const fsImpl = deps.fs ?? fs;
  const memoRoot = env.MEMO_REPO_PATH?.trim() || '';
  const stat: ReconcilerResult = {
    scanned: 0,
    drifted: 0,
    skipped: 0,
    missing: 0,
    errors: 0,
  };
  if (!memoRoot) {
    logger.log('[TaskForumReconciler] MEMO_REPO_PATH 미설정 — skip');
    return stat;
  }
  const links: TaskForumLink[] = readAllLatestTaskForumLinks(env);
  stat.scanned = links.length;
  const state = readStatusState(env, fsImpl);
  let stateChanged = false;
  for (const link of links) {
    const abs = findTaskMdAbs(memoRoot, link.taskId, fsImpl);
    if (!abs) {
      stat.missing += 1;
      continue;
    }
    const { status } = parseTaskFile(abs, path.basename(abs), fsImpl);
    if (!status) {
      stat.missing += 1;
      continue;
    }
    const desired = tagStatusFromTaskStatus(status);
    const last = state[link.taskId];
    if (last === desired) {
      stat.skipped += 1;
      continue;
    }
    if (client) {
      try {
        await evolveForumPost(
          client,
          { postId: link.postId, channelId: link.channelId },
          {
            statusTag: desired,
            threadMessage: `📌 상태 변경: \`${last ?? '(첫 sync)'}\` → \`${desired}\` (md: ${status})`,
          },
        );
      } catch (e) {
        stat.errors += 1;
        logger.warn(
          `[TaskForumReconciler] ${link.taskId} evolve 실패: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
        continue;
      }
    }
    state[link.taskId] = desired;
    stateChanged = true;
    stat.drifted += 1;
  }
  if (stateChanged) writeStatusState(env, state, fsImpl);
  logger.log(
    `[TaskForumReconciler] scanned=${stat.scanned} drifted=${stat.drifted} skipped=${stat.skipped} missing=${stat.missing} errors=${stat.errors}`,
  );
  return stat;
}

/**
 * 주기 reconciler 시작. setInterval 핸들 반환 (test cleanup 용).
 * 기본 5분. env `YAWNBOT_TASK_FORUM_RECONCILE_INTERVAL_MIN` 으로 override.
 */
export function startTaskForumReconciler(
  client: ClientLike,
  env: NodeJS.ProcessEnv,
  deps: ReconcilerDeps = {},
): { stop: () => void } {
  const intervalMin = parseInt(
    env.YAWNBOT_TASK_FORUM_RECONCILE_INTERVAL_MIN || '5',
    10,
  );
  const ms = Math.max(60_000, intervalMin * 60_000);
  const handle = setInterval(() => {
    void reconcileTaskForumStatusOnce(client, env, deps).catch((e) => {
      const logger = deps.logger ?? console;
      logger.warn(
        `[TaskForumReconciler] tick 예외: ${e instanceof Error ? e.message : String(e)}`,
      );
    });
  }, ms);
  // Node setInterval 이 unref 가능하면 main 루프 종료 방해 X (CLI 한정).
  if (typeof handle.unref === 'function') handle.unref();
  return { stop: () => clearInterval(handle) };
}
