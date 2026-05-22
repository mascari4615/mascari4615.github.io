/**
 * proposal-adapter 행동 테스트 (KAR-018-W slice-2).
 * tracer-bullet: 발굴→parse→route→dispatch / parse-fail 폐기 / no-dispatch /
 * inboxDispatch 인박스 기록(canon 무변경). FS 격리 tmpdir.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  runProducerOnce,
  inboxDispatch,
  proposalsPath,
  setProposalAnnouncer,
  resolvedLedgerPath,
  readRejectedProposalIds,
  summarizeRejectedForDiscovery,
  readRecentProducerSchemaFails,
  type ProposalProducerDeps,
} from './proposal-adapter';

const envJson = JSON.stringify({
  kind: 'env',
  payload: { id: 'P1', summary: 's', targetFiles: ['a'], source: 'self-task' },
});

let root: string;
let notes: string[];
function baseEnv() {
  return { MEMO_REPO_PATH: root } as NodeJS.ProcessEnv;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'prop-'));
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  notes = [];
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('runProducerOnce — 발굴 → route → dispatch', () => {
  it('정상 발굴 → 타겟 반환 + dispatch 호출', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const deps: ProposalProducerDeps = {
      env: baseEnv(),
      discover: async () => envJson,
      dispatch: { 'self-improve': fn },
      notify: (m) => notes.push(m),
    };
    expect(await runProducerOnce(deps)).toBe('self-improve');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('파싱 실패 → parse-fail (폐기, dispatch 호출 X)', async () => {
    const fn = vi.fn();
    const r = await runProducerOnce({
      env: baseEnv(),
      discover: async () => '쓰레기 출력',
      dispatch: { 'self-improve': fn },
      notify: (m) => notes.push(m),
    });
    expect(r).toBe('parse-fail');
    expect(fn).not.toHaveBeenCalled();
  });

  it('SO-3: 파싱 실패 시 evolution-events 에 producer-schema-fail + raw 적재 + reader 회수', async () => {
    const env = baseEnv();
    const r = await runProducerOnce({
      env,
      discover: async () => '   완전 깨진 출력 — JSON 아님   ',
      dispatch: {},
      notify: () => {},
    });
    expect(r).toBe('parse-fail');
    const evoPath = path.join(root, '.claude', 'evolution-events.jsonl');
    expect(fs.existsSync(evoPath)).toBe(true);
    const last = fs.readFileSync(evoPath, 'utf-8').trim().split(/\r?\n/).pop()!;
    const e = JSON.parse(last);
    expect(e.code).toBe('producer-schema-fail');
    expect(e.source).toBe('proposal');
    expect(e.evidence).toContain('깨진 출력');
    // reader 가 evidence snippet 회수 (다음 producer prompt 자가 inject)
    const fails = readRecentProducerSchemaFails(env, 3);
    expect(fails.length).toBeGreaterThanOrEqual(1);
    expect(fails[fails.length - 1]).toContain('깨진 출력');
  });

  it('타겟 미배선 → no-dispatch (graceful)', async () => {
    expect(
      await runProducerOnce({
        env: baseEnv(),
        discover: async () => envJson,
        dispatch: {},
        notify: (m) => notes.push(m),
      }),
    ).toBe('no-dispatch');
  });

  it('discover 예외 → discover-error', async () => {
    expect(
      await runProducerOnce({
        env: baseEnv(),
        discover: async () => {
          throw new Error('boom');
        },
        dispatch: {},
        notify: (m) => notes.push(m),
      }),
    ).toBe('discover-error');
  });
});

describe('inboxDispatch — 보수 materialization (canon 무변경)', () => {
  it('모든 타겟 → proposals.jsonl 인박스 기록', async () => {
    const env = baseEnv();
    const r = await runProducerOnce({
      env,
      discover: async () => envJson,
      dispatch: inboxDispatch(env),
      notify: (m) => notes.push(m),
    });
    expect(r).toBe('self-improve');
    const line = fs.readFileSync(proposalsPath(env), 'utf-8').trim();
    const e = JSON.parse(line);
    expect(e.target).toBe('self-improve');
    expect(e.kind).toBe('env');
    expect(e.envelope.payload.id).toBe('P1');
  });
});

describe('KAR-018-Y-1 중복 dedup — 거절/대기/승인 재등장 차단', () => {
  it('같은 엔벨로프 2회 발굴 → 2번째 duplicate, 인박스·카드 2중 X', async () => {
    const env = baseEnv();
    const announcer = vi.fn();
    setProposalAnnouncer(announcer);
    const mk = () => ({
      env,
      discover: async () => envJson,
      dispatch: inboxDispatch(env),
      notify: (m: string) => notes.push(m),
    });
    expect(await runProducerOnce(mk())).toBe('self-improve'); // 신규
    expect(await runProducerOnce(mk())).toBe('duplicate'); // 재발굴 차단
    // 인박스 1줄만 (2중 append X)
    const lines = fs
      .readFileSync(proposalsPath(env), 'utf-8')
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);
    expect(lines.length).toBe(1);
    // 카드 게시(announcer) 1회만 (반복 노이즈 0)
    expect(announcer).toHaveBeenCalledOnce();
    setProposalAnnouncer(null);
  });

  it('신규 발굴은 완전 불변 (회귀0)', async () => {
    const env = baseEnv();
    const fn = vi.fn().mockResolvedValue(undefined);
    expect(
      await runProducerOnce({
        env,
        discover: async () => envJson,
        dispatch: { 'self-improve': fn },
        notify: (m) => notes.push(m),
      }),
    ).toBe('self-improve');
    expect(fn).toHaveBeenCalledOnce();
  });
});

describe('KAR-018-Y-2 거절 학습 — resolved 원장 → discover 컨텍스트', () => {
  const writeResolved = (rows: Array<{ id: string; decision: string }>) => {
    const env = baseEnv();
    fs.writeFileSync(
      resolvedLedgerPath(env),
      rows
        .map((r) => JSON.stringify({ ts: 't', id: r.id, decision: r.decision }))
        .join('\n') + '\n',
    );
  };
  const writeInbox = (entries: Array<{ id: string; kind: string; payload: object }>) => {
    const env = baseEnv();
    fs.writeFileSync(
      proposalsPath(env),
      entries
        .map((e) =>
          JSON.stringify({
            ts: 't',
            id: e.id,
            target: 'self-improve',
            kind: e.kind,
            envelope: { kind: e.kind, payload: e.payload },
          }),
        )
        .join('\n') + '\n',
    );
  };

  it('최신 결정이 rejected 인 id 만 (approved/번복 제외)', () => {
    writeResolved([
      { id: 'pA', decision: 'rejected' },
      { id: 'pB', decision: 'approved' },
      { id: 'pC', decision: 'rejected' },
      { id: 'pC', decision: 'approved' }, // 최신=approved → 제외
    ]);
    const r = readRejectedProposalIds(baseEnv());
    expect([...r].sort()).toEqual(['pA']);
  });

  it('거절 ⨝ 인박스 → 제목 블록, 거절 0 = 빈문자(섹션 생략)', () => {
    expect(summarizeRejectedForDiscovery(baseEnv())).toBe('');
    writeResolved([{ id: 'pX', decision: 'rejected' }]);
    writeInbox([
      { id: 'pX', kind: 'task', payload: { title: '거절된 방향' } },
      { id: 'pY', kind: 'env', payload: { summary: '승인된 건' } },
    ]);
    const s = summarizeRejectedForDiscovery(baseEnv());
    expect(s).toContain('거절된 방향');
    expect(s).not.toContain('승인된 건'); // 거절 아닌 건 미포함
    expect(s.startsWith('- task:')).toBe(true);
  });
});

// ── LT-2 북극성 게이트 (TASK-KAR-018-LT 기둥1) ──
describe('runProducerOnce — LT-2 projectId 북극성 게이트', () => {
  function writePortfolio() {
    fs.writeFileSync(
      path.join(root, '.claude', 'team-portfolio.json'),
      JSON.stringify({
        projects: [
          { id: 'wm', title: 'WM', northStar: '팬100', weight: 100, status: 'active', progressLog: [] },
        ],
      }),
      'utf-8',
    );
  }
  const withPid = JSON.stringify({
    kind: 'env',
    projectId: 'wm',
    payload: { id: 'P1', summary: 's', targetFiles: ['a'], source: 'self-task' },
  });
  const badPid = JSON.stringify({
    kind: 'env',
    projectId: 'ghost',
    payload: { id: 'P1', summary: 's', targetFiles: ['a'], source: 'self-task' },
  });

  it('정본 존재 + projectId 미기재 → no-project (폐기, dispatch X)', async () => {
    writePortfolio();
    const fn = vi.fn();
    const r = await runProducerOnce({
      env: baseEnv(),
      discover: async () => envJson, // projectId 없음
      dispatch: { 'self-improve': fn },
      notify: (m) => notes.push(m),
    });
    expect(r).toBe('no-project');
    expect(fn).not.toHaveBeenCalled();
    expect(notes.join()).toContain('북극성');
  });

  it('정본 존재 + 미지 projectId → no-project', async () => {
    writePortfolio();
    const fn = vi.fn();
    const r = await runProducerOnce({
      env: baseEnv(),
      discover: async () => badPid,
      dispatch: { 'self-improve': fn },
      notify: (m) => notes.push(m),
    });
    expect(r).toBe('no-project');
    expect(fn).not.toHaveBeenCalled();
  });

  it('정본 존재 + 유효 projectId → 게이트 통과·dispatch', async () => {
    writePortfolio();
    const fn = vi.fn().mockResolvedValue(undefined);
    const r = await runProducerOnce({
      env: baseEnv(),
      discover: async () => withPid,
      dispatch: { 'self-improve': fn },
      notify: (m) => notes.push(m),
    });
    expect(r).toBe('self-improve');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('pre-rollout (정본 부재) → 게이트 skip, 기존 동작 불변 (회귀 가드)', async () => {
    // team-portfolio.json 미작성 → projects 0 → gate skip
    const fn = vi.fn().mockResolvedValue(undefined);
    const r = await runProducerOnce({
      env: baseEnv(),
      discover: async () => envJson, // projectId 없어도
      dispatch: { 'self-improve': fn },
      notify: (m) => notes.push(m),
    });
    expect(r).toBe('self-improve'); // 게이트 미적용
    expect(fn).toHaveBeenCalledOnce();
  });
});
