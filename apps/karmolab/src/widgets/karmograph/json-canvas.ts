/**
 * json-canvas.ts — 남의 도구로 나가고 들어오는 길 (TASK-KL-202, [JSON Canvas](https://jsoncanvas.org/)).
 *
 * 우리 형식으로만 저장하면 이 도구를 그만 쓰는 날 그림도 같이 죽는다. JSON Canvas 는
 * Obsidian Canvas 가 열어 둔 형식이고 Kinopio 같은 도구가 이미 읽고 쓴다 — **나가는 문**이 있으면
 * 사람이 마음 놓고 여기에 세계관을 쌓는다.
 *
 * 맞바꿀 수 없는 것(꼬리표·칸·공용 글·묶음 모양·발표 순서)은 **글로 접어 넣는다** — 형식이 못 담는
 * 것을 조용히 버리면, 내보냈다 다시 읽었을 때 세계관이 야위어 있다.
 */
import type { GraphSpec, GraphNode } from '../../lib/graph/spec';
import { resolveDoc } from '../../lib/graph/notes';
import { t, loadNamespace } from '../../lib/i18n';

interface CanvasNode {
  id: string;
  type: 'text' | 'group';
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  label?: string;
  color?: string;
}

interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  label?: string;
}

export interface JsonCanvas {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

/** 노드 하나를 글 한 덩이로 — 첫 줄이 이름, 그 밑에 한마디·칸·설명. */
function nodeToText(spec: GraphSpec, n: GraphNode): string {
  const lines = [`# ${n.label || t('karmograph.noName')}`];
  if (n.note) lines.push(`_${n.note}_`);
  for (const [k, v] of Object.entries(n.fields ?? {})) lines.push(`- ${k}: ${v}`);
  if ((n.tags ?? []).length > 0) lines.push((n.tags ?? []).map((t) => `#${t}`).join(' '));
  const doc = resolveDoc(spec, n).trim();
  if (doc) lines.push('', doc);
  return lines.join('\n');
}

/** 숫자가 아니면 기본값 — 자료가 모자란 것과 못 내보내는 것은 다르다. */
const num = (v: unknown, fallback: number): number =>
  (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export function toJsonCanvas(spec: GraphSpec): JsonCanvas {
  return {
    nodes: [
      /* ★ 네모가 없는 묶음은 **내보낼 자리가 없다** — 건너뛴다.
         (없는 채로 읽다가 내보내기 자체가 터졌다: 실측 2026-08-14, 거친 판에서 JSON Canvas만 빨강.) */
      ...spec.groups.filter((g) => g.bbox).map((g): CanvasNode => ({
        id: g.id,
        type: 'group',
        x: Math.round(g.bbox.x),
        y: Math.round(g.bbox.y),
        width: Math.round(g.bbox.w),
        height: Math.round(g.bbox.h),
        label: g.label,
      })),
      /* 자리·크기가 안 적힌 카드도 있다. `Math.round(undefined)` 는 **NaN** 인데, NaN 이 든
         파일은 여는 쪽에서 조용히 깨진다(터지지도 않아 더 나쁘다) — 기본 자리로 채운다. */
      ...spec.nodes.map((n): CanvasNode => ({
        id: n.id,
        type: 'text',
        x: Math.round(num(n.x, 0)),
        y: Math.round(num(n.y, 0)),
        width: Math.round(num(n.w, 160)),
        height: Math.round(num(n.h, 44)),
        text: nodeToText(spec, n),
      })),
    ],
    edges: spec.edges.map((e): CanvasEdge => ({
      id: e.id,
      fromNode: e.from.split(':')[0],
      toNode: e.to.split(':')[0],
      label: e.label,
    })),
  };
}

/**
 * 남의 캔버스를 읽어 우리 스펙으로. 글 덩이의 **첫 줄이 이름**, `- 칸: 값` 은 칸,
 * `#꼬리표` 는 꼬리표, 나머지는 설명 — 우리가 내보낸 모양을 그대로 되읽을 수 있게 맞춘다.
 */
export function fromJsonCanvas(raw: unknown, base: GraphSpec): GraphSpec {
  const src = raw as Partial<JsonCanvas> | null;
  if (!src || !Array.isArray(src.nodes)) throw new Error(t('karmograph.err.428'));

  const nodes: GraphNode[] = [];
  const groups = [...base.groups];
  for (const cn of src.nodes) {
    if (cn.type === 'group') {
      groups.push({
        id: cn.id,
        label: cn.label ?? t('karmograph.groups.msg'),
        color: '#94a3b8',
        bbox: { x: cn.x, y: cn.y, w: cn.width, h: cn.height },
        shape: 'box',
      });
      continue;
    }
    const lines = (cn.text ?? '').split(/\r?\n/);
    const label = (lines.shift() ?? '').replace(/^#\s*/, '').trim();
    const fields: Record<string, string> = {};
    const tags: string[] = [];
    const rest: string[] = [];
    for (const line of lines) {
      const field = /^-\s*([^:]+):\s*(.*)$/.exec(line);
      if (field) { fields[field[1].trim()] = field[2].trim(); continue; }
      if (/^#\S/.test(line.trim())) { tags.push(...line.trim().split(/\s+/).map((t) => t.replace(/^#/, ''))); continue; }
      rest.push(line);
    }
    nodes.push({
      id: cn.id,
      kind: base.nodes[0]?.kind ?? 'person',
      label: label || t('karmograph.noName'),
      group: '',
      x: cn.x, y: cn.y, w: cn.width, h: cn.height,
      ports: [],
      doc: rest.join('\n').trim() || undefined,
      fields: Object.keys(fields).length > 0 ? fields : undefined,
      tags: tags.length > 0 ? tags : undefined,
    });
  }

  return {
    ...base,
    groups,
    nodes,
    edges: (src.edges ?? []).map((e) => ({
      id: e.id,
      from: e.fromNode,
      to: e.toNode,
      kind: Object.keys(base._edge_kinds)[0] ?? 'rel',
      label: e.label,
    })),
  };
}
