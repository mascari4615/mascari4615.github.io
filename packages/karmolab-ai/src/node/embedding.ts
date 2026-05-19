import { buildVertexPublisherModelUrl } from '../index';
import { parseGenerativeSurfaceFromEnv } from './text';

const DEFAULT_EMBEDDING_MODEL_AISTUDIO = 'gemini-embedding-001';
const DEFAULT_EMBEDDING_MODEL_VERTEX = 'text-embedding-004';

/**
 * 텍스트 임베딩 벡터 반환.
 *
 * - `KARMOLAB_AI_SURFACE=vertex` + `VERTEX_API_KEY` + `VERTEX_PROJECT_ID` → Vertex `:predict`
 * - 그 외 → AI Studio `embedContent` (`GEMINI_API_KEY` 필수)
 *
 * 모델 우선순위: `options.modelId` > `EMBEDDING_MODEL_ID` env > surface별 기본값
 */
export async function generateEmbedding(
  env: NodeJS.ProcessEnv,
  text: string,
  options: { modelId?: string } = {},
): Promise<number[]> {
  const surface = parseGenerativeSurfaceFromEnv(env);
  const modelOverride = options.modelId?.trim() || env.EMBEDDING_MODEL_ID?.trim() || '';

  if (surface === 'vertex') {
    const apiKey = env.VERTEX_API_KEY?.trim();
    const projectId = env.VERTEX_PROJECT_ID?.trim();
    if (!apiKey || !projectId) {
      throw new Error('Vertex 임베딩: VERTEX_API_KEY와 VERTEX_PROJECT_ID가 필요합니다.');
    }
    const modelId = modelOverride || DEFAULT_EMBEDDING_MODEL_VERTEX;
    const url = buildVertexPublisherModelUrl({
      projectId,
      location: env.VERTEX_LOCATION?.trim() || undefined,
      modelId,
      method: 'predict',
      apiKey,
    });
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instances: [{ content: text }] }),
    });
    const raw = await res.text();
    let data: { predictions?: Array<{ embeddings?: { values?: number[] } }>; error?: { message?: string } };
    try { data = JSON.parse(raw); } catch { throw new Error(`Vertex 임베딩 파싱 실패: ${raw.slice(0, 300)}`); }
    if (!res.ok) throw new Error(data.error?.message || `Vertex 임베딩 HTTP ${res.status}`);
    const values = data.predictions?.[0]?.embeddings?.values;
    if (!Array.isArray(values) || values.length === 0) throw new Error('Vertex 임베딩 응답 비어있음');
    return values;
  }

  // AI Studio
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error('AI Studio 임베딩: GEMINI_API_KEY가 필요합니다.');
  const modelId = modelOverride || DEFAULT_EMBEDDING_MODEL_AISTUDIO;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:embedContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: `models/${modelId}`, content: { parts: [{ text }] } }),
  });
  const raw = await res.text();
  let data: { embedding?: { values?: number[] }; error?: { message?: string } };
  try { data = JSON.parse(raw); } catch { throw new Error(`AI Studio 임베딩 파싱 실패: ${raw.slice(0, 300)}`); }
  if (!res.ok) throw new Error(data.error?.message || `AI Studio 임베딩 HTTP ${res.status}`);
  const values = data.embedding?.values;
  if (!Array.isArray(values) || values.length === 0) throw new Error('AI Studio 임베딩 응답 비어있음');
  return values;
}
