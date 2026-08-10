/**
 * 모험 장면 이미지 생성 — KL-032 η 단계.
 *
 * Vertex Imagen 4 직접 호출 (브라우저 fetch). karmolab-ai REST URL 빌더 사용.
 * 사용자 prefer: adv_vertex_api_key / adv_vertex_project_id / adv_vertex_location (settings.ts 와 공유).
 *
 * imagegen 위젯의 Gemini.callVertexGeminiImage 패턴 흡수했지만 의존 분리 — adventure 한정 단순 호출.
 */
import { buildVertexPublisherModelUrl, DEFAULT_VERTEX_LOCATION } from 'karmolab-ai';
import { t, loadNamespace } from '../../lib/i18n';

interface ToolboxLike {
  getPref?: (key: string) => unknown;
}

function readPref(key: string): string {
  const T = (globalThis as unknown as { Toolbox?: ToolboxLike }).Toolbox;
  const v = T?.getPref?.(key);
  if (typeof v === 'string') return v.trim();
  if (v == null) return '';
  return String(v).trim();
}

const IMAGEN_MODEL_DEFAULT = 'imagen-4.0-generate-001';
const IMAGEN_VIBE_SUFFIX = ', anime illustration, soft warm lighting, painterly cozy atmosphere, KarmoWorld setting';

export interface GeneratedAdventureImage {
  dataUrl: string;
  prompt: string;
}

export async function generateAdventureImage(
  narrativeSnippet: string,
  signal?: AbortSignal,
): Promise<GeneratedAdventureImage> {
  const apiKey = readPref('adv_vertex_api_key');
  const projectId = readPref('adv_vertex_project_id');
  const location = readPref('adv_vertex_location') || DEFAULT_VERTEX_LOCATION;
  const modelId = readPref('adv_imagen_model_id') || IMAGEN_MODEL_DEFAULT;

  if (!apiKey || !projectId) {
    throw new Error(t('adventure.err.50'));
  }

  // narrativeSnippet 앞 280자만 prompt — Imagen prompt 길이 제한 의식
  const trimmed = narrativeSnippet.replace(/\s+/g, ' ').trim().slice(0, 280);
  const prompt = trimmed + IMAGEN_VIBE_SUFFIX;

  const url = buildVertexPublisherModelUrl({
    projectId,
    location,
    modelId,
    method: 'predict',
    apiKey,
  });

  const body = {
    instances: [{ prompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio: '16:9',
      personGeneration: 'allow_adult',
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Vertex Imagen HTTP ${res.status}: ${raw.slice(0, 400)}`);
  }
  let data: {
    error?: { message?: string };
    predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
  };
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Vertex Imagen 응답 파싱 실패: ${raw.slice(0, 300)}`);
  }
  if (data.error) {
    throw new Error(data.error.message || 'Vertex Imagen API 오류');
  }
  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) {
    throw new Error(t('adventure.err.51') + JSON.stringify(data).slice(0, 400));
  }
  const mime = data.predictions?.[0]?.mimeType || 'image/png';
  const dataUrl = `data:${mime};base64,${b64}`;
  return { dataUrl, prompt };
}
