/**
 * 텍스트 임베딩 벡터 반환.
 *
 * - `KARMOLAB_AI_SURFACE=vertex` + `VERTEX_API_KEY` + `VERTEX_PROJECT_ID` → Vertex `:predict`
 * - 그 외 → AI Studio `embedContent` (`GEMINI_API_KEY` 필수)
 *
 * 모델 우선순위: `options.modelId` > `EMBEDDING_MODEL_ID` env > surface별 기본값
 */
export declare function generateEmbedding(env: NodeJS.ProcessEnv, text: string, options?: {
    modelId?: string;
}): Promise<number[]>;
