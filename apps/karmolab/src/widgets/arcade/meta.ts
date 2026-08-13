/**
 * 게임 명패 (TASK-KL-242 · SSOT 정리 = TASK-KL-264)
 *
 * 규칙 파일(`games/*.ts`)에는 화면에 보일 글자가 한 자도 없다 — 규칙은 말을 모르고, 그래야
 * 같은 게임이 세 나라 말로 돈다. 이름·설명은 말 묶음(`arcade.game.<id>.*`)에, 그림과 갈래는
 * **`catalog.ts` 한 줄**에. 이 파일은 거기서 파생된 명패일 뿐이다 —
 * 다만 읽는 곳은 구운 명패(`catalog-meta.generated.ts`)다. 로비가 명패를 그리려고
 * 게임 51개를 통째로 받으면 안 되기 때문이다(TASK-KL-242 쪼개기).
 *
 * 갈래를 두는 이유: 스물이 넘으면 **나열은 목록이 아니라 벽**이 된다. 클럽하우스 51 도 보드·카드·
 * 장난감 스포츠로 나눠 놨다. 51개가 되어도 사람이 「하고 싶은 결」로 먼저 좁힐 수 있어야 한다.
 */
import { CARDS } from './catalog-meta.generated';

export type Kind = 'board' | 'card' | 'sport' | 'quick' | 'puzzle';

export interface GameMeta {
  id: string;
  icon: string;
  kind: Kind;
}

/** 화면에 보일 차례 = 카탈로그 차례. 갈래 안에서는 쉬운 것부터. */
export const META: GameMeta[] = CARDS.map((c) => ({ id: c.id, icon: c.icon, kind: c.kind }));

export const iconOf = (id: string): string => META.find((m) => m.id === id)?.icon ?? '🎲';
export const kindOf = (id: string): Kind => META.find((m) => m.id === id)?.kind ?? 'board';

/** 화면에 보일 갈래 차례 — 짧고 가벼운 것부터. */
export const KINDS: Kind[] = ['quick', 'board', 'card', 'sport', 'puzzle'];
