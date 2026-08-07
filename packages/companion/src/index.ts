/**
 * `companion` — 인격을 모르는 동반자 코어.
 *
 * TASK-KAR-201. 여기엔 캐릭터가 없다. 캐릭터는 나중에 꽂는 부품이다.
 */
export * from './types';
export { Companion, type CompanionOptions } from './core';
export { loadCharacter, loadCharacters } from './character';
export { reasonToSpeak, nudgeSense, type Reason, type NudgeInput, type NudgeSenseOptions } from './nudge';
export { dayMark, type DayMark, type DayMarkOptions } from './day-mark';
export { checkDrift, driftWarning, avoidanceWarning, type Drift, type DriftRules } from './drift';
export { reflexFor, type ReflexOptions } from './reflex';
export { pickFiller, type FillerOptions } from './filler';
export { readRapport, type Rapport, type RapportOptions } from './rapport';
export { fileCuriosity, wonderHand, maybeAsk, noticeCuriosity, stripParticle, worthWondering, unusableCuriosity, type Curiosity } from './curiosity';
export { readMood, avoidRepeats, recallFrom, type Mood, type MoodInput } from './mood';
export {
  needsPermission,
  findFileHand,
  openHand,
  windowsHand,
  clockHand,
  readNotesHand,
  fileInfoHand,
  type AskFirst,
} from './hands/desktop';
export {
  describeHands,
  findRequests,
  noteHand,
  recallHand,
  remindHand,
  useHands,
  type Hand,
  type HandRequest,
} from './hands';

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
export { claudeCliBrain, type ClaudeCliBrainOptions, type PlainThinker, type SwitchableBrain } from './brain/claude-cli';

export { terminalBody, type TerminalBodyOptions } from './body/terminal';
export { clockBody, type ClockBodyOptions } from './body/clock';
export { webBody, openPinnedWindow, type WebBodyOptions } from './body/web';

export { anySpeech } from './voice/any';
export { piperSpeech, piperReady, type PiperSpeechOptions } from './voice/piper';
export { edgeSpeech, type EdgeSpeechOptions, type Speech, type SpeechVoice } from './voice/edge-tts';
export { clonedSpeech, type ClonedSpeechOptions } from './voice/cloned';
export * from './claims';
export * from './hands/auto';
export * from './hands/from-file';
export * from './conversation';
export * from './barge';
export * from './backchannel';
export * from './budget';
export * from './correction';
export * from './expression';
export * from './feeling';
export * from './game/word-chain';
export * from './game/playing';
export * from './hollow';
export * from './made-up';
export * from './milestone';
export * from './mouth-gate';
export * from './touch';
export * from './people';
export * from './quiet';
export * from './resume';
export * from './running-gag';
export * from './rut';
export * from './tally';
export * from './troubles';
export * from './tender';
export * from './tease';
export * from './tangent';
export * from './self-image';
export * from './settings';
export * from './stated';
export * from './memory/episodes';
export * from './memory/known-stamps';
export * from './garbled';
export * from './room';
export * from './toss-back';
export * from './voice/feeling-tone';
export * from './watching';
export * from './while-away';
export * from './what-landed';
export * from './wish';
export * from './pressure';
export * from './heard';
