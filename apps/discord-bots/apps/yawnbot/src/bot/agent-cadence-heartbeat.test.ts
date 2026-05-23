/**
 * summarizeTick 순수 회귀 (KAR-018-Y-2 — 팀 aliveness 가시화).
 *
 * tracer-bullet: 의미 있는 활동만 #team-bus 한 줄, 순수 idle = null
 * (스팸 X). 동료 평이체(내부 코드명·§조항 X) 잠금.
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

  it('surgery seed / escalate / dedupe 셋 다 가시화 (각각 다른 어휘)', () => {
    expect(summarizeTick('idle+surgery:seed:워커 진단')).toContain('과제 시드 작성');
    expect(summarizeTick('idle+surgery:escalate')).toContain('사람 판단 필요');
    // dedupe = 사용자가 「surgery 죽었나?」 오해 회피 — silent X
    expect(summarizeTick('idle+surgery:dedupe:worker-fail-critical')).toContain('24h 내 처리됨');
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

  it('내부 코드명·§조항 누출 0 (동료 평이체)', () => {
    const s =
      summarizeTick(
        'idle→producer:task+worker:kl-worker:done:TASK-KL-070+dialogue:echo',
      ) ?? '';
    expect(s).not.toMatch(/cadence|governance|drift|seam|§|reserve|tier3/i);
  });

  // ── LT-5: 다중턴 숙의 인식 + 포트폴리오 앵커 ──
  it('deliberation:<n>:<verdict> → 진짜 토론→결정 가시화', () => {
    expect(summarizeTick('idle+deliberation:3:adopt')).toContain(
      '3턴 토론 끝에 — 채택',
    );
    expect(summarizeTick('idle+deliberation:4:reject')).toContain('반려');
    expect(summarizeTick('idle+deliberation:2:adopt-mods')).toContain(
      '수정 채택',
    );
    const esc = summarizeTick('idle+deliberation:4:escalate') ?? '';
    expect(esc).toContain('동료 판단');
  });
  it('deliberation 토큰이 옛 dialogue 정규식에 오매치 X', () => {
    const s = summarizeTick('idle+deliberation:3:adopt') ?? '';
    expect(s).not.toContain('한마디 보탬'); // dialogue: 로 잘못 안 잡힘
  });
  it('anchor 미지정 = 기존 prefix(회귀0) / 지정 = 포트폴리오 앵커', () => {
    expect(summarizeTick('idle+deliberation:1:adopt')).toContain(
      '🛰 팀 한 바퀴',
    );
    const a = summarizeTick(
      'idle+deliberation:1:adopt',
      '📌 «WM» 목표: HomeInside 허브',
    );
    expect(a).toContain('📌 «WM» 목표: HomeInside 허브');
    expect(a).not.toContain('🛰 팀 한 바퀴');
  });
});
