export type ImagenAspectRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
export type ImagenPersonGeneration = 'dont_allow' | 'allow_adult' | 'allow_all';
export type ImagenSafetySetting = 'block_most' | 'block_some' | 'block_few' | 'block_none';
export interface VertexImageResult {
    /** 디코딩된 이미지 바이너리 */
    buffer: Buffer;
    /** "image/png" 등 */
    mimeType: string;
}
/**
 * Vertex Publisher `:predict` 로 Imagen 호출.
 * `MODEL_CATALOG.imagen` 의 ID 중 하나를 `modelId`로 전달 (기본 `imagen-4.0-generate-001`).
 */
export declare function generateVertexImage(opts: {
    apiKey: string;
    projectId: string;
    location?: string | null;
    modelId?: string | null;
    prompt: string;
    negativePrompt?: string;
    /** 1~4 */
    sampleCount?: number;
    aspectRatio?: ImagenAspectRatio;
    personGeneration?: ImagenPersonGeneration;
    safetySetting?: ImagenSafetySetting;
    signal?: AbortSignal;
}): Promise<VertexImageResult[]>;
/**
 * `.env` 기반 이미지 생성. `VERTEX_API_KEY` + `VERTEX_PROJECT_ID` 필수.
 * 모델 우선순위: `options.modelId` > `IMAGE_MODEL_ID` > `MODEL_CATALOG.imagen` 기본값
 */
export declare function generateImageFromEnvWithOptions(env: NodeJS.ProcessEnv, prompt: string, options?: {
    modelId?: string | null;
    sampleCount?: number;
    aspectRatio?: ImagenAspectRatio;
    negativePrompt?: string;
    personGeneration?: ImagenPersonGeneration;
    safetySetting?: ImagenSafetySetting;
    signal?: AbortSignal;
}): Promise<{
    images: VertexImageResult[];
    modelId: string;
}>;
