/**
 * task-forum-bridge — memo TASK (md 정본) ↔ #team-work forum-post (Discord 표현) 매핑.
 *
 * 비전 (TASK-YB-039): 같은 forum-post 가 제안(proposal) → 채택(TASK 생성)
 * → 진행 → done 까지 한 객체로 산다. 채택 시 같은 thread 의 제목을
 * `제안 <id>: ...` 에서 `[TASK-YB-NNN] ...` 로 rename — 사용자 시점
 * 단일 흐름 가시화.
 *
 * 정본 방향: md TASK = 정본, forum-post = 파생 (active-sessions 라이브 투영
 * 패턴 재사용 — 평행 정의 0). 본 모듈 = 그 *매핑* 만 영속. ledger 1개
 * (`.claude/task-forum-bridge.jsonl`) append-only, 마지막 entry = 최신.
 *
 * 호출자: agent-bus § reconcileProposalCards 의 adopt 분기 (proposal 의
 * 같은 thread 를 TASK 의 thread 로 승격). 신규 worker-report·backfill 도
 * 추후 (P4-P6) 본 ledger 경유.
 */
import fs from 'fs';
import path from 'path';

export interface TaskForumLink {
  /** 'TASK-YB-039' 같은 정규 TASK id. */
  taskId: string;
  /** forum-post = thread id. */
  postId: string;
  /** team-work forum 채널 id (verdict reconciler 가 fetch 시 필요). */
  channelId: string;
  /** 어떤 proposal id 가 이 TASK 로 졸업했는지 (선택). */
  proposalId?: string;
  ts: string;
}

const TASK_ID_RE = /TASK-[A-Z]+-\d+/;

/**
 * basename 또는 임의 문자열에서 첫 TASK id 추출. 'TASK-YB-039-...'·
 * 'TASK-YB-039.md'·'생성됨: TASK-YB-039 (...)' 모두 동일 hit.
 *
 * @returns 'TASK-YB-039' 같은 정규 id, 또는 null.
 */
export function parseTaskId(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = TASK_ID_RE.exec(s);
  return m ? m[0] : null;
}

/**
 * forum thread 제목 100자 한도 내에서 `[TASK-YB-NNN] {body}` 조립.
 * body 가 비면 prefix 만. discord native 한도(100) 안전.
 */
export function forumTitleForTask(taskId: string, body?: string): string {
  const prefix = `[${taskId}] `;
  const max = 100;
  const tail = (body || '').trim();
  if (!tail) return prefix.trimEnd().slice(0, max);
  const room = max - prefix.length;
  if (room <= 0) return prefix.slice(0, max);
  return prefix + tail.slice(0, room);
}

export function taskForumLedgerPath(env: NodeJS.ProcessEnv): string {
  const root = env.MEMO_REPO_PATH?.trim() || '';
  return root ? path.join(root, '.claude', 'task-forum-bridge.jsonl') : '';
}

/** append-only ledger 1줄 박음. best-effort (root 미설정 = noop). */
export function appendTaskForumLink(
  env: NodeJS.ProcessEnv,
  link: Omit<TaskForumLink, 'ts'> & { ts?: string },
): void {
  const p = taskForumLedgerPath(env);
  if (!p) return;
  const entry: TaskForumLink = {
    taskId: link.taskId,
    postId: link.postId,
    channelId: link.channelId,
    proposalId: link.proposalId,
    ts: link.ts || new Date().toISOString(),
  };
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, JSON.stringify(entry) + '\n', 'utf-8');
  } catch {
    /* best-effort */
  }
}

/** taskId → 최신 매핑 1건. 미존재 = null. */
export function lookupTaskForumLinkByTaskId(
  env: NodeJS.ProcessEnv,
  taskId: string,
): TaskForumLink | null {
  const p = taskForumLedgerPath(env);
  if (!p || !fs.existsSync(p)) return null;
  try {
    let hit: TaskForumLink | null = null;
    for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      try {
        const e = JSON.parse(t) as TaskForumLink;
        if (e.taskId === taskId) hit = e;
      } catch {
        /* skip malformed */
      }
    }
    return hit;
  } catch {
    return null;
  }
}

/** 전 ledger 의 taskId 별 *최신* 1건 (reconciler 가 일괄 처리용).
 *  중복 append 의 옛 entry 는 자연 superseded. */
export function readAllLatestTaskForumLinks(
  env: NodeJS.ProcessEnv,
): TaskForumLink[] {
  const p = taskForumLedgerPath(env);
  if (!p || !fs.existsSync(p)) return [];
  try {
    const byTaskId = new Map<string, TaskForumLink>();
    for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      try {
        const e = JSON.parse(t) as TaskForumLink;
        byTaskId.set(e.taskId, e);
      } catch {
        /* skip */
      }
    }
    return Array.from(byTaskId.values());
  } catch {
    return [];
  }
}

/** postId → 최신 매핑 1건 (역방향 — worker-report 에서 thread → TASK 회수). */
export function lookupTaskForumLinkByPostId(
  env: NodeJS.ProcessEnv,
  postId: string,
): TaskForumLink | null {
  const p = taskForumLedgerPath(env);
  if (!p || !fs.existsSync(p)) return null;
  try {
    let hit: TaskForumLink | null = null;
    for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      try {
        const e = JSON.parse(t) as TaskForumLink;
        if (e.postId === postId) hit = e;
      } catch {
        /* skip */
      }
    }
    return hit;
  } catch {
    return null;
  }
}
