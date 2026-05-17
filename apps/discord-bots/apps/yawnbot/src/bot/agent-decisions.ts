// 사용자 → TASK 스레드 답변을 워커가 읽는 결정 저장소 (KAR-018-Y).
// 발단 완료조건 #2 "escalation 승인 루프 닫힘" — 워커가 "A/B?" 물으면
// 사용자가 그 TASK 디스코드 스레드에 답글 → 봇이 여기 기록 → 다음 워커
// pickup 시 buildWorkerPrompt 가 임베드 → claude 가 답 갖고 이어감.
//
// gitignore 파생 런타임(.claude/agent-decisions.jsonl, agent-approvals
// 계보). 순수(parse/format/block) 전수검증, append/read = IO.
import fs from 'fs';
import path from 'path';

export interface Decision {
  taskId: string;
  text: string;
  by: string;
  ts: string;
}

export function decisionsPath(memoRoot: string): string {
  return path.join(memoRoot, '.claude', 'agent-decisions.jsonl');
}

/** jsonl 1줄 → Decision (이상행=null, 견고). 순수. */
export function parseDecisionLine(line: string): Decision | null {
  const t = line.trim();
  if (!t) return null;
  try {
    const o = JSON.parse(t);
    if (o && typeof o.taskId === 'string' && typeof o.text === 'string') {
      return {
        taskId: o.taskId,
        text: o.text,
        by: typeof o.by === 'string' ? o.by : '?',
        ts: typeof o.ts === 'string' ? o.ts : '',
      };
    }
  } catch {
    /* 이상행 skip */
  }
  return null;
}

/** TASK 의 사용자 결정들 → 프롬프트 블록(없으면 ''). 순수. */
export function formatDecisionsBlock(decisions: Decision[]): string {
  if (decisions.length === 0) return '';
  const lines = decisions.map(
    (d, i) => `${i + 1}. (${d.by}) ${d.text.replace(/\s+/g, ' ').trim()}`,
  );
  return [
    '[사용자 결정 — 디스코드 스레드 답변. *이 지시대로* 진행, 재질문 X]',
    ...lines,
  ].join('\n');
}

/** TASK 결정 전부(시간순). 파일 없음/이상=빈 배열(견고). IO. */
export function getDecisionsForTask(
  memoRoot: string,
  taskId: string,
): Decision[] {
  try {
    const raw = fs.readFileSync(decisionsPath(memoRoot), 'utf-8');
    return raw
      .split('\n')
      .map(parseDecisionLine)
      .filter((d): d is Decision => !!d && d.taskId === taskId);
  } catch {
    return [];
  }
}

/** 결정 1건 append (디렉토리 보장). best-effort throw 안 함. IO. */
export function recordDecision(
  memoRoot: string,
  d: Omit<Decision, 'ts'> & { ts?: string },
): boolean {
  try {
    const p = decisionsPath(memoRoot);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const rec: Decision = {
      taskId: d.taskId,
      text: d.text,
      by: d.by,
      ts: d.ts ?? new Date().toISOString(),
    };
    fs.appendFileSync(p, JSON.stringify(rec) + '\n', 'utf-8');
    return true;
  } catch {
    return false;
  }
}
