import type { AdventureProvider, AdventureProviderId } from './types';
import { ClaudeProvider } from './ClaudeProvider';
import { VertexProvider } from './VertexProvider';

export const ADV_PROVIDER_PREF_KEY = 'adv_provider_id';

interface ToolboxLike {
  getPref?: (key: string) => unknown;
}

export function getAdventureProviderIdPref(): AdventureProviderId {
  const T = (globalThis as unknown as { Toolbox?: ToolboxLike }).Toolbox;
  const v = T?.getPref?.(ADV_PROVIDER_PREF_KEY);
  return v === 'vertex' ? 'vertex' : 'claude';
}

export function createAdventureProvider(id?: AdventureProviderId): AdventureProvider {
  const resolved = id ?? getAdventureProviderIdPref();
  switch (resolved) {
    case 'vertex':
      return new VertexProvider();
    case 'claude':
    default:
      return new ClaudeProvider();
  }
}

export const ALL_ADVENTURE_PROVIDERS: ReadonlyArray<AdventureProvider> = Object.freeze([
  new ClaudeProvider(),
  new VertexProvider(),
]);
