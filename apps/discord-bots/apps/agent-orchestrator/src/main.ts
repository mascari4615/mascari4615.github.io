/**
 * agent-orchestrator — 에이전트 팀 cadence host (TASK-KAR-096 Phase 1b).
 *
 * 사용자 발화 (2026-05-22): 「봇 1개 죽으면 전 에이전트 정지 ← 그니까 재시작하면 꺼진다는거잖아」
 * 「진짜 독립 multi-process refactor 이게 근본이잖아」 + 「해」 push.
 *
 * yawnbot 에서 cadence 코드 분리 → 별 NSSM service. yawnbot restart 가 새 worker pickup 도
 * 막지 않게.
 *
 * Phase 1b (본 entry): yawnbot dist 의 startAgentCadence 를 require — 같은 코드 share 하되
 *   별 process 로 가동. discord notify wire = stub (trace.jsonl 박힘만, Phase 1c 에서 webhook).
 * Phase 1c: discord notify wire (webhook URL POST — yawnbot reactive 와 분리)
 * Phase 2: 워커별 별 daemon (kar/kl/wm-support/wm-worker)
 * Phase 3: 각 워커 자기 코드 fix → 자기 restart
 *
 * yawnbot main.ts 가 AGENT_HOST=orchestrator env 시 cadence 호출 skip → 이중 race 방지.
 *
 * yawnbot 코드 require: declaration 미생성이라 TS import 불가, runtime require 사용.
 * 같은 npm workspace 라 node_modules hoist 로 link 자동.
 */
import 'dotenv/config';
import { createRequire } from 'node:module';

const log = (msg: string): void => {
  // eslint-disable-next-line no-console
  console.log(`[agent-orchestrator ${new Date().toISOString()}] ${msg}`);
};

log('starting (TASK-KAR-096 Phase 1b — cadence loop, discord notify=stub)');
log(`AGENT_HOST=${process.env.AGENT_HOST ?? '<unset>'} (yawnbot 측 skip 신호)`);
log(`MEMO_REPO_PATH=${process.env.MEMO_REPO_PATH ?? '<unset>'}`);
log(`AGENT_CADENCE_ENABLED=${process.env.AGENT_CADENCE_ENABLED ?? '<unset>'}`);
log(`AGENT_CADENCE_QUIET=${process.env.AGENT_CADENCE_QUIET ?? '<unset>'}`);

if (!process.env.MEMO_REPO_PATH) {
  log('ERROR: MEMO_REPO_PATH 미설정. orchestrator 종료.');
  process.exit(1);
}

if (process.env.AGENT_HOST?.trim() !== 'orchestrator') {
  log('WARN: AGENT_HOST 가 orchestrator 아님. yawnbot 측 cadence 와 이중 race 위험. AGENT_HOST=orchestrator 권장.');
}

// yawnbot dist 의 cadence entry require. node_modules workspace hoist 로 link.
const localRequire = createRequire(import.meta.url);
let startAgentCadence: ((env: NodeJS.ProcessEnv) => void) | null = null;
try {
  // path: orchestrator/dist/src/main.js → ../../../yawnbot/dist/src/bot/agent-cadence.js
  const mod = localRequire('../../../yawnbot/dist/src/bot/agent-cadence.js');
  startAgentCadence = mod.startAgentCadence;
} catch (e) {
  log(`ERROR: yawnbot/dist/src/bot/agent-cadence.js require 실패: ${e instanceof Error ? e.message : String(e)}`);
  log('yawnbot 빌드 먼저 (`npm run build:yawnbot`). orchestrator 종료.');
  process.exit(1);
}

if (typeof startAgentCadence !== 'function') {
  log('ERROR: startAgentCadence not a function. yawnbot dist 구조 변경 가능. 종료.');
  process.exit(1);
}

startAgentCadence(process.env);
log('cadence loop started via require. notify wire=stub (trace.jsonl 박힘, discord 발화 X — Phase 1c).');
log('agent-orchestrator ready. cadence cron 자가발전 cycle 가동 중.');

const shutdown = (signal: string): void => {
  log(`${signal} received, exiting`);
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
