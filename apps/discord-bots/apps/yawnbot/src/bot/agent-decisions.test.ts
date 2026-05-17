// agent-decisions 순수 코어 검증 (FS 무관). KAR-018-Y 양방향 스레드.
import { describe, it, expect } from 'vitest';
import {
  parseDecisionLine,
  formatDecisionsBlock,
  type Decision,
} from './agent-decisions';

describe('parseDecisionLine (순수·견고)', () => {
  it('정상 jsonl → Decision', () => {
    const d = parseDecisionLine(
      '{"taskId":"TASK-WM-084","text":"옵션 A","by":"masca","ts":"2026-05-18T00:00:00Z"}',
    );
    expect(d).toEqual({
      taskId: 'TASK-WM-084',
      text: '옵션 A',
      by: 'masca',
      ts: '2026-05-18T00:00:00Z',
    });
  });
  it('by/ts 누락 = 기본값 보정', () => {
    const d = parseDecisionLine('{"taskId":"T","text":"x"}');
    expect(d?.by).toBe('?');
    expect(d?.ts).toBe('');
  });
  it('빈줄·이상행·필수필드 부재 = null', () => {
    expect(parseDecisionLine('')).toBeNull();
    expect(parseDecisionLine('not json')).toBeNull();
    expect(parseDecisionLine('{"text":"x"}')).toBeNull();
    expect(parseDecisionLine('{"taskId":"T"}')).toBeNull();
  });
});

describe('formatDecisionsBlock (순수)', () => {
  it('빈 = 빈 문자열(프롬프트 미주입)', () => {
    expect(formatDecisionsBlock([])).toBe('');
  });
  it('결정들 = 번호·작성자·지시문 블록', () => {
    const ds: Decision[] = [
      { taskId: 'T', text: '옵션 A 로', by: 'masca', ts: '' },
      { taskId: 'T', text: 'Phase D\n는 deferred', by: 'masca', ts: '' },
    ];
    const b = formatDecisionsBlock(ds);
    expect(b).toContain('[사용자 결정');
    expect(b).toContain('1. (masca) 옵션 A 로');
    expect(b).toContain('2. (masca) Phase D 는 deferred'); // 개행 정규화
    expect(b).toContain('재질문 X');
  });
});
