/**
 * poster-legend.ts. 한 장으로 뽑을 때 붙일 **범례** (TASK-KL-271 O1, 골격).
 *
 * 지금 그림으로 저장은 판을 **있는 그대로** 오려 낸다. 그 그림을 받은 사람은
 * 분홍 테두리는 뭐고 노란 점은 뭔가를 물을 수밖에 없다. 종류와 관계의 뜻이 그림 밖
 * (도구 안 옆 패널)에 있기 때문이다. 공식 캐릭터 상관도가 늘 범례를 달고 나오는 이유다.
 *
 * 이 조각이 정하는 것은 **무엇을 범례에 넣는가** 하나뿐이다(어디에 어떻게 그릴지는 자리 잡는 쪽 일).
 * 규칙이 눈에 안 보이는 셈이라 순수 함수로 뺀다. 그림 만드는 코드에 섞이면 검사로 못 묻는다.
 *
 * 규칙:
 *  - **판에 실제로 쓰인 것만.** 안 쓴 종류를 범례에 적으면 이 그림에 없는 것을 설명하게 된다.
 *  - **많이 쓰인 순.** 같은 수면 이름순. 같은 판을 두 번 뽑으면 같은 그림이 나와야 한다.
 *  - **상한이 있다.** 스무 가지가 늘어서면 범례가 그림을 잡아먹는다. 넘치면 그 밖 N가지로 접는다.
 */

/** 범례 한 줄. `kind` 는 종류 id. 색, 아이콘을 부르는 쪽이 붙인다. */
export interface LegendItem {
  kind: string;
  label: string;
  /** 이 종류가 판에 몇 개 있나. 순서의 근거이자, 인물 12처럼 세어 보여 줄 때 쓴다. */
  count: number;
  /** 카드 종류인가 관계 종류인가. 둘은 범례에서 줄을 나눠 선다. */
  of: 'node' | 'edge';
}

export interface LegendResult {
  nodes: LegendItem[];
  edges: LegendItem[];
  /** 상한에 걸려 접힌 가짓수 (0 이면 접힌 것 없음). */
  moreNodes: number;
  moreEdges: number;
}

/** 한 줄에 서너 개씩 두 줄까지가 읽을 수 있는 한계다(그 이상은 그림을 잡아먹는다). */
export const LEGEND_MAX = 8;

function tally(
  items: { kind: string }[],
  labelOf: (kind: string) => string,
  of: 'node' | 'edge',
): LegendItem[] {
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.kind, (counts.get(it.kind) ?? 0) + 1);
  const out: LegendItem[] = [];
  for (const [kind, count] of counts) out.push({ kind, label: labelOf(kind), count, of });
  // 많이 쓰인 것부터. 같으면 이름순. 같은 판은 몇 번을 뽑아도 같은 그림이어야 한다.
  out.sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label) || a.kind.localeCompare(b.kind));
  return out;
}

/**
 * 이 판을 설명하는 데 필요한 범례.
 *
 * @param spec 지금 판 (거른 뒤의 것을 넘기면 보이는 것만 설명하게 된다. 그게 맞다)
 * @param nodeLabel 종류 id → 사람이 읽는 이름
 * @param edgeLabel 관계 id → 사람이 읽는 이름
 */
export function posterLegend(
  spec: { nodes: { kind: string }[]; edges: { kind: string }[] },
  nodeLabel: (kind: string) => string,
  edgeLabel: (kind: string) => string,
  max = LEGEND_MAX,
): LegendResult {
  const nodes = tally(spec.nodes, nodeLabel, 'node');
  const edges = tally(spec.edges, edgeLabel, 'edge');
  return {
    nodes: nodes.slice(0, max),
    edges: edges.slice(0, max),
    moreNodes: Math.max(0, nodes.length - max),
    moreEdges: Math.max(0, edges.length - max),
  };
}

/**
 * 범례가 쓸모 있나. 종류가 **한 가지뿐**이면 설명할 것이 없다. 전부 인물입니다는 그림을 보면 안다.
 * 그런 판에 범례를 달면 자리만 먹는다.
 */
export function legendWorthShowing(r: LegendResult): boolean {
  return r.nodes.length + r.edges.length > 1;
}
