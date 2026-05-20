/**
 * team-digest — #team-bus 주기 가시화 다이제스트 (TASK-KAR-018-LT-DIGEST).
 *
 * ticker(evolution-observatory) ⊥ digest(여기): ticker = event-driven push
 * (새 evolution event 즉시), digest = time-driven pull (12h 주기 종합).
 * 진화 0 일 때도 "12h 진화 0 — stalled: …" 명시 송신 — "cron 껍데기" 인지 직격.
 *
 * 평행 인프라 0: evolution-observatory(EvolutionEvent ledger) + team-portfolio
 * (progressLog) + system-health(issues) 기존 substrate 만 read. gov.notify ride.
 */
import type { EvolutionEvent } from './evolution-observatory';
import type { Portfolio, PortfolioProject } from './team-portfolio';
import type { HealthIssue, HealthSignals } from './system-health';

export interface DigestInput {
  events: EvolutionEvent[];
  portfolio: Portfolio;
  signals: HealthSignals;
  issues: HealthIssue[];
  windowMs?: number;
  nowMs?: number;
}

const DEFAULT_WINDOW_MS = 12 * 3600_000;
const MAX_DIGEST_CHARS = 1900;

export function filterEventsByWindow(
  events: EvolutionEvent[],
  sinceMs: number,
): EvolutionEvent[] {
  return events.filter((e) => {
    const t = Date.parse(e.ts);
    return Number.isFinite(t) && t >= sinceMs;
  });
}

function projectStalledHrs(proj: PortfolioProject, nowMs: number): number | null {
  if (proj.progressLog.length === 0) {
    const opened = proj.currentObjective?.openedTs
      ? Date.parse(proj.currentObjective.openedTs)
      : NaN;
    if (Number.isFinite(opened)) {
      return Math.floor((nowMs - opened) / 3600_000);
    }
    return null;
  }
  const last = proj.progressLog[proj.progressLog.length - 1];
  const lastMs = Date.parse(last.ts);
  if (!Number.isFinite(lastMs)) return null;
  return Math.floor((nowMs - lastMs) / 3600_000);
}

function projectDeltaCount(proj: PortfolioProject, sinceMs: number): number {
  return proj.progressLog.filter((e) => {
    const t = Date.parse(e.ts);
    return Number.isFinite(t) && t >= sinceMs;
  }).length;
}

function fmtKstHeader(nowMs: number, windowHrs: number): string {
  const kst = new Date(nowMs + 9 * 3600_000).toISOString();
  return `🧬 **팀 진화 ${windowHrs}h 다이제스트** — ${kst.slice(0, 10)} ${kst.slice(11, 16)} KST`;
}

export function buildDigestText(input: DigestInput): string {
  const nowMs = input.nowMs ?? Date.now();
  const windowMs = input.windowMs ?? DEFAULT_WINDOW_MS;
  const sinceMs = nowMs - windowMs;
  const windowHrs = Math.max(1, Math.round(windowMs / 3600_000));

  const lines: string[] = [];
  lines.push(fmtKstHeader(nowMs, windowHrs));
  lines.push('');

  const activeProjects = input.portfolio.projects
    .filter((p) => p.status === 'active')
    .slice()
    .sort((a, b) => b.weight - a.weight);

  // 1. 포트폴리오 진전 — "전진" 정본(progressLog vs northStar).
  lines.push('📊 **포트폴리오 진전**');
  if (activeProjects.length === 0) {
    lines.push('  · (active 프로젝트 없음)');
  } else {
    let totalDelta = 0;
    for (const proj of activeProjects) {
      const delta = projectDeltaCount(proj, sinceMs);
      totalDelta += delta;
      const stalled = projectStalledHrs(proj, nowMs);
      const stalledTag =
        delta === 0 && stalled !== null && stalled >= windowHrs
          ? ` · ⚠ stalled ${stalled}h`
          : '';
      const instrTag = proj.instrumental ? ' (도구적)' : '';
      lines.push(
        `  · ${proj.title} (w${proj.weight}${instrTag}): +${delta} entry${stalledTag}`,
      );
    }
    if (totalDelta === 0) {
      lines.push(
        `  · **${windowHrs}h 동안 전 프로젝트 progressLog 정체** — 자가정비 외 실전진 0`,
      );
    }
  }
  lines.push('');

  // 2. 자가증강 (LT-11) — promotion/regression.
  const augment = input.events.filter((e) => e.source === 'self-augment');
  const promoted = augment.filter((e) => e.code === 'core-promoted').length;
  const reverted = augment.filter((e) => e.code === 'core-reverted').length;
  lines.push(`🧬 **자가증강 (LT-11)** — 승격 ${promoted} · 원복 ${reverted}`);
  if (augment.length > 0) {
    const subjects = Array.from(new Set(augment.map((e) => e.subject))).slice(0, 5);
    lines.push(`  · 코어: ${subjects.join(', ')}`);
  } else {
    lines.push(`  · (${windowHrs}h 동안 코어 변동 0)`);
  }
  lines.push('');

  // 3. 자기수술 입력 (기둥4) — health source critical/warn 분포 + 현 issues.
  const healthEvents = input.events.filter((e) => e.source === 'health');
  const critEvents = healthEvents.filter((e) => e.severity === 'critical').length;
  const warnEvents = healthEvents.filter((e) => e.severity === 'warn').length;
  lines.push(
    `🔬 **자기수술 입력 (기둥4)** — critical ${critEvents} · warn ${warnEvents}`,
  );
  if (input.issues.length > 0) {
    for (const issue of input.issues.slice(0, 4)) {
      lines.push(`  · [${issue.severity}] ${issue.code}: ${issue.detail.slice(0, 110)}`);
    }
  } else {
    lines.push('  · (현재 헬스 이슈 0)');
  }
  lines.push('');

  // 4. 제안 파이프 (proposal source).
  const proposal = input.events.filter((e) => e.source === 'proposal');
  if (proposal.length > 0) {
    const parseFail = proposal.filter((e) => e.code === 'proposal-parse-fail').length;
    const duplicate = proposal.filter((e) => e.code === 'proposal-duplicate').length;
    const projMissing = proposal.filter(
      (e) => e.code === 'proposal-project-missing',
    ).length;
    lines.push(
      `💬 **제안 파이프** — parse-fail ${parseFail} · 중복 ${duplicate} · projectId 누락 ${projMissing}`,
    );
    lines.push('');
  }

  // 5. 워커 trace (LT-W2 dedupe 효과 추적).
  const trace = input.events.filter((e) => e.source === 'trace');
  if (trace.length > 0) {
    const failed = trace.filter((e) => e.code === 'worker-failed').length;
    const noArtifact = trace.filter((e) => e.code === 'worker-no-artifact').length;
    const traceErr = trace.filter((e) => e.code === 'trace-error').length;
    lines.push(
      `👷 **워커 trace** — failed ${failed} · no-artifact ${noArtifact} · error ${traceErr}`,
    );
    lines.push('');
  }

  const out = lines.join('\n').trimEnd();
  return out.length > MAX_DIGEST_CHARS
    ? out.slice(0, MAX_DIGEST_CHARS - 3) + '...'
    : out;
}
