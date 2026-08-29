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
  /**
   * 층을 직접 정할 때. 안 주면 선수 사슬의 길이로 계산한다.
   * 왜 필요한가: 한 갈래 안에서는 「단계」가 곧 층이다. 사슬로 깊이를 재면 칸이 한 줄로 늘어서서
   * 지도가 아니라 목록이 된다(실제로 그렇게 나왔다).
   */
  depth?: number;
  /**
   * 뜻으로 구운 자리 (0..1 두 축) — `data/studymap-atlas.json`.
   * 왜: 선수관계만으로 자리를 잡으면 옆에 붙은 두 갈래가 서로 아무 관계도 아니다
   * (41갈래는 아예 손으로 적은 선이 없다 — 선이 칸에서 우연히 파생됐다).
   * 모든 노드에 이 값이 있으면 층 대신 **이 자리**로 그린다.
   */
  at?: [number, number];
  /**
   * 층 안 자리 — 작을수록 왼쪽. 없으면 부모의 가로 위치를 따라간다.
   *
   * 왜 필요한가: 한 단계 안의 차례는 **사람이 적어 둔 것**이다(HTML → CSS → JS → DOM).
   * 부모 x 평균으로 정렬하면 그 차례가 흐트러져 지도가 사이드바 목록과 다른 말을 한다.
   * 뜻으로 정렬해 봤더니 더 나빴다 — HTML 이 맨 오른쪽으로 갔다(실측). 차례가 있는 자리에서는
   * 차례가 이긴다. 뜻은 **차례가 아예 없는 곳**(갈래 성좌)에서만 자리를 정한다.
   */
  order?: number;
}

export interface TreePlaced extends TreeNode {
  x: number;
  y: number;
  depth: number;
}

export interface TreeEdge {
  from: string;
  to: string;
  /**
   * 뼈대가 아닌 곁가지.
   * 왜 나누나: 선수 관계를 **전부** 실선으로 그으면 그물이 된다(갈래 41개에 선 100개 — 트리로 안 보인다).
   * 사람이 지도에서 읽고 싶은 것은 「어디서 왔나」 한 줄이다. 그래서 부모 하나만 뼈대로 남기고
   * 나머지는 흐린 점선으로 밀어 둔다 — 정보는 버리지 않되, 형태는 트리로 돌아온다.
   */
  weak?: boolean;
}

export interface TreeLayout {
  nodes: TreePlaced[];
  edges: TreeEdge[];
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
    const fixed = byId.get(id)?.depth;
    if (typeof fixed === 'number') {
      depth.set(id, fixed);
      return fixed;
    }
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
      /* 적어 둔 차례가 있으면 그것이 먼저다 — 부모 x 평균은 「누가 옆인가」를 아무렇게나 정한다. */
      if (typeof a.order === 'number' && typeof b.order === 'number' && a.order !== b.order) return a.order - b.order;
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

  /**
   * 뼈대 고르기 — 부모 중 **가장 깊은 하나**만 실선.
   * 가장 깊은 부모 = 바로 앞에 배운 것이므로, 그 한 줄이 곧 「방금 어디서 왔나」가 된다.
   */
  const edges: TreeEdge[] = [];
  nodes.forEach((n) => {
    const parents = (n.prereq || []).filter((p) => byId.has(p));
    if (!parents.length) return;
    let spine = parents[0];
    for (const p of parents) if ((depth.get(p) ?? 0) > (depth.get(spine) ?? 0)) spine = p;
    parents.forEach((p) => edges.push({ from: p, to: n.id, weak: p !== spine }));
  });

  return { nodes: [...placed.values()], edges, width, height: (maxDepth + 1) * gapY };
}

/**
 * **뜻 지도** — 구운 자리(`at`)를 그대로 화면 좌표로 편다.
 *
 * 층으로 쌓지 않는다: 41갈래에는 배울 차례가 아예 안 적혀 있다. 없는 순서를 지어내는 대신
 * 「무엇과 무엇이 가까운가」를 그린다. 선(선수관계)은 그대로 긋는다 — 자리는 뜻, 선은 순서.
 *
 * 겹침만 푼다. 뜻이 아주 가까운 둘은 좌표도 거의 같아서 글씨가 포개진다 — 서로 밀어
 * 최소 거리만 확보한다(자리 순서는 그대로 두는 만큼만 민다).
 */
export function layoutMeaning(nodes: TreeNode[], span = 1180, minGap = 132): TreeLayout {
  const pts = nodes.map((n) => ({ n, x: (n.at as [number, number])[0] * span, y: (n.at as [number, number])[1] * span * 0.62 }));
  for (let round = 0; round < 220; round += 1) {
    let moved = false;
    for (let i = 0; i < pts.length; i += 1) {
      for (let j = i + 1; j < pts.length; j += 1) {
        const dx = pts[j].x - pts[i].x;
        const dy = pts[j].y - pts[i].y;
        const d = Math.hypot(dx, dy);
        if (d >= minGap) continue;
        /* 완전히 겹친 둘은 방향이 없다 — 번호로 갈라 놓는다(같은 입력이면 같은 그림이어야 한다). */
        const ux = d > 1e-6 ? dx / d : Math.cos(i + j);
        const uy = d > 1e-6 ? dy / d : Math.sin(i + j);
        const push = (minGap - d) / 2;
        pts[i].x -= ux * push;
        pts[i].y -= uy * push;
        pts[j].x += ux * push;
        pts[j].y += uy * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  const minX = Math.min(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const placed: TreePlaced[] = pts.map((p) => ({ ...p.n, depth: 0, x: p.x - minX, y: p.y - minY }));
  const byId = new Map(placed.map((p) => [p.id, p]));
  const edges: TreeEdge[] = [];
  for (const n of placed) {
    /* 뜻 지도에서는 뼈대·곁가지를 안 나눈다 — 위아래가 없으니 「방금 어디서 왔나」도 없다. */
    for (const p of n.prereq || []) if (byId.has(p)) edges.push({ from: p, to: n.id, weak: true });
  }
  return {
    nodes: placed,
    edges,
    width: Math.max(...placed.map((p) => p.x)) + 1,
    height: Math.max(...placed.map((p) => p.y)) + 1,
  };
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
