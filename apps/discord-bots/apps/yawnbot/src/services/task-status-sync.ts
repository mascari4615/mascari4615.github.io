/**
 * TASK status PR-머지 자동 sync — TASK-KAR-092.
 *
 * webhook.ts 가 PR `merged` 이벤트 수신 시 호출:
 *   runMemoScript('sync-task-status.mjs', ['--apply', '--json'])
 *   → diff 파싱 → per-file commitAndPushMemoFile → 알림 라인 빌더
 *
 * 평행 파이프 0 — 기존 substrate (memo-push · runMemoScript) 위에 핸들러 1개.
 * sync-task-status 자체 로직은 memo 정본 단일 출처.
 */
import * as path from 'node:path';
import { runMemoScript } from '../bot/agent-cadence-state';
import { commitAndPushMemoFile, type MemoPushResult } from './memo-push';

export interface TaskStatusDiff {
  id: string;
  current: string;
  target: string;
  reason: string;
  file: string;
  witnessHash?: string;
  witnessRepo?: string;
}

export interface TaskStatusSyncResult {
  outcome: 'no-change' | 'synced' | 'partial' | 'script-error' | 'parse-error' | 'no-memo-root';
  diffs: TaskStatusDiff[];
  pushed: number;
  skipped: number;
  errors: string[];
  /** #team-bus 알림용 1줄 라인 (변경 0 = 빈 문자열). */
  summaryLine: string;
}

export interface TaskStatusSyncDeps {
  run?: (memoRoot: string, script: string, args: string[]) => { code: number; out: string };
  push?: (env: NodeJS.ProcessEnv, absPath: string, message: string) => Promise<MemoPushResult>;
  logger?: Pick<Console, 'log' | 'warn'>;
}

/**
 * PR merge 후 1회 sync 실행.
 *
 * - script --apply --json 으로 frontmatter 갱신 (memo 디스크 변경).
 * - diff 마다 commitAndPushMemoFile 1회 (skipped:race 등은 다음 cadence 재시도).
 * - 어떤 단계 실패도 throw X — caller 비차단, 결과 객체로 반환.
 */
export async function syncTaskStatusOnPrMerge(
  env: NodeJS.ProcessEnv,
  prContext: { prNumber?: number; prTitle?: string },
  deps: TaskStatusSyncDeps = {},
): Promise<TaskStatusSyncResult> {
  const memoRoot = env.MEMO_REPO_PATH?.trim() || '';
  if (!memoRoot) {
    return { outcome: 'no-memo-root', diffs: [], pushed: 0, skipped: 0, errors: [], summaryLine: '' };
  }

  const run = deps.run ?? runMemoScript;
  const push = deps.push ?? commitAndPushMemoFile;
  const logger = deps.logger ?? console;

  const r = run(memoRoot, 'sync-task-status.mjs', ['--apply', '--json']);
  if (r.code !== 0) {
    logger.warn(`[task-status-sync] script exit ${r.code} — ${r.out.slice(0, 240)}`);
    return { outcome: 'script-error', diffs: [], pushed: 0, skipped: 0, errors: [`script exit ${r.code}`], summaryLine: '' };
  }

  let parsed: { diffs?: TaskStatusDiff[] };
  try {
    parsed = JSON.parse(r.out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn(`[task-status-sync] parse fail — ${msg.slice(0, 240)}`);
    return { outcome: 'parse-error', diffs: [], pushed: 0, skipped: 0, errors: [msg.slice(0, 240)], summaryLine: '' };
  }

  const diffs = parsed.diffs ?? [];
  if (diffs.length === 0) {
    return { outcome: 'no-change', diffs: [], pushed: 0, skipped: 0, errors: [], summaryLine: '' };
  }

  let pushed = 0;
  let skipped = 0;
  const errors: string[] = [];
  const pushedIds: string[] = [];

  for (const d of diffs) {
    const absPath = path.join(memoRoot, d.file);
    const prefix = prContext.prNumber ? `PR #${prContext.prNumber} merge` : 'PR merge';
    const msg = `chore(tasks): ${d.id} ${d.current} -> ${d.target} (auto ${prefix})`;
    try {
      const res = await push(env, absPath, msg);
      if (res.outcome === 'pushed') {
        pushed += 1;
        pushedIds.push(`${d.id} ${d.current}→${d.target}`);
      } else if (res.outcome.startsWith('skipped:')) {
        skipped += 1;
      } else {
        errors.push(`${d.id}: ${res.outcome} ${res.detail ?? ''}`.trim().slice(0, 200));
      }
    } catch (e) {
      const msg2 = e instanceof Error ? e.message : String(e);
      errors.push(`${d.id}: throw ${msg2.slice(0, 160)}`);
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

  return { outcome, diffs, pushed, skipped, errors, summaryLine };
}
