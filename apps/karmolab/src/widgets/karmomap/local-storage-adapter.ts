/**
 * karmomap/local-storage-adapter.ts — localStorage 기반 GraphPersistAdapter.
 * key 네임스페이스: karmomap.* (TASK-KL-087 결정).
 */

import type { GraphSpec, NodeCoord } from '../../lib/graph/spec';
import type { GraphPersistAdapter } from '../../lib/graph/adapter';

const STORAGE_KEY = 'karmomap.spec';

export class KarmomapLocalStorageAdapter implements GraphPersistAdapter {
  async load(): Promise<GraphSpec | null> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as GraphSpec;
    } catch {
      return null;
    }
  }

  async save(updates: NodeCoord[]): Promise<void> {
    // 좌표 업데이트만 받으므로 전체 spec 을 별도로 관리
    // full save 는 saveFullSpec() 으로 처리 (node add/delete 등)
    // 드래그 좌표는 spec 에 반영 후 saveFullSpec 호출
    const spec = await this.load();
    if (!spec) return;
    for (const u of updates) {
      if (!u.kind || u.kind === 'node') {
        const node = spec.nodes.find((n) => n.id === u.id);
        if (node) { node.x = u.x; node.y = u.y; }
      }
    }
    this.saveFullSpec(spec);
  }

  saveFullSpec(spec: GraphSpec): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(spec));
    } catch (e) {
      console.error('[karmomap] localStorage save 실패', e);
    }
  }

  loadSync(): GraphSpec | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as GraphSpec;
    } catch {
      return null;
    }
  }
}
