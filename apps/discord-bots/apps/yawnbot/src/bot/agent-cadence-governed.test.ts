/**
 * governed cadence 행동 테스트 (KAR-018-D slice-3).
 * tracer-bullet: parseCadenceObjective / classifyRisk / runGovernedCadenceOnce
 * (drift-skip / escalate+pending / approved resume / proceed). FS 격리=tmpdir.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  parseCadenceObjective,
  classifyRisk,
  runGovernedCadenceOnce,
  buildGovernCadenceDeps,
  armKill,
  disarmKill,
  type ParsedObjective,
} from './agent-cadence';
import { SessionRegistry, type Tier3Deps } from './dispatcher';

const row = (id: string, sum: string, der: string, al: string, st = 'active') =>
  `| ${id} | ${sum} | ${der} | ${al} | ${st} | - | - |`;

afterEach(() => disarmKill());

describe('parseCadenceObjective (D-4 — 공백도 반환)', () => {
  it('active 행 → 필드 분해', () => {
    const o = parseCadenceObjective(['헤더', row('OBJ-001', '목표X', 'self-task:x', '§1')].join('\n'));
    expect(o).toEqual({ objId: 'OBJ-001', summary: '목표X', derivation: 'self-task:x', alignment: '§1' });
  });
  it('정렬 공백도 null 아님 (governance 가 판정)', () => {
    expect(parseCadenceObjective(row('OBJ-002', 'm', 'd', '   '))?.alignment).toBe('');
  });
  it('active 아님 → null', () => {
    expect(parseCadenceObjective(row('OBJ-003', 'm', 'd', '§1', 'proposed'))).toBeNull();
  });
});

describe('classifyRisk (보수 — NLP 날조 X)', () => {
  const o = (al: string, der = 'd'): ParsedObjective => ({ objId: 'O', summary: 's', derivation: der, alignment: al });
  it('§2.2 참조 → risk-tag', () => expect(classifyRisk(o('§2.2'))).toBeTruthy());
  it('[risk] 마커 → risk-tag', () => expect(classifyRisk(o('§1', '[risk] env'))).toBeTruthy());
  it('일반 → undefined', () => expect(classifyRisk(o('§1 · §2.5'))).toBeUndefined());
});

describe('runGovernedCadenceOnce — 게이트 분기', () => {
  let root: string;
  let runImpl: ReturnType<typeof vi.fn>;
  function deps(): Tier3Deps {
    runImpl = vi.fn().mockResolvedValue('ok');
    return { thisMachine: 'any', reserve: () => true, run: runImpl, registry: new SessionRegistry() };
  }
  function gov() {
    return buildGovernCadenceDeps({ MEMO_REPO_PATH: root } as NodeJS.ProcessEnv);
  }
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'gcad-'));
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('kill → killed, spawn X', async () => {
    armKill();
    const d = deps();
    expect(await runGovernedCadenceOnce(d, gov(), () => ({ objId: 'O', summary: 's', derivation: 'd', alignment: '§1' }))).toBe('killed');
    expect(runImpl).not.toHaveBeenCalled();
  });

  it('objective 없음 → idle', async () => {
    expect(await runGovernedCadenceOnce(deps(), gov(), () => null)).toBe('idle');
  });

  it('정렬 공백 → drift-skip, spawn X', async () => {
    const d = deps();
    const r = await runGovernedCadenceOnce(d, gov(), () => ({ objId: 'O', summary: 's', derivation: 'd', alignment: '' }));
    expect(r).toBe('drift-skip');
    expect(runImpl).not.toHaveBeenCalled();
  });

  it('risk-tag → escalated + pending append, 재호출 중복 X', async () => {
    const d = deps();
    const o = (): ParsedObjective => ({ objId: 'OBJ-9', summary: 's', derivation: 'd', alignment: '§2.2' });
    expect(await runGovernedCadenceOnce(d, gov(), o)).toBe('escalated');
    expect(await runGovernedCadenceOnce(d, gov(), o)).toBe('escalated');
    const lines = fs
      .readFileSync(path.join(root, '.claude', 'agent-approvals.jsonl'), 'utf-8')
      .trim()
      .split('\n');
    expect(lines).toHaveLength(1); // 중복 억제
    expect(runImpl).not.toHaveBeenCalled();
  });

  it('승인됨(approvals.jsonl) + risk → proceed + spawn', async () => {
    const d = deps();
    fs.writeFileSync(
      path.join(root, '.claude', 'agent-approvals.jsonl'),
      JSON.stringify({ ts: 't', objId: 'OBJ-9', core: 'cadence', status: 'approved', reason: 'ok' }) + '\n',
    );
    const r = await runGovernedCadenceOnce(d, gov(), () => ({ objId: 'OBJ-9', summary: 's', derivation: 'd', alignment: '§2.2' }));
    expect(r).toBe('done');
    expect(runImpl).toHaveBeenCalledTimes(1);
  });

  it('정상 objective → proceed + spawn', async () => {
    const d = deps();
    const r = await runGovernedCadenceOnce(d, gov(), () => ({ objId: 'OBJ-1', summary: 's', derivation: 'self-task:x', alignment: '§1 · §2.5' }));
    expect(r).toBe('done');
    expect(runImpl).toHaveBeenCalledTimes(1);
  });
});
