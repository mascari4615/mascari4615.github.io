/**
 * system-health — 기둥4 자기수술 헬스 신호 수집·진단 (TASK-KAR-018-LT).
 *
 * 진단(2026-05-19): retro/QC 가 형식적인 구조적 근본 =
 *  ① retro: progressLog 기반 메타-목표 조정뿐 — 시스템 실작동(cadence 침묵·
 *     워커 실패·trace 정지)는 아예 안 봄. progressLog.length===0 게이트로
 *     진전이 없을수록 retro 도 안 돔(역설).
 *  ② QC: LLM 0, 순수 사용자 핑 — 사용자가 Discord 확인 안 하면 진단 0.
 *
 * 본 모듈 = 기존 substrate(agent-trace.jsonl, team-portfolio.json)만 읽는
 * 순수·결정적 헬스 신호 수집 (Discord·LLM·git 0 — 최소 의존).
 * best-effort: 각 신호 실패 = 해당 필드 null (hang·throw X).
 */
import fs from 'fs';
import path from 'path';
import { loadPortfolio } from './team-portfolio';

// ── 신호 수집 ────────────────────────────────────────────────────────────────

export interface HealthSignals {
  /** agent-trace.jsonl 마지막 항목 이후 경과 시간(h). 없으면 Infinity. */
  traceStalenessHrs: number;
  /** 모든 active 프로젝트 progressLog 가 비어있는가 (전진 기록 전무). */
  progressStale: boolean;
  /** 최근 6h trace 에서 worker 결과: fail/(done+fail). 데이터 없으면 null. */
  workerFailRatio: number | null;
  /** 최근 24h trace 에서 type==='error' 이벤트 수. */
  traceErrorCount: number;
  /**
   * 최근 6h 안에 동일 task id 가 3회 이상 *no-op done* (착수 → no-op → 종료) 반복한 task 수.
   * ≥1 = 「Cronbot 패턴」 (사용자 발화 2026-05-22): cron 이 돌지만 매번 동일 동작 = 자가발전 0.
   * 근본 원인 = status drift (frontmatter ≠ 코드 실상태) → 워커 PICKABLE 무한 재선택.
   * sync regex fix (commit bbe2af42/e4cb1c58) 후에도 잔존 패턴 감지용.
   */
  brokenLoopTaskCount: number;
}

interface TraceEntry {
  ts?: string;
  type?: string;
  core?: string;
  reason?: string;
  task?: string;
}

// gatherHealthSignals 가 4회 호출 → 매 cycle 전체 trace parse = O(N). 6h/24h
// window 만 보므로 tail 만 read. 누적 trace 가 커져도 cadence latency 영향 X.
const TRACE_TAIL_LINES = 2000;
function readTraceLines(memoRoot: string): TraceEntry[] {
  try {
    const p = path.join(memoRoot, '.claude', 'discoveries', 'agent-trace.jsonl');
    if (!fs.existsSync(p)) return [];
    return fs
      .readFileSync(p, 'utf-8')
      .split(/\r?\n/)
      .slice(-TRACE_TAIL_LINES)
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l) as TraceEntry;
        } catch {
          return {};
        }
      });
  } catch {
    return [];
  }
}

/**
 * 시스템 헬스 신호 수집 (순수 IO, best-effort, 각 신호 실패 = 안전 기본값).
 */
export function gatherHealthSignals(
  env: NodeJS.ProcessEnv,
  nowMs: number = Date.now(),
): HealthSignals {
  const memoRoot = env.MEMO_REPO_PATH?.trim() || '';

  // traceStalenessHrs
  let traceStalenessHrs = Infinity;
  if (memoRoot) {
    try {
      const lines = readTraceLines(memoRoot);
      const tss = lines
        .map((e) => e.ts)
        .filter(Boolean)
        .map((s) => Date.parse(s!))
        .filter(isFinite);
      if (tss.length > 0) {
        const lastMs = Math.max(...tss);
        traceStalenessHrs = (nowMs - lastMs) / 3_600_000;
      }
    } catch {
      /* best-effort */
    }
  }

  // progressStale
  let progressStale = true;
  if (memoRoot) {
    try {
      const portfolio = loadPortfolio(memoRoot);
      progressStale = portfolio.projects
        .filter((p) => p.status === 'active')
        .every((p) => p.progressLog.length === 0);
    } catch {
      /* best-effort — 미발견 시 안전 기본(true=stale) */
    }
  }

  // workerFailRatio (최근 6h)
  // status 분류:
  //  - done             = 성공(push 확인)
  //  - escalated        = 사용자 결정 필요로 올바르게 라우팅 = *정상 동작* (분모·분자 둘 다 제외)
  //  - done-no-artifact = 실행했으나 산출 0 = soft fail (분자)
  //  - error/timeout/.. = hard fail (분자)
  // 「escalated 도 fail 카운트」 버그 fix: 봇이 결정 task 만 보아도 100% fail
  // 신호 → surgery loop 무한 발동 (KAR-130/132/138~144 자기복제 직접 원인).
  let workerFailRatio: number | null = null;
  if (memoRoot) {
    try {
      const cutoff6h = new Date(nowMs - 6 * 3_600_000).toISOString();
      const lines = readTraceLines(memoRoot);
      let done = 0;
      let fail = 0;
      for (const e of lines) {
        if (!e.ts || e.ts < cutoff6h) continue;
        const m = /^worker\s+\S+\s+(\S+)/.exec(e.reason || '');
        if (!m) continue;
        const status = m[1];
        if (status === 'done') done++;
        else if (status === 'escalated') { /* 정상 라우팅 = 분모 미포함 */ }
        else fail++;
      }
      if (done + fail > 0) workerFailRatio = fail / (done + fail);
    } catch {
      /* best-effort */
    }
  }

  // traceErrorCount (최근 24h)
  let traceErrorCount = 0;
  if (memoRoot) {
    try {
      const cutoff24h = new Date(nowMs - 24 * 3_600_000).toISOString();
      const lines = readTraceLines(memoRoot);
      traceErrorCount = lines.filter(
        (e) => e.ts && e.ts >= cutoff24h && e.type === 'error',
      ).length;
    } catch {
      /* best-effort */
    }
  }

  // brokenLoopTaskCount (최근 6h, 동일 task id no-op done ≥3회)
  //   trace.jsonl 의 reason `worker <core> done` 라인을 task id 별 누적.
  //   sync regex fix 후에도 잔존하는 broken loop 패턴 — 코드/스펙 drift 가
  //   real fail mode 임을 health signal 로 표면화 → self-surgery LLM 진단 가능.
  let brokenLoopTaskCount = 0;
  if (memoRoot) {
    try {
      const cutoff6h = new Date(nowMs - 6 * 3_600_000).toISOString();
      const lines = readTraceLines(memoRoot);
      const doneCount = new Map<string, number>();
      for (const e of lines) {
        if (!e.ts || e.ts < cutoff6h) continue;
        if (!/\bdone\b/.test(e.reason || '')) continue;
        // reason "worker <core> done TASK-XXX-NNN ..." → task id 추출.
        // 또는 e.task 필드 직접 사용 (스키마 확장 대비).
        const taskId =
          e.task ||
          (e.reason || '').match(/TASK-[A-Z]+-\d{3}(?:-[A-Z0-9]+)*/)?.[0] ||
          null;
        if (!taskId) continue;
        doneCount.set(taskId, (doneCount.get(taskId) ?? 0) + 1);
      }
      for (const [, count] of doneCount) {
        if (count >= 3) brokenLoopTaskCount++;
      }
    } catch {
      /* best-effort */
    }
  }

  return { traceStalenessHrs, progressStale, workerFailRatio, traceErrorCount, brokenLoopTaskCount };
}

// ── 진단 ─────────────────────────────────────────────────────────────────────

export interface HealthIssue {
  severity: 'warn' | 'critical';
  code: string;
  detail: string;
}

export interface HealthThresholds {
  traceStaleWarnHrs: number;    // default 2
  traceStaleCriticalHrs: number; // default 24
  workerFailWarn: number;       // default 0.5
  workerFailCritical: number;   // default 0.8
  traceErrorCritical: number;   // default 5
}

export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  traceStaleWarnHrs: 2,
  traceStaleCriticalHrs: 24,
  workerFailWarn: 0.5,
  workerFailCritical: 0.8,
  traceErrorCritical: 5,
};

/**
 * 헬스 신호 → 이슈 목록 (순수·결정적). 이슈 없으면 빈 배열.
 */
export function diagnoseHealth(
  signals: HealthSignals,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS,
): HealthIssue[] {
  const issues: HealthIssue[] = [];

  if (signals.traceStalenessHrs >= thresholds.traceStaleCriticalHrs) {
    issues.push({
      severity: 'critical',
      code: 'cadence-stale',
      detail: `cadence trace ${Math.round(signals.traceStalenessHrs)}h 침묵 — 봇 정지·배포 실패·kill 의심`,
    });
  } else if (signals.traceStalenessHrs >= thresholds.traceStaleWarnHrs) {
    issues.push({
      severity: 'warn',
      code: 'cadence-slow',
      detail: `cadence trace ${Math.round(signals.traceStalenessHrs)}h 경과 — 틱 지연 가능`,
    });
  }

  if (signals.progressStale) {
    // KAR-018 후속 (2026-05-22 사용자 goal "에이전트 봇이 지혼자 자가발전"):
    // warn → critical 승격. 팀이 자기 코드만 청소하고 사용자 북극성 (WM 등)
    // 전진 0 = 팀 존재 이유 결손. 자기수술이 12h마다 발동해서 user-value-
    // aligned TASK 자율 시드해야 깡통 자가개선 탈출. system-health 의
    // critical 정의 = "팀이 사용자 가치 전달 0" 도 시스템 침묵·워커 막힘과
    // 동급으로 critical.
    issues.push({
      severity: 'critical',
      code: 'progress-stale',
      detail: '모든 active 프로젝트 progressLog 비어있음 — 팀 전진 기록 전무 (사용자 가치 전달 결손)',
    });
  }

  if (
    signals.workerFailRatio !== null &&
    signals.workerFailRatio >= thresholds.workerFailCritical
  ) {
    issues.push({
      severity: 'critical',
      code: 'worker-fail-critical',
      detail: `워커 실패율 ${Math.round(signals.workerFailRatio * 100)}% (최근 6h) — 워커 막힘`,
    });
  } else if (
    signals.workerFailRatio !== null &&
    signals.workerFailRatio >= thresholds.workerFailWarn
  ) {
    issues.push({
      severity: 'warn',
      code: 'worker-fail-warn',
      detail: `워커 실패율 ${Math.round(signals.workerFailRatio * 100)}% (최근 6h)`,
    });
  }

  if (signals.traceErrorCount >= thresholds.traceErrorCritical) {
    issues.push({
      severity: 'critical',
      code: 'trace-errors',
      detail: `trace 에러 ${signals.traceErrorCount}건 (24h) — 반복 오류`,
    });
  }

  if (signals.brokenLoopTaskCount >= 1) {
    issues.push({
      severity: 'critical',
      code: 'broken-loop',
      detail: `동일 task ${signals.brokenLoopTaskCount}개가 6h 안에 3회+ no-op 종료 반복 — Cronbot 패턴 (자가발전 0, status drift 또는 워커 선택 게이트 결함)`,
    });
  }

  return issues;
}

/**
 * 헬스 신호 + 이슈 → 프롬프트·알림용 텍스트 블록 (순수).
 * issues 없으면 "정상" 한 줄.
 */
export function formatHealthBlock(
  signals: HealthSignals,
  issues: HealthIssue[],
): string {
  const stalenessStr =
    signals.traceStalenessHrs === Infinity
      ? '기록 없음'
      : `${Math.round(signals.traceStalenessHrs)}h 전`;
  const lines: string[] = [
    `[시스템 헬스 신호]`,
    `· cadence 마지막 틱: ${stalenessStr}`,
    `· 전진 기록(progressLog): ${signals.progressStale ? '전무(모든 프로젝트)' : '존재'}`,
  ];
  if (signals.workerFailRatio !== null) {
    lines.push(
      `· 워커 실패율(6h): ${Math.round(signals.workerFailRatio * 100)}%`,
    );
  }
  if (signals.traceErrorCount > 0) {
    lines.push(`· trace 에러(24h): ${signals.traceErrorCount}건`);
  }
  if (signals.brokenLoopTaskCount > 0) {
    lines.push(`· broken-loop task(6h, ≥3회 no-op): ${signals.brokenLoopTaskCount}개`);
  }
  if (issues.length === 0) {
    lines.push('→ 이상 없음');
  } else {
    lines.push(
      '[감지된 이슈]',
      ...issues.map(
        (i) => `· [${i.severity.toUpperCase()}] ${i.code}: ${i.detail}`,
      ),
    );
  }
  return lines.join('\n');
}
