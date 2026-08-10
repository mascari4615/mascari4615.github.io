import { t } from '../../../lib/i18n';

import type {
  AdventureProvider,
  AdventureCompletionRequest,
  AdventureCompletionResponse,
  AdventureProviderModel,
} from './types';

const CLAUDE_MODEL_DEFAULT = 'claude-sonnet-4-6';
const CLAUDE_MODELS_AVAILABLE: AdventureProviderModel[] = [
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
  { id: 'claude-opus-4-7', name: 'Claude Opus 4.7' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
];

type TauriInvokePayload = {
  systemInstruction: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  userText: string;
  modelId: string;
};

type TauriInvokeResult = {
  text: string;
  modelId: string;
};

type TauriInvoke = (cmd: 'adventure_claude_complete', args: TauriInvokePayload) => Promise<TauriInvokeResult>;

function getTauriInvoke(): TauriInvoke | null {
  const tauri = (globalThis as unknown as {
    __TAURI__?: { core?: { invoke?: TauriInvoke } };
  }).__TAURI__;
  return tauri?.core?.invoke ?? null;
}

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

export class ClaudeProvider implements AdventureProvider {
  readonly id = 'claude' as const;
  readonly name = 'Claude (Max OAuth)';

  defaultModelId(): string {
    return CLAUDE_MODEL_DEFAULT;
  }

  availableModels(): AdventureProviderModel[] {
    return CLAUDE_MODELS_AVAILABLE.slice();
  }

  async complete(req: AdventureCompletionRequest): Promise<AdventureCompletionResponse> {
    const invoke = getTauriInvoke();
    if (!invoke) {
      throw new Error(
        t('adventure.t49'),
      );
    }

    const modelId = readPref('adv_claude_model_id') || CLAUDE_MODEL_DEFAULT;

    const result = await invoke('adventure_claude_complete', {
      systemInstruction: req.systemInstruction,
      history: req.history,
      userText: req.userText,
      modelId,
    });

    return { text: result.text, providerId: this.id, modelId: result.modelId };
  }
}
