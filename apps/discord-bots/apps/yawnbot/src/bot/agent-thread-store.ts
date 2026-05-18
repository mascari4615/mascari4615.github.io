// TASK ↔ Discord 스레드 *영속* 매핑 (TASK-KAR-018-THR).
//
// 근본: agent-thread-router 의 taskThreads 는 in-memory Map — prod 봇은
// master push 마다 nssm restart(2026-05-18 1h ~5 deploy) → 맵 소실 →
// 같은 TASK 다음 메시지에 *중복 스레드* + 옛 스레드(맥락·미응답) 고아.
// = KAR-018-LT D2「누적 0」를 재기동 churn 이 적극 파괴.
//
// 영속 매핑 = TASK frontmatter `discord_thread` (id). 비밀 아님 →
// 커밋 가시 정합. memo write 경로 = agent-decisions 가 쓰는 그 memoRoot
// 재사용(평행정의0). 순수(parse/locate/upsert) 전수검증, 파일 R/W = IO.
import fs from 'fs';
import path from 'path';
import { taskFolderForPrefix } from './proposal-adapter';

/** `TASK-KAR-018-THR` → prefix `KAR`. 비매치=null. 순수. */
export function prefixOfTaskId(taskId: string): string | null {
  const m = taskId.match(/^TASK-([A-Z]{2,6})-/);
  return m ? m[1] : null;
}

/** id 정규화(선행 `TASK-` strip + 대문자) — 파일명/frontmatter 혼용 흡수. 순수. */
export function normalizeTaskId(raw: string): string {
  return raw
    .trim()
    .replace(/^TASK-/i, '')
    .toUpperCase();
}

/**
 * frontmatter `discord_thread:` 값 → 스레드 id. id 도 url
 * (https://discord.com/channels/<g>/<id>) 도 허용 → 끝 숫자열만 추출.
 * 못 뽑으면 null. 순수.
 */
export function parseThreadValue(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const t = String(raw).trim().replace(/^["']|["']$/g, '');
  if (!t) return null;
  // url 이면 마지막 path 세그먼트, 아니면 그대로 — 숫자열(snowflake)만 채택.
  const seg = t.includes('/') ? t.split('/').filter(Boolean).pop() ?? '' : t;
  const m = seg.match(/\d{5,}/);
  return m ? m[0] : null;
}

/** 프론트매터 블록에서 `discord_thread` 값 추출(없으면 null). 순수. */
export function readThreadFromFrontmatter(fileContent: string): string | null {
  const fm = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  for (const line of fm[1].split(/\r?\n/)) {
    const m = line.match(/^discord_thread\s*:\s*(.+)$/);
    if (m) return parseThreadValue(m[1]);
  }
  return null;
}

/**
 * frontmatter 에 `discord_thread: <id>` upsert. 기존 줄 있으면 교체,
 * 없으면 닫는 `---` 직전 삽입. frontmatter 블록 없으면 null(미손상 —
 * write-back skip). 순수·결정적.
 */
export function upsertThreadInFrontmatter(
  fileContent: string,
  threadId: string,
): string | null {
  const fm = fileContent.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
  if (!fm) return null;
  const [, open, body, close] = fm;
  const nl = fileContent.includes('\r\n') ? '\r\n' : '\n';
  const lines = body.split(/\r?\n/);
  let replaced = false;
  const next = lines.map((l) => {
    if (/^discord_thread\s*:/.test(l)) {
      replaced = true;
      return `discord_thread: ${threadId}`;
    }
    return l;
  });
  if (!replaced) next.push(`discord_thread: ${threadId}`);
  const rebuilt = open + next.join(nl) + close;
  return fileContent.replace(fm[0], rebuilt);
}

/**
 * taskId 에 해당하는 TASK 파일 절대경로 (없으면 null). prefix → 도메인
 * 폴더(정본 = proposal-adapter DOMAIN_MAP, 평행정의0) 평면 스캔 후
 * frontmatter `id` 정규화 일치로 확정 (TASK-KAR-018 vs -018-THR 오매치
 * 방지). map miss(재기동) 시에만 호출 — IO 비용 수용. IO.
 */
export function findTaskFile(
  memoRoot: string,
  taskId: string,
): string | null {
  if (!memoRoot) return null;
  const prefix = prefixOfTaskId(taskId);
  if (!prefix) return null;
  const folder = taskFolderForPrefix(prefix);
  if (!folder) return null;
  const dir = path.join(memoRoot, folder);
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const want = normalizeTaskId(taskId);
  // 빠른 경로: 파일명이 taskId 로 시작(경계 `-`/`.`) → 우선 후보.
  const ordered = files
    .filter((f) => /^TASK-.*\.md$/i.test(f))
    .sort((a, b) => {
      const ap = a.startsWith(taskId) ? 0 : 1;
      const bp = b.startsWith(taskId) ? 0 : 1;
      return ap - bp;
    });
  for (const f of ordered) {
    const abs = path.join(dir, f);
    let content: string;
    try {
      content = fs.readFileSync(abs, 'utf-8');
    } catch {
      continue;
    }
    const fileId = parseFrontmatterId(content);
    if (fileId && normalizeTaskId(fileId) === want) return abs;
  }
  return null;
}

/** frontmatter 블록의 `id:` 원시값(없으면 null). 순수. */
export function parseFrontmatterId(fileContent: string): string | null {
  const fm = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  for (const line of fm[1].split(/\r?\n/)) {
    const m = line.match(/^id\s*:\s*(.+)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

/** TASK 파일에 기록된 스레드 id (없음/오류=null). IO. */
export function readTaskThreadId(
  memoRoot: string,
  taskId: string,
): string | null {
  const file = findTaskFile(memoRoot, taskId);
  if (!file) return null;
  try {
    return readThreadFromFrontmatter(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * TASK 파일 frontmatter 에 스레드 id write-back (durability+UX+audit).
 * 멱등(동일값=무변경). 파일/프론트매터 없으면 false(best-effort,
 * 게시 막지 X). IO.
 */
export function writeTaskThreadId(
  memoRoot: string,
  taskId: string,
  threadId: string,
): boolean {
  const file = findTaskFile(memoRoot, taskId);
  if (!file) return false;
  try {
    const cur = fs.readFileSync(file, 'utf-8');
    if (readThreadFromFrontmatter(cur) === threadId) return true; // 멱등
    const next = upsertThreadInFrontmatter(cur, threadId);
    if (next == null || next === cur) return false;
    fs.writeFileSync(file, next, 'utf-8');
    return true;
  } catch {
    return false;
  }
}
