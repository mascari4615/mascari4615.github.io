/**
 * team-bus-fetcher — #team-bus 최근 발언 fetch 의 모듈-레벨 setter/getter
 * (KAR-018-LT-W1-WIRE).
 *
 * 패턴 = music-player 의 setMusicDiscordClient(line 226) 동형. main.ts 가
 * Discord client / channel resolver 를 들고 있으므로, startup 에서 setter
 * 호출 → cadence-worker.ts 가 import 해서 사용. 평행 인프라 X.
 *
 * Phase 1 (LT-W1) = WorkerConsumerDeps.fetchTeamBusContext seam.
 * Phase 2 (본 모듈) = production wire. deps 미주입 시 module-level fallback.
 */
export type TeamBusContextFetcher =
  (limit: number) => Promise<string | undefined>;

let provider: TeamBusContextFetcher | null = null;

/**
 * main.ts 가 startup(clientReady) 에서 호출. null 전달 = wire 해제(shutdown).
 */
export function setTeamBusContextFetcher(
  fn: TeamBusContextFetcher | null,
): void {
  provider = fn;
}

/**
 * 워커가 호출. wire 안 됐으면 undefined(채팅 input 누락 = 5입력 fallback).
 * 실패 시 throw — 호출 측(processWorker) drift trace 잡고 fallback.
 */
export async function fetchTeamBusContext(
  limit: number,
): Promise<string | undefined> {
  if (!provider) return undefined;
  return provider(limit);
}
