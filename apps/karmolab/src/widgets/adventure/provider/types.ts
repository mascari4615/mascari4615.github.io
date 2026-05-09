/**
 * Adventure 위젯 LLM provider 추상화.
 *
 * KL-032 결정 5: provider abstraction + 위젯 토글, default = Claude Sonnet 4.6 (Max OAuth).
 * KarmoLab 룰 #11 (Vertex 우선) 의 KL-032 예외 — 사용자 발화 「Max x20 활용」 시드 정합.
 *
 * - Vertex Gemini = 브라우저 fetch 직접 (karmolab-ai REST URL 빌더 사용).
 * - Claude        = Tauri command 통해 Rust 측 호출 (브라우저 직접 호출은 CORS / 토큰 노출).
 *   Rust 구현은 ζ 단계.
 */

export type AdventureProviderId = 'claude' | 'vertex';

export interface AdventureMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AdventureCompletionRequest {
  systemInstruction: string;
  history: AdventureMessage[];
  userText: string;
  signal?: AbortSignal;
}

export interface AdventureCompletionResponse {
  text: string;
  providerId: AdventureProviderId;
  modelId: string;
}

export interface AdventureProviderModel {
  id: string;
  name: string;
}

export interface AdventureProvider {
  readonly id: AdventureProviderId;
  readonly name: string;
  defaultModelId(): string;
  availableModels(): AdventureProviderModel[];
  complete(req: AdventureCompletionRequest): Promise<AdventureCompletionResponse>;
}
