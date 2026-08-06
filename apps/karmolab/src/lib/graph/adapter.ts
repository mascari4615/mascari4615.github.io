/**
 * lib/graph/adapter.ts — 그래프 영속 어댑터 seam (TASK-KL-087 단위 0).
 *
 * 캔버스는 "어디에 저장되는가" 를 모른다. 이 인터페이스 하나만 안다.
 * 구현체:
 *  - `widgets/cockpit/graph-tauri-adapter.ts` — Tauri invoke (memo/.claude/graph.json)
 *  - `widgets/karmomap/local-storage-adapter.ts` — localStorage
 */
import type { GraphSpec, NodeCoord } from './spec';

export interface GraphPersistAdapter {
  /** 전체 스펙 로드. 없거나 실패하면 null (caller 가 빈 캔버스로 시작). */
  load(): Promise<GraphSpec | null>;
  /** 드래그로 바뀐 좌표 패치. 캔버스가 debounce 후 호출. */
  save(updates: NodeCoord[]): Promise<void>;
}

/**
 * 아무것도 저장하지 않는 어댑터.
 * 캔버스 기본값 — 어댑터를 안 주면 좌표 변경이 조용히 사라진다(읽기 전용 표시용).
 */
export const NULL_PERSIST_ADAPTER: GraphPersistAdapter = {
  load(): Promise<GraphSpec | null> {
    return Promise.resolve(null);
  },
  save(): Promise<void> {
    return Promise.resolve();
  },
};
