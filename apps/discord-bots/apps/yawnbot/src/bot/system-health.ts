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
}

interface TraceEntry {
  ts?: string;
  type?: string;
  core?: string;
  reason?: string;
}

function readTraceLines(memoRoot: string): TraceEntry[] {
  try {
    const p = path.join(memoRoot, '.claude', 'discoveries', 'agent-trace.jsonl');
    if (!fs.existsSync(p)) return [];
    return fs
      .readFileSync(p, 'utf-8')
      .split(/\r?\n/)
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
        if (m[1] === 'done') done++;
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

  return { traceStalenessHrs, progressStale, workerFailRatio, traceErrorCount };
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
