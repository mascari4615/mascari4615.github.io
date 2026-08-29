/**
 * 스터디 맵 테크트리를 **KarmoGraph 캔버스로** 그린다 (SSOT).
 *
 * 전에는 이 위젯이 자기 SVG 를 따로 그렸다. 그런데 KarmoLab 에는 이미 그래프 엔진이 있다 —
 * 확대·이동·미니맵·손가락 두 개·선 잇기·모양(동그라미)·선 붙는 자리(포트)가 다 들어 있는 물건이다.
 * 같은 걸 두 벌 만들면 한쪽만 좋아진다. 그래서 **자리 계산만 우리가 하고 그리기는 엔진에 맡긴다.**
 *
 * 이 파일이 하는 일은 번역 하나뿐: `TreeLayout` → `GraphSpec`.
 */
import { GraphCanvas } from '../../lib/karmograph/canvas';
import type { GraphSpec, GraphNode, GraphEdge, LaneDef, GroupDef } from '../../lib/karmograph/spec';
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
  /** 참이면 전체가 한 화면에 들어오게 — 칸이 적은 갈래 안 지도에서 쓴다. */
  fitAll?: boolean;
  /** 동그라미 지름. 갈래 지도는 크게, 칸 트리는 조금 작게. */
  size?: number;
  /**
   * 이웃 묶음 — 뜻 지도에서 「이 근처는 무엇인가」를 배경이 말하게 한다.
   * 자리만 있으면 사람은 왜 거기 있는지 모른다(점 41개는 그냥 흩어진 점이다).
   */
  groups?: { id: string; label: string; members: string[] }[];
}

/** 묶음 바탕색 — 서로 구분되되 노드보다 뒤로 물러나야 한다(배경이지 주인공이 아니다). */
const GROUP_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

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
export function toGraphSpec(
  layout: TreeLayout,
  size = 64,
  laneLabels: string[] = [],
  groupDefs: { id: string; label: string; members: string[] }[] = [],
): GraphSpec {
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const doneOf = (id: string): boolean => (byId.get(id)?.ratio ?? 0) >= 1;
  const groupOf = new Map<string, string>();
  for (const g of groupDefs) for (const m of g.members) if (byId.has(m)) groupOf.set(m, g.id);

  const nodes: GraphNode[] = layout.nodes.map((n) => {
    const prereqDone = (n.prereq || []).filter((p) => byId.has(p)).every(doneOf);
    const state = stateOf(n.ratio, prereqDone);
    return {
      id: n.id,
      kind: state,
      label: n.title,
      group: groupOf.get(n.id) ?? '',
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

  const edges: GraphEdge[] = layout.edges.map(({ from, to, weak }, i) => ({
    id: `e${i}`,
    from,
    to,
    /* 곁가지는 따로 부류를 준다 — 흐린 점선이라 형태를 안 흐린다. */
    kind: weak ? 'also' : doneOf(from) ? 'open' : 'need',
    /* 곁가지는 살짝 휘어 뼈대와 겹치지 않게. */
    curve: weak ? 0.35 : 0,
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

  /* 묶음 상자는 **멤버를 감싸는 윤곽**으로 — 네모로 그리면 남의 빈 자리를 물어 소속이 흐려진다. */
  const groups: GroupDef[] = groupDefs
    .map((g, i): GroupDef | null => {
      const mine = g.members.map((m) => byId.get(m)).filter((n): n is NonNullable<typeof n> => !!n);
      if (!mine.length) return null;
      const pad = size;
      const x = Math.min(...mine.map((n) => n.x)) - pad;
      const y = Math.min(...mine.map((n) => n.y)) - pad;
      return {
        id: g.id,
        label: g.label,
        color: GROUP_COLORS[i % GROUP_COLORS.length],
        shape: 'hull' as const,
        bbox: {
          x: Math.round(x),
          y: Math.round(y),
          w: Math.round(Math.max(...mine.map((n) => n.x)) + pad - x),
          h: Math.round(Math.max(...mine.map((n) => n.y)) + pad - y),
        },
      };
    })
    .filter((g): g is GroupDef => !!g);

  return {
    version: 1,
    _meta: {},
    groups,
    lanes,
    nodes,
    edges,
    ephemeral_anchors: [],
    _edge_kinds: {
      need: { color: '#475569', width: 1.4, style: 'solid', arrow: true },
      open: { color: '#22c55e', width: 1.6, style: 'solid', arrow: true },
      also: { color: '#33415580', width: 1, style: 'dotted', arrow: false },
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
  canvas.setSpec(toGraphSpec(layout, opts.size ?? 64, opts.laneLabels ?? [], opts.groups ?? []));
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
  /**
   * 카메라. 두 가지를 조심한다.
   *  ① 한 노드에 맞추면 배율이 튄다 → 일정 크기 창을 잡는다.
   *  ② 칸이 적은 지도를 「전부 맞춤」 하면 이번엔 **너무 확대**된다(7칸짜리가 화면을 가득 채운다).
   *     그래서 최소 창 크기를 정해 배율 상한을 만든다.
   *  ③ 자리 계산은 CSS 가 붙은 뒤라야 맞다 → 다음 프레임에 한 번 더 맞춘다.
   */
  /* 창의 최소 크기 = 배율 상한. 작게 잡으면 6칸짜리 지도가 텅 비어 보이고, 크게 잡으면 글자가 커진다. */
  const MIN_W = opts.fitAll ? 820 : 1180;
  const MIN_H = opts.fitAll ? 420 : 680;
  const aim = (): void => {
    const focus = opts.fitAll ? undefined : opts.focusId ? layout.nodes.find((n) => n.id === opts.focusId) : undefined;
    if (focus) {
      canvas.fitToWorldRect({ x: focus.x - MIN_W / 2, y: focus.y - MIN_H / 2, w: MIN_W, h: MIN_H }, 20);
      return;
    }
    const xs = layout.nodes.map((n) => n.x);
    const ys = layout.nodes.map((n) => n.y);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const w = Math.max(MIN_W, Math.max(...xs) - x0);
    const h = Math.max(MIN_H, Math.max(...ys) - y0);
    const cx = x0 + (Math.max(...xs) - x0) / 2;
    const cy = y0 + (Math.max(...ys) - y0) / 2;
    canvas.fitToWorldRect({ x: cx - w / 2, y: cy - h / 2, w, h }, 40);
  };
  aim();
  requestAnimationFrame(aim);

  return () => {
    host.innerHTML = '';
  };
}
