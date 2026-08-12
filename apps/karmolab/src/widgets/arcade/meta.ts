/**
 * 게임 명패 (TASK-KL-242)
 *
 * 규칙 파일(`games/*.ts`)에는 화면에 보일 글자가 한 자도 없다 — 규칙은 말을 모르고, 그래야
 * 같은 게임이 세 나라 말로 돈다. 이름·설명은 말 묶음(`arcade.game.<id>.*`)에, 그림과 **갈래**는 여기에.
 *
 * 갈래를 두는 이유: 스물이 넘으면 **나열은 목록이 아니라 벽**이 된다. 클럽하우스 51 도 보드·카드·
 * 장난감 스포츠로 나눠 놨다. 51개가 되어도 사람이 「하고 싶은 결」로 먼저 좁힐 수 있어야 한다.
 */
/**
 * ⚠ 그림은 **흔한 이모지**로만 고른다. 트럼프(🂡)·도미노(🁣) 낱자 유니코드는 예뻐 보이지만
 * 기본 글꼴에 없어서 네모(두부)로 뜬다 — 실제로 로비에서 두 개가 그렇게 떴다.
 */
export type Kind = 'board' | 'card' | 'sport' | 'quick' | 'puzzle';

export interface GameMeta {
  id: string;
  icon: string;
  kind: Kind;
}

/** 화면에 보일 차례. 갈래 안에서는 쉬운 것부터. */
export const META: GameMeta[] = [
  { id: 'reflex', icon: '⚡', kind: 'quick' },
  { id: 'speed', icon: '⚡', kind: 'quick' },
  { id: 'airhockey', icon: '🏒', kind: 'quick' },

  { id: 'gomoku', icon: '⚫', kind: 'board' },
  { id: 'four', icon: '🔴', kind: 'board' },
  { id: 'reversi', icon: '⚪', kind: 'board' },
  { id: 'dots', icon: '⬜', kind: 'board' },
  { id: 'ultimate', icon: '⊞', kind: 'board' },
  { id: 'checkers', icon: '🔶', kind: 'board' },
  { id: 'nim', icon: '⚪', kind: 'board' },

  { id: 'blackjack', icon: '♠️', kind: 'card' },
  { id: 'president', icon: '👑', kind: 'card' },
  { id: 'dominoes', icon: '🀄', kind: 'card' },
  { id: 'yacht', icon: '🎲', kind: 'card' },
  { id: 'highlow', icon: '🔺', kind: 'card' },
  { id: 'hanabi', icon: '🎆', kind: 'card' },

  { id: 'curling', icon: '🥌', kind: 'sport' },
  { id: 'bowling', icon: '🎳', kind: 'sport' },
  { id: 'pool', icon: '🎱', kind: 'sport' },
  { id: 'darts', icon: '🎯', kind: 'sport' },

  { id: 'memory', icon: '🃏', kind: 'puzzle' },
  { id: 'hitblow', icon: '🔢', kind: 'puzzle' },
  { id: 'slide', icon: '🧩', kind: 'puzzle' }
];

export const iconOf = (id: string): string => META.find((m) => m.id === id)?.icon ?? '🎲';
export const kindOf = (id: string): Kind => META.find((m) => m.id === id)?.kind ?? 'board';

/** 화면에 보일 갈래 차례 — 짧고 가벼운 것부터. */
export const KINDS: Kind[] = ['quick', 'board', 'card', 'sport', 'puzzle'];
