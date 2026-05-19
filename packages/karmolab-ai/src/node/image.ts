import {
  buildVertexPublisherModelUrl,
  DEFAULT_VERTEX_LOCATION,
  getDefaultModelId,
} from '../index';

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
export async function generateVertexImage(opts: {
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
}): Promise<VertexImageResult[]> {
  const modelId = opts.modelId?.trim() || getDefaultModelId('imagen');
  const loc = (opts.location?.trim() || DEFAULT_VERTEX_LOCATION).trim() || DEFAULT_VERTEX_LOCATION;
  const url = buildVertexPublisherModelUrl({
    projectId: opts.projectId.trim(),
    location: loc,
    modelId,
    method: 'predict',
    apiKey: opts.apiKey.trim(),
  });

  const parameters: Record<string, unknown> = {
    sampleCount: Math.max(1, Math.min(4, opts.sampleCount ?? 1)),
  };
  if (opts.aspectRatio) parameters.aspectRatio = opts.aspectRatio;
  if (opts.personGeneration) parameters.personGeneration = opts.personGeneration;
  if (opts.safetySetting) parameters.safetySetting = opts.safetySetting;

  const instance: Record<string, unknown> = { prompt: opts.prompt };
  if (opts.negativePrompt) instance.negativePrompt = opts.negativePrompt;

  const body = { instances: [instance], parameters };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  const raw = await res.text();
  let data: {
    error?: { message?: string; status?: string };
    predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
  };
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Imagen 응답 파싱 실패 HTTP ${res.status}: ${raw.slice(0, 400)}`);
  }
  if (!res.ok) {
    throw new Error(
      data.error?.message || data.error?.status || `Imagen HTTP ${res.status}: ${raw.slice(0, 400)}`,
    );
  }
  const preds = data.predictions;
  if (!Array.isArray(preds) || preds.length === 0) {
    throw new Error('Imagen 응답에 이미지가 없습니다: ' + raw.slice(0, 400));
  }
  return preds.map((p) => {
    const b64 = p.bytesBase64Encoded;
    if (!b64) {
      throw new Error('Imagen 응답 prediction 에 bytesBase64Encoded 가 없음');
    }
    return {
      buffer: Buffer.from(b64, 'base64'),
      mimeType: p.mimeType || 'image/png',
    };
  });
}

/**
 * `.env` 기반 이미지 생성. `VERTEX_API_KEY` + `VERTEX_PROJECT_ID` 필수.
 * 모델 우선순위: `options.modelId` > `IMAGE_MODEL_ID` > `MODEL_CATALOG.imagen` 기본값
 */
export async function generateImageFromEnvWithOptions(
  env: NodeJS.ProcessEnv,
  prompt: string,
  options: {
    modelId?: string | null;
    sampleCount?: number;
    aspectRatio?: ImagenAspectRatio;
    negativePrompt?: string;
    personGeneration?: ImagenPersonGeneration;
    safetySetting?: ImagenSafetySetting;
    signal?: AbortSignal;
  } = {},
): Promise<{ images: VertexImageResult[]; modelId: string }> {
  const apiKey = env.VERTEX_API_KEY?.trim();
  const projectId = env.VERTEX_PROJECT_ID?.trim();
  if (!apiKey || !projectId) {
    throw new Error('Imagen(Vertex): .env에 VERTEX_API_KEY와 VERTEX_PROJECT_ID가 필요합니다.');
  }
  const location = env.VERTEX_LOCATION?.trim() || undefined;
  const modelId =
    options.modelId?.trim() || env.IMAGE_MODEL_ID?.trim() || getDefaultModelId('imagen');
  const images = await generateVertexImage({
    apiKey,
    projectId,
    location,
    modelId,
    prompt,
    negativePrompt: options.negativePrompt,
    sampleCount: options.sampleCount,
    aspectRatio: options.aspectRatio,
    personGeneration: options.personGeneration,
    safetySetting: options.safetySetting,
    signal: options.signal,
  });
  return { images, modelId };
}
