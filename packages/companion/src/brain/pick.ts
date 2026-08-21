import type { Brain } from '../types';
import { assistantBrain } from './assistant';
import { claudeCliBrain } from './claude-cli';
import { echoBrain, silentBrain } from './echo';
import { grokCliBrain } from './grok-cli';
import { previewBrain } from './preview';
import type { ToolMode } from './mode';

export type { ToolMode } from './mode';

/**
 * 창이 두뇌를 고르는 자리.
 *
 * 백엔드를 파일마다 if 로 늘리지 않는다. 새 CLI 는 여기 case 하나 + `brain/<name>.ts`.
 * 그록만의 합치기가 아니다.
 */

export const BRAIN_NAMES = ['echo', 'silent', 'claude', 'grok', 'assistant', 'preview'] as const;
export type BrainName = (typeof BRAIN_NAMES)[number];

export interface PickBrainOptions {
  tools?: ToolMode;
  handsNote?: string;
  alwaysNote?: string;
  model?: string;
  /** work 일 때 손대는 폴더. 없으면 지금 실행 폴더. */
  workDir?: string;
}

export function parseBrainName(raw: string | undefined): BrainName {
  const name = (raw ?? 'claude').trim().toLowerCase();
  return (BRAIN_NAMES as readonly string[]).includes(name) ? (name as BrainName) : 'echo';
}

export function parseToolMode(raw: string | undefined): ToolMode {
  return raw?.trim().toLowerCase() === 'work' ? 'work' : 'talk';
}

export function pickBrain(name: BrainName, options: PickBrainOptions = {}): Brain {
  const tools = options.tools ?? 'talk';
  const shared = {
    handsNote: options.handsNote,
    alwaysNote: options.alwaysNote,
    model: options.model,
    tools,
    workDir: options.workDir,
  };
  switch (name) {
    case 'grok':
      return grokCliBrain(shared);
    case 'claude':
      return claudeCliBrain({
        handsNote: options.handsNote,
        alwaysNote: options.alwaysNote,
        model: options.model,
      });
    case 'assistant':
      return assistantBrain();
    case 'preview':
      return previewBrain();
    case 'silent':
      return silentBrain;
    default:
      return echoBrain;
  }
}
