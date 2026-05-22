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
// KAR-018-SO-X 후속: CJS 빌드라 createRequire(import.meta.url) 가 ESM-only
// → Node 24 가 reparse 후 `exports is not defined` crash loop (30+ cycles
// 실측, stderr 1324B 반복). tsconfig.base.json = module:CommonJS 강제 →
// top-level `require` 가 이미 글로벌. createRequire 불요.
//
// KAR-018-SO-X 추가 fix: yawnbot load-env.js 를 cadence 전에 require → yawnbot
// 4-레이어 config (defaults + prod profile + .env + AI keys) 자동 로드. NSSM
// AppEnvironmentExtra 에 MEMO_REPO_PATH/CADENCE_* 일일이 박는 평행 정의 회피.
// load-env.js 부재 (yawnbot 빌드 X) = silent — cadence require 가 어차피 실패.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../../yawnbot/dist/src/load-env.js');
} catch { /* yawnbot 빌드 미완 = 다음 require 에서 진단 */ }

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
let startAgentCadence: ((env: NodeJS.ProcessEnv) => void) | null = null;
try {
  // path: orchestrator/dist/src/main.js → ../../../yawnbot/dist/src/bot/agent-cadence.js
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../../../yawnbot/dist/src/bot/agent-cadence.js');
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
