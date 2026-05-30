// system-health 순수 코어 검증 (FS 무관). TASK-KAR-018-LT 기둥4.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  diagnoseHealth,
  formatHealthBlock,
  gatherHealthSignals,
  realProgressCount,
  DEFAULT_HEALTH_THRESHOLDS,
  type HealthSignals,
  type HealthIssue,
} from './system-health';
import { parseSurgeryDecision } from './team-portfolio';

// ── 픽스처 ──────────────────────────────────────────────────────

const healthy: HealthSignals = {
  traceStalenessHrs: 0.5,
  progressStale: false,
  workerFailRatio: 0.1,
  traceErrorCount: 0,
  brokenLoopTaskCount: 0,
};

const critical: HealthSignals = {
  traceStalenessHrs: 48,
  progressStale: true,
  workerFailRatio: 0.9,
  traceErrorCount: 10,
  brokenLoopTaskCount: 2,
};

// ── diagnoseHealth ───────────────────────────────────────────────

describe('diagnoseHealth', () => {
  it('헬스 신호 정상 → 이슈 없음', () => {
    const issues = diagnoseHealth(healthy);
    expect(issues).toHaveLength(0);
  });

  it('traceStalenessHrs >= 24 → cadence-stale critical', () => {
    const issues = diagnoseHealth({ ...healthy, traceStalenessHrs: 24 });
    const c = issues.find((i) => i.code === 'cadence-stale');
    expect(c?.severity).toBe('critical');
  });

  it('traceStalenessHrs [2, 24) → cadence-slow warn', () => {
    const issues = diagnoseHealth({ ...healthy, traceStalenessHrs: 5 });
    const c = issues.find((i) => i.code === 'cadence-slow');
    expect(c?.severity).toBe('warn');
    expect(issues.find((i) => i.code === 'cadence-stale')).toBeUndefined();
  });

  it('traceStalenessHrs < 2 → cadence 이슈 없음', () => {
    const issues = diagnoseHealth({ ...healthy, traceStalenessHrs: 1 });
    expect(issues.filter((i) => i.code.startsWith('cadence-'))).toHaveLength(0);
  });

  it('progressStale true → progress-stale critical (0415ff91 승격)', () => {
    // 평행 세션 commit 0415ff91 (자가발전 루프 깡통 탈출) 에서 warn→critical
    // 승격. 테스트 assertion 미반영 잔존 (master red). SO-X 와 함께 fix.
    const issues = diagnoseHealth({ ...healthy, progressStale: true });
    const c = issues.find((i) => i.code === 'progress-stale');
    expect(c?.severity).toBe('critical');
  });

  it('workerFailRatio >= 0.8 → worker-fail-critical', () => {
    const issues = diagnoseHealth({ ...healthy, workerFailRatio: 0.8 });
    const c = issues.find((i) => i.code === 'worker-fail-critical');
    expect(c?.severity).toBe('critical');
  });

  it('workerFailRatio [0.5, 0.8) → worker-fail-warn', () => {
    const issues = diagnoseHealth({ ...healthy, workerFailRatio: 0.6 });
    expect(issues.find((i) => i.code === 'worker-fail-critical')).toBeUndefined();
    expect(issues.find((i) => i.code === 'worker-fail-warn')?.severity).toBe('warn');
  });

  it('workerFailRatio null → worker 이슈 없음', () => {
    const issues = diagnoseHealth({ ...healthy, workerFailRatio: null });
    expect(issues.filter((i) => i.code.startsWith('worker-'))).toHaveLength(0);
  });

  it('traceErrorCount >= 5 → trace-errors critical', () => {
    const issues = diagnoseHealth({ ...healthy, traceErrorCount: 5 });
    const c = issues.find((i) => i.code === 'trace-errors');
    expect(c?.severity).toBe('critical');
  });

  it('traceErrorCount < 5 → trace-errors 없음', () => {
    const issues = diagnoseHealth({ ...healthy, traceErrorCount: 4 });
    expect(issues.find((i) => i.code === 'trace-errors')).toBeUndefined();
  });

  // ── team-dormant (KAR-018 죽은-루프-부활) ──────────────────────
  it('realProgressRecent=0 + warm trace(<2h) → team-dormant critical', () => {
    const issues = diagnoseHealth({
      ...healthy,
      realProgressRecent: 0,
      traceStalenessHrs: 0.5,
    });
    expect(issues.find((i) => i.code === 'team-dormant')?.severity).toBe('critical');
  });

  it('realProgressRecent>0 → team-dormant 미발화 (실산출 있음)', () => {
    const issues = diagnoseHealth({
      ...healthy,
      realProgressRecent: 2,
      traceStalenessHrs: 0.5,
    });
    expect(issues.find((i) => i.code === 'team-dormant')).toBeUndefined();
  });

  it('realProgressRecent=0 이지만 trace stale(>=2h) → cadence-* 담당, team-dormant X (중복 방지)', () => {
    const issues = diagnoseHealth({
      ...healthy,
      realProgressRecent: 0,
      traceStalenessHrs: 5,
    });
    expect(issues.find((i) => i.code === 'team-dormant')).toBeUndefined();
    expect(issues.find((i) => i.code === 'cadence-slow')).toBeDefined();
  });

  it('realProgressRecent undefined(구 literal) → team-dormant 미발화 (back-compat)', () => {
    const issues = diagnoseHealth({ ...healthy });
    expect(issues.find((i) => i.code === 'team-dormant')).toBeUndefined();
  });

  it('모든 critical 신호 → 4개 이슈 모두 감지', () => {
    const issues = diagnoseHealth(critical);
    const codes = issues.map((i) => i.code);
    expect(codes).toContain('cadence-stale');
    expect(codes).toContain('progress-stale');
    expect(codes).toContain('worker-fail-critical');
    expect(codes).toContain('trace-errors');
  });

  it('커스텀 임계값 적용 가능', () => {
    const issues = diagnoseHealth(
      { ...healthy, traceStalenessHrs: 50 },
      { ...DEFAULT_HEALTH_THRESHOLDS, traceStaleCriticalHrs: 100 },
    );
    expect(issues.find((i) => i.code === 'cadence-stale')).toBeUndefined();
  });
});

// ── formatHealthBlock ────────────────────────────────────────────

describe('formatHealthBlock', () => {
  it('이슈 없으면 "이상 없음" 포함', () => {
    const block = formatHealthBlock(healthy, []);
    expect(block).toContain('이상 없음');
  });

  it('critical 이슈 있으면 CRITICAL 태그 포함', () => {
    const issue: HealthIssue = { severity: 'critical', code: 'cadence-stale', detail: '48h 침묵' };
    const block = formatHealthBlock(critical, [issue]);
    expect(block).toContain('[CRITICAL]');
    expect(block).toContain('cadence-stale');
  });

  it('traceStalenessHrs Infinity → "기록 없음" 표기', () => {
    const block = formatHealthBlock({ ...healthy, traceStalenessHrs: Infinity }, []);
    expect(block).toContain('기록 없음');
  });

  it('workerFailRatio null → 워커 실패율 행 없음', () => {
    const block = formatHealthBlock({ ...healthy, workerFailRatio: null }, []);
    expect(block).not.toContain('워커 실패율');
  });

  it('workerFailRatio 숫자 → 퍼센트 표기', () => {
    const block = formatHealthBlock({ ...healthy, workerFailRatio: 0.75 }, []);
    expect(block).toContain('75%');
  });

  it('[시스템 헬스 신호] 헤더 항상 포함', () => {
    const block = formatHealthBlock(healthy, []);
    expect(block).toContain('[시스템 헬스 신호]');
  });
});

// ── parseSurgeryDecision ─────────────────────────────────────────

describe('parseSurgeryDecision', () => {
  it('과제: 제목 → seed + taskTitle', () => {
    const d = parseSurgeryDecision('과제: cadence 침묵 근본 원인 조사\n상세 내용');
    expect(d.action).toBe('seed');
    expect(d.taskTitle).toBe('cadence 침묵 근본 원인 조사');
    expect(d.taskBody).toContain('상세 내용');
  });

  it('과제： 전각콜론도 인식', () => {
    const d = parseSurgeryDecision('과제： trace 에러 대응');
    expect(d.action).toBe('seed');
    expect(d.taskTitle).toBe('trace 에러 대응');
  });

  it('escalate: 사유 → escalate', () => {
    const d = parseSurgeryDecision('escalate: 외부 요인 알 수 없음');
    expect(d.action).toBe('escalate');
    expect(d.reason).toBe('외부 요인 알 수 없음');
  });

  it('정상: 사유 → keep', () => {
    const d = parseSurgeryDecision('정상: 모든 지표 정상');
    expect(d.action).toBe('keep');
    expect(d.reason).toBe('모든 지표 정상');
  });

  it('불명확 텍스트 → escalate (안전 기본값)', () => {
    const d = parseSurgeryDecision('이것도 저것도 아닌 응답');
    expect(d.action).toBe('escalate');
    expect(d.reason).toContain('진단 불명확');
  });

  it('빈 문자열 → escalate', () => {
    const d = parseSurgeryDecision('');
    expect(d.action).toBe('escalate');
  });

  it('taskTitle 120자 초과 → 잘림', () => {
    const d = parseSurgeryDecision(`과제: ${'a'.repeat(200)}`);
    expect(d.action).toBe('seed');
    expect(d.taskTitle!.length).toBeLessThanOrEqual(120);
  });
});

// ── gatherHealthSignals: workerFailRatio 의 escalated 제외 ──────
//
// 회귀: escalated (사용자 결정 라우팅 = 정상) 가 fail 로 카운트되어 봇이
// 정상 동작해도 100% fail 신호 → surgery loop 무한 발동 → 자기복제 dup TASK.
// KAR-130/132/138~144 (8+ dup) 직접 원인. fix = escalated 분모·분자 제외.

describe('gatherHealthSignals — workerFailRatio escalated 제외', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'shealth-'));
    fs.mkdirSync(path.join(root, '.claude', 'discoveries'), { recursive: true });
  });
  afterEach(() => {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
  });
  function writeTrace(reasons: string[]) {
    const now = new Date().toISOString();
    fs.writeFileSync(
      path.join(root, '.claude', 'discoveries', 'agent-trace.jsonl'),
      reasons.map((r) => JSON.stringify({ ts: now, type: 'budget', core: 'kar-worker', reason: r })).join('\n') + '\n',
      'utf-8',
    );
  }
  const env = () => ({ MEMO_REPO_PATH: root } as NodeJS.ProcessEnv);

  it('done 만 → workerFailRatio=0', () => {
    writeTrace(['worker TASK-X-1 done agentic b1', 'worker TASK-X-2 done agentic b2']);
    expect(gatherHealthSignals(env()).workerFailRatio).toBe(0);
  });

  it('escalated 만 → workerFailRatio=null (분모 0)', () => {
    writeTrace(['worker TASK-X-1 escalated agentic b', 'worker TASK-X-2 escalated agentic b2']);
    // 봇이 결정 task 만 만나도 fail 신호 X (이전엔 100% fail 로 카운트되던 버그).
    expect(gatherHealthSignals(env()).workerFailRatio).toBe(null);
  });

  it('done 1 + escalated 2 → workerFailRatio=0 (escalated 제외)', () => {
    writeTrace([
      'worker TASK-X-1 done agentic b',
      'worker TASK-X-2 escalated agentic b',
      'worker TASK-X-3 escalated agentic b',
    ]);
    expect(gatherHealthSignals(env()).workerFailRatio).toBe(0);
  });

  it('done-no-artifact 는 여전히 fail', () => {
    writeTrace([
      'worker TASK-X-1 done agentic b',
      'worker TASK-X-2 done-no-artifact agentic b',
    ]);
    expect(gatherHealthSignals(env()).workerFailRatio).toBe(0.5);
  });

  it('error 는 여전히 fail', () => {
    writeTrace([
      'worker TASK-X-1 done agentic b',
      'worker TASK-X-2 error agentic b err=oops',
    ]);
    expect(gatherHealthSignals(env()).workerFailRatio).toBe(0.5);
  });
});

// ── realProgressCount + team-dormant 통합 (prod dormant 재현) ──────
//
// 2026-05-30 라이브 진단: prod trace 400/400 = 전부 type:budget skip,
// worker push·코어 승격 0. 그런데 trace 가 warm(매 5분 skip) + 실패 0 →
// 기존 5신호 전부 GREEN → producer/initiator 영원 잠듦. team-dormant 가
// 그 사각(liveness≠productivity)을 닫는 rung. 본 describe 가 그 시나리오 재현.

describe('realProgressCount + team-dormant 통합 (dormant 재현)', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dormant-'));
    fs.mkdirSync(path.join(root, '.claude', 'discoveries'), { recursive: true });
  });
  afterEach(() => {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
  });
  const env = () => ({ MEMO_REPO_PATH: root } as NodeJS.ProcessEnv);
  const iso = (hAgo: number) => new Date(Date.now() - hAgo * 3_600_000).toISOString();
  function writeTrace(entries: object[]) {
    fs.writeFileSync(
      path.join(root, '.claude', 'discoveries', 'agent-trace.jsonl'),
      entries.map((e) => JSON.stringify(e)).join('\n') + '\n',
      'utf-8',
    );
  }
  function writeEvolution(entries: object[]) {
    fs.writeFileSync(
      path.join(root, '.claude', 'evolution-events.jsonl'),
      entries.map((e) => JSON.stringify(e)).join('\n') + '\n',
      'utf-8',
    );
  }

  it('skip만 반복(warm trace, 실산출 0) → realProgressCount 0 + team-dormant 발화 (prod 재현)', () => {
    writeTrace([
      { ts: iso(0.1), type: 'budget', core: 'kar-worker', reason: 'SO-1 self-recall skip 1 task(s) already-fixed: TASK-KAR-018-LT-FORUM' },
      { ts: iso(0.5), type: 'budget', core: 'producer', reason: 'producer gap-analysis idle — 측정된 능력격차 없음' },
      { ts: iso(2), type: 'budget', core: 'kar-worker', reason: 'SO-1 self-recall skip' },
    ]);
    expect(realProgressCount(root)).toBe(0);
    const signals = gatherHealthSignals(env());
    expect(signals.realProgressRecent).toBe(0);
    expect(signals.traceStalenessHrs).toBeLessThan(2); // warm — 봇은 살아있음
    expect(diagnoseHealth(signals).find((i) => i.code === 'team-dormant')).toBeDefined();
  });

  it('worker push 산출 있으면 → realProgressCount>0 + team-dormant 미발화', () => {
    writeTrace([
      { ts: iso(0.1), type: 'budget', core: 'kar-worker', reason: 'skip' },
      { ts: iso(2), type: 'worker', core: 'kar-worker', reason: 'worker TASK-KAR-200 done agentic feature/x' },
    ]);
    expect(realProgressCount(root)).toBeGreaterThan(0);
    expect(diagnoseHealth(gatherHealthSignals(env())).find((i) => i.code === 'team-dormant')).toBeUndefined();
  });

  it('코어 승격(evolution-events)도 실산출로 카운트 (dormant 아님)', () => {
    writeTrace([{ ts: iso(0.1), type: 'budget', core: 'x', reason: 'skip' }]);
    writeEvolution([{ ts: iso(1), code: 'core-promoted', subject: 'triage-worker' }]);
    expect(realProgressCount(root)).toBe(1);
  });

  it('윈도우 밖(>18h) 산출은 카운트 X → 여전히 dormant', () => {
    writeTrace([
      { ts: iso(0.1), type: 'budget', core: 'x', reason: 'skip' },
      { ts: iso(30), type: 'worker', core: 'x', reason: 'worker TASK-KAR-9 done agentic b' }, // 30h 전 = 윈도우 밖
    ]);
    expect(realProgressCount(root)).toBe(0);
  });

  it('memoRoot 부재 → 0 (안전, dormant 단정 X는 호출측 trace staleness 가 담당)', () => {
    expect(realProgressCount('')).toBe(0);
  });
});
