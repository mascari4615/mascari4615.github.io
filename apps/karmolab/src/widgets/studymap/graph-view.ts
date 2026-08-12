/**
 * 스터디 맵 테크트리를 **KarmoGraph 캔버스로** 그린다 (SSOT).
 *
 * 전에는 이 위젯이 자기 SVG 를 따로 그렸다. 그런데 KarmoLab 에는 이미 그래프 엔진이 있다 —
 * 확대·이동·미니맵·손가락 두 개·선 잇기·모양(동그라미)·선 붙는 자리(포트)가 다 들어 있는 물건이다.
 * 같은 걸 두 벌 만들면 한쪽만 좋아진다. 그래서 **자리 계산만 우리가 하고 그리기는 엔진에 맡긴다.**
 *
 * 이 파일이 하는 일은 번역 하나뿐: `TreeLayout` → `GraphSpec`.
 */
import { GraphCanvas } from '../../lib/graph/canvas';
import type { GraphSpec, GraphNode, GraphEdge } from '../../lib/graph/spec';
import type { TreeLayout } from './tree';

/** 칸의 상태 — 색과 아이콘이 여기서 갈린다. */
export type TreeState = 'done' | 'going' | 'open' | 'locked';

export interface TreeViewOptions {
  /** 노드를 눌렀을 때. 갈래면 그 갈래로, 칸이면 강의로. */
  onPick: (id: string) => void;
  /** 지금 자리 — 열자마자 여기로 화면을 맞춘다. */
  focusId?: string;
  /** 동그라미 지름. 갈래 지도는 크게, 칸 트리는 조금 작게. */
  size?: number;
}

const KIND_COLORS: Record<TreeState, string> = {
  done: '#22c55e',
  going: '#60a5fa',
  open: '#94a3b8',
  locked: '#475569',
};

/** 선수 관계가 다 끝났으면 열린 것, 아니면 잠긴 것 — 게임 테크트리의 규약을 그대로 쓴다. */
export function stateOf(ratio: number, prereqDone: boolean): TreeState {
  if (ratio >= 1) return 'done';
  if (ratio > 0) return 'going';
  return prereqDone ? 'open' : 'locked';
}

/**
 * 자리 계산 결과를 엔진이 읽는 표로 옮긴다.
 * 노드는 **동그라미**(shape: 'circle'), 선은 위→아래로 흐르는 곡선.
 */
export function toGraphSpec(layout: TreeLayout, size = 64): GraphSpec {
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const doneOf = (id: string): boolean => (byId.get(id)?.ratio ?? 0) >= 1;

  const nodes: GraphNode[] = layout.nodes.map((n) => {
    const prereqDone = (n.prereq || []).filter((p) => byId.has(p)).every(doneOf);
    const state = stateOf(n.ratio, prereqDone);
    return {
      id: n.id,
      kind: state,
      label: n.title,
      group: '',
      /* 자리 계산은 가운데 좌표를 준다 — 엔진은 왼쪽 위 기준이라 반지름만큼 민다. */
      x: Math.round(n.x - size / 2),
      y: Math.round(n.y - size / 2),
      w: size,
      h: size,
      ports: [],
      shape: 'circle',
      /* 얼굴 자리에 갈래 이모지(또는 ✓)를 넣는다 — 색만으로는 무엇인지 안 보인다. */
      avatar: n.tag ? { kind: 'emoji', value: n.tag } : undefined,
      note: n.ratio > 0 && n.ratio < 1 ? `${Math.round(n.ratio * 100)}%` : undefined,
    } as GraphNode;
  });

  const edges: GraphEdge[] = layout.edges.map(({ from, to }, i) => ({
    id: `e${i}`,
    from,
    to,
    kind: doneOf(from) ? 'open' : 'need',
    curve: 0,
  }));

  return {
    version: 1,
    _meta: {},
    groups: [],
    nodes,
    edges,
    ephemeral_anchors: [],
    _edge_kinds: {
      need: { color: '#475569', width: 1.4, style: 'solid', arrow: true },
      open: { color: '#22c55e', width: 1.6, style: 'solid', arrow: true },
    },
  } as GraphSpec;
}

/**
 * 캔버스를 띄운다. 읽기 전용 — 끌어서 옮기기·잇기는 주지 않는다(지도는 사람이 고치는 물건이 아니다).
 * @returns 정리 함수. 화면을 갈아엎을 때 부른다.
 */
export function mountTree(host: HTMLElement, layout: TreeLayout, opts: TreeViewOptions): () => void {
  host.innerHTML = '';
  const canvas = new GraphCanvas(host, {
    kindColors: KIND_COLORS,
    defaultKindColor: KIND_COLORS.open,
    onNodeClick: (id) => opts.onPick(id),
  });
  canvas.setSpec(toGraphSpec(layout, opts.size ?? 64));
  canvas.render();
  return () => {
    host.innerHTML = '';
  };
}
