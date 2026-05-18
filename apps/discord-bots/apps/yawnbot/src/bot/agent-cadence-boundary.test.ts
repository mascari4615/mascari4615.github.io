/**
 * 생산자 ⊥ 소비자 경계 회귀 (KAR-018-X 핵심 결정 ⓪ 잠금).
 *
 * 본 TASK 의 아키텍처 근본 = "생산자(atlas/echo=제안) ⊥ 소비자(워커=실행)
 * 깔끔 분리" (스펙 핵심결정 ⓪/① · agent-mission §2.7 substrate). 지금까지
 * 이 경계는 *분리된 deps 표면* (producer=discover/reserve, worker=scan/
 * claim/spawn) 으로만 암묵 강제 — 누군가 나중에 worker 에 발굴을, producer
 * 에 tier3 실행을 배선해도 깨질 테스트가 0. Backlog 미체크 항목
 * "워커↔생산자 경계 (워커가 발굴 안 함·생산자가 실행 안 함) 회귀 시나리오
 * (yawnbot 영역)" 를 *관측 가능한 부수효과* 로 명시 불변식화한다.
 *
 * 비대칭 ground-truth (이게 경계의 본질):
 *  · 생산자 = `proposals.jsonl` 에 *제안 엔벨로프* 산출. tier3 실행/worktree/
 *    Draft PR 산출물 0. 결과 어휘는 절대 worker-form(`:done:TASK-`...) 아님.
 *  · 소비자 = scan→claim→spawn(tier3) 으로 큐 *소비*. `proposals.jsonl`
 *    *생성 0* (제안 산출 = 발굴 드리프트 = 경계 위반).
 *
 * 실 claude·실 예산·실 git 없이 주입 deps + tmpdir FS 격리로 분기 잠금.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  runGovernedProducerOnce,
  runWorkerConsumerOnce,
  disarmKill,
  resetWorkerStatus,
  type WorkerCore,
} from './agent-cadence';

let root: string;
const env = () => ({ MEMO_REPO_PATH: root }) as NodeJS.ProcessEnv;
const proposalsPath = () => path.join(root, '.claude', 'proposals.jsonl');

beforeEach(() => {
  disarmKill();
  resetWorkerStatus();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'boundary-'));
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const W: WorkerCore = {
  coreId: 'wm-worker',
  domain: 'WM',
  machine: 'any',
  label: '🛠 WmWorker',
};

// 발굴 stub 이 *실행처럼 보이는* TASK-shaped payload 를 반환해도 생산자는
// 그것을 절대 "실행" 하지 않고 인박스로만 라우팅해야 한다(제안 only).
const taskShapedEnvelope = JSON.stringify({
  kind: 'env',
  payload: {
    id: 'P1',
    summary: 'TASK-WM-999 처럼 보이는 실행 유혹 페이로드',
    targetFiles: ['src/x.ts'],
    source: 'self-task',
  },
});

describe('생산자가 실행 안 함 (producer ⇒ 제안 only, tier3 실행 0)', () => {
  it('reserve allow → proposals.jsonl 제안 엔벨로프만, worker-form 결과 X', async () => {
    let discoverCalls = 0;
    const r = await runGovernedProducerOnce(env(), {
      discover: async () => {
        discoverCalls++;
        return taskShapedEnvelope;
      },
      reserve: () => true,
    });
    expect(discoverCalls).toBe(1);
    // 산출 = 제안 라우팅(self-improve). 절대 worker 실행 어휘 아님.
    expect(r).toBe('self-improve');
    expect(r).not.toMatch(/:done:|:done-no-artifact:|:error|:claim-lost/);
    // 부수효과 = proposals.jsonl 의 *제안 엔벨로프 단 하나*. 실행 산출물 0.
    const inbox = fs.readFileSync(proposalsPath(), 'utf-8').trim();
    expect(JSON.parse(inbox).envelope.payload.id).toBe('P1');
  });

  it('reserve deny → 발굴 호출 0 + 인박스 산출 0 (제안조차 안 함)', async () => {
    let discoverCalls = 0;
    const r = await runGovernedProducerOnce(env(), {
      discover: async () => {
        discoverCalls++;
        return taskShapedEnvelope;
      },
      reserve: () => false,
    });
    expect(r).toBe('producer-gated');
    expect(discoverCalls).toBe(0);
    expect(fs.existsSync(proposalsPath())).toBe(false);
  });
});

describe('워커가 발굴 안 함 (consumer ⇒ 큐 소비 only, proposals.jsonl 생성 0)', () => {
  it('scan→claim→spawn done — 큐 소비, proposals.jsonl 절대 미생성', async () => {
    const scanned: string[] = [];
    const spawned: string[] = [];
    const r = await runWorkerConsumerOnce(env(), {
      listWorkers: () => [W],
      scan: (domain) => {
        scanned.push(domain);
        return [{ id: 'TASK-WM-1', file: 'memo/wm/tasks/x.md' }];
      },
      claim: () => true,
      setupWorktree: () => ({
        cwd: 'w',
        repoRoot: 'r',
        wtDir: 'w',
        branch: 'b',
      }),
      spawn: async (req) => {
        spawned.push(req.core);
        return { status: 'done' };
      },
      branchPushed: () => true,
      notify: () => {},
      missionText: 'M',
    });
    // 소비 경로 전수 통과 (scan→spawn).
    expect(scanned).toEqual(['WM']);
    expect(spawned).toEqual(['wm-worker']);
    expect(r).toBe('wm-worker:done:TASK-WM-1');
    // 경계 핵심: 워커는 *제안을 산출하지 않는다*. proposals.jsonl 미생성.
    expect(fs.existsSync(proposalsPath())).toBe(false);
  });

  it('idle(후보 0) 여러 틱 — 발굴로 전환 안 함, proposals.jsonl 여전히 0', async () => {
    const deps = {
      listWorkers: () => [W],
      scan: () => [],
      notify: () => {},
    };
    await runWorkerConsumerOnce(env(), deps);
    await runWorkerConsumerOnce(env(), deps);
    const r = await runWorkerConsumerOnce(env(), deps);
    expect(r).toBe('wm-worker:idle');
    // 후보 없다고 워커가 *발굴* 로 빠지면 = 경계 위반. 인박스 산출 0.
    expect(fs.existsSync(proposalsPath())).toBe(false);
  });
});

describe('대칭 불변식 — 같은 memoRoot 에서 두 축의 비대칭', () => {
  it('생산자만 proposals.jsonl 산출 · 소비자만 tier3 spawn', async () => {
    let producerSpawnedTier3 = false; // 생산자는 spawn dep 자체가 없음(구조적)
    await runGovernedProducerOnce(env(), {
      discover: async () => taskShapedEnvelope,
      reserve: () => true,
    });
    // 생산자 1틱 후: 제안 산출 O.
    expect(fs.existsSync(proposalsPath())).toBe(true);
    const beforeWorker = fs.readFileSync(proposalsPath(), 'utf-8');

    let workerSpawnedTier3 = false;
    const r = await runWorkerConsumerOnce(env(), {
      listWorkers: () => [W],
      scan: () => [{ id: 'TASK-WM-1', file: 'memo/wm/tasks/x.md' }],
      claim: () => true,
      setupWorktree: () => ({
        cwd: 'w',
        repoRoot: 'r',
        wtDir: 'w',
        branch: 'b',
      }),
      spawn: async () => {
        workerSpawnedTier3 = true;
        return { status: 'done' };
      },
      branchPushed: () => true,
      notify: () => {},
    });
    expect(r).toBe('wm-worker:done:TASK-WM-1');
    // 소비자 = tier3 실행 O, 생산자 = tier3 실행 X (spawn dep 부재).
    expect(workerSpawnedTier3).toBe(true);
    expect(producerSpawnedTier3).toBe(false);
    // 소비자가 producer 산출(proposals.jsonl)을 *건드리지 않음* — 두 축이
    // 같은 memoRoot 를 공유해도 인박스는 생산자 전유, 소비자 read-only.
    expect(fs.readFileSync(proposalsPath(), 'utf-8')).toBe(beforeWorker);
  });
});
