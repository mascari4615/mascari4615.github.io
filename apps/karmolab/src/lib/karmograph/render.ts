/**
 * lib/karmograph/render.ts — **편집기 없이 그림만** (TASK-KL-326).
 *
 * 왜 있나: 판을 그리는 길이 캔버스(`canvas.ts`) 하나뿐이었다. 그런데 캔버스는 **대화형
 * 편집기**다 — 끌고 고르고 되돌리는 것이 본체고, 그림은 그 부산물이다. `exportSvgString`
 * 도 *살아 있는 캔버스의 DOM* 을 읽어서 뽑으므로, 그림 한 장이 필요할 뿐인 자리
 * (문서 안 도해 · 브라우저 없는 MCP · 인쇄)에서도 편집기 257KB 를 통째로 띄워야 했다.
 *
 * 그래서 **그림만 내는 길**을 연다. 셈은 이미 순수한 것을 그대로 쓴다
 * (`canvas-math` 의 `boundsOf`·`edgeCurve`·`convexHull`) — 자리·곡선을 여기서 다시
 * 셈하면 편집기에서 본 그림과 문서에서 본 그림이 **조용히 어긋난다**. 다른 것은
 * 「무엇으로 뱉느냐」뿐이다: 캔버스는 DOM 조각, 여기는 글자.
 *
 * 안 하는 것 — 고르기·끌기·되돌리기·소형지도·손잡이. 그건 편집기의 일이다.
 */
import type { GraphSpec, GraphNode, GraphEdge, GroupDef, EdgeKindDef, NodeShape } from './spec';
import { boundsOf, edgeCurve, convexHull, roundedHullPath, boxCorners } from './canvas-math';
import { DEFAULT_THEME } from './canvas-theme';

type Theme = typeof DEFAULT_THEME;

export interface RenderOptions {
  /** 종류별 색. 없으면 `defaultKindColor`. */
  kindColors?: Record<string, string>;
  defaultKindColor?: string;
  /** 판 둘레 여백(px). */
  padding?: number;
  /** 색표. 안 주면 기본(어두운 판) — 문서에 넣을 때는 그 문서의 색을 넘겨라. */
  theme?: Partial<Theme>;
  /** `<svg>` 에 박을 class. */
  className?: string;
  /** 접근성 이름 — `<title>` 로 들어간다. 화면낭독기가 이 그림을 뭐라 부를지. */
  title?: string;
}

/** `<` `&` 는 SVG 를 깨뜨린다. 라벨은 사람이 쓴 글이라 뭐든 들어온다. */
function esc(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 소수점을 잘라 글자 수를 줄인다 — 판 하나가 수천 줄이 되면 문서가 무거워진다. */
const n = (value: number): string => (Math.round(value * 100) / 100).toString();

function attrs(map: Record<string, string | number | undefined>): string {
  return Object.entries(map)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => key + '="' + esc(String(value)) + '"')
    .join(' ');
}

/** 한 줄이 카드보다 길면 자른다. 감싸 접기는 편집기의 일(`foldNoteBody`)이고 여기선 한 줄이다. */
function clip(text: string, width: number, fontSize: number): string {
  const per = fontSize * 0.62;            // 한글·영문 섞인 평균 글자폭 (실측 근사)
  const max = Math.max(2, Math.floor((width - 16) / per));
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}

function nodeBackground(node: GraphNode, shape: NodeShape, color: string, fill: string): string {
  const common = { fill, stroke: color + '60', 'stroke-width': 1.5 };
  if (shape === 'circle') {
    return '<ellipse ' + attrs({
      cx: n(node.w / 2), cy: n(node.h / 2), rx: n(node.w / 2), ry: n(node.h / 2), ...common,
    }) + '/>';
  }
  // bubble·note·photo 도 여기서는 카드로 낸다 — 꼬리·사진은 편집기의 꾸밈이다.
  return '<rect ' + attrs({
    x: 0, y: 0, width: n(node.w), height: n(node.h), rx: 10, ry: 10, ...common,
  }) + '/>';
}

function renderNode(node: GraphNode, color: string, theme: Theme): string {
  const shape: NodeShape = node.shape ?? 'rect';
  const parts: string[] = [nodeBackground(node, shape, color, theme.nodeFill)];

  // 좌측 색띠 — 카드일 때만 (동그라미에선 어색하다). 캔버스와 같은 규칙.
  if (shape === 'rect') {
    parts.push('<rect ' + attrs({ x: 0, y: 0, width: 4, height: n(node.h), rx: 2, ry: 2, fill: color }) + '/>');
  }

  const hasNote = typeof node.note === 'string' && node.note !== '';
  parts.push(
    '<text ' + attrs({
      x: n(node.w / 2), y: n(hasNote ? node.h / 2 - 4 : node.h / 2),
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-size': 13, fill: theme.nodeText,
    }) + '>' + esc(clip(node.label, node.w, 13)) + '</text>',
  );
  if (hasNote) {
    parts.push(
      '<text ' + attrs({
        x: n(node.w / 2), y: n(node.h / 2 + 12),
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-size': 11, fill: theme.childText,
      }) + '>' + esc(clip(node.note as string, node.w, 11)) + '</text>',
    );
  }

  const rotate = node.rotate ? ' rotate(' + n(node.rotate) + ' ' + n(node.w / 2) + ' ' + n(node.h / 2) + ')' : '';
  return '<g ' + attrs({
    class: 'ck-node', transform: 'translate(' + n(node.x) + ' ' + n(node.y) + ')' + rotate,
  }) + '>' + parts.join('') + '</g>';
}

function renderGroup(group: GroupDef, members: GraphNode[]): string {
  if (group.hidden === true) return '';
  const label = '<text ' + attrs({
    x: n(group.bbox.x + 10), y: n(group.bbox.y + 16), 'font-size': 11, fill: group.color, opacity: 0.85,
  }) + '>' + esc(group.label) + '</text>';

  if (group.shape === 'hull' && members.length > 0) {
    const path = roundedHullPath(convexHull(members.flatMap((m) => boxCorners(m, 18))));
    if (path !== null) {
      return '<g class="ck-group"><path ' + attrs({
        d: path, fill: group.color + '14', stroke: group.color + '55', 'stroke-width': 1.5,
      }) + '/>' + label + '</g>';
    }
  }
  return '<g class="ck-group"><rect ' + attrs({
    x: n(group.bbox.x), y: n(group.bbox.y), width: n(group.bbox.w), height: n(group.bbox.h),
    rx: 14, ry: 14, fill: group.color + '14', stroke: group.color + '55', 'stroke-width': 1.5,
  }) + '/>' + label + '</g>';
}

const DASH: Record<string, string | undefined> = {
  solid: undefined, dashed: '8 5', dotted: '2 5', wavy: '10 4', crack: '3 3 9 3',
};

function renderEdge(
  edge: GraphEdge,
  from: GraphNode,
  to: GraphNode,
  def: EdgeKindDef,
  theme: Theme,
): string {
  const geom = edgeCurve(from, to, edge.curve ?? 0);
  const d = 'M ' + n(geom.p1.x) + ' ' + n(geom.p1.y)
    + ' C ' + n(geom.c1.x) + ' ' + n(geom.c1.y)
    + ', ' + n(geom.c2.x) + ' ' + n(geom.c2.y)
    + ', ' + n(geom.p2.x) + ' ' + n(geom.p2.y);
  const color = edge.color ?? def.color;
  const style = edge.style ?? def.style;

  const path = '<path ' + attrs({
    class: 'ck-edge', d, fill: 'none', stroke: color,
    'stroke-width': edge.width ?? def.width ?? 1.5,
    'stroke-dasharray': DASH[style],
    'marker-end': def.arrow ? 'url(#ck-arrow)' : undefined,
    'marker-start': (edge.arrowStart ?? def.arrowStart) === true ? 'url(#ck-arrow-start)' : undefined,
  }) + '/>';

  if (typeof edge.label !== 'string' || edge.label === '') return path;
  // 이름표는 곡선 가운데 — 베지어 t=0.5 는 네 점의 가중평균이다.
  const mx = (geom.p1.x + 3 * geom.c1.x + 3 * geom.c2.x + geom.p2.x) / 8;
  const my = (geom.p1.y + 3 * geom.c1.y + 3 * geom.c2.y + geom.p2.y) / 8;
  const width = edge.label.length * 6.4 + 10;
  return path
    + '<rect ' + attrs({
      x: n(mx - width / 2), y: n(my - 9), width: n(width), height: 18, rx: 9, ry: 9,
      fill: theme.edgeDotFill, opacity: 0.9,
    }) + '/>'
    + '<text ' + attrs({
      x: n(mx), y: n(my), 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-size': 10, fill: color,
    }) + '>' + esc(edge.label) + '</text>';
}

/* 화살촉은 선 색을 따라가야 한다 — `context-stroke` 가 그 일을 하고, 못 알아듣는
   곳에서는 검정으로 떨어진다(그림이 사라지지는 않는다). */
function marker(id: string, flip: boolean): string {
  return '<marker ' + attrs({
    id, viewBox: '0 0 10 10', refX: flip ? 1 : 9, refY: 5,
    markerWidth: 6, markerHeight: 6, orient: flip ? 'auto-start-reverse' : 'auto',
  }) + '><path d="' + (flip ? 'M 10 0 L 0 5 L 10 10 z' : 'M 0 0 L 10 5 L 0 10 z')
    + '" fill="context-stroke"/></marker>';
}

/**
 * 판 하나를 **SVG 글자 한 덩이**로. DOM 도 브라우저도 안 쓴다.
 *
 * 돌려주는 것은 `<svg>…</svg>` 통짜라 문서에 그대로 넣거나 파일로 써도 혼자 선다
 * (색을 변수로 두지 않고 값으로 박는 이유 = `canvas-theme.ts` 머리말과 같다).
 */
export function renderGraphSvg(spec: GraphSpec, options: RenderOptions = {}): string {
  const theme: Theme = { ...DEFAULT_THEME, ...(options.theme ?? {}) };
  const padding = options.padding ?? 24;
  const defaultKindColor = options.defaultKindColor ?? theme.edgeDefaultColor;
  const kindColors = options.kindColors ?? {};

  const nodes = spec.nodes ?? [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const bounds = boundsOf(nodes.map((node) => ({ x: node.x, y: node.y, w: node.w, h: node.h })));

  const mainGroupOf = (node: GraphNode): string | undefined => {
    const groups = node.groups ?? (node.group !== '' ? [node.group] : []);
    return groups[0] !== undefined && groups[0] !== '' ? groups[0] : undefined;
  };

  const groupLayer = (spec.groups ?? [])
    .map((group) => renderGroup(group, nodes.filter((node) => mainGroupOf(node) === group.id)))
    .join('');

  const edgeLayer = (spec.edges ?? [])
    .map((edge) => {
      // 포트 suffix(`id:port`)는 그림에선 뜻이 없다 — 캔버스와 같은 규칙으로 잘라 낸다.
      const from = byId.get(String(edge.from).split(':')[0]);
      const to = byId.get(String(edge.to).split(':')[0]);
      if (from === undefined || to === undefined) return '';
      const def: EdgeKindDef = spec._edge_kinds?.[edge.kind] ?? {
        color: theme.edgeDefaultColor, style: 'solid', arrow: true,
      };
      return renderEdge(edge, from, to, def, theme);
    })
    .join('');

  const nodeLayer = nodes
    .map((node) => renderNode(node, kindColors[node.kind] ?? defaultKindColor, theme))
    .join('');

  const width = bounds.w + padding * 2;
  const height = bounds.h + padding * 2;
  const viewBox = n(bounds.minX - padding) + ' ' + n(bounds.minY - padding) + ' ' + n(width) + ' ' + n(height);

  return '<svg ' + attrs({
    xmlns: 'http://www.w3.org/2000/svg', viewBox, width: n(width), height: n(height),
    class: options.className ?? 'ck-static', role: 'img',
  }) + '>'
    + (typeof options.title === 'string' && options.title !== '' ? '<title>' + esc(options.title) + '</title>' : '')
    + '<defs>' + marker('ck-arrow', false) + marker('ck-arrow-start', true) + '</defs>'
    + '<g class="ck-groups">' + groupLayer + '</g>'
    + '<g class="ck-edges">' + edgeLayer + '</g>'
    + '<g class="ck-nodes">' + nodeLayer + '</g>'
    + '</svg>';
}
