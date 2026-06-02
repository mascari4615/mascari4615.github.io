/**
 * cockpit/graph-tauri-adapter.ts — Tauri invoke 를 GraphPersistAdapter 로 래핑.
 * cockpit.ts 가 이 어댑터를 GraphCanvas 에 주입 (graph-spec.ts 의 Tauri 결합 격리).
 */

import type { GraphSpec, NodeCoord } from '../../lib/graph/spec';
import type { GraphPersistAdapter } from '../../lib/graph/adapter';

function getInvoke(): ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null {
  const t = (window as unknown as { __TAURI__?: { core?: { invoke?: unknown } } }).__TAURI__;
  const fn_ = t?.core?.invoke;
  return typeof fn_ === 'function' ? (fn_ as (cmd: string, args?: Record<string, unknown>) => Promise<unknown>) : null;
}

export class CockpitTauriAdapter implements GraphPersistAdapter {
  private repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  async load(): Promise<GraphSpec | null> {
    const invoke = getInvoke();
    if (!invoke) return null;
    try {
      return await invoke('cockpit_get_graph_spec', { repoRoot: this.repoRoot }) as GraphSpec;
    } catch (e) {
      console.error('[cockpit-tauri] cockpit_get_graph_spec 실패', e);
      return null;
    }
  }

  async save(updates: NodeCoord[]): Promise<void> {
    const invoke = getInvoke();
    if (!invoke) return;
    try {
      await invoke('cockpit_save_graph_coords', { repoRoot: this.repoRoot, updates });
    } catch (e) {
      console.error('[cockpit-tauri] cockpit_save_graph_coords 실패', e);
    }
  }
}
