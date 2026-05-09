/**
 * 무한 텍스트 어드벤처 turn loop — KL-032 결정 4 (자유+선택지 N개).
 *
 * - 사용자 입력 (자유 텍스트 또는 선택지 클릭) → provider.complete → parseTurnResponse → UI 갱신
 * - history = AdventureMessage[] (provider 인터페이스), session.turns = AdventureTurnRecord[] (raw 누적)
 */
import type { AdventureMessage, AdventureProvider } from './provider';
import { buildSystemInstruction, parseTurnResponse, type ParsedTurn } from './prompt';
import {
  type AdventureSession,
  type AdventureTurnRecord,
  saveSession,
} from './storage';

export interface TurnLoopState {
  session: AdventureSession;
  history: AdventureMessage[];
  systemInstruction: string;
  lastParsed: ParsedTurn | null;
  busy: boolean;
}

export function createInitialState(session: AdventureSession): TurnLoopState {
  return {
    session,
    history: [],
    systemInstruction: buildSystemInstruction({ castSlugs: session.castSlugs }),
    lastParsed: null,
    busy: false,
  };
}

export interface TurnResult {
  parsed: ParsedTurn;
  rawText: string;
  providerId: string;
  modelId: string;
}

export async function runTurn(
  state: TurnLoopState,
  provider: AdventureProvider,
  userText: string,
  signal?: AbortSignal,
): Promise<TurnResult> {
  if (state.busy) {
    throw new Error('이미 turn 진행 중입니다.');
  }
  state.busy = true;
  try {
    const response = await provider.complete({
      systemInstruction: state.systemInstruction,
      history: state.history,
      userText,
      signal,
    });
    const parsed = parseTurnResponse(response.text);

    state.history.push({ role: 'user', content: userText });
    state.history.push({ role: 'assistant', content: response.text });
    state.lastParsed = parsed;

    const turn: AdventureTurnRecord = {
      ts: new Date().toISOString(),
      userText,
      assistantText: response.text,
      parsed: {
        narrative: parsed.narrative,
        choices: parsed.choices.slice(),
        npcSlugs: parsed.npcSlugs.slice(),
        sceneTitles: parsed.sceneTitles.slice(),
        ended: parsed.ended,
      },
      providerId: response.providerId,
      modelId: response.modelId,
    };
    state.session.turns.push(turn);
    await saveSession(state.session);

    // NPC 새로 cast 박힘 → systemInstruction 갱신 (다음 turn 부터 풍부한 컨텍스트)
    let castChanged = false;
    for (const slug of parsed.npcSlugs) {
      if (!state.session.castSlugs.includes(slug)) {
        state.session.castSlugs.push(slug);
        castChanged = true;
      }
    }
    if (castChanged) {
      state.systemInstruction = buildSystemInstruction({ castSlugs: state.session.castSlugs });
    }

    return {
      parsed,
      rawText: response.text,
      providerId: response.providerId,
      modelId: response.modelId,
    };
  } finally {
    state.busy = false;
  }
}

export function attachImageRef(state: TurnLoopState, imageRef: string): void {
  const last = state.session.turns[state.session.turns.length - 1];
  if (!last) return;
  last.imageRefs = last.imageRefs ?? [];
  last.imageRefs.push(imageRef);
  void saveSession(state.session);
}
