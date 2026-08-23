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

const incoming = new Map<string, Promise<boolean>>();

/**
 * 그 게임 조각을 받아 둔다. 이미 있으면 바로 끝난다.
 *
 * **받아졌나를 돌려준다** — 던지지 않는다(한 판 못 받았다고 오락실 전체가 죽으면 안 된다).
 * 대신 부르는 쪽이 「됐다/안 됐다」를 **구별할 수 있어야** 한다:
 *
 * 전에는 `Promise<void>` 라, 부르는 자리 셋이 전부 `.then(() => { if (gameById(id)) … })` 였다.
 * 못 받으면 그 `if` 가 조용히 거짓이 되어 **아무 일도 안 일어났다** — 누른 사람 눈에는
 * 버튼이 죽은 것이고, 검사 눈에도 아무 자국이 안 남는다. 「모름」을 「아니오」로 읽던 자리다.
 *
 * 그리고 **스크립트가 떴다고 받아진 게 아니다**. 파일은 200 인데 안에서 터졌거나 다른 이름으로
 * 등록되면 `onload` 는 그대로 뜬다 — 그래서 뜬 뒤에 **자루를 다시 본다**.
 */
export function ensureGame(id: string): Promise<boolean> {
  if (bag()[id]) return Promise.resolve(true);
  const present = incoming.get(id);
  if (present) return present;
  const card = cardById(id);
  if (!card) return Promise.resolve(false);
  const p = new Promise<boolean>((resolve) => {
    const end = (ok: boolean): void => {
      if (!ok) incoming.delete(id); /* 다음에 다시 눌러 볼 수 있게 — 회선이 잠깐 죽었을 수 있다 */
      resolve(ok);
    };
    const s = document.createElement('script');
    s.src = `/apps/karmolab/arcade/games/${card.chunk}.js`;
    s.onload = () => {
      const arrived = !!bag()[id];
      if (!arrived) console.warn(`[arcade-loader] ${card.chunk}.js 는 떴는데 ${id} 가 자루에 없다`);
      end(arrived);
    };
    s.onerror = () => end(false);
    document.head.appendChild(s);
  });
  incoming.set(id, p);
  return p;
}

/** 여러 판을 한꺼번에 (대회는 다섯 판을 미리 안다). */
export const ensureGames = (ids: string[]): Promise<boolean[]> =>
  Promise.all([...new Set(ids)].map(ensureGame));

/* ── 입체 화면 (같은 규칙, 다른 표현) ─────────────────────────────
 *
 * 규칙은 위 자루에 이미 있다. 여기서 받는 것은 **그리는 법 하나**뿐이라
 * 2D 로 노는 사람은 이 파일을 영영 안 받는다.
 * 없으면 `undefined` — 부르는 쪽이 조용히 2D 로 돌아간다(못 받았다고 판이 안 서면 안 된다).
 */
const bag3d = (): Record<string, GameView<any, any> | undefined> =>
  ((window as unknown as { __ARCADE_VIEWS3D?: Record<string, GameView<any, any>> }).__ARCADE_VIEWS3D ??= {});

export const view3dById = (id: string): GameView<any, any> | undefined => bag3d()[id];

const incoming3d = new Map<string, Promise<boolean>>();

export function ensureView3d(id: string): Promise<boolean> {
  if (bag3d()[id]) return Promise.resolve(true);
  const card = cardById(id);
  if (!card?.d3) return Promise.resolve(false);
  const present = incoming3d.get(id);
  if (present) return present;
  const p = new Promise<boolean>((resolve) => {
    const end = (ok: boolean): void => {
      if (!ok) incoming3d.delete(id);
      resolve(ok);
    };
    const s = document.createElement('script');
    s.src = `/apps/karmolab/arcade/games3d/${card.chunk}.js`;
    s.onload = () => end(!!bag3d()[id]);
    s.onerror = () => end(false);
    document.head.appendChild(s);
  });
  incoming3d.set(id, p);
  return p;
}
