/**
 * lib/graph/canvas-leaders.ts — **딸린 쪽지를 주인에게 잇는 실선** (2026-08-12 분리).
 *
 * 어떤 카드는 혼자 서 있는 게 아니라 **다른 카드나 선에 딸려 있다**(`attachedTo`). 그 딸림은
 * 눈에 안 보이면 없는 것과 같아서, 가운데에서 가운데로 가는 가는 실을 그어 준다.
 *
 * 캔버스 본체(줄 상한 1900)에서 떼어 냈다. 본체가 아는 것들(어느 카드가 보이나 · 상자가 어디냐 ·
 * 선의 곡선이 어떻게 생겼나)은 **ctx 로 받는다** — 묶음 그리기(`canvas-group`)와 같은 결이다.
 */
import { buildLeaderLine } from './canvas-edge';
import type { GraphEdge, GraphNode } from './spec';

export interface LeaderCtx {
  /** 지금 화면에 남아 있는 카드 — 걸러진 카드에는 실을 안 긋는다(주인 없는 실이 남는다). */
  shown: Set<string>;
  box: (nodeId: string) => { x: number; y: number; w: number; h: number } | null;
  /** `node:xxx` 같은 가리킴을 카드 id 로. */
  nodeRef: (ref: string) => string;
  edges: GraphEdge[];
  /** 선 위의 한 점 — 주인이 카드가 아니라 **선**일 때 그 선의 어디에 붙일지. */
  edgePoint: (edge: GraphEdge, t: number) => { x: number; y: number } | null;
  color: (kind: string) => string;
  layer: SVGGElement;
}

/** 실은 **선 층의 맨 밑**에 깔린다 — 카드·선을 가리면 안 된다. */
export function renderLeaders(nodes: GraphNode[], ctx: LeaderCtx): void {
  for (const n of nodes) {
    const targetId = n.attachedTo;
    if (!targetId || !ctx.shown.has(n.id)) continue;
    const from = ctx.box(n.id);
    if (!from) continue;

    const targetNode = ctx.box(ctx.nodeRef(targetId));
    let to: { x: number; y: number } | null = targetNode
      ? { x: targetNode.x + targetNode.w / 2, y: targetNode.y + targetNode.h / 2 }
      : null;
    if (!to) {
      const edge = ctx.edges.find((x) => x.id === targetId);
      to = edge ? ctx.edgePoint(edge, edge.labelPos ?? 0.5) : null;
    }
    if (!to) continue;

    ctx.layer.insertBefore(
      buildLeaderLine({ x: from.x + from.w / 2, y: from.y + from.h / 2 }, to, ctx.color(n.kind)),
      ctx.layer.firstChild,
    );
  }
}
