/**
 * lib/karmograph/from-mermaid.ts — **mermaid 글을 판으로** (TASK-KL-326).
 *
 * mermaid 는 라이브러리가 아니라 **문법**이다. 그 값은 「코드블록 안 글이 곧 그림」이라
 * 깃허브·memo·남의 저장소 어디서나 읽힌다는 것 — 남이 쓴 문서의 문법은 우리가 못 정한다.
 * 그러니 문법은 그대로 받고, **그리는 일만 우리 것으로** 가져온다.
 *
 * 읽는 일은 이미 `core/mermaidlite` 가 한다(우리가 짠 337줄, 의존성 0). 여기는 그 결과를
 * KarmoGraph 의 자료 모양(`GraphSpec`)으로 옮기는 **다리** 하나다. 이 다리가 없어서
 * mermaidlite 가 자기 SVG 를 따로 그렸고, 그림 그리는 자리가 둘로 갈려 있었다.
 *
 * ## 자리 잡기를 왜 여기서 새로 하나
 *
 * mermaid 글에는 좌표가 없다 — `A --> B` 는 있어도 「A 가 어디」는 없다. 반면 `GraphNode`
 * 는 `x,y,w,h` 를 요구한다. 그래서 자리를 지어 줘야 한다.
 *
 * 옆에 `from-text.ts` 의 `layoutTree` 가 있지만 그건 **나무**용이다(부모가 하나). 흐름도는
 * 여러 갈래가 한 점으로 모이는 **그물**이라(`MD --> L` 과 `P --> L` 이 함께 온다) 나무로
 * 접으면 그 합류가 사라진다. 그래서 **층으로 쌓는다** — 들어오는 화살이 없는 것이 0층,
 * 그 다음이 1층… mermaid 자신이 쓰는 방식과 같은 계보다.
 */
import type { GraphSpec, GraphNode, GraphEdge, NodeShape } from './spec';
import { emptyGraphSpec } from './spec';
import { parse, type Diagram, type Node as MermaidNode } from '../../core/mermaidlite';

/** 카드 크기 — 글자 수에 맞춰 늘리되 너무 길면 자른다(`render.ts` 가 말줄임을 한다). */
const CARD_H = 44;
const CARD_MIN_W = 96;
const CARD_MAX_W = 260;

/** 층 간격 · 같은 층 안 간격. 화살이 카드에서 수직으로 빠져나올 만큼은 띄운다. */
const LAYER_GAP = 120;
const SIBLING_GAP = 28;

/**
 * 묶음 색 — mermaid 글에는 색이 없다. 판마다 손으로 고를 수도 없으니 차례대로 돌려 쓴다.
 * 캔버스 기본 색표와 같은 계열이라 같은 판을 편집기에서 열어도 낯설지 않다.
 */
const GROUP_COLORS = ['#38bdf8', '#a78bfa', '#f472b6', '#34d399', '#fbbf24'];

const SHAPE: Record<MermaidNode['shape'], NodeShape> = {
  box: 'rect', round: 'rect', diamond: 'rect', circle: 'circle',
};

function widthFor(label: string): number {
  return Math.min(CARD_MAX_W, Math.max(CARD_MIN_W, label.length * 9 + 28));
}

/**
 * 각 마디가 몇 층인가 — **들어오는 화살이 없는 것이 0층**, 나머지는 「나를 가리키는 것들의
 * 최대 층 + 1」. 고리(순환)가 있으면 영원히 안 끝나므로 마디 수만큼만 돌고 멈춘다
 * (고리진 흐름도는 드물지만, 멈추는 것이 매달리는 것보다 낫다).
 */
function layerOf(nodes: MermaidNode[], edges: { from: string; to: string }[]): Map<string, number> {
  const layer = new Map<string, number>();
  for (const node of nodes) layer.set(node.id, 0);

  for (let round = 0; round < nodes.length; round += 1) {
    let moved = false;
    for (const edge of edges) {
      const from = layer.get(edge.from);
      const to = layer.get(edge.to);
      if (from === undefined || to === undefined) continue;
      if (to < from + 1) {
        layer.set(edge.to, from + 1);
        moved = true;
      }
    }
    if (moved === false) break;
  }
  return layer;
}

/**
 * mermaid 글 한 덩이 → KarmoGraph 판.
 *
 * `kind` 는 전부 `'step'` 이다 — 흐름도의 마디에는 신분이 없다. 색을 다르게 주고 싶으면
 * 부르는 쪽이 `renderGraphSvg` 의 `kindColors` 로 넘긴다.
 */
export function specFromMermaid(text: string): { spec: GraphSpec; diagram: Diagram } {
  const diagram = parse(text);
  const spec = emptyGraphSpec();
  if (diagram.kind === 'unknown') return { spec, diagram };

  const layer = layerOf(diagram.nodes, diagram.edges);

  // 층별로 모아 같은 층 안에서는 글에 나온 차례대로 세운다 — 사람이 적은 순서가 곧 뜻이다.
  const byLayer = new Map<number, MermaidNode[]>();
  for (const node of diagram.nodes) {
    const index = layer.get(node.id) ?? 0;
    const list = byLayer.get(index) ?? [];
    list.push(node);
    byLayer.set(index, list);
  }

  const horizontal = diagram.dir === 'LR';
  const nodes: GraphNode[] = [];

  for (const [index, list] of [...byLayer.entries()].sort((a, b) => a[0] - b[0])) {
    // 같은 층은 가운데 정렬 — 위아래 층과 축이 어긋나면 화살이 비스듬히 흘러 읽기 나쁘다.
    const sizes = list.map((node) => (horizontal ? CARD_H : widthFor(node.label)));
    const total = sizes.reduce((sum, size) => sum + size, 0) + SIBLING_GAP * (list.length - 1);
    let cursor = -total / 2;

    list.forEach((node, position) => {
      const w = widthFor(node.label);
      // 층이 나아가는 축은 방향에 따라 갈린다 — LR 이면 가로, TD 면 세로.
      const depth = horizontal ? index * (CARD_MAX_W + LAYER_GAP) : index * (CARD_H + LAYER_GAP);
      nodes.push({
        id: node.id,
        kind: 'step',
        label: node.label,
        group: '',
        x: horizontal ? depth : cursor,
        y: horizontal ? cursor : depth,
        w,
        h: CARD_H,
        ports: [],
        shape: SHAPE[node.shape],
      });
      cursor += sizes[position] + SIBLING_GAP;
    });
  }

  /* `subgraph` → 묶음. 상자는 **멤버를 감싸도록** 지어 준다 — mermaid 글에는 상자 좌표가
     없으니 자리를 잡은 뒤에야 크기를 알 수 있다. 겹쳐 적힌 묶음은 각자 자기 멤버만 감싼다. */
  const byNodeId = new Map(nodes.map((node) => [node.id, node]));
  const groups = diagram.groups
    .map((group, index) => {
      const members = group.members
        .map((id) => byNodeId.get(id))
        .filter((node): node is GraphNode => node !== undefined);
      if (members.length === 0) return undefined;
      for (const member of members) member.group = group.id;
      const pad = 20;
      const minX = Math.min(...members.map((m) => m.x)) - pad;
      const minY = Math.min(...members.map((m) => m.y)) - pad - 8;   // 이름표 자리
      const maxX = Math.max(...members.map((m) => m.x + m.w)) + pad;
      const maxY = Math.max(...members.map((m) => m.y + m.h)) + pad;
      return {
        id: group.id,
        label: group.label,
        color: GROUP_COLORS[index % GROUP_COLORS.length],
        bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      };
    })
    .filter((group): group is NonNullable<typeof group> => group !== undefined);

  const edges: GraphEdge[] = diagram.edges.map((edge, index) => ({
    id: 'e' + index,
    from: edge.from,
    to: edge.to,
    kind: 'flow',
    label: edge.label,
    style: edge.dashed === true ? 'dashed' : 'solid',
  }));

  spec.nodes = nodes;
  spec.edges = edges;
  // 묶음은 자리를 잡은 뒤에 지어졌다(위) — 여기서 판에 얹는다.
  spec.groups = groups;
  spec._edge_kinds = { flow: { color: '#64748b', style: 'solid', arrow: true } };
  return { spec, diagram };
}
