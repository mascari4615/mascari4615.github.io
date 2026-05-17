/**
 * materializeAgentProposal 워커 판별자 pass-through 잠금 (KAR-018-X 계약완성).
 *
 * E i3a 팩토리에 *additive* 확장 — kind/domain/machine 이 있으면 core.md
 * frontmatter 로 흘려보내 selectWorkerCores 가 고를 수 있게. 없으면 기존
 * 출력 byte-identical(생산자 atlas/echo 회귀 0). 팩토리 출력 → loadCoreDef
 * → selectWorkerCores 까지 end-to-end (계약 "워커=팩토리 경로" 실증).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { materializeAgentProposal } from './proposal-adapter';
import { loadCoreDef } from '../services/agent-core';
import { selectWorkerCores } from './agent-cadence';

let root: string;
const env = () => ({ MEMO_REPO_PATH: root }) as NodeJS.ProcessEnv;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'matw-'));
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf-8');
}

describe('생산자 spec (kind 미설정) — 기존 동작 불변 (회귀 lock)', () => {
  it('kind/domain/machine 라인 무출력 + 발굴-제안 직무 + status:draft', () => {
    const rel = materializeAgentProposal(env(), {
      id: 'P1', coreId: 'scout', role: '조사한다', name: 'Scout', source: 's',
    });
    expect(rel).toBeTruthy();
    const md = read(rel as string);
    expect(md).not.toContain('kind:');
    expect(md).not.toContain('domain:');
    expect(md).toContain('status: draft');
    expect(md).toContain('직접 main 변경 X');
    expect(md).not.toContain('⑦(2) 소비자');
  });
});

describe('워커 spec (kind:worker) — 판별자 pass-through', () => {
  const workerSpec = {
    id: 'P2', coreId: 'wm-worker', role: 'WM 도메인 실행', name: 'WmWorker',
    source: 'KAR-018-X', kind: 'worker', domain: 'wm', machine: 'desktop',
  };

  it('frontmatter 에 kind/domain(대문자)/machine + 소비자 직무 + status:draft 불변', () => {
    const rel = materializeAgentProposal(env(), workerSpec);
    const md = read(rel as string);
    expect(md).toContain('kind: worker');
    expect(md).toContain('domain: WM');
    expect(md).toContain('machine: desktop');
    expect(md).toContain('status: draft'); // 불변식 — 자동 active X
    expect(md).toContain('⑦(2) 소비자');
    expect(md).toContain('Draft PR only');
  });

  it('팩토리 출력 → loadCoreDef → selectWorkerCores 가 인식 (draft=inert)', () => {
    materializeAgentProposal(env(), workerSpec);
    const def = loadCoreDef(root, 'wm-worker');
    expect(def).toBeTruthy();
    expect(def!.frontmatter.kind).toBe('worker');
    expect(def!.frontmatter.domain).toBe('WM');
    // draft → 아직 inert (사람 가동 승인 전 — 계약 불변식)
    expect(selectWorkerCores([def])).toHaveLength(0);
  });

  it('사람이 status:active 승격 → selectWorkerCores 가 워커로 픽업', () => {
    const rel = materializeAgentProposal(env(), workerSpec) as string;
    const p = path.join(root, rel);
    fs.writeFileSync(p, read(rel).replace('status: draft', 'status: active'));
    const def = loadCoreDef(root, 'wm-worker');
    const workers = selectWorkerCores([def]);
    expect(workers).toHaveLength(1);
    expect(workers[0]).toMatchObject({
      coreId: 'wm-worker', domain: 'WM', machine: 'desktop',
    });
  });

  it('기존 코어 비덮어쓰기 (멱등 skip — 불변식)', () => {
    materializeAgentProposal(env(), workerSpec);
    const first = read((`.claude/agents/wm-worker/core.md`));
    materializeAgentProposal(env(), { ...workerSpec, role: '덮어쓰기 시도' });
    expect(read('.claude/agents/wm-worker/core.md')).toBe(first);
  });
});
