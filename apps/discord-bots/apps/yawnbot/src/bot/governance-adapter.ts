/**
 * governance-adapter — 거버넌스 어댑터 층 (KAR-018-D slice-2).
 *
 * substrate⊥어댑터(parent ⓪'): governance.ts(순수) ↔ yawnbot 배선 사이.
 * 본 파일이 fs/ENV/team-room 형(form)을 알고, governance.ts 는 모름.
 *
 * slice-2 책임:
 *  · governance.reserveBudget verdict → team-room BudgetReserveFn(boolean) 매핑
 *  · trace jsonl append (KAR-003 discoveries 형식 재사용 — 평행정의 0)
 *  · !kill 전역: kill 파일 존재 시 reserve=deny (이벤트 경로도 자동 gating —
 *    사람↔디스코드 대화는 예산 비차단, 전역 kill 만 차단. agent-mission §4.1)
 *
 * 이벤트 경로 reserve 입력엔 추정치·risk-tag 가 없다(사람 직접 발화) →
 * 대개 allow. 작업단위 분류(risk-tag/추정/드리프트 3-판정)는 slice-3.
 */
import fs from 'fs';
import path from 'path';
import {
  reserveBudget as govReserveBudget,
  ceilingsFromEnv,
  type BudgetVerdict,
} from './governance';
import type { BudgetReserveFn } from './team-room';

function memoRoot(env: NodeJS.ProcessEnv): string {
  return env.MEMO_REPO_PATH?.trim() || '';
}

/** 전역 !kill 신호 파일 (agent-cadence 와 동일 경로 — 단일 채널). */
export function killFilePath(env: NodeJS.ProcessEnv): string {
  const root = memoRoot(env);
  return root ? path.join(root, '.claude', 'agent-kill') : '';
}

/** 전역 정지 여부 (이벤트·cadence 공통, parent ④ Kill Switch). */
export function isGloballyKilled(env: NodeJS.ProcessEnv): boolean {
  const f = killFilePath(env);
  return f !== '' && fs.existsSync(f);
}

export interface TraceEntry {
  ts: string;
  type: 'budget' | 'kill' | 'drift';
  core: string;
  channelId?: string;
  verdict?: BudgetVerdict;
  reason: string;
}

/**
 * trace 감사 append — `<memo>/.claude/discoveries/agent-trace.jsonl`
 * (discoveries jsonl 형식 재사용). best-effort: 실패해도 거버넌스 판정 불방해.
 */
export function appendTrace(env: NodeJS.ProcessEnv, entry: TraceEntry): void {
  const root = memoRoot(env);
  if (!root) return;
  try {
    const dir = path.join(root, '.claude', 'discoveries');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, 'agent-trace.jsonl'),
      JSON.stringify(entry) + '\n',
      'utf-8',
    );
  } catch {
    /* 감사 실패는 silent — 판정 자체를 막지 않음 (가용성 우선) */
  }
}

// ── pending-approval 영속 + resume (D-3, slice-3) ────────────
// escalate → approvals.jsonl 에 pending append + notify(#team-bus).
// resume = cadence 재pull 시 같은 objective 에 status:'approved' 라인 있으면
// escalate 우회. *블록된 live 프로세스 X* (process.md 백그라운드 자율종료 정합).

export interface ApprovalEntry {
  ts: string;
  objId: string;
  core: string;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
}

export function approvalsPath(env: NodeJS.ProcessEnv): string {
  const root = memoRoot(env);
  return root ? path.join(root, '.claude', 'agent-approvals.jsonl') : '';
}

export function appendApproval(
  env: NodeJS.ProcessEnv,
  entry: ApprovalEntry,
): void {
  const p = approvalsPath(env);
  if (!p) return;
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, JSON.stringify(entry) + '\n', 'utf-8');
  } catch {
    /* best-effort */
  }
}

/**
 * objId 가 사용자 승인됨? 마지막 상태 라인 기준 (approved=true / rejected·pending=false).
 * 사용자가 jsonl 에 `{"objId":..,"status":"approved"}` 라인 추가 = 승인
 * (slice-3 durable 인터페이스 — /approve 슬래시는 후속).
 */
export function isObjectiveApproved(
  env: NodeJS.ProcessEnv,
  objId: string,
): boolean {
  const p = approvalsPath(env);
  if (!p || !fs.existsSync(p)) return false;
  try {
    let approved = false;
    for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
      const s = line.trim();
      if (!s) continue;
      const e = JSON.parse(s) as ApprovalEntry;
      if (e.objId === objId) approved = e.status === 'approved';
    }
    return approved;
  } catch {
    return false;
  }
}

/** 이미 이 objId 에 pending 이 떠 있나 (중복 #team-bus 게시·jsonl 폭증 방지). */
export function hasPending(env: NodeJS.ProcessEnv, objId: string): boolean {
  const p = approvalsPath(env);
  if (!p || !fs.existsSync(p)) return false;
  try {
    let last: ApprovalEntry['status'] | null = null;
    for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
      const s = line.trim();
      if (!s) continue;
      const e = JSON.parse(s) as ApprovalEntry;
      if (e.objId === objId) last = e.status;
    }
    return last === 'pending';
  } catch {
    return false;
  }
}

export type NotifyFn = (msg: string) => void;

// 실 #team-bus 게시 오버라이드 (setBudgetReserve 패턴, 평행정의0).
// main.ts 가 Discord client 로 sendLocalEvent 래퍼를 주입. 미주입이면
// trace 만 (KAR-018-W slice-3 이전 동작 보존 — graceful).
let teamBusNotify: NotifyFn | null = null;
export function setTeamBusNotify(fn: NotifyFn | null): void {
  teamBusNotify = fn;
}

/**
 * #team-bus 알림. *항상 trace 감사* + teamBusNotify 주입 시 *실 Discord 게시*.
 * 전 엔진(governance escalate / self-improve·skill reject / factory /
 * proposal)이 이 단일 seam 을 소비 → 한 곳 배선으로 전부 관측 가능.
 */
export function defaultNotify(env: NodeJS.ProcessEnv): NotifyFn {
  return (msg) => {
    appendTrace(env, {
      ts: new Date().toISOString(),
      type: 'drift',
      core: 'cadence',
      reason: `#team-bus: ${msg}`,
    });
    if (teamBusNotify) {
      try {
        teamBusNotify(msg);
      } catch {
        /* 게시 실패가 감사·판정 막지 않음 (가용성 우선) */
      }
    }
  };
}

/**
 * team-room.setBudgetReserve 에 주입할 BudgetReserveFn.
 * 전역 kill → deny / governance verdict(allow|narrow → true, escalate|stop → false).
 * 매 판정 trace append.
 */
export function buildGovernanceReserve(
  env: NodeJS.ProcessEnv,
): BudgetReserveFn {
  const ceilings = ceilingsFromEnv(env);
  return ({ core, channelId }) => {
    if (isGloballyKilled(env)) {
      appendTrace(env, {
        ts: new Date().toISOString(),
        type: 'kill',
        core,
        channelId,
        reason: '!kill 전역 활성 — reserve deny',
      });
      return false;
    }
    const d = govReserveBudget({ core }, ceilings);
    appendTrace(env, {
      ts: new Date().toISOString(),
      type: 'budget',
      core,
      channelId,
      verdict: d.verdict,
      reason: d.reason,
    });
    return d.verdict === 'allow' || d.verdict === 'narrow';
  };
}
