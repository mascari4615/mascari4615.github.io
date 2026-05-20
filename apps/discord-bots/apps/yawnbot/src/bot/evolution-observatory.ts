import fs from 'fs';
import path from 'path';
import {
  diagnoseHealth,
  gatherHealthSignals,
  type HealthIssue,
  type HealthSignals,
} from './system-health';

export type EvolutionSeverity = 'info' | 'warn' | 'critical';
export type EvolutionSource =
  | 'health'
  | 'trace'
  | 'portfolio'
  | 'proposal'
  | 'self-augment';

export interface EvolutionMetric {
  name: string;
  value: number;
  unit?: string;
}

export interface EvolutionEvent {
  ts: string;
  code: string;
  severity: EvolutionSeverity;
  source: EvolutionSource;
  subject: string;
  detail: string;
  metrics: EvolutionMetric[];
  evidence: string;
}

export interface TraceEntry {
  ts?: string;
  type?: string;
  core?: string;
  reason?: string;
}

export interface PromotionEntry {
  ts?: string;
  coreId?: string;
  action?: 'promoted' | 'reverted';
  reason?: string;
}

export interface EvolutionSummary {
  total: number;
  critical: number;
  warn: number;
  info: number;
  byCode: Record<string, number>;
  bySource: Record<string, number>;
  bySubject: Record<string, number>;
  topCodes: Array<{ code: string; count: number }>;
}

export interface EvolutionRunResult {
  observed: number;
  appended: number;
  summary: EvolutionSummary;
}

export interface EvolutionObservatoryDeps {
  healthSignals?: HealthSignals;
  healthIssues?: HealthIssue[];
  traceEntries?: TraceEntry[];
  notify?: (message: string) => void;
  nowMs?: number;
}

function isoNow(nowMs: number): string {
  return new Date(nowMs).toISOString();
}

function inc(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function severityFromHealth(issue: HealthIssue): EvolutionSeverity {
  return issue.severity === 'critical' ? 'critical' : 'warn';
}

function metric(name: string, value: number, unit?: string): EvolutionMetric {
  return unit ? { name, value, unit } : { name, value };
}

export function normalizeHealthEvents(
  signals: HealthSignals,
  issues: HealthIssue[],
  nowMs: number = Date.now(),
): EvolutionEvent[] {
  const ts = isoNow(nowMs);
  return issues.map((issue) => {
    const metrics: EvolutionMetric[] = [];
    if (Number.isFinite(signals.traceStalenessHrs)) {
      metrics.push(metric('traceStalenessHrs', signals.traceStalenessHrs, 'h'));
    }
    if (signals.workerFailRatio !== null) {
      metrics.push(metric('workerFailRatio', signals.workerFailRatio));
    }
    metrics.push(metric('traceErrorCount', signals.traceErrorCount));
    return {
      ts,
      code: issue.code,
      severity: severityFromHealth(issue),
      source: 'health',
      subject: issue.code.startsWith('worker') ? 'worker-pool' : 'cadence',
      detail: issue.detail,
      metrics,
      evidence: `health:${issue.code}`,
    };
  });
}

export function normalizeTraceEvents(
  traceEntries: TraceEntry[],
  nowMs: number = Date.now(),
): EvolutionEvent[] {
  const fallbackTs = isoNow(nowMs);
  const events: EvolutionEvent[] = [];
  for (const entry of traceEntries) {
    const reason = entry.reason ?? '';
    const ts = entry.ts || fallbackTs;

    const worker = /^worker\s+(\S+)\s+(\S+)/.exec(reason);
    if (worker) {
      const taskId = worker[1];
      const status = worker[2];
      if (status === 'done') continue;
      const noArtifact = status === 'done-no-artifact';
      events.push({
        ts,
        code: noArtifact ? 'worker-no-artifact' : 'worker-failed',
        severity: noArtifact ? 'critical' : 'warn',
        source: 'trace',
        subject: entry.core || 'worker',
        detail: noArtifact
          ? `Worker finished ${taskId} without a durable artifact.`
          : `Worker ${status} on ${taskId}.`,
        metrics: [metric('count', 1)],
        evidence: reason.slice(0, 240),
      });
      continue;
    }

    if (/parse-fail|parse fail|parsing failed/i.test(reason)) {
      events.push({
        ts,
        code: 'proposal-parse-fail',
        severity: 'warn',
        source: 'proposal',
        subject: entry.core || 'producer',
        detail: 'Producer output failed proposal parsing.',
        metrics: [metric('count', 1)],
        evidence: reason.slice(0, 240),
      });
      continue;
    }

    if (/duplicate|dedup/i.test(reason)) {
      events.push({
        ts,
        code: 'proposal-duplicate',
        severity: 'info',
        source: 'proposal',
        subject: entry.core || 'producer',
        detail: 'Producer repeated a proposal already seen by the inbox.',
        metrics: [metric('count', 1)],
        evidence: reason.slice(0, 240),
      });
      continue;
    }

    if (/no-project|projectId/i.test(reason)) {
      events.push({
        ts,
        code: 'proposal-project-missing',
        severity: 'warn',
        source: 'proposal',
        subject: entry.core || 'producer',
        detail: 'Proposal did not cite a valid portfolio project.',
        metrics: [metric('count', 1)],
        evidence: reason.slice(0, 240),
      });
      continue;
    }

    if (entry.type === 'error') {
      events.push({
        ts,
        code: 'trace-error',
        severity: 'critical',
        source: 'trace',
        subject: entry.core || 'unknown',
        detail: 'Trace recorded an error event.',
        metrics: [metric('count', 1)],
        evidence: reason.slice(0, 240),
      });
    }
  }
  return events;
}

export function normalizePromotionEvents(
  entries: PromotionEntry[],
  nowMs: number = Date.now(),
): EvolutionEvent[] {
  const fallbackTs = isoNow(nowMs);
  const events: EvolutionEvent[] = [];
  for (const entry of entries) {
    if (!entry.coreId || !entry.action) continue;
    const promoted = entry.action === 'promoted';
    events.push({
      ts: entry.ts || fallbackTs,
      code: promoted ? 'core-promoted' : 'core-reverted',
      severity: promoted ? 'info' : 'critical',
      source: 'self-augment',
      subject: entry.coreId,
      detail: promoted
        ? `Core ${entry.coreId} passed self-augmentation promotion gates and became active.`
        : `Core ${entry.coreId} regressed after promotion and was reverted to draft.`,
      metrics: [metric('count', 1)],
      evidence: `${entry.action}: ${entry.reason || ''}`.slice(0, 240),
    });
  }
  return events;
}

export function summarizeEvolutionEvents(
  events: EvolutionEvent[],
): EvolutionSummary {
  const summary: EvolutionSummary = {
    total: events.length,
    critical: 0,
    warn: 0,
    info: 0,
    byCode: {},
    bySource: {},
    bySubject: {},
    topCodes: [],
  };
  for (const event of events) {
    summary[event.severity] += 1;
    inc(summary.byCode, event.code);
    inc(summary.bySource, event.source);
    inc(summary.bySubject, event.subject);
  }
  summary.topCodes = Object.entries(summary.byCode)
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
    .slice(0, 8);
  return summary;
}

export function evolutionLedgerPath(env: NodeJS.ProcessEnv): string {
  const root = env.MEMO_REPO_PATH?.trim() || '';
  return root ? path.join(root, '.claude', 'evolution-events.jsonl') : '';
}

export function eventFingerprint(event: EvolutionEvent): string {
  return [
    event.code,
    event.source,
    event.subject,
    event.evidence,
  ].join('\u001f');
}

export function readEvolutionEventFingerprints(
  env: NodeJS.ProcessEnv,
): Set<string> {
  const filePath = evolutionLedgerPath(env);
  const seen = new Set<string>();
  if (!filePath || !fs.existsSync(filePath)) return seen;
  try {
    for (const line of fs.readFileSync(filePath, 'utf-8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        seen.add(eventFingerprint(JSON.parse(trimmed) as EvolutionEvent));
      } catch {
        /* Ignore corrupt observability rows. */
      }
    }
  } catch {
    return seen;
  }
  return seen;
}

export function readEvolutionEvents(
  env: NodeJS.ProcessEnv,
  limit = 100,
): EvolutionEvent[] {
  const filePath = evolutionLedgerPath(env);
  if (!filePath || !fs.existsSync(filePath)) return [];
  try {
    return fs
      .readFileSync(filePath, 'utf-8')
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-Math.max(1, limit))
      .map((line) => JSON.parse(line) as EvolutionEvent)
      .filter((event) => !!event.code && !!event.severity);
  } catch {
    return [];
  }
}

export function summarizeRecentEvolutionEvents(
  env: NodeJS.ProcessEnv,
  limit = 100,
): EvolutionSummary {
  return summarizeEvolutionEvents(readEvolutionEvents(env, limit));
}

export function tracePath(env: NodeJS.ProcessEnv): string {
  const root = env.MEMO_REPO_PATH?.trim() || '';
  return root ? path.join(root, '.claude', 'discoveries', 'agent-trace.jsonl') : '';
}

export function promotionTracePath(env: NodeJS.ProcessEnv): string {
  const root = env.MEMO_REPO_PATH?.trim() || '';
  return root ? path.join(root, '.claude', 'agent-core-promotion.jsonl') : '';
}

export function readTraceEntries(env: NodeJS.ProcessEnv): TraceEntry[] {
  const filePath = tracePath(env);
  if (!filePath || !fs.existsSync(filePath)) return [];
  const entries: TraceEntry[] = [];
  try {
    for (const line of fs.readFileSync(filePath, 'utf-8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(JSON.parse(trimmed) as TraceEntry);
      } catch {
        entries.push({});
      }
    }
  } catch {
    return [];
  }
  return entries;
}

export function readPromotionEntries(env: NodeJS.ProcessEnv): PromotionEntry[] {
  const filePath = promotionTracePath(env);
  if (!filePath || !fs.existsSync(filePath)) return [];
  const entries: PromotionEntry[] = [];
  try {
    for (const line of fs.readFileSync(filePath, 'utf-8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(JSON.parse(trimmed) as PromotionEntry);
      } catch {
        entries.push({});
      }
    }
  } catch {
    return [];
  }
  return entries;
}

export function appendEvolutionEvents(
  env: NodeJS.ProcessEnv,
  events: EvolutionEvent[],
): void {
  const filePath = evolutionLedgerPath(env);
  if (!filePath || events.length === 0) return;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(
      filePath,
      events.map((event) => JSON.stringify(event)).join('\n') + '\n',
      'utf-8',
    );
  } catch {
    /* best-effort: observability must not block cadence work. */
  }
}

export function appendNewEvolutionEvents(
  env: NodeJS.ProcessEnv,
  events: EvolutionEvent[],
): EvolutionEvent[] {
  const seen = readEvolutionEventFingerprints(env);
  const fresh: EvolutionEvent[] = [];
  for (const event of events) {
    const fingerprint = eventFingerprint(event);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    fresh.push(event);
  }
  appendEvolutionEvents(env, fresh);
  return fresh;
}

export function collectEvolutionEvents(
  env: NodeJS.ProcessEnv,
  signals: HealthSignals,
  issues: HealthIssue[],
  nowMs: number = Date.now(),
): EvolutionEvent[] {
  return [
    ...normalizeHealthEvents(signals, issues, nowMs),
    ...normalizeTraceEvents(readTraceEntries(env), nowMs),
    ...normalizePromotionEvents(readPromotionEntries(env), nowMs),
  ];
}

export function runEvolutionObservatoryOnce(
  env: NodeJS.ProcessEnv,
  deps: EvolutionObservatoryDeps = {},
): EvolutionRunResult {
  const nowMs = deps.nowMs ?? Date.now();
  const signals = deps.healthSignals ?? gatherHealthSignals(env, nowMs);
  const issues = deps.healthIssues ?? diagnoseHealth(signals);
  const traceEntries = deps.traceEntries ?? readTraceEntries(env);
  const promotionEntries = readPromotionEntries(env);
  const observed = [
    ...normalizeHealthEvents(signals, issues, nowMs),
    ...normalizeTraceEvents(traceEntries, nowMs),
    ...normalizePromotionEvents(promotionEntries, nowMs),
  ];
  const appended = appendNewEvolutionEvents(env, observed);
  const summary = summarizeEvolutionEvents(appended);
  if (summary.total > 0 && deps.notify) {
    const ticker = formatEvolutionTicker(appended, summary);
    deps.notify(ticker || formatEvolutionSummary(summary));
  }
  return {
    observed: observed.length,
    appended: appended.length,
    summary,
  };
}

export function formatRecentEvolutionForDiscovery(
  env: NodeJS.ProcessEnv,
  limit = 12,
): string {
  const events = readEvolutionEvents(env, limit);
  if (events.length === 0) return '';
  return events
    .slice(-Math.max(1, limit))
    .map(
      (event) =>
        `- [${event.severity}] ${event.code} / ${event.subject}: ${event.detail}`,
    )
    .join('\n')
    .slice(0, 1400);
}

export function formatEvolutionSummary(summary: EvolutionSummary): string {
  const codes = summary.topCodes
    .map((entry) => `${entry.code}:${entry.count}`)
    .join(', ') || 'none';
  return [
    '[evolution-observatory]',
    `total=${summary.total} critical=${summary.critical} warn=${summary.warn} info=${summary.info}`,
    `topCodes=${codes}`,
  ].join('\n');
}

export interface StatsDigestState {
  lastTs: string;
}

export interface StatsDigestDeps {
  notify?: (msg: string) => void;
  nowMs?: number;
  intervalMs?: number;
  windowMs?: number;
}

export function statsDigestStatePath(env: NodeJS.ProcessEnv): string {
  const root = env.MEMO_REPO_PATH?.trim() || '';
  return root ? path.join(root, '.claude', 'evolution-stats-digest.last.json') : '';
}

export function readStatsDigestState(env: NodeJS.ProcessEnv): StatsDigestState | null {
  const p = statsDigestStatePath(env);
  if (!p || !fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as StatsDigestState;
  } catch {
    return null;
  }
}

export function writeStatsDigestState(env: NodeJS.ProcessEnv, state: StatsDigestState): void {
  const p = statsDigestStatePath(env);
  if (!p) return;
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(state), 'utf-8');
  } catch {
    /* state 저장 실패 = 다음 tick 재시도 — 비차단 */
  }
}

export function shouldRunStatsDigest(
  env: NodeJS.ProcessEnv,
  nowMs: number,
  intervalMs = 24 * 3600 * 1000,
): boolean {
  const state = readStatsDigestState(env);
  if (!state) return true;
  const last = Date.parse(state.lastTs);
  if (!Number.isFinite(last)) return true;
  return nowMs - last >= intervalMs;
}

/**
 * 7d 진화 stats 다이제스트 — 봇이 자기 ledger 읽고 자체 측정.
 * prod ledger 가 데스크톱에서 안 보여도 봇 자신이 #team-bus 에 발화 → 사용자·Claude 둘 다 채널서 봄.
 * 진화 0/7d = 솔직 "🦴 cron 톤 그대로" 발화 (셀프 진단, 영광스런 진화 부재 정직 인정).
 */
export function buildEvolutionStatsDigest(
  events: EvolutionEvent[],
  nowMs: number,
  windowMs = 7 * 24 * 3600 * 1000,
): string {
  const since = nowMs - windowMs;
  const recent = events.filter((e) => {
    const ts = Date.parse(e.ts);
    return Number.isFinite(ts) && ts >= since;
  });
  const summary = summarizeEvolutionEvents(recent);
  const days = Math.round(windowMs / (24 * 3600 * 1000));
  const promoted = summary.byCode['core-promoted'] || 0;
  const reverted = summary.byCode['core-reverted'] || 0;
  const noArt = summary.byCode['worker-no-artifact'] || 0;
  const failed = summary.byCode['worker-failed'] || 0;
  const dup = summary.byCode['proposal-duplicate'] || 0;
  const parseFail = summary.byCode['proposal-parse-fail'] || 0;
  const lines = [`📊 진화 stats — 지난 ${days}d`];
  if (promoted === 0 && reverted === 0) {
    lines.push('🦴 코어 진화 0건 — 자가증강 입력 0 (cron 톤 그대로 · 영광스런 진화 부재)');
  } else {
    lines.push(`🧬 코어 승격 ${promoted} · 🩸 퇴행 ${reverted}`);
  }
  lines.push(`⚙ 워커: no-artifact ${noArt} · failed ${failed}`);
  lines.push(`🪶 producer: parse-fail ${parseFail} · duplicate ${dup}`);
  if (summary.topCodes.length > 0) {
    lines.push(
      'top: ' + summary.topCodes.slice(0, 5).map((c) => `${c.code}×${c.count}`).join(' · '),
    );
  } else {
    lines.push('top: 전체 0 — ledger 비어있음');
  }
  return lines.join('\n');
}

export function runEvolutionStatsDigestOnce(
  env: NodeJS.ProcessEnv,
  deps: StatsDigestDeps = {},
): 'digest:sent' | 'digest:gated' {
  const nowMs = deps.nowMs ?? Date.now();
  const intervalMs = deps.intervalMs ?? 24 * 3600 * 1000;
  const windowMs = deps.windowMs ?? 7 * 24 * 3600 * 1000;
  if (!shouldRunStatsDigest(env, nowMs, intervalMs)) return 'digest:gated';
  const events = readEvolutionEvents(env, 5000);
  const msg = buildEvolutionStatsDigest(events, nowMs, windowMs);
  if (deps.notify) deps.notify(msg);
  writeStatsDigestState(env, { lastTs: new Date(nowMs).toISOString() });
  return 'digest:sent';
}

/**
 * 진화 ticker — appended 이벤트를 사용자 정서 한 메시지로.
 * 빅토르식 마일스톤: 코어 승격/퇴행 = 헤드라인, 그 외 = 누적 신호.
 * cron 톤 X — 살아있는 팀이 "이번 틱에 일어난 일"을 #team-bus 에 알림.
 */
export function formatEvolutionTicker(
  appended: EvolutionEvent[],
  summary: EvolutionSummary,
): string {
  if (appended.length === 0) return '';
  const lines: string[] = [];
  const promotions = appended.filter((e) => e.code === 'core-promoted');
  const reverts = appended.filter((e) => e.code === 'core-reverted');
  for (const e of promotions) {
    lines.push(`🧬 «${e.subject}» 코어 승격 — ${e.evidence || 'PASS'}`);
  }
  for (const e of reverts) {
    lines.push(`🩸 «${e.subject}» 진화 퇴행 → 복구 — ${e.evidence || 'revert'}`);
  }
  const others = summary.topCodes.filter(
    (c) => c.code !== 'core-promoted' && c.code !== 'core-reverted',
  );
  if (others.length > 0) {
    const tags = others
      .slice(0, 5)
      .map((c) => `${c.code}×${c.count}`)
      .join(' · ');
    const sev = `crit=${summary.critical} warn=${summary.warn} info=${summary.info}`;
    lines.push(`📈 진화 입력 (${sev}) — ${tags}`);
  } else if (lines.length === 0) {
    lines.push(
      `📈 진화 ${summary.total}건 — crit=${summary.critical} warn=${summary.warn} info=${summary.info}`,
    );
  }
  return lines.join('\n');
}
