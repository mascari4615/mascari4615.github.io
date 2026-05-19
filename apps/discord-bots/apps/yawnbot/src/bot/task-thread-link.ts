// TASK frontmatter `discord_thread` 영속 매핑 (TASK-KAR-018-THR).
//
// 근본: 봇 = master push 마다 nssm restart. agent-thread-router 의
// taskThreads 는 in-memory Map → 재기동마다 소실 → 같은 TASK 다음
// 메시지에 *중복 스레드* 생성 + 옛 스레드(맥락·미응답 포함) 고아화
// (KAR-018-LT D2 「누적 0」를 churn 이 적극 파괴). 매핑을 TASK 파일
// frontmatter 에 기록 → 재기동 내성 + 클릭 가능 링크 + audit. 비밀
// 아님 → 커밋 가시 정합(feedback_nonsecret_config_visible_canon).
// memo write 경로 = heartbeat/agent-decisions 가 쓰는 그 인증 경로.
//
// 순수(parse/upsert) 전수검증, find/read/write = IO (best-effort,
// throw X — 게시 실패가 워커/판정 막지 X = agent-decisions 와 동근).
import fs from 'fs';
import path from 'path';
import { taskFoldersForId } from './proposal-adapter';

export const THREAD_LINK_KEY = 'discord_thread';

/**
 * frontmatter(`---`…`---`) 에서 `discord_thread` 값 추출. 순수.
 * frontmatter/키 없음 = null. id 또는 url 원문 그대로 (따옴표만 제거).
 */
export function parseThreadLink(content: string): string | null {
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  for (const line of fm[1].split(/\r?\n/)) {
    const m = line.match(/^discord_thread:\s*(.+?)\s*$/);
    if (m) {
      const v = m[1].replace(/^["']|["']$/g, '').trim();
      return v || null;
    }
  }
  return null;
}

/**
 * frontmatter 에 `discord_thread: <threadId>` 를 upsert. frontmatter
 * 가 없으면 원본 그대로 반환 (TASK 파일은 항상 frontmatter 보유 —
 * 날조 X, 안전). 이미 동일 값이면 무변경(write 회피). 순수·결정적.
 */
export function upsertThreadLink(content: string, threadId: string): string {
  const fm = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
  if (!fm) return content;
  const [, open, bodyRaw, close] = fm;
  const nl = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = bodyRaw.split(/\r?\n/);
  const entry = `${THREAD_LINK_KEY}: ${threadId}`;
  const idx = lines.findIndex((l) => /^discord_thread:/.test(l));
  if (idx >= 0) {
    if (lines[idx] === entry) return content;
    lines[idx] = entry;
  } else {
    lines.push(entry);
  }
  return content.replace(fm[0], open + lines.join(nl) + close);
}

/**
 * taskId(`TASK-…`) → TASK 파일 절대경로. 후보 폴더만 스캔(전 repo X).
 * 1차 = 파일명 prefix(`TASK-…-slug.md` 관례, read 0), 폴백 = frontmatter
 * `id:` 정확 일치(비표준 파일명 견고). 제안 id(pXXX) 등 비-TASK = null
 * (TASK 파일 부재 → write-back no-op, durability 는 name-search 가 담당).
 */
export function findTaskFile(memoRoot: string, taskId: string): string | null {
  if (!memoRoot || !/^TASK-[A-Z]/.test(taskId)) return null;
  const folders = taskFoldersForId(taskId);
  // 1차: 파일명 (cheap, read 없음)
  for (const folder of folders) {
    const dir = path.join(memoRoot, folder);
    let files: string[];
    try {
      files = fs.readdirSync(dir);
    } catch {
      continue;
    }
    const byName = files.find(
      (f) =>
        f.endsWith('.md') &&
        (f.startsWith(`${taskId}-`) || f === `${taskId}.md`),
    );
    if (byName) return path.join(dir, byName);
  }
  // 폴백: frontmatter id 정확 일치 (파일명이 관례를 벗어난 경우)
  const idLine = new RegExp(`^id:\\s*${taskId}\\s*$`, 'm');
  for (const folder of folders) {
    const dir = path.join(memoRoot, folder);
    let files: string[];
    try {
      files = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith('.md')) continue;
      const abs = path.join(dir, f);
      try {
        if (idLine.test(fs.readFileSync(abs, 'utf-8'))) return abs;
      } catch {
        /* 읽기 실패 → 다음 */
      }
    }
  }
  return null;
}

/** TASK 파일의 `discord_thread` 읽기. 미발견/부재 = null. IO·견고. */
export function readTaskThreadLink(
  memoRoot: string,
  taskId: string,
): string | null {
  const abs = findTaskFile(memoRoot, taskId);
  if (!abs) return null;
  try {
    return parseThreadLink(fs.readFileSync(abs, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * TASK 파일에 `discord_thread` write-back. 파일 미발견(제안 id 등) =
 * false (no-op, 비차단). 이미 동일 = true(무 write). IO·best-effort.
 */
export function writeTaskThreadLink(
  memoRoot: string,
  taskId: string,
  threadId: string,
): boolean {
  const abs = findTaskFile(memoRoot, taskId);
  if (!abs) return false;
  try {
    const cur = fs.readFileSync(abs, 'utf-8');
    const next = upsertThreadLink(cur, threadId);
    if (next === cur) return true;
    fs.writeFileSync(abs, next, 'utf-8');
    return true;
  } catch {
    return false;
  }
}
