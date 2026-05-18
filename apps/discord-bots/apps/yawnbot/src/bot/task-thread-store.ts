// TASK ↔ Discord 스레드 *영속* 매핑 (KAR-018-THR).
//
// 근본: agent-thread-router 의 taskThreads 가 in-memory Map 뿐 → prod 봇이
// master push 마다 nssm restart(2026-05-18 1h~5 deploy 실측) → 맵 소실 →
// 같은 TASK 다음 메시지에 *중복 스레드* + 옛 스레드(맥락·미응답) 고아화.
// = KAR-018-LT D2 「누적 0」 를 재기동 churn 이 적극 파괴.
//
// 설계(스펙 §설계): 영속 매핑 = TASK frontmatter `discord_thread`(비밀 X →
// 커밋 가시 정합). write 경로 = heartbeat/agent-decisions 가 이미 쓰는 그
// memo 인증 경로 재사용(MEMO_REPO_PATH). 본 모듈 = 순수 파일 IO 만(동기,
// best-effort) — Discord 무관, tmpdir 로 전수 단위검증.
import fs from 'fs';
import path from 'path';

/** TASK prefix → memo-root 기준 tasks 폴더 (proposal-adapter DOMAIN_MAP 정합). */
const PREFIX_FOLDER: Record<string, string> = {
  KAR: 'tasks',
  WM: 'wm/tasks',
  KL: 'projects/karmolab/tasks',
  YB: 'projects/yawnbot/tasks',
  LIFE: 'life/tasks',
  HOBBY: 'hobby/tasks',
  LEARN: 'learning/tasks',
};

/** taskId(TASK-<PREFIX>-…) → 후보 tasks 폴더 절대경로. 비-TASK(pXXX 제안)=null. */
export function taskFolderForId(
  memoRoot: string,
  taskId: string,
): string | null {
  if (!memoRoot) return null;
  const m = taskId.match(/^TASK-([A-Z]{2,6})-/);
  if (!m) return null; // 제안 id(pXXX) 등 = TASK 파일 없음 → 파일영속 미적용
  const folder = PREFIX_FOLDER[m[1]];
  if (!folder) return null;
  return path.join(memoRoot, folder);
}

/**
 * taskId 의 TASK .md 파일 절대경로 (frontmatter `id:` 정확매칭이 정본,
 * 파일명 prefix 는 빠른 1차 필터). 못 찾으면 null. 순수·동기·best-effort.
 */
export function findTaskFile(
  memoRoot: string,
  taskId: string,
): string | null {
  const dir = taskFolderForId(memoRoot, taskId);
  if (!dir) return null;
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  } catch {
    return null; // 폴더 부재
  }
  // 1차: 파일명이 `${taskId}-` / `${taskId}.md` (생성 관례 — materializeTask).
  const byName = files.filter(
    (f) => f === `${taskId}.md` || f.startsWith(`${taskId}-`),
  );
  const idRe = new RegExp(`^id:\\s*${taskId}\\s*$`, 'm');
  for (const f of [...byName, ...files]) {
    const abs = path.join(dir, f);
    try {
      const head = fs.readFileSync(abs, 'utf-8').slice(0, 4000);
      const fmEnd = head.indexOf('\n---', 3);
      const fm = fmEnd > 0 ? head.slice(0, fmEnd) : head;
      if (idRe.test(fm)) return abs;
    } catch {
      /* 손상/경합 — 다음 후보 */
    }
  }
  return null;
}

/** url("https://discord.com/channels/g/<id>") 또는 raw snowflake → 스레드 id. */
export function parseThreadRef(ref: string | null | undefined): string | null {
  const t = (ref || '').trim();
  if (!t) return null;
  const url = t.match(/channels\/\d+\/(\d+)/); // …/channels/<guild>/<thread>
  if (url) return url[1];
  return /^\d{5,}$/.test(t) ? t : null;
}

/** TASK 파일에 기록된 `discord_thread` → 스레드 id (없으면 null). */
export function readTaskThread(
  memoRoot: string,
  taskId: string,
): string | null {
  const file = findTaskFile(memoRoot, taskId);
  if (!file) return null;
  try {
    const src = fs.readFileSync(file, 'utf-8');
    const m = src.match(/^discord_thread:\s*(.+?)\s*$/m);
    return m ? parseThreadRef(m[1]) : null;
  } catch {
    return null;
  }
}

/**
 * TASK frontmatter 에 `discord_thread: <id>` write-back (멱등 — 있으면
 * 값 교체, 없으면 닫는 `---` 직전 삽입). 파일/폴더 없으면 no-op(false).
 * 동기·best-effort — 기록 실패가 스레드 라우팅을 막지 X(가용성 우선).
 */
export function writeTaskThread(
  memoRoot: string,
  taskId: string,
  threadId: string,
): boolean {
  if (!/^\d{5,}$/.test(threadId)) return false;
  const file = findTaskFile(memoRoot, taskId);
  if (!file) return false;
  let src: string;
  try {
    src = fs.readFileSync(file, 'utf-8');
  } catch {
    return false;
  }
  const existing = src.match(/^discord_thread:\s*(.+?)\s*$/m);
  if (existing) {
    if (parseThreadRef(existing[1]) === threadId) return true; // 멱등
    src = src.replace(/^discord_thread:.*$/m, `discord_thread: ${threadId}`);
  } else {
    // 첫 frontmatter 블록(--- … ---)의 닫는 --- 직전에 삽입.
    const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm) return false; // frontmatter 없는 파일 = 날조 X
    const close = src.indexOf('\n---', 3);
    if (close < 0) return false;
    src =
      src.slice(0, close) +
      `\ndiscord_thread: ${threadId}` +
      src.slice(close);
  }
  try {
    fs.writeFileSync(file, src, 'utf-8');
    return true;
  } catch {
    return false;
  }
}
