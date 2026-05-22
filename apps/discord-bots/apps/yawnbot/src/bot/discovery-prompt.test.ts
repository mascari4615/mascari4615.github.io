/**
 * 발굴 프롬프트 자족성 회귀 (KAR-018-W, 2026-05-17 hang 근본 fix).
 *
 * 버그: 옛 프롬프트가 "agent-mission.md 자가검사"(파일 읽기)를 시켜 →
 * 비-agentic claude(도구 거부)가 못 읽는 파일에 무한 deliberation →
 * 풀 타임아웃 hang. fix = 미션 텍스트를 어댑터가 fs 로 읽어 *인라인*.
 * 이 테스트가 깨지면 = 누군가 프롬프트에 파일읽기 지시를 되살렸음.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  buildDiscoveryPrompt,
  readMissionText,
  gatherDiscoveryContext,
} from './agent-cadence';
import { appendEvolutionEvents } from './evolution-observatory';

describe('buildDiscoveryPrompt — 자족(파일 비의존)', () => {
  const p = buildDiscoveryPrompt('§1 TEST_MISSION_MARKER 공통목표');

  it('전달된 미션 텍스트를 인라인 임베드', () => {
    expect(p).toContain('TEST_MISSION_MARKER');
  });

  it('"파일 읽기 시도 X" 를 명시 (도구 거부 루프 방지)', () => {
    expect(p).toContain('도구·파일');
    expect(p).toMatch(/파일을 읽으려 시도하지 마라/);
  });

  it('옛 버그 지시("agent-mission.md ... 자가검사" 파일읽기) 부재', () => {
    expect(p).not.toContain('agent-mission.md §1');
    expect(p).not.toMatch(/agent-mission\.md.*자가검사/);
  });

  it('판별 union 5 kind + 빈출력=폐기 계약 유지', () => {
    for (const k of ['env', 'skill', 'agent', 'task', 'objective']) {
      expect(p).toContain(k);
    }
    // KAR-018-Y 회귀근본: 판단기준=미션정렬 확신뿐(컨텍스트 완전성 X),
    // 기권 시 *완전히 빈 출력*(설명·괄호문 금지 — 그게 파싱 깨뜨림).
    expect(p).toContain('미션 정렬');
    expect(p).toContain('완전히 빈 출력');
    expect(p).toContain('날조');
  });

  it('context 있으면 "부분 스냅샷·기권하지 마라" 프레이밍 (KAR-018-Y 회귀)', () => {
    // claude 가 "전체 목록 없음→판별 불가→기권" 한 차분 실증 직접 반박.
    const pc = buildDiscoveryPrompt('§1 M', '### 최근 커밋\n- abc 일부');
    expect(pc).toContain('부분 스냅샷');
    expect(pc).toContain('기권하지 마라');
  });
});

describe('readMissionText — 어댑터 fs read + fallback', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mission-'));
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('MEMO_REPO_PATH 미설정 → fallback (hang 대신 degraded)', () => {
    expect(readMissionText({} as NodeJS.ProcessEnv)).toContain('§1 공통목표');
  });

  it('파일 부재 → fallback', () => {
    const t = readMissionText({ MEMO_REPO_PATH: root } as NodeJS.ProcessEnv);
    expect(t).toContain('§3 비목표');
  });

  it('파일 존재 → 그 본문 반환', () => {
    fs.writeFileSync(
      path.join(root, '.claude', 'agent-mission.md'),
      'REAL_MISSION_BODY §1',
    );
    expect(
      readMissionText({ MEMO_REPO_PATH: root } as NodeJS.ProcessEnv),
    ).toBe('REAL_MISSION_BODY §1');
  });
});

describe('buildDiscoveryPrompt — 컨텍스트 섹션 (slice-5)', () => {
  it('컨텍스트 미전달 = 기존 동작 불변 (하위호환)', () => {
    const p = buildDiscoveryPrompt('§1 M');
    expect(p).not.toContain('현황 컨텍스트');
    expect(p).toContain('§1 M');
  });

  it('컨텍스트 전달 → 현황 섹션 + 중복금지 지시 임베드', () => {
    const p = buildDiscoveryPrompt('§1 M', 'CTX_MARKER_데이터');
    expect(p).toContain('현황 컨텍스트');
    expect(p).toContain('CTX_MARKER_데이터');
    expect(p).toContain('중복'); // 무한증식 회피 지시
  });

  it('SO-3: schemaFailExamples 주어지면 자기 직전 fail snippet 인라인 (자가교정 rung)', () => {
    const p = buildDiscoveryPrompt(
      '§1 M', '', '', '',
      ['깨진 출력 v1 — JSON 아님', '두번째 fail snippet — kind 누락'],
    );
    expect(p).toContain('너의 직전 출력 형식 실패');
    expect(p).toContain('깨진 출력 v1');
    expect(p).toContain('두번째 fail snippet');
  });

  it('SO-3: schemaFailExamples 빈 배열 = 블록 미포함 (legacy 동작)', () => {
    const p = buildDiscoveryPrompt('§1 M', '', '', '', []);
    expect(p).not.toContain('너의 직전 출력 형식 실패');
  });

  it('SO-2-A: channelContextText 주어지면 #team-bus 블록 inline (사용자 발화 read)', () => {
    const p = buildDiscoveryPrompt(
      '§1 M', '', '', '', [],
      '[masca] 봇 잠담 좀 줄여줘\n[wm-worker] 알겠습니다',
    );
    expect(p).toContain('팀 채널(#team-bus) 직전 발언');
    expect(p).toContain('잠담 좀 줄여줘');
    expect(p).toContain('사용자가 채널에서 박은 요청');
  });

  it('SO-2-A: channelContextText 빈 = 블록 미포함 (graceful)', () => {
    const p = buildDiscoveryPrompt('§1 M', '', '', '', [], '');
    expect(p).not.toContain('팀 채널(#team-bus) 직전 발언');
  });
});

describe('gatherDiscoveryContext — 어댑터 읽기전용·안전 (slice-5)', () => {
  it('MEMO_REPO_PATH 미설정 → 빈 문자열 (안전 degraded)', () => {
    expect(gatherDiscoveryContext({} as NodeJS.ProcessEnv)).toBe('');
  });

  it('정본 부재 환경에서도 throw·hang 0 (best-effort)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-'));
    try {
      // .claude·git 없음 → 모든 섹션 실패해도 빈 문자열 (예외 X)
      expect(() =>
        gatherDiscoveryContext({ MEMO_REPO_PATH: tmp } as NodeJS.ProcessEnv),
      ).not.toThrow();
      expect(
        gatherDiscoveryContext({ MEMO_REPO_PATH: tmp } as NodeJS.ProcessEnv),
      ).toBe('');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('objectives.md 존재 → OBJ 행이 컨텍스트에 포함', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx2-'));
    try {
      fs.mkdirSync(path.join(tmp, '.claude'), { recursive: true });
      fs.writeFileSync(
        path.join(tmp, '.claude', 'objectives.md'),
        '| OBJ-009 | 기존목표XYZ | d | §1 | active | - | - |\n',
      );
      const ctx = gatherDiscoveryContext({
        MEMO_REPO_PATH: tmp,
      } as NodeJS.ProcessEnv);
      expect(ctx).toContain('기존목표XYZ');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('wm/tasks/ 에 ready/seed TASK 있으면 컨텍스트에 포함', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-wm-'));
    try {
      fs.mkdirSync(path.join(tmp, '.claude'), { recursive: true });
      fs.mkdirSync(path.join(tmp, 'wm', 'tasks'), { recursive: true });
      fs.writeFileSync(
        path.join(tmp, 'wm', 'tasks', 'TASK-WM-999-던전-드랍.md'),
        '---\nid: TASK-WM-999\ntitle: 던전 드랍 테이블 설계\nstatus: ready\npriority: high\n---\n## 목표\n',
      );
      const ctx = gatherDiscoveryContext({ MEMO_REPO_PATH: tmp } as NodeJS.ProcessEnv);
      expect(ctx).toContain('던전 드랍 테이블 설계');
      expect(ctx).toContain('WM 준비 작업');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('wm/dev/context.md 있으면 WM 개발 상태 포함', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-wmdev-'));
    try {
      fs.mkdirSync(path.join(tmp, '.claude'), { recursive: true });
      fs.mkdirSync(path.join(tmp, 'wm', 'dev'), { recursive: true });
      fs.writeFileSync(
        path.join(tmp, 'wm', 'dev', 'context.md'),
        '# WM 컨텍스트\n현재 HomeInside 허브 작업 중.\n',
      );
      const ctx = gatherDiscoveryContext({ MEMO_REPO_PATH: tmp } as NodeJS.ProcessEnv);
      expect(ctx).toContain('WM 현재 개발 상태');
      expect(ctx).toContain('HomeInside 허브');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('최근 evolution ledger 를 다음 발굴 컨텍스트에 포함', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-evo-'));
    try {
      fs.mkdirSync(path.join(tmp, '.claude'), { recursive: true });
      const tenv = { MEMO_REPO_PATH: tmp } as NodeJS.ProcessEnv;
      appendEvolutionEvents(tenv, [
        {
          ts: '2026-05-20T00:00:00Z',
          code: 'core-reverted',
          severity: 'critical',
          source: 'self-augment',
          subject: 'scout',
          detail: 'Core scout regressed after promotion and was reverted to draft.',
          metrics: [{ name: 'count', value: 1 }],
          evidence: 'reverted: done 비율 0/4',
        },
      ]);
      const ctx = gatherDiscoveryContext(tenv);
      expect(ctx).toContain('최근 진화 관측');
      expect(ctx).toContain('core-reverted');
      expect(ctx).toContain('scout');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('buildDiscoveryPrompt — producerPerspective (코어 정체성)', () => {
  it('perspective 없음 = 기존 범용 프롬프트 (회귀 0)', () => {
    const p = buildDiscoveryPrompt('§1 M');
    expect(p).toContain('cadence 생산자다');
    expect(p).not.toContain('로서 발굴한다');
  });

  it('perspective 주입 시 해당 역할 문구 포함', () => {
    const p = buildDiscoveryPrompt('§1 M', '', '', 'wm-scout (WM 게임 디자이너)');
    expect(p).toContain('wm-scout');
    expect(p).toContain('로서 발굴한다');
    expect(p).toContain('§1 M'); // missionText 유지
  });

  it('포트폴리오 + perspective 동시 존재', () => {
    const p = buildDiscoveryPrompt('§1 M', '', '[팀 포트폴리오]', 'atlas (KAR 인프라)');
    expect(p).toContain('[팀 포트폴리오]');
    expect(p).toContain('atlas');
  });
});
