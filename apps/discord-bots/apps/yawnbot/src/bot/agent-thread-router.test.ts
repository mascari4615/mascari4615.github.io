// agent-thread-router 순수 코어 전수검증 (Discord IO 무관). KAR-018-Y +
// KAR-018-THR(2026-05-20: 영속 매핑·pXXX 키·재기동 견고).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  extractTaskId,
  extractThreadKey,
  chunkForDiscord,
  appendTaskThread,
  lookupTaskThread,
  resolvePersistedThread,
  taskThreadsPath,
} from './agent-thread-router';
import { appendProposalMsg } from './agent-bus';

describe('extractTaskId (순수 — TASK 만)', () => {
  it('워커 메시지에서 TASK id 추출', () => {
    expect(
      extractTaskId('🤖 KlWorker ▶ TASK-KL-071 수행 — 브랜치 feature/...'),
    ).toBe('TASK-KL-071');
  });
  it('서브 접미(-A/-B/-X) 포함', () => {
    expect(extractTaskId('⚠ TASK-KAR-018-X error')).toBe('TASK-KAR-018-X');
    expect(extractTaskId('TASK-KL-055-B 점유')).toBe('TASK-KL-055-B');
  });
  it('첫 매치만 (그 틱 대상)', () => {
    expect(extractTaskId('TASK-WM-084 vs TASK-WM-116')).toBe('TASK-WM-084');
  });
  it('TASK 없으면 null (팀-공통=하트비트)', () => {
    expect(extractTaskId('🛰 팀 한 바퀴: 동료 echo 한마디')).toBeNull();
    expect(extractTaskId('')).toBeNull();
  });
  it('제안 id(pXXX)는 *여기선 무시* — 워커 픽업 키 아님(결정 증발 차단)', () => {
    // 인박드 핸들러가 본 결과를 recordDecision({taskId}) 로 쓴다 →
    // pXXX 가 들어가면 워커가 못 찾는 결정으로 증발. extractThreadKey
    // 만 pXXX 인정 (라우터 전용).
    expect(extractTaskId('제안 p42c94051 게시')).toBeNull();
  });
});

describe('extractThreadKey (TASK ∪ pXXX — 라우터 전용)', () => {
  it('TASK 있으면 TASK 우선', () => {
    expect(extractThreadKey('TASK-KAR-018-THR · p42c94051 관련')).toBe(
      'TASK-KAR-018-THR',
    );
  });
  it('TASK 없고 pXXX 만 → 제안 id', () => {
    expect(extractThreadKey('🛰 atlas: 제안 p42c94051 카드 게시')).toBe(
      'p42c94051',
    );
  });
  it('pXXX 형식 엄격 — 8 hex 만 매치(보안 X·식별자만, proposal.ts:172)', () => {
    expect(extractThreadKey('p1234567')).toBeNull(); // 7 자
    expect(extractThreadKey('pZZZZZZZZ')).toBeNull(); // hex 아님
    expect(extractThreadKey('pabcdef01')).toBe('pabcdef01');
  });
  it('둘 다 없으면 null', () => {
    expect(extractThreadKey('하트비트 한 줄')).toBeNull();
  });
});

describe('chunkForDiscord (순수·결정적)', () => {
  it('한도 이하 = 1청크', () => {
    expect(chunkForDiscord('짧은 보고')).toEqual(['짧은 보고']);
  });
  it('빈/공백 = 빈 배열', () => {
    expect(chunkForDiscord('')).toEqual([]);
    expect(chunkForDiscord('   \n  ')).toEqual([]);
  });
  it('줄 경계 우선 분할, 각 ≤ max', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `line ${i} ` + 'x'.repeat(60));
    const chunks = chunkForDiscord(lines.join('\n'), 200);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(200);
    // 무손실: 모든 줄 보존
    for (let i = 0; i < 50; i++)
      expect(chunks.join('\n')).toContain(`line ${i} `);
  });
  it('한 줄이 max 초과 → 강제 슬라이스(무손실)', () => {
    const long = 'a'.repeat(5000);
    const chunks = chunkForDiscord(long, 1900);
    expect(chunks.length).toBe(3);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1900);
    expect(chunks.join('')).toBe(long);
  });
});

// ── KAR-018-THR: 영속 매핑 — 재기동·deploy churn 견고 ──────────
describe('TASK 스레드 영속 매핑 (재기동에 중복 생성 0)', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'thr-'));
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('append → lookup round-trip (최신 wins)', () => {
    appendTaskThread(root, {
      key: 'TASK-KAR-018-THR',
      threadId: 't-old',
      channelId: 'c1',
    });
    appendTaskThread(root, {
      key: 'TASK-KAR-018-THR',
      threadId: 't-new',
      channelId: 'c1',
    });
    expect(lookupTaskThread(root, 'TASK-KAR-018-THR')?.threadId).toBe(
      't-new',
    );
  });

  it('미존재 키 → null', () => {
    expect(lookupTaskThread(root, 'TASK-NONE-001')).toBeNull();
  });

  it('memoRoot 빈 문자열 = path 빈 → no-op (테스트/dev graceful)', () => {
    expect(taskThreadsPath('')).toBe('');
    expect(lookupTaskThread('', 'TASK-X')).toBeNull();
    // append 도 throw X (best-effort)
    expect(() =>
      appendTaskThread('', { key: 'k', threadId: 't', channelId: 'c' }),
    ).not.toThrow();
  });
});

describe('resolvePersistedThread — pXXX 와 TASK 분기 (단일 진입점)', () => {
  let root: string;
  const env = () => ({ MEMO_REPO_PATH: root }) as NodeJS.ProcessEnv;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'thr-r-'));
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('pXXX → agent-proposal-msgs.jsonl (announceProposal 기록 재사용)', () => {
    appendProposalMsg(env(), {
      messageId: 'm1',
      threadId: 'thr-from-proposal',
      channelId: 'cP',
      id: 'p42c94051',
      kind: 'task',
      target: 'task-new',
      title: '제안 카드',
      ts: 'now',
    });
    expect(resolvePersistedThread(root, env(), 'p42c94051')).toBe(
      'thr-from-proposal',
    );
  });

  it('TASK-* → agent-task-threads.jsonl (router 기록)', () => {
    appendTaskThread(root, {
      key: 'TASK-KL-100',
      threadId: 'thr-from-router',
      channelId: 'cT',
    });
    expect(resolvePersistedThread(root, env(), 'TASK-KL-100')).toBe(
      'thr-from-router',
    );
  });

  it('미존재 키 → null (다음 단계: 이름검색 → 생성)', () => {
    expect(resolvePersistedThread(root, env(), 'TASK-NONE-001')).toBeNull();
    expect(resolvePersistedThread(root, env(), 'p00000000')).toBeNull();
  });

  it('memoRoot 빈 → null (in-memory only, 구 동작 fallback)', () => {
    expect(resolvePersistedThread('', env(), 'TASK-X')).toBeNull();
  });

  it('재기동 시뮬: 영속 파일만 있으면 같은 키 → 같은 스레드 id 복원', () => {
    // "봇 프로세스 A" 가 만든 매핑 = 디스크
    appendTaskThread(root, {
      key: 'TASK-KAR-018-THR',
      threadId: 't-stable',
      channelId: 'cT',
    });
    // "봇 프로세스 B" 가 시작 = in-memory 빈 상태, 디스크만으로 회복
    expect(resolvePersistedThread(root, env(), 'TASK-KAR-018-THR')).toBe(
      't-stable',
    );
  });
});
