/**
 * 등급전에 사람이 서면 채널이 부른다 (change.arcade-online)
 *
 * 등급전은 만들어 뒀는데 줄에 아무도 없다. 사람이 모이는 자리는 사이트가 아니라 디스코드고,
 * 거기 있는 사람은 누가 지금 기다린다는 것을 알 길이 없었다. 그래서 혼자 45초 서 있다가
 * 나간다. 판이 안 나는 게 아니라 **만난 적이 없다.**
 *
 * 규율 셋. 남의 알림을 안 축내려고 둠
 *  ① **바로 안 부른다.** 서자마자 짝이 나는 판이 흔하다. 45초를 넘겨 기다릴 때만
 *  ② **같은 놀이는 30분에 한 번.** LFG 봇들이 역할 멘션에 거는 쿨다운의 흔한 하한
 *  ③ **한 시간에 넉 장까지.** 놀이가 여럿이면 ②만으로는 도배
 *
 * 시계는 인자로 받음. 검사가 30분을 진짜로 기다릴 수 없어서
 * 송신은 `sendLocalEvent` 한 길 그대로 (`arcade-result` 와 같은 규율).
 */
import type { Client } from 'discord.js';
import { sendLocalEvent } from './local-webhook';
import { loadGames } from './slash/arcade';

const SITE = 'https://blog.mascari4615.com';
const LOBBY = `${SITE}/apps/karmolab/#arcade`;

/** 서자마자 부르지 않는다. 이 안에 붙는 판이 흔하다 */
export const WARMUP_MS = 45_000;
/** 같은 놀이를 다시 부르기까지 */
export const COOLDOWN_MS = 30 * 60_000;
/** 한 시간에 이만큼까지 */
export const PER_HOUR = 4;

const lastByGame = new Map<string, number>();
let recent: number[] = [];

/** 검사용 뒷문 */
export function resetLfg(): void {
  lastByGame.clear();
  recent = [];
}

/**
 * 지금 부르고 장부에 적음. 안 부르기로 했으면 그 이유
 *
 * 물어보기와 적기를 한 자리에. 나누면 물어만 보고 안 적는 자리가 생기고, 그날 채널이 도배
 */
export function tryCall(game: string, waitedMs: number, now = Date.now()): 'ok' | 'early' | 'cooldown' | 'hourly' {
  if (waitedMs < WARMUP_MS) return 'early';
  recent = recent.filter((t) => now - t < 60 * 60_000);
  if (recent.length >= PER_HOUR) return 'hourly';
  if (now - (lastByGame.get(game) ?? 0) < COOLDOWN_MS) return 'cooldown';
  lastByGame.set(game, now);
  recent.push(now);
  return 'ok';
}

export interface WaitInfo {
  game: string;
  /** 사람이 로비에 적은 이름 */
  name: string;
  /** 줄에 선 시각 */
  since: number;
}

export type OnWait = (info: WaitInfo) => void;

/** 놀이 한국어 이름. 없으면 id 그대로 (말 묶음이 두 벌이 되면 갈라진다) */
export function nameOfGame(game: string): string {
  return loadGames().find((g) => g.id === game)?.name ?? game;
}

/**
 * 대기열이 부를 손. 사이트가 5초마다 줄을 다시 알리므로 여기 시계는 따로 없음
 * 45초를 넘긴 첫 알림에서 채널로
 */
export function makeLfgCaller(client: Client, now = (): number => Date.now()): OnWait {
  return (info: WaitInfo): void => {
    const at = now();
    if (tryCall(info.game, at - info.since, at) !== 'ok') return;
    const mins = Math.max(1, Math.round((at - info.since) / 60_000));
    void sendLocalEvent(client, {
      kind: 'arcade-lfg',
      source: 'karmolab/arcade',
      title: `${nameOfGame(info.game)} 등급전, 한 사람이 기다립니다`,
      summary: `${info.name} 님이 ${mins}분째 줄에 서 있어요. 들어가면 바로 붙습니다.`,
      url: LOBBY
    });
  };
}
