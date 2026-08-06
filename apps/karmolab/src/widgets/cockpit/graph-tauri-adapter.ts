/**
 * graph-tauri-adapter.ts — cockpit 의 그래프 영속 구현 (TASK-KL-087 단위 0).
 *
 * 정본 데이터 = `memo/.claude/graph.json` (hand-curated).
 * Rust `cockpit_graph.rs` 가 read/write, 여기는 그 invoke 를 감싼다.
 *
 * 이 파일이 cockpit 의 **유일한 Tauri 접점**이다 — `lib/graph/` 는
 * 데스크톱이 있는지조차 모른다. 원본은 `graph-spec.ts` 가 타입과 invoke 를
 * 한 몸으로 갖고 있어 cockpit 밖에서 캔버스를 못 썼다 (TASK-KL-087 의 출발점).
 */
import type { GraphSpec, NodeCoord } from '../../lib/graph/spec';
import type { GraphPersistAdapter } from '../../lib/graph/adapter';

/** cockpit 의 노드 종류별 색 — KarmoMap 등 다른 캔버스는 자기 셋을 쓴다. */
export const COCKPIT_KIND_COLORS: Record<string, string> = {
  domain:   '#a78bfa',
  app:      '#60a5fa',
  canon:    '#34d399',
  external: '#f87171',
  agent:    '#22d3ee',
  runtime:  '#fbbf24',
};

function getInvoke(): ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null {
  const t = (window as unknown as { __TAURI__?: { core?: { invoke?: unknown } } }).__TAURI__;
  const fn_ = t?.core?.invoke;
  return typeof fn_ === 'function' ? (fn_ as (cmd: string, args?: Record<string, unknown>) => Promise<unknown>) : null;
}

function getRepoRoot(): string {
  // localdev_get_repo_root 결과를 cockpit.ts 가 캐시해서 전역에 넣어둔다.
  return (window as unknown as { __cockpitRepoRoot?: string }).__cockpitRepoRoot ?? '';
}

export const cockpitGraphAdapter: GraphPersistAdapter = {
  async load(): Promise<GraphSpec | null> {
    const invoke = getInvoke();
    if (!invoke) return null;
    const repo_root = getRepoRoot();
    if (!repo_root) return null;
    try {
      return (await invoke('cockpit_get_graph_spec', { repoRoot: repo_root })) as GraphSpec;
    } catch (e) {
      console.error('[cockpit] cockpit_get_graph_spec 실패', e);
      return null;
    }
  },

  async save(updates: NodeCoord[]): Promise<void> {
    const invoke = getInvoke();
    if (!invoke) return;
    const repo_root = getRepoRoot();
    if (!repo_root) return;
    try {
      await invoke('cockpit_save_graph_coords', { repoRoot: repo_root, updates });
    } catch (e) {
      console.error('[cockpit] cockpit_save_graph_coords 실패', e);
    }
  },
};
