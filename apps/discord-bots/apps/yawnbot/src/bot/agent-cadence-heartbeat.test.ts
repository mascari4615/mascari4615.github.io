/**
 * summarizeTick 순수 회귀 (KAR-018-Y-2 — 팀 aliveness 가시화).
 *
 * tracer-bullet: 의미 있는 활동만 #team-bus 한 줄, 순수 idle = null
 * (스팸 X). 사장 평이체(내부 코드명·§조항 X) 잠금.
 */
import { describe, it, expect } from 'vitest';
import { summarizeTick } from './agent-cadence';

describe('summarizeTick — 의미 활동만 가시화', () => {
  it('순수 idle / gated = null (스팸 0)', () => {
    expect(summarizeTick('idle')).toBeNull();
    expect(summarizeTick('idle→producer:producer-gated')).toBeNull();
    expect(summarizeTick('idle→producer:dialogue-idle')).toBeNull();
    expect(summarizeTick('killed')).toBeNull();
    expect(summarizeTick('')).toBeNull();
  });

  it('발굴 dispatch → 발굴 1건 한 줄', () => {
    const s = summarizeTick('idle→producer:task');
    expect(s).toContain('발굴');
    expect(s).toContain('🛰 팀 한 바퀴');
  });

  it('워커 자율 착수 → 코어·TASK 표기', () => {
    const s = summarizeTick('idle→producer:task+worker:kl-worker:done:TASK-KL-070');
    expect(s).toContain('kl-worker');
    expect(s).toContain('TASK-KL-070');
    expect(s).toContain('착수');
  });

  it('코어↔코어 대화 = 동료 한마디', () => {
    const s = summarizeTick('idle→producer:dialogue-idle+dialogue:echo');
    expect(s).toContain('echo');
    expect(s).toContain('한마디');
  });

  it('승인된 발굴 소비 / escalate / budget-stop / drift-skip 표기', () => {
    expect(summarizeTick('idle+consumed:2')).toContain('2건');
    expect(summarizeTick('escalated')).toContain('승인 대기');
    expect(summarizeTick('budget-stop')).toContain('멈춤');
    expect(summarizeTick('drift-skip')).toContain('건너뜀');
  });

  it('복합 tick = 항목 · 으로 결합', () => {
    const s = summarizeTick(
      'idle→producer:task+consumed:1+worker:wm-worker:done:TASK-WM-120+dialogue:atlas',
    );
    expect(s).toContain('·');
    expect(s).toContain('wm-worker');
    expect(s).toContain('atlas');
    expect(s).toContain('1건');
  });

  it('내부 코드명·§조항 누출 0 (사장 평이체)', () => {
    const s =
      summarizeTick(
        'idle→producer:task+worker:kl-worker:done:TASK-KL-070+dialogue:echo',
      ) ?? '';
    expect(s).not.toMatch(/cadence|governance|drift|seam|§|reserve|tier3/i);
  });
});
