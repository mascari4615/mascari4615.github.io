// TASK-YB-033: 디스코드 사장 메시지를 작업으로 자동 등록.
//
// YB-031 이 owner 요청을 포착(owner-requests.jsonl)·board·에이전트 즉답까지 했다.
// YB-033 = 그 요청을 *실제 도메인 TASK seed* 로 자동 변환 → autopilot 큐 진입.
// 도메인(LLM 판정)별 prefix/디렉토리/machine 에 맞춰 TASK-XX-NNN seed 파일 생성.
// status=seed = autopilot/사람 검토 윈도우 (바로 실행 X). 원 요청 = owner-requests.jsonl.

import fs from 'fs';
import path from 'path';
import { type RequestDomain, DOMAIN_AGENT } from './owner-request';

export interface DomainTaskSpec {
  prefix: string;
  dir: string;
  machine: string;
}

/** 도메인 → TASK prefix·디렉토리(memoRoot 기준)·machine. general = KAR 폴백. */
export const DOMAIN_TASK: Record<RequestDomain, DomainTaskSpec> = {
  WM: { prefix: 'WM', dir: 'wm/tasks', machine: 'cloud-wm' },
  KL: { prefix: 'KL', dir: 'projects/karmolab/tasks', machine: 'cloud-kl' },
  YB: { prefix: 'YB', dir: 'projects/yawnbot/tasks', machine: 'cloud-kl' },
  KAR: { prefix: 'KAR', dir: 'tasks', machine: 'any' },
  general: { prefix: 'KAR', dir: 'tasks', machine: 'any' },
};

/** 그 도메인 디렉토리에서 최대 TASK seq + 1. 디렉토리 부재/빈 = 1. */
export function nextTaskSeq(memoRoot: string, spec: DomainTaskSpec): number {
  const dirPath = path.join(memoRoot, spec.dir);
  let max = 0;
  try {
    const re = new RegExp(`^TASK-${spec.prefix}-(\\d+)`);
    for (const name of fs.readdirSync(dirPath)) {
      const m = name.match(re);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  } catch {
    /* 디렉토리 없음 = 0 */
  }
  return max + 1;
}

/** 요청 본문 → 파일명 slug (한글·영숫자 보존, 나머지 -, 40자 cap). */
export function slugify(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug || 'request';
}

export interface OwnerRequestTask {
  id: string;
  absPath: string;
  relPath: string;
  content: string;
}

/**
 * owner 요청 → 도메인 TASK seed (frontmatter + 본문). 정본 = memo/TASK-SCHEMA.md.
 * 발화 인용(품질게이트 필수) = 원 요청 텍스트. 파일은 호출부가 write(wx atomic).
 */
export function buildOwnerRequestTask(
  memoRoot: string,
  domain: RequestDomain,
  requestText: string,
  reqId: string,
): OwnerRequestTask | null {
  const spec = DOMAIN_TASK[domain];
  if (!spec) return null;
  const seq = nextTaskSeq(memoRoot, spec);
  const id = `TASK-${spec.prefix}-${String(seq).padStart(3, '0')}`;
  const slug = slugify(requestText);
  const fileName = `${id}-${slug}.md`;
  // relPath = forward slash (git/memo 정본 — Windows path.join backslash 회피).
  const relPath = `${spec.dir}/${fileName}`;
  const absPath = path.join(memoRoot, spec.dir, fileName);
  const agent = DOMAIN_AGENT[domain];
  const safeText = requestText.replace(/"/g, "'").slice(0, 300);
  const content = [
    '---',
    `id: ${id}`,
    'status: seed',
    'priority: normal',
    `machine: ${spec.machine}`,
    `path: [${domain.toLowerCase()}, owner-request]`,
    'tags: [owner-request]',
    '---',
    '',
    '## 목표',
    '',
    `> 사용자 발화: "${safeText}" (디스코드 사장 요청 자동 등록 — owner-request ${reqId}, YB-033)`,
    '',
    '## 컨텍스트',
    '',
    '- 사장이 디스코드에서 직접 요청 → owner-request 포착(YB-031) → TASK seed 자동 등록(YB-033).',
    `- 도메인 = ${domain} (LLM 판정) · 담당 에이전트 = ${agent}.`,
    '',
    '## 완료 조건',
    '',
    '- [ ] (검토 후 채움 — seed→ready 승격 시. 요청 의도 명확화 먼저)',
    '',
    '## 비고',
    '',
    '- 자동 생성 seed. autopilot 큐/사람 검토 후 진행. 원 요청 원문 = `.claude/owner-requests.jsonl`.',
    '',
  ].join('\n');
  return { id, absPath, relPath, content };
}

/**
 * build + atomic write (wx — 동일 경로 중복 시 throw). 호출부가 catch.
 * 반환 = 생성된 task (또는 null = 도메인 미해소). push 는 호출부 책임.
 */
export function writeOwnerRequestTask(
  memoRoot: string,
  domain: RequestDomain,
  requestText: string,
  reqId: string,
): OwnerRequestTask | null {
  const task = buildOwnerRequestTask(memoRoot, domain, requestText, reqId);
  if (!task) return null;
  fs.mkdirSync(path.dirname(task.absPath), { recursive: true });
  fs.writeFileSync(task.absPath, task.content, { flag: 'wx' });
  return task;
}
