// system-health 순수 코어 검증 (FS 무관). TASK-KAR-018-LT 기둥4.
import { describe, it, expect } from 'vitest';
import {
  diagnoseHealth,
  formatHealthBlock,
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
};

const critical: HealthSignals = {
  traceStalenessHrs: 48,
  progressStale: true,
  workerFailRatio: 0.9,
  traceErrorCount: 10,
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

  it('progressStale true → progress-stale warn', () => {
    const issues = diagnoseHealth({ ...healthy, progressStale: true });
    const c = issues.find((i) => i.code === 'progress-stale');
    expect(c?.severity).toBe('warn');
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
