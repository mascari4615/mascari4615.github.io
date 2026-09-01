import type { RankedGameRules } from './types';
import { gomokuRules } from './games/gomoku';
import { yachtRules } from './games/yacht';

const RULES = new Map<string, RankedGameRules>([
  [gomokuRules.gameId, gomokuRules],
  [yachtRules.gameId, yachtRules]
]);

export const rulesFor = (game: string): RankedGameRules | null => RULES.get(game) ?? null;

export const rankedGameIds = (): string[] => [...RULES.keys()];
