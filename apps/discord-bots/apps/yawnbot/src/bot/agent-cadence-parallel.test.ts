/**
 * 워커 드레인 병렬화 회귀 (KAR-018-P, slot D).
 *
 * 직렬화 강제 근본 결합 = per-child 자격을 *전역 process.env* 로 전달
 * (자식이 ambient 상속). 근본 fix = req.childEnv per-spawn 격리 +
 * bounded 동시성 풀. 본 스위트가 잠그는 불변식:
 *  ① 동시 워커가 자기 도메인 토큰만 본다(교차오염 0) + 전역
 *     process.env.GH_TOKEN 변이 0.
 *  ② AGENT_WORKER_CONCURRENCY cap 준수(=1 → 직렬, 미설정 → 워커수 병렬).
 * spawn 주입으로 실 claude·실 git 없이 분기 잠금(결정성).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  runWorkerConsumerOnce,
  disarmKill,
  resetWorkerStatus,
  type WorkerCore,
} from './agent-cadence';
import type { Tier3Request, Tier3Result } from './dispatcher';

const wc = (coreId: string, domain: string): WorkerCore => ({
  coreId,
  domain,
  machine: 'any',
  label: `🛠 ${coreId}`,
});

const baseDeps = (
  workers: WorkerCore[],
  spawn: (req: Tier3Request) => Promise<Tier3Result>,
) => ({
  listWorkers: () => workers,
  scan: (domain: string) => [{ id: `TASK-${domain}-1`, file: 'f.md' }],
  claim: () => true,
  setupWorktree: () => ({ cwd: 'w', repoRoot: 'r', wtDir: 'w', branch: 'b' }),
  branchPushed: () => true,
  spawn,
});

const tick = () => new Promise((r) => setTimeout(r, 5));

beforeEach(() => {
  disarmKill();
  resetWorkerStatus();
});

describe('KAR-018-P 병렬화 — env 격리 (전역 변이 0, 교차오염 0)', () => {
  it('동시 워커가 각자 도메인 토큰만 보고 process.env 는 불변', async () => {
    const before = process.env.GH_TOKEN;
    const seen: Record<string, string | undefined> = {};
    const env = {
      MEMO_REPO_PATH: '/tmp/memo',
      WM_GITHUB_PAT: 'WMTOK',
      GH_TOKEN: 'IOTOK', // 주입 env 의 값 — process.env 아님
    } as NodeJS.ProcessEnv;

    const spawn = async (req: Tier3Request): Promise<Tier3Result> => {
      // 인터리브 강제: 다른 워커가 끼어든 뒤에 자기 토큰 캡처.
      await tick();
      seen[req.core] = req.childEnv?.GH_TOKEN;
      await tick();
      return { status: 'done' };
    };

    await runWorkerConsumerOnce(
      env,
      baseDeps([wc('wm-worker', 'WM'), wc('kl-worker', 'KL')], spawn),
    );

    // wm → WM_GITHUB_PAT, kl → (App null) → 주입 env.GH_TOKEN. 교차 X.
    expect(seen['wm-worker']).toBe('WMTOK');
    expect(seen['kl-worker']).toBe('IOTOK');
    // 근본: 전역 process.env.GH_TOKEN 변이 없음(직렬화 강제 결합 제거).
    expect(process.env.GH_TOKEN).toBe(before);
  });
});

describe('KAR-018-P 병렬화 — bounded 동시성 cap', () => {
  const concurrencyProbe = (workers: WorkerCore[], env: NodeJS.ProcessEnv) => {
    let live = 0;
    let maxLive = 0;
    const spawn = async (): Promise<Tier3Result> => {
      live += 1;
      maxLive = Math.max(maxLive, live);
      await tick();
      live -= 1;
      return { status: 'done' };
    };
    return runWorkerConsumerOnce(env, baseDeps(workers, spawn)).then(
      () => maxLive,
    );
  };

  it('cap=1 → 직렬(동시 in-flight 최대 1)', async () => {
    const max = await concurrencyProbe(
      [wc('a-worker', 'WM'), wc('b-worker', 'KL'), wc('c-worker', 'KAR')],
      {
        MEMO_REPO_PATH: '/tmp/memo',
        AGENT_WORKER_CONCURRENCY: '1',
      } as NodeJS.ProcessEnv,
    );
    expect(max).toBe(1);
  });

  it('cap 미설정 → 워커수만큼 병렬(동시 in-flight = 3)', async () => {
    const max = await concurrencyProbe(
      [wc('a-worker', 'WM'), wc('b-worker', 'KL'), wc('c-worker', 'KAR')],
      { MEMO_REPO_PATH: '/tmp/memo' } as NodeJS.ProcessEnv,
    );
    expect(max).toBe(3);
  });

  it('cap=2 → 동시 in-flight 상한 2', async () => {
    const max = await concurrencyProbe(
      [
        wc('a-worker', 'WM'),
        wc('b-worker', 'KL'),
        wc('c-worker', 'KAR'),
        wc('d-worker', 'WM'),
      ],
      {
        MEMO_REPO_PATH: '/tmp/memo',
        AGENT_WORKER_CONCURRENCY: '2',
      } as NodeJS.ProcessEnv,
    );
    expect(max).toBe(2);
  });
});
