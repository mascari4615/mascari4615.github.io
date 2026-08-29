/**
 * 추천 여섯 칸. 51개 앞에서 뭘 하지를 대신 정한다 (TASK-KL-264 F4)
 *
 * 51개를 갈래별로 늘어놓은 로비는 목록이 아니라 **벽**이다. 고르기가 노는 것보다 힘들면
 * 사람은 창을 닫는다. 오늘의 세 판은 *모두에게 같은* 셋이고, 이 여섯은 *나에게 맞춘* 여섯이다.
 *
 * 고르는 규율. 이 순서가 곧 추천의 뜻이다:
 *  ① **안 해 본 것 먼저.** 51개를 만든 이유가 그거다. 이미 아는 것만 뜨면 51은 6이 된다.
 *  ② **해 봤으면 오래된 것부터.** 어제 한 것을 오늘 또 권하면 그건 추천이 아니라 반복이다.
 *  ③ **갈래를 섞는다.** 여섯 칸이 전부 보드면 그날은 아무도 안 누른다.
 *  ④ **길이를 섞는다**. 짧은 것이 최소 둘, 긴 것은 많아야 하나. 지금 5분밖에 없다가
 *     로비 앞에서 가장 흔한 사정이라, 여섯 칸이 전부 긴 판이면 그 사람에게는 0칸이다.
 *
 * 무작위가 아니다. 같은 사람이 같은 상태로 열면 같은 여섯이 뜬다. 눌렀다 돌아왔더니 칸이
 * 통째로 바뀌어 있으면 아까 본 그것을 다시 찾을 수 없다.
 */
import type { Kind } from './meta';
import type { Length } from './length';
import type { Plays } from './plays';

export const SLOTS = 6;
/** 짧은 판을 적어도 이만큼 */
const MIN_SHORT = 2;
/** 긴 판은 많아야 이만큼 */
const MAX_LONG = 1;

export interface Pickable {
  id: string;
  kind: Kind;
  length: Length;
}

/**
 * 여섯을 뽑는다. 규율 ①②로 줄을 세운 뒤, ③④를 **자리 배정 규칙**으로 걸러 담는다 . 
 * 점수 하나로 뭉뚱그리지 않는다. 보드가 벌써 둘이라 이건 건너뛴다가 설명 가능해야 한다.
 */
export function pick6(all: Pickable[], plays: Plays, slots = SLOTS): string[] {
  const rank = (g: Pickable): number => {
    const p = plays[g.id];
    /* 안 해 본 것은 맨 앞. 해 본 것은 오래된 순. 마지막으로 언제가 클수록 뒤로. */
    return p ? p.at : -1;
  };
  const queue = [...all].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));

  const out: Pickable[] = [];
  const kindCount = new Map<Kind, number>();
  const take = (g: Pickable): void => {
    out.push(g);
    kindCount.set(g.kind, (kindCount.get(g.kind) ?? 0) + 1);
  };
  /* 한 갈래가 여섯 중 둘을 넘지 않게. 여섯 칸에 갈래가 다섯이라 둘이면 충분히 섞인다. */
  const kindFull = (g: Pickable): boolean => (kindCount.get(g.kind) ?? 0) >= 2;
  const longs = (): number => out.filter((g) => g.length === 'long').length;
  const shorts = (): number => out.filter((g) => g.length === 'short').length;

  for (const g of queue) {
    if (out.length >= slots) break;
    if (kindFull(g)) continue;
    if (g.length === 'long' && longs() >= MAX_LONG) continue;
    /* 남은 칸이 짧은 것 몫밖에 없으면 짧은 것만 받는다. */
    const need = MIN_SHORT - shorts();
    if (need > 0 && slots - out.length <= need && g.length !== 'short') continue;
    take(g);
  }
  /* 규칙이 너무 빡빡해 덜 찼으면 남은 것으로 채운다. 빈 칸보다는 낫다. */
  for (const g of queue) {
    if (out.length >= slots) break;
    if (!out.includes(g)) take(g);
  }
  return out.map((g) => g.id);
}

/**
 * 검색. 이름, 설명, 갈래, 길이 중 아무 데나 걸리면 보여 준다.
 *
 * 오목을 치는 사람도 있고 보드를 치는 사람도 있고 짧은을 치는 사람도 있다.
 * 어디에 걸릴지 미리 정하는 대신 **다 뒤진다**. 51개짜리 목록에서 그 비용은 0이다.
 */
export function matches(hay: string[], q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return hay.some((h) => h.toLowerCase().includes(needle));
}
