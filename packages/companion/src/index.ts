/**
 * `companion` — 인격을 모르는 동반자 코어.
 *
 * TASK-KAR-201. 여기엔 캐릭터가 없다. 캐릭터는 나중에 꽂는 부품이다.
 */
export * from './types';
export { Companion, type CompanionOptions } from './core';
export { loadCharacter } from './character';

export { screenSense, type ScreenSenseOptions } from './sense/screen';
export { whisperEars, type Whisper, type WhisperOptions } from './sense/whisper';

export { InMemoryMemory } from './memory/in-memory';
export { JsonlFileMemory } from './memory/jsonl-file';
export {
  DistillingMemory,
  brainDistiller,
  type Distiller,
  type DistillingMemoryOptions,
} from './memory/distilling';

export { alwaysRespond, neverRespond, cooldownAttention, type CooldownOptions } from './attention/index';
export { tactfulAttention, windowsIdleMs, type TactOptions } from './attention/tact';

export { echoBrain, silentBrain } from './brain/echo';
export { assistantBrain, type AssistantBrainOptions } from './brain/assistant';
export { claudeCliBrain, type ClaudeCliBrainOptions, type PlainThinker } from './brain/claude-cli';

export { terminalBody, type TerminalBodyOptions } from './body/terminal';
export { clockBody, type ClockBodyOptions } from './body/clock';
export { webBody, openPinnedWindow, type WebBodyOptions } from './body/web';

export { edgeSpeech, type EdgeSpeechOptions, type Speech, type SpeechVoice } from './voice/edge-tts';
