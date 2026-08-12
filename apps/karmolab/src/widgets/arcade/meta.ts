/**
 * 게임 명패 (TASK-KL-242)
 *
 * 규칙 파일(`games/*.ts`)에는 화면에 보일 글자가 한 자도 없다 — 규칙은 말을 모르고, 그래야
 * 같은 게임이 세 나라 말로 돈다. 이름·설명은 말 묶음(`arcade.game.<id>.*`)에, 그림은 여기에.
 */
export interface GameMeta {
  id: string;
  icon: string;
}

export const META: GameMeta[] = [
  { id: 'reflex', icon: '⚡' },
  { id: 'gomoku', icon: '⚫' },
  { id: 'four', icon: '🔴' },
  { id: 'memory', icon: '🃏' },
  { id: 'hitblow', icon: '🔢' },
  { id: 'reversi', icon: '⚪' },
  { id: 'dots', icon: '⬜' },
  { id: 'speed', icon: '⚡' },
  { id: 'slide', icon: '🧩' }
];

export const iconOf = (id: string): string => META.find((m) => m.id === id)?.icon ?? '🎲';
