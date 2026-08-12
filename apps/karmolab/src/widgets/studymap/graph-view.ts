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
import type { GraphSpec, GraphNode, GraphEdge, LaneDef } from '../../lib/graph/spec';
import type { TreeLayout } from './tree';

/** 칸의 상태 — 색과 아이콘이 여기서 갈린다. */
export type TreeState = 'done' | 'going' | 'open' | 'locked';

export interface TreeViewOptions {
  /** 단계 띠 이름 — 깊이 순서대로. 없으면 띠를 안 그린다. */
  laneLabels?: string[];
  /** 추천 경로 — 이 칸들에 불이 들어온다(다음 한 칸까지 가는 길). */
  pathIds?: string[];
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
export function toGraphSpec(layout: TreeLayout, size = 64, laneLabels: string[] = []): GraphSpec {
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

  /* 같은 깊이는 같은 단계 — 띠로 깔아 「지금 몇 번째인지」를 배경이 말하게 한다. */
  const depths = [...new Set(layout.nodes.map((n) => n.depth))].sort((a, b) => a - b);
  const lanes: LaneDef[] = laneLabels.length
    ? depths.map((d) => {
        const rows = layout.nodes.filter((n) => n.depth === d);
        const top = Math.min(...rows.map((n) => n.y)) - size;
        const bottom = Math.max(...rows.map((n) => n.y)) + size;
        return { id: `lane-${d}`, label: laneLabels[d] ?? `${d + 1}단계`, y: Math.round(top), h: Math.round(bottom - top) };
      })
    : [];

  return {
    version: 1,
    _meta: {},
    groups: [],
    lanes,
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
  canvas.setSpec(toGraphSpec(layout, opts.size ?? 64, opts.laneLabels ?? []));
  canvas.render();

  /* 추천 경로에 불을 켠다 — 엔진의 활성 집합을 그대로 쓴다(같은 장치를 두 벌 만들지 않는다). */
  if (opts.pathIds?.length) {
    const ids = new Set(opts.pathIds);
    canvas.setActiveSets({
      node_ids_active: ids,
      edge_ids_animated: new Set(
        layout.edges
          .map((e, i) => ({ id: `e${i}`, e }))
          .filter(({ e }) => ids.has(e.from) && ids.has(e.to))
          .map(({ id }) => id),
      ),
    });
  }

  /**
   * 열자마자 지금 자리로 화면을 맞춘다.
   * 다만 **한 노드에 맞추면 안 된다** — 그러면 배율이 튀어 글자가 커지고 주변이 안 보인다(실측).
   * 그래서 그 노드를 가운데 둔 **일정한 크기의 창**을 잡는다: 배율은 늘 비슷하고, 이웃이 함께 보인다.
   */
  const focus = opts.focusId ? layout.nodes.find((n) => n.id === opts.focusId) : undefined;
  if (focus) {
    const w = 1080;
    const h = 620;
    canvas.fitToWorldRect({ x: focus.x - w / 2, y: focus.y - h / 2, w, h }, 20);
  } else {
    canvas.fitToNodes(layout.nodes.map((n) => n.id), 60);
  }

  return () => {
    host.innerHTML = '';
  };
}
