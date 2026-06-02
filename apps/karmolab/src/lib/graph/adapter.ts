/**
 * lib/graph/adapter.ts — GraphPersistAdapter 인터페이스 + NullAdapter.
 * 구현체: cockpit/graph-tauri-adapter.ts (Tauri) / karmomap/local-storage-adapter.ts (localStorage).
 */

import type { GraphSpec, NodeCoord } from './spec';

export interface GraphPersistAdapter {
  load(): Promise<GraphSpec | null>;
  save(updates: NodeCoord[]): Promise<void>;
}

export class NullPersistAdapter implements GraphPersistAdapter {
  async load(): Promise<GraphSpec | null> { return null; }
  async save(_updates: NodeCoord[]): Promise<void> { /* no-op */ }
}
