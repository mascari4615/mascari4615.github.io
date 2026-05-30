/**
 * graph-spec.ts — graph.json 타입 정의 + Tauri invoke 래퍼 (TASK-KL-082 단위 A).
 *
 * graph.json 은 memo/.claude/graph.json 이 정본 (hand-curated).
 * Rust cockpit_graph.rs 가 read/write.
 */

// ─── 타입 정의 ────────────────────────────────────────────────────────────────

export interface Port {
  id: string;
}

export interface LiveSpec {
  source: string;
  repo?: string;
  signal?: string;
  host?: string;
  service?: string;
}

export interface GraphNode {
  id: string;
  kind: string;
  label: string;
  group: string;
  x: number;
  y: number;
  w: number;
  h: number;
  ports: Port[];
  doc?: string;
  live?: LiveSpec;
  children?: string[];  // 노드 카드 안에 표시할 서브항목 레이블
}

export interface GraphEdge {
  id: string;
  from: string;   // "nodeId:portId"
  to: string;     // "nodeId:portId"
  kind: string;
  label?: string;
}

export interface GroupDef {
  id: string;
  label: string;
  color: string;
  bbox: { x: number; y: number; w: number; h: number };
}

export interface EphemeralAnchor {
  id: string;
  label: string;
  group: string;
  x: number;
  y: number;
  w: number;
  h: number;
  source: {
    kind: string;
    file?: string;
    filter?: string;
  };
  spawn_kind: string;
  id_template: string;
  label_template: string;
  highlight?: string;
}

/** save 시 보낼 좌표 패치 — kind 로 어느 컬렉션 patch 할지 분기. */
export interface CoordUpdate {
  id: string;
  x: number;
  y: number;
  kind?: 'node' | 'anchor' | 'group';
}

export interface EdgeKindDef {
  color: string;
  style: 'solid' | 'dashed' | 'dotted';
  arrow: boolean;
  animated_on_active?: boolean;
}

export interface GraphSpec {
  version: number;
  _meta: Record<string, string>;
  groups: GroupDef[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  ephemeral_anchors: EphemeralAnchor[];
  _edge_kinds: Record<string, EdgeKindDef>;
}

export interface NodeCoord {
  id: string;
  x: number;
  y: number;
  kind?: 'node' | 'anchor' | 'group';
}

// ─── Tauri invoke 래퍼 ────────────────────────────────────────────────────────

function getInvoke(): ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null {
  const t = (window as unknown as { __TAURI__?: { core?: { invoke?: unknown } } }).__TAURI__;
  const fn_ = t?.core?.invoke;
  return typeof fn_ === 'function' ? (fn_ as (cmd: string, args?: Record<string, unknown>) => Promise<unknown>) : null;
}

function getRepoRoot(): string {
  // localdev_get_repo_root 결과를 cockpit.ts 가 캐시해서 전달하는 구조.
  // 여기서는 전역 캐시에서 읽음 (cockpit.ts 가 주입).
  return (window as unknown as { __cockpitRepoRoot?: string }).__cockpitRepoRoot ?? '';
}

export async function loadGraphSpec(): Promise<GraphSpec | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  const repo_root = getRepoRoot();
  if (!repo_root) return null;
  try {
    const spec = await invoke('cockpit_get_graph_spec', { repoRoot: repo_root }) as GraphSpec;
    return spec;
  } catch (e) {
    console.error('[cockpit] cockpit_get_graph_spec 실패', e);
    return null;
  }
}

export async function saveGraphCoords(updates: NodeCoord[]): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  const repo_root = getRepoRoot();
  if (!repo_root) return;
  try {
    await invoke('cockpit_save_graph_coords', { repoRoot: repo_root, updates });
  } catch (e) {
    console.error('[cockpit] cockpit_save_graph_coords 실패', e);
  }
}
