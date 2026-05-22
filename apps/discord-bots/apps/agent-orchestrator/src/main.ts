/**
 * agent-orchestrator — 에이전트 팀 cadence host (TASK-KAR-096 Phase 1).
 *
 * 사용자 발화 (2026-05-22): 「봇 1개 죽으면 전 에이전트 정지 ← 그니까 재시작하면 꺼진다는거잖아」
 * 「진짜 독립 multi-process refactor 이게 근본이잖아」
 *
 * yawnbot 에서 cadence 코드 분리 → 별 NSSM service. yawnbot restart 가 새 worker pickup 도
 * 막지 않게.
 *
 * Phase 1a (본 entry): directory skeleton + yawnbot env gate (AGENT_HOST=orchestrator 시 yawnbot
 *   cadence 호출 skip — 이중 race 방지). cadence wire 자체는 미연결 stub.
 * Phase 1b (다음 cycle): tsconfig project references 또는 yawnbot dist 의존 + startAgentCadence
 *   호출 + dotenv 경로 정합.
 * Phase 1c (다음 cycle): discord notify wire (webhook URL POST — yawnbot 의 reactive 영역과 분리).
 * Phase 2 (다음 cycle): 워커별 별 daemon (kar-worker / kl-worker / wm-support / wm-worker 각자
 *   별 NSSM service).
 * Phase 3 (다음 cycle): 각 워커 자기 코드 fix → 자기 restart (다른 워커 영향 0).
 */
import 'dotenv/config';

const log = (msg: string): void => {
  // eslint-disable-next-line no-console
  console.log(`[agent-orchestrator ${new Date().toISOString()}] ${msg}`);
};

log('Phase 1a skeleton — directory + entry. cadence wire 미연결 (Phase 1b 박을 때 wire).');
log(`AGENT_HOST=${process.env.AGENT_HOST ?? '<unset>'} (yawnbot 측 cadence skip 신호)`);
log(`MEMO_REPO_PATH=${process.env.MEMO_REPO_PATH ?? '<unset>'}`);
log(`AGENT_CADENCE_ENABLED=${process.env.AGENT_CADENCE_ENABLED ?? '<unset>'}`);
log(`AGENT_CADENCE_QUIET=${process.env.AGENT_CADENCE_QUIET ?? '<unset>'}`);

if (!process.env.MEMO_REPO_PATH) {
  log('ERROR: MEMO_REPO_PATH 미설정. orchestrator 는 memo 접근 필수. 다음 Phase 에서 활성.');
}

// Phase 1b TODO: yawnbot 의 startAgentCadence import + wire
// import { startAgentCadence } from '<yawnbot-import-path>';
// startAgentCadence(process.env);

log('Phase 1a 종료. 실 cadence wire = Phase 1b. 본 process 는 종료 (NSSM service install 전).');
process.exit(0);
