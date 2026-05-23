/**
 * task-forum-backfill — memo TASK md (status ∈ {ready, in_progress, seed})
 * 들을 #team-work forum-post 로 1회 시드. 멱등 (ledger 에 entry 있으면 skip).
 *
 * TASK-YB-039 P6 — proposal 흐름 *밖* 에서 직접 만들어진 TASK 들도
 * 같은 board 에서 보이게. 사용자 비전: "team-work 에 모든 작업중인 Task
 * 목록 표시".
 *
 * 호출 = boot 1회 (`clientReady` 직후, 채널 프로비저닝 *뒤* — agent-work
 * channelId 신선). 매 boot 멱등: 이미 ledger 박힌 건 skip → 첫 boot
 * 만 실비용. 새 TASK 가 생기면 다음 boot 가 자동 흡수.
 *
 * 가시 로그 (process.md § no-news-is-bad-news):
 *   [TaskForumBackfill] scanned=N pickable=K created=M skipped=S errors=E
 */
import fs from 'fs';
import path from 'path';
import {
  createForumPost,
  type ClientLike,
  type ForumDomain,
  type ForumKind,
} from './forum-post';
import {
  appendTaskForumLink,
  lookupTaskForumLinkByTaskId,
  forumTitleForTask,
} from './task-forum-bridge';

/** memo 하위 TASK 디렉토리. task-status-sync.ts § TASK_DIRS 와 정합. */
const TASK_DIRS = [
  'tasks',
  'wm/tasks',
  'life/tasks',
  'projects/karmolab/tasks',
  'projects/yawnbot/tasks',
];

/** backfill 대상 status — 아직 살아있는 작업만. done/wont_do/archived/sealed/deferred/absorbed 제외.
 *  in_review/unit_verified = 검증 대기 (작업 끝났지만 아직 done X — 사용자 시점 진행중).
 *  design = WM phase (아키텍처/설계 단계 — 진행중).
 *  hold = 일시 보류이지만 의도적 — 보여주는 게 안전. */
const PICKABLE_STATUSES = new Set([
  'ready',
  'in_progress',
  'in-progress',
  'active',
  'seed',
  'in_review',
  'unit_verified',
  'design',
  'hold',
]);

const TASK_ID_RE = /^(TASK-(?:KAR|WM|KL|YB|LIFE|HOBBY|LEARN)-[A-Z0-9][A-Z0-9-]*)/;

export interface TaskFileMeta {
  taskId: string;
  /** memoRoot 기준 상대 경로. */
  relPath: string;
  status: string;
  /** frontmatter title 또는 첫 H1, 없으면 filename body. */
  title: string;
}

export interface TaskForumBackfillResult {
  scanned: number;
  pickable: number;
  created: number;
  skipped: number;
  errors: number;
}

export interface BackfillDeps {
  fs?: {
    existsSync: (p: string) => boolean;
    readdirSync: (p: string) => string[];
    readFileSync: (p: string, enc: 'utf-8') => string;
  };
  logger?: Pick<Console, 'log' | 'warn'>;
}

/** filename `TASK-YB-039-team-work-단일-board-통합.md` → body `team work 단일 board 통합`. */
function fallbackTitleFromFilename(filename: string): string {
  const base = filename.replace(/\.md$/, '');
  const m = TASK_ID_RE.exec(base);
  if (!m) return base;
  const tail = base.slice(m[0].length).replace(/^[-_]+/, '');
  return tail.replace(/[-_]+/g, ' ').trim();
}

/**
 * md 파일에서 status + title 추출. 순수 — IO 주입 가능.
 *
 * - status = frontmatter `status: <val>` 첫 매치
 * - title = (frontmatter `title: <val>`) > (첫 `# H1`) > filename fallback
 */
export function parseTaskFile(
  abs: string,
  filename: string,
  fsImpl: BackfillDeps['fs'] = fs,
): { status: string | null; title: string } {
  const fallback = fallbackTitleFromFilename(filename);
  try {
    const content = fsImpl!.readFileSync(abs, 'utf-8');
    const statusM = content.match(/^status\s*:\s*([^\s#]+)/m);
    const titleM = content.match(/^title\s*:\s*"?([^"\n]+)"?$/m);
    const h1M = content.match(/^#\s+(.+?)\s*$/m);
    const title = (titleM?.[1] || h1M?.[1] || fallback || '(제목 없음)').trim();
    return {
      status: statusM ? statusM[1].trim() : null,
      title,
    };
  } catch {
    return { status: null, title: fallback };
  }
}

/** memoRoot 하위 5 TASK_DIRS scan → pickable TaskFileMeta 목록. */
export function listPickableTasks(
  memoRoot: string,
  deps: BackfillDeps = {},
): TaskFileMeta[] {
  const fsImpl = deps.fs ?? fs;
  if (!memoRoot || !fsImpl.existsSync(memoRoot)) return [];
  const out: TaskFileMeta[] = [];
  for (const dir of TASK_DIRS) {
    const dirAbs = path.join(memoRoot, dir);
    if (!fsImpl.existsSync(dirAbs)) continue;
    let files: string[];
    try {
      files = fsImpl.readdirSync(dirAbs);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith('.md')) continue;
      const m = TASK_ID_RE.exec(f);
      if (!m) continue;
      const taskId = m[1];
      const abs = path.join(dirAbs, f);
      const { status, title } = parseTaskFile(abs, f, fsImpl);
      if (!status || !PICKABLE_STATUSES.has(status)) continue;
      out.push({ taskId, relPath: path.join(dir, f), status, title });
    }
  }
  return out;
}

/** taskId prefix → forum domain 태그. 미지정 = KAR. */
function domainFromTaskId(taskId: string): ForumDomain {
  if (taskId.startsWith('TASK-WM-')) return 'WM';
  if (taskId.startsWith('TASK-KL-')) return 'KL';
  if (taskId.startsWith('TASK-YB-')) return 'YB';
  return 'KAR';
}

/** md status → forum status tag. ledger reconciler 와 정합 (재사용).
 *  in_review/unit_verified = approved (검증 후 done 직전 단계 시각 구분).
 *  design = in-progress (설계 = 진행). hold/seed/ready = pending. */
export function tagStatusFromTaskStatus(
  status: string,
): 'in-progress' | 'pending' | 'done' | 'rejected' | 'approved' {
  if (status === 'done') return 'done';
  if (status === 'wont_do' || status === 'rejected' || status === 'archived' || status === 'sealed') {
    return 'rejected';
  }
  if (status === 'in_review' || status === 'unit_verified') return 'approved';
  if (status === 'in_progress' || status === 'in-progress' || status === 'active' || status === 'design') {
    return 'in-progress';
  }
  return 'pending';
}

/**
 * 1회 backfill. 멱등 — 같은 taskId 의 ledger entry 가 있으면 skip.
 *
 * @returns 통계 (caller 가 로그).
 */
export async function runTaskForumBackfillOnce(
  client: ClientLike,
  env: NodeJS.ProcessEnv,
  deps: BackfillDeps = {},
): Promise<TaskForumBackfillResult> {
  const logger = deps.logger ?? console;
  const memoRoot = env.MEMO_REPO_PATH?.trim() || '';
  const tasks = listPickableTasks(memoRoot, deps);
  const stat: TaskForumBackfillResult = {
    scanned: tasks.length,
    pickable: tasks.length,
    created: 0,
    skipped: 0,
    errors: 0,
  };
  for (const t of tasks) {
    if (lookupTaskForumLinkByTaskId(env, t.taskId)) {
      stat.skipped += 1;
      continue;
    }
    try {
      // backfill = 이미 박힌 TASK md → forum-post. kind 'task' = TASK lifecycle
      // object (proposal/worker-report/discovery 와 의미 구분).
      const kind: ForumKind = 'task';
      const embed = {
        title: `🏷️ ${t.taskId}`,
        description: t.title,
        fields: [
          { name: '📌 상태', value: t.status, inline: true },
          { name: '📁 정본', value: `\`${t.relPath}\``, inline: true },
        ],
        footer: { text: 'memo md = 정본 · forum-post = 파생 (TASK-YB-039 P6 backfill)' },
        timestamp: new Date().toISOString(),
      };
      const handle = await createForumPost(client, env, {
        kind,
        domain: domainFromTaskId(t.taskId),
        title: forumTitleForTask(t.taskId, t.title),
        embed,
        // 초기 status 태그 = md status 매핑. in_progress TASK 가 'pending'
        // 으로 잘못 박히는 2단계 (생성→evolve) 회피.
        initialStatus: tagStatusFromTaskStatus(t.status),
      });
      if (!handle) {
        // forum 미프로비저닝 — 전체 중단 (다음 부팅 재시도).
        logger.warn(
          '[TaskForumBackfill] #team-work forum 미프로비저닝 — abort backfill, 다음 부팅 재시도',
        );
        break;
      }
      appendTaskForumLink(env, {
        taskId: t.taskId,
        postId: handle.postId,
        channelId: handle.channelId,
      });
      stat.created += 1;
    } catch (e) {
      stat.errors += 1;
      logger.warn(
        `[TaskForumBackfill] ${t.taskId} 생성 실패: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  logger.log(
    `[TaskForumBackfill] scanned=${stat.scanned} pickable=${stat.pickable} created=${stat.created} skipped=${stat.skipped} errors=${stat.errors}`,
  );
  return stat;
}
