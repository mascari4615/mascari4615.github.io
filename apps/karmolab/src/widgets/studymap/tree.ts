/**
 * 스터디 맵 테크트리 — 갈래 성좌(1층)와 칸 트리(2층).
 *
 * 왜 그래프인가: 목록은 「무엇이 있나」는 알려 주지만 「무엇 다음에 무엇인가」를 못 알려 준다.
 * 선수 관계는 이미 표(`prereq`)에 있으므로, 좌표를 손으로 찍지 않고 **그 관계에서 자리를 계산**한다.
 * 그래야 갈래를 늘려도 그림이 저절로 맞는다(칸 311개를 손으로 배치할 수는 없다).
 *
 * 배치 규칙은 하나뿐이다 — **먼저 배울 것이 위**. 깊이는 선수 관계의 가장 긴 사슬로 정한다.
 */

export interface TreeNode {
  id: string;
  title: string;
  /** 0 = 아무것도 안 함 · 1 = 다 끝냄 */
  ratio: number;
  /** 이 노드보다 먼저 오는 노드들 */
  prereq: string[];
  /** 화면에 곁들일 짧은 글(갈래면 이모지, 칸이면 단계 이름) */
  tag?: string;
}

export interface TreePlaced extends TreeNode {
  x: number;
  y: number;
  depth: number;
}

export interface TreeLayout {
  nodes: TreePlaced[];
  edges: Array<{ from: string; to: string }>;
  width: number;
  height: number;
}

/**
 * 층을 나눠 배치한다(위 → 아래).
 * 선수 사슬이 순환하면(자료 실수) 깊이를 0 으로 두고 계속 그린다 — 그림이 통째로 사라지는 것보다 낫다.
 */
export function layoutTree(nodes: TreeNode[], gapX = 168, gapY = 118): TreeLayout {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const depth = new Map<string, number>();

  const walk = (id: string, seen: Set<string>): number => {
    if (depth.has(id)) return depth.get(id) as number;
    if (seen.has(id)) return 0; /* 순환 — 여기서 끊는다 */
    seen.add(id);
    const n = byId.get(id);
    const parents = (n?.prereq || []).filter((p) => byId.has(p));
    const d = parents.length === 0 ? 0 : Math.max(...parents.map((p) => walk(p, seen))) + 1;
    depth.set(id, d);
    return d;
  };
  nodes.forEach((n) => walk(n.id, new Set()));

  /* 같은 층 안에서는 부모의 가로 위치를 따라간다 — 선이 덜 꼬인다. */
  const layers = new Map<number, TreeNode[]>();
  nodes.forEach((n) => {
    const d = depth.get(n.id) ?? 0;
    if (!layers.has(d)) layers.set(d, []);
    (layers.get(d) as TreeNode[]).push(n);
  });

  const placed = new Map<string, TreePlaced>();
  const maxDepth = Math.max(0, ...[...layers.keys()]);
  let widest = 1;

  for (let d = 0; d <= maxDepth; d++) {
    const row = layers.get(d) || [];
    row.sort((a, b) => {
      const pa = (a.prereq || []).map((p) => placed.get(p)?.x ?? 0);
      const pb = (b.prereq || []).map((p) => placed.get(p)?.x ?? 0);
      const ma = pa.length ? pa.reduce((s, v) => s + v, 0) / pa.length : 0;
      const mb = pb.length ? pb.reduce((s, v) => s + v, 0) / pb.length : 0;
      return ma - mb || a.title.localeCompare(b.title);
    });
    widest = Math.max(widest, row.length);
    row.forEach((n, i) => {
      placed.set(n.id, { ...n, depth: d, x: (i + 0.5) * gapX, y: (d + 0.5) * gapY });
    });
  }

  /* 층마다 개수가 달라 왼쪽으로 쏠린다 — 각 층을 가운데로 민다. */
  const width = widest * gapX;
  for (let d = 0; d <= maxDepth; d++) {
    const row = (layers.get(d) || []).map((n) => placed.get(n.id) as TreePlaced);
    const rowWidth = row.length * gapX;
    const shift = (width - rowWidth) / 2;
    row.forEach((n) => (n.x += shift));
  }

  const edges: Array<{ from: string; to: string }> = [];
  nodes.forEach((n) => (n.prereq || []).forEach((p) => byId.has(p) && edges.push({ from: p, to: n.id })));

  return { nodes: [...placed.values()], edges, width, height: (maxDepth + 1) * gapY };
}

const esc = (v: unknown): string =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 진행 정도를 고리로 — 숫자보다 눈이 먼저 읽는다. */
function ring(ratio: number, r = 17): string {
  const c = 2 * Math.PI * r;
  const on = Math.max(0, Math.min(1, ratio)) * c;
  return `<circle class="tt-ring-bg" r="${r}" />
    <circle class="tt-ring" r="${r}" stroke-dasharray="${on.toFixed(1)} ${(c - on).toFixed(1)}" transform="rotate(-90)" />`;
}

/**
 * SVG 한 장으로 그린다. 노드는 `data-node` 를 달고 나가므로 클릭 처리는 부르는 쪽이 한다.
 * `dim` 이 참이면 아직 손대지 않은 자리를 흐리게 — 「어디부터」가 눈에 띄게.
 */
export function treeSvg(layout: TreeLayout, opts: { currentId?: string; nextId?: string } = {}): string {
  const pos = new Map(layout.nodes.map((n) => [n.id, n]));
  const lines = layout.edges
    .map(({ from, to }) => {
      const a = pos.get(from);
      const b = pos.get(to);
      if (!a || !b) return '';
      const mid = (a.y + b.y) / 2;
      return `<path class="tt-edge${b.ratio > 0 ? ' is-open' : ''}" d="M${a.x} ${a.y + 20} C${a.x} ${mid} ${b.x} ${mid} ${b.x} ${b.y - 20}" />`;
    })
    .join('');

  const dots = layout.nodes
    .map((n) => {
      const state = n.ratio >= 1 ? ' is-done' : n.ratio > 0 ? ' is-going' : '';
      const mark = n.id === opts.nextId ? ' is-next' : n.id === opts.currentId ? ' is-current' : '';
      return `<g class="tt-node${state}${mark}" transform="translate(${n.x} ${n.y})" data-node="${esc(n.id)}" role="button" tabindex="0" aria-label="${esc(n.title)}">
        ${ring(n.ratio)}
        <text class="tt-emoji" y="6" text-anchor="middle">${esc(n.tag || '')}</text>
        <text class="tt-label" y="38" text-anchor="middle">${esc(n.title)}</text>
      </g>`;
    })
    .join('');

  /**
   * 화면 너비에 맞춰 줄이면 글씨가 뭉갠다(41갈래를 한 폭에 넣으면 0.5배까지 줄어든다).
   * 그래서 **제 크기로 그리고 가로로 굴린다** — 지도는 원래 한 화면보다 큰 물건이다.
   */
  const pad = 46;
  const w = layout.width + pad * 2;
  const h = layout.height + pad * 2;
  return `<svg class="tt-svg" width="${Math.round(w)}" height="${Math.round(h)}" viewBox="${-pad} ${-pad} ${w} ${h}" role="group">
    <g class="tt-edges">${lines}</g>${dots}
  </svg>`;
}
