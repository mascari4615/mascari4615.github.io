// TASK 별 Discord 스레드 영속 매핑 (KAR-018-THR).
//
// 사용자 발화 (2026-05-18, 의역 X): "아예 Task 별로 스레드를 만드는거 어때요?
// Task 별로 스레드 링크를 적어두는 식 등으로 가능하지않나 ?"
//
// 근본 진단: `agent-thread-router.makeThreadRouter` 의 `taskThreads` =
// in-memory Map. prod 봇 = master push 마다 nssm restart → 맵 소실 →
// 같은 TASK 다음 메시지가 *기존 스레드 이름검색 없이* `ch.threads.create`
// → 중복 스레드, 옛 스레드(사용자 미응답 포함) 고아 → OneDay 자동 아카이브
// = KAR-018-LT D2 「누적 0」 재기동 churn 으로 재현.
//
// 해소 = thread↔task 매핑 substrate 영속화. `agent-decisions.jsonl` 형제
// (같은 `.claude/` 디렉토리, 같은 jsonl·append-only, 같은 best-effort IO).
// 순수(parse/latestThreadFor) 전수검증, append/read = IO. Discord 무관 —
// substrate-clean.
import fs from 'fs';
import path from 'path';

export interface TaskThreadRec {
  taskId: string;
  threadId: string;
  channelId: string;
  ts: string;
}

export function taskThreadsPath(memoRoot: string): string {
  return memoRoot
    ? path.join(memoRoot, '.claude', 'agent-task-threads.jsonl')
    : '';
}

/** jsonl 1줄 → TaskThreadRec (이상행=null, 견고). 순수. */
export function parseTaskThreadLine(line: string): TaskThreadRec | null {
  const t = line.trim();
  if (!t) return null;
  try {
    const o = JSON.parse(t);
    if (
      o &&
      typeof o.taskId === 'string' &&
      o.taskId &&
      typeof o.threadId === 'string' &&
      o.threadId
    ) {
      return {
        taskId: o.taskId,
        threadId: o.threadId,
        channelId: typeof o.channelId === 'string' ? o.channelId : '',
        ts: typeof o.ts === 'string' ? o.ts : '',
      };
    }
  } catch {
    /* 손상행 skip — best-effort */
  }
  return null;
}

/** taskId 의 최신 매핑 (없으면 null). 같은 taskId 마지막 줄 유효. 순수. */
export function latestThreadFor(
  lines: string[],
  taskId: string,
): TaskThreadRec | null {
  let hit: TaskThreadRec | null = null;
  for (const line of lines) {
    const rec = parseTaskThreadLine(line);
    if (rec && rec.taskId === taskId) hit = rec;
  }
  return hit;
}

/** 파일에서 taskId 최신 매핑 1건 (파일 부재·손상 = null). IO. */
export function lookupTaskThread(
  memoRoot: string,
  taskId: string,
): TaskThreadRec | null {
  const p = taskThreadsPath(memoRoot);
  if (!p || !fs.existsSync(p)) return null;
  try {
    const lines = fs.readFileSync(p, 'utf-8').split(/\r?\n/);
    return latestThreadFor(lines, taskId);
  } catch {
    return null;
  }
}

/** 1건 append (디렉토리 보장). best-effort throw 안 함. IO. */
export function recordTaskThread(
  memoRoot: string,
  rec: Omit<TaskThreadRec, 'ts'> & { ts?: string },
): boolean {
  const p = taskThreadsPath(memoRoot);
  if (!p) return false;
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const full: TaskThreadRec = {
      taskId: rec.taskId,
      threadId: rec.threadId,
      channelId: rec.channelId,
      ts: rec.ts ?? new Date().toISOString(),
    };
    fs.appendFileSync(p, JSON.stringify(full) + '\n', 'utf-8');
    return true;
  } catch {
    return false;
  }
}
