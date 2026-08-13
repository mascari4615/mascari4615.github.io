/**
 * 게임 조각 받아 오기 (TASK-KL-242 쪼개기)
 *
 * 로비는 명패만 들고 있다(`catalog-meta.generated.ts`). 규칙과 화면은 **누른 게임 하나만**
 * 그때 받는다 — 파일 하나가 게임 하나다(`arcade/games/<조각>.js`, `build.mjs` 가 굽는다).
 *
 * 왜 `import()` 가 아닌가: 이 저장소의 위젯 묶음은 IIFE 라 동적 import 를 써도 안 쪼개지고
 * 그대로 안에 눌러 담긴다(묶어 쓰기에서 실측 — 오히려 늘었다). 그래서 이 저장소가 원래
 * 쓰는 「그때 붙이는 스크립트」 방식을 그대로 쓴다(`core/*.js` 와 같은 수법).
 */
import type { GameDef } from './types';
import type { GameView } from './views';
import { cardById } from './catalog-meta.generated';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Slot = { def: GameDef<any, any>; view: GameView<any, any> };

const bag = (): Record<string, Slot | undefined> =>
  ((window as unknown as { __ARCADE_GAMES?: Record<string, Slot> }).__ARCADE_GAMES ??= {});

/** 이미 받아 둔 게임의 규칙. **아직 안 받았으면 `undefined`** — 부르기 전에 `ensureGame`. */
export const gameById = (id: string): GameDef<any, any> | undefined => bag()[id]?.def;

/** 이미 받아 둔 게임의 화면. 위와 같다. */
export const viewById = (id: string): GameView<any, any> | undefined => bag()[id]?.view;

const 오는중 = new Map<string, Promise<void>>();

/**
 * 그 게임 조각을 받아 둔다. 이미 있으면 바로 끝난다.
 *
 * 못 받아도 **던지지 않는다** — 부르는 쪽은 「아직 없다」와 「끝내 없다」를 같게 다룬다
 * (없으면 그 화면이 안 열릴 뿐, 오락실 전체가 죽지는 않아야 한다).
 */
export function ensureGame(id: string): Promise<void> {
  if (bag()[id]) return Promise.resolve();
  const 있는것 = 오는중.get(id);
  if (있는것) return 있는것;
  const card = cardById(id);
  if (!card) return Promise.resolve();
  const p = new Promise<void>((resolve) => {
    const s = document.createElement('script');
    s.src = `/apps/karmolab/arcade/games/${card.chunk}.js`;
    s.onload = () => resolve();
    s.onerror = () => {
      오는중.delete(id); /* 다음에 다시 눌러 볼 수 있게 — 회선이 잠깐 죽었을 수 있다 */
      resolve();
    };
    document.head.appendChild(s);
  });
  오는중.set(id, p);
  return p;
}

/** 여러 판을 한꺼번에 (대회는 다섯 판을 미리 안다). */
export const ensureGames = (ids: string[]): Promise<void[]> => Promise.all([...new Set(ids)].map(ensureGame));
