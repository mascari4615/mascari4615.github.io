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
  saveImage,
  saveSession,
} from './storage';
import { t, loadNamespace } from '../../lib/i18n';

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
    throw new Error(t('adventure.err.502'));
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

/**
 * KL-037: dataUrl → 별 PNG 파일 박고 imageRefs 에 path 박음.
 *
 * Tauri 환경: `adventure_save_image` → `images/turn-NN-ts.png` 박힘 + path 받음.
 * 브라우저: dataUrl size limit (~256KB) 안이면 dataUrl 박힘, 초과면 imageRef 박지 않음.
 *
 * 호출처가 `state.session` 만 넘기는 패턴이라 첫 인자 = AdventureSession.
 */
export async function attachImageRef(
  session: AdventureSession,
  dataUrl: string,
): Promise<void> {
  const turnIndex = session.turns.length - 1;
  const last = session.turns[turnIndex];
  if (!last) return;
  const ref = await saveImage(session.slug, turnIndex, dataUrl);
  if (!ref) return;
  last.imageRefs = last.imageRefs ?? [];
  last.imageRefs.push(ref);
  await saveSession(session);
}
