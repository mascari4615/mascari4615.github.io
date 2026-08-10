import { buildVertexPublisherModelUrl, DEFAULT_VERTEX_LOCATION } from 'karmolab-ai';
import type {
  AdventureProvider,
  AdventureCompletionRequest,
  AdventureCompletionResponse,
  AdventureProviderModel,
} from './types';
import { t, loadNamespace } from '../../../lib/i18n';

const VERTEX_MODEL_DEFAULT = 'gemini-2.5-pro';
const VERTEX_MODELS_AVAILABLE: AdventureProviderModel[] = [
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
];

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

export class VertexProvider implements AdventureProvider {
  readonly id = 'vertex' as const;
  readonly name = 'Vertex Gemini';

  defaultModelId(): string {
    return VERTEX_MODEL_DEFAULT;
  }

  availableModels(): AdventureProviderModel[] {
    return VERTEX_MODELS_AVAILABLE.slice();
  }

  async complete(req: AdventureCompletionRequest): Promise<AdventureCompletionResponse> {
    const apiKey = readPref('adv_vertex_api_key');
    const projectId = readPref('adv_vertex_project_id');
    const location = readPref('adv_vertex_location') || DEFAULT_VERTEX_LOCATION;
    const modelId = readPref('adv_vertex_model_id') || VERTEX_MODEL_DEFAULT;

    if (!apiKey || !projectId) {
      throw new Error(
        t('adventure.t40'),
      );
    }

    const url = buildVertexPublisherModelUrl({
      projectId,
      location,
      modelId,
      method: 'generateContent',
      apiKey,
    });

    const contents = [
      ...req.history.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      { role: 'user', parts: [{ text: req.userText }] },
    ];

    const body = {
      contents,
      systemInstruction: { parts: [{ text: req.systemInstruction }] },
      generationConfig: { maxOutputTokens: 8192 },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: req.signal,
    });

    const raw = await res.text();
    if (!res.ok) {
      throw new Error(`Vertex HTTP ${res.status}: ${raw.slice(0, 400)}`);
    }
    let data: {
      error?: { message?: string };
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`Vertex 응답 파싱 실패: ${raw.slice(0, 400)}`);
    }
    if (data.error) {
      throw new Error(data.error.message || 'Vertex API 오류');
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string' || text === '') {
      throw new Error(t('adventure.err.41') + JSON.stringify(data).slice(0, 400));
    }

    return { text, providerId: this.id, modelId };
  }
}
