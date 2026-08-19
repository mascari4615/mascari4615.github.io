/**
 * 작은 mermaid — 글로 적은 그림을 그린다 (TASK-KL-316 / 10)
 *
 * 왜 직접 그리나: 이 저장소는 `vendor/mermaid.min.js` 를 **가리키기만 하고 갖고 있지 않다**
 * (`docs` 위젯이 그 경로를 부르는데 파일이 없다 — 그래서 문서의 그림은 지금 안 뜬다).
 * 진짜 mermaid 는 3MB 가 넘는다. 우리가 쓰는 건 **흐름도와 표 관계** 둘이라,
 * 그 둘만 여기서 읽고 SVG 로 그린다. 저장소가 안 무거워지고, 인터넷도 필요 없다.
 *
 * 그리는 법은 **층 나누기**다: 화살표를 따라 깊이를 매기고(위상 순서), 같은 깊이를 한 줄에 놓는다.
 * 예쁜 자동 배치를 흉내 내지 않는다 — 「누가 누구를 가리키나」가 보이면 그림의 할 일은 끝이다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'mermaidlite',
  ops: {
    svg: {
      desc: 'Draw a mermaid flowchart or erDiagram as an SVG (a small built-in subset, no external library).',
      in: { text: 'string', dark: 'boolean?' },
      out: 'string'
    },
    check: {
      desc: 'Check a mermaid diagram and report what was understood: kind, nodes, edges, and unknown lines.',
      in: { text: 'string' },
      out: 'string'
    }
  }
};

export type Kind = 'flowchart' | 'er' | 'unknown';
export type Dir = 'TD' | 'LR';

export interface Node {
  id: string;
  label: string;
  /** 네모 · 둥근 네모 · 마름모 · 원 */
  shape: 'box' | 'round' | 'diamond' | 'circle';
  /** 표 관계에서 쓰는 칸 목록 */
  fields?: string[];
}

export interface Edge {
  from: string;
  to: string;
  label?: string;
  dashed?: boolean;
}

/**
 * `subgraph` 묶음 (TASK-KL-326).
 *
 * 여태 `subgraph`·`end` 를 「못 읽은 줄」로 버렸다. 그런데 그 줄이 버려지면 **소속이
 * 통째로 사라진다** — `docs/ROADMAP.md` 의 그림은 「어느 것이 글쓴이 쪽이고 어느 것이
 * 브라우저 쪽인가」가 요점인데, 남는 것은 화살표뿐이었다.
 */
export interface Group {
  id: string;
  label: string;
  /** 이 묶음 안에 적힌 마디들 (글에 나온 차례). */
  members: string[];
}

export interface Diagram {
  kind: Kind;
  dir: Dir;
  nodes: Node[];
  edges: Edge[];
  /** `subgraph` 묶음. 흐름도에만 나온다. */
  groups: Group[];
  /** 못 읽은 줄 — 숨기지 않고 돌려준다 */
  unknown: string[];
}

const clean = (s: string): string => s.trim().replace(/^["']|["']$/g, '');

/** `A[글]` · `B(둥근)` · `C{마름모}` · `D((원))` · `E` */
function readNode(raw: string): Node {
  const text = raw.trim();
  const m = /^([\w가-힣.\-]+)\s*(\(\(|\[|\(|\{)([^\])}]*)(\)\)|\]|\)|\})$/.exec(text);
  if (m === null) return { id: text, label: text, shape: 'box' };
  const open = m[2];
  const shape: Node['shape'] = open === '((' ? 'circle' : open === '[' ? 'box' : open === '(' ? 'round' : 'diamond';
  return { id: m[1], label: clean(m[3]) === '' ? m[1] : clean(m[3]), shape };
}

export function parse(text: string): Diagram {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('%%'));
  const out: Diagram = { kind: 'unknown', dir: 'TD', nodes: [], edges: [], groups: [], unknown: [] };
  if (lines.length === 0) return out;

  const head = lines[0].toLowerCase();
  if (head.startsWith('erdiagram')) out.kind = 'er';
  else if (head.startsWith('flowchart') || head.startsWith('graph')) {
    out.kind = 'flowchart';
    out.dir = /\blr\b|\brl\b/i.test(lines[0]) ? 'LR' : 'TD';
  } else return out;

  const seen = new Map<string, Node>();
  const put = (node: Node): Node => {
    const had = seen.get(node.id);
    if (had === undefined) {
      seen.set(node.id, node);
      out.nodes.push(node);
      return node;
    }
    if (had.label === had.id && node.label !== node.id) had.label = node.label;
    if (had.shape === 'box' && node.shape !== 'box') had.shape = node.shape;
    return had;
  };

  if (out.kind === 'er') {
    let current: Node | undefined;
    for (const line of lines.slice(1)) {
      if (line === '}') {
        current = undefined;
        continue;
      }
      if (current !== undefined) {
        /* 표 안의 칸: `INT id PK` */
        const parts = line.split(/\s+/);
        if (parts.length >= 2) (current.fields ??= []).push(parts[1] + ' : ' + parts[0] + (parts[2] === undefined ? '' : '  ' + parts[2]));
        else if (line !== '') (current.fields ??= []).push(line);
        continue;
      }
      const block = /^([\w가-힣_]+)\s*\{$/.exec(line);
      if (block !== null) {
        current = put({ id: block[1], label: block[1], shape: 'box', fields: [] });
        continue;
      }
      const rel = /^([\w가-힣_]+)\s+([|}{o<>-]+)\s+([\w가-힣_]+)\s*:\s*(.*)$/.exec(line);
      if (rel !== null) {
        put({ id: rel[1], label: rel[1], shape: 'box' });
        put({ id: rel[3], label: rel[3], shape: 'box' });
        out.edges.push({ from: rel[1], to: rel[3], label: clean(rel[4]) });
        continue;
      }
      out.unknown.push(line);
    }
    return out;
  }

  /* 묶음은 겹쳐 적을 수 있다(`subgraph` 안의 `subgraph`) — 그래서 쌓아 두고, 마디가 나오면
     **가장 안쪽 묶음**에 넣는다. 닫는 `end` 가 모자라거나 남아도 터지지 않는다. */
  const openGroups: Group[] = [];

  for (const line of lines.slice(1)) {
    /* `subgraph 아이디 [보이는 이름]` · `subgraph 이름` 둘 다 받는다. */
    const sub = /^subgraph\s+([^\[\]]+?)(?:\s*\[([^\]]*)\])?\s*$/i.exec(line);
    if (sub !== null) {
      const id = clean(sub[1]);
      const group: Group = { id, label: sub[2] === undefined ? id : clean(sub[2]), members: [] };
      out.groups.push(group);
      openGroups.push(group);
      continue;
    }
    if (/^end$/i.test(line)) {
      openGroups.pop();
      continue;
    }
    if (/^(classDef|class |click |style )/i.test(line)) {
      out.unknown.push(line);
      continue;
    }
    /* `A --> B` · `A -->|글| B` · `A -.-> B` · `A --- B` */
    /* 이 마디가 지금 열려 있는 묶음 안에 적혔다면 그 묶음의 것이다. 같은 마디가 두 번
       적혀도 한 번만 센다(`A --> B` 와 `B --> C` 에 B 가 둘 다 나온다). */
    const join = (id: string): void => {
      const group = openGroups[openGroups.length - 1];
      if (group !== undefined && group.members.includes(id) === false) group.members.push(id);
    };

    const arrow = /^(.+?)\s*(-\.->|-->|---|-\.-)\s*(?:\|([^|]*)\|\s*)?(.+)$/.exec(line);
    if (arrow !== null) {
      const from = put(readNode(arrow[1]));
      const to = put(readNode(arrow[4]));
      join(from.id);
      join(to.id);
      out.edges.push({ from: from.id, to: to.id, label: arrow[3] === undefined ? undefined : clean(arrow[3]), dashed: arrow[2].includes('.') });
      continue;
    }
    if (/^[\w가-힣.\-]+\s*(\(\(|\[|\(|\{)/.test(line) || /^[\w가-힣.\-]+$/.test(line)) {
      join(put(readNode(line)).id);
      continue;
    }
    out.unknown.push(line);
  }
  return out;
}

/* ── 층 나누기 ─────────────────────────────────────────────────────── */

/** 화살표를 따라 깊이를 매긴다. 고리가 있으면 거기서 멈춘다(무한히 안 돈다). */
export function levels(diagram: Diagram): string[][] {
  const depth = new Map<string, number>();
  const incoming = new Map<string, number>();
  for (const n of diagram.nodes) incoming.set(n.id, 0);
  for (const e of diagram.edges) incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);

  const queue = diagram.nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0).map((n) => n.id);
  /* 고리뿐이면 시작점이 없다 — 그럴 땐 첫 마디를 시작점으로 삼는다 */
  if (queue.length === 0 && diagram.nodes.length > 0) queue.push(diagram.nodes[0].id);
  for (const id of queue) depth.set(id, 0);

  const left = new Map(incoming);
  const order = [...queue];
  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    for (const e of diagram.edges) {
      if (e.from !== id) continue;
      const now = (left.get(e.to) ?? 0) - 1;
      left.set(e.to, now);
      depth.set(e.to, Math.max(depth.get(e.to) ?? 0, (depth.get(id) ?? 0) + 1));
      if (now <= 0 && !order.includes(e.to)) order.push(e.to);
    }
  }
  /* 고리 때문에 못 들어간 마디도 자리를 준다 — 안 그리면 그림이 거짓말이 된다 */
  for (const n of diagram.nodes) if (!depth.has(n.id)) depth.set(n.id, 0);

  const rows: string[][] = [];
  for (const n of diagram.nodes) {
    const d = depth.get(n.id) ?? 0;
    (rows[d] ??= []).push(n.id);
  }
  return rows.filter((r) => r !== undefined);
}

/* ── 그리기 ────────────────────────────────────────────────────────── */

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 한글은 한 글자가 두 칸이다 — 글자 수로만 재면 상자가 글을 못 담는다. */
function textWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += /[ᄀ-ᇿ　-鿿가-힣＀-￯]/.test(ch) ? 15 : 8;
  return w;
}

export interface DrawOpts {
  dark?: boolean;
  gapX?: number;
  gapY?: number;
}

export function toSvg(diagram: Diagram, opts: DrawOpts = {}): string {
  const ink = opts.dark === true ? '#e8eaf0' : '#1b1e24';
  const line = opts.dark === true ? '#8a93a6' : '#5b6474';
  const fill = opts.dark === true ? '#232833' : '#ffffff';
  const gapX = opts.gapX ?? 40;
  const gapY = opts.gapY ?? 70;
  const padding = 24;

  const rows = levels(diagram);
  const size = new Map<string, { w: number; h: number }>();
  for (const n of diagram.nodes) {
    const rowsIn = [n.label, ...(n.fields ?? [])];
    const w = Math.max(90, ...rowsIn.map((r) => textWidth(r) + 28));
    const h = n.fields === undefined || n.fields.length === 0 ? 44 : 30 + n.fields.length * 18 + 10;
    size.set(n.id, { w, h });
  }

  const at = new Map<string, { x: number; y: number; w: number; h: number }>();
  let y = padding;
  let widest = 0;
  const vertical = diagram.dir === 'TD';
  rows.forEach((row) => {
    let x = padding;
    let tallest = 0;
    for (const id of row) {
      const s = size.get(id) ?? { w: 90, h: 44 };
      at.set(id, { x, y, w: s.w, h: s.h });
      x += s.w + gapX;
      tallest = Math.max(tallest, s.h);
    }
    widest = Math.max(widest, x - gapX + padding);
    y += tallest + gapY;
  });

  if (!vertical) {
    /* 옆으로 놓기 = 층을 x 로 돌린다 (같은 셈을 두 번 안 쓴다) */
    const flipped = new Map<string, { x: number; y: number; w: number; h: number }>();
    let cx = padding;
    rows.forEach((row) => {
      let cy = padding;
      let colWidth = 0;
      for (const id of row) {
        const s = size.get(id) ?? { w: 90, h: 44 };
        flipped.set(id, { x: cx, y: cy, w: s.w, h: s.h });
        cy += s.h + gapX;
        colWidth = Math.max(colWidth, s.w);
      }
      cx += colWidth + gapY;
    });
    at.clear();
    for (const [k, v] of flipped) at.set(k, v);
    widest = Math.max(...[...at.values()].map((p) => p.x + p.w)) + padding;
    y = Math.max(...[...at.values()].map((p) => p.y + p.h)) + padding;
  }

  const width = Math.max(240, widest);
  const height = Math.max(120, y);
  const parts: string[] = [];
  parts.push(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" width="' + width + '" height="' + height + '" font-family="system-ui, sans-serif" font-size="13">'
  );
  parts.push(
    '<defs><marker id="mlArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
      '<path d="M0 0 L10 5 L0 10 z" fill="' + line + '"/></marker></defs>'
  );

  for (const e of diagram.edges) {
    const a = at.get(e.from);
    const b = at.get(e.to);
    if (a === undefined || b === undefined) continue;
    const x1 = a.x + a.w / 2;
    const y1 = a.y + a.h;
    const x2 = b.x + b.w / 2;
    const y2 = b.y;
    const dash = e.dashed === true ? ' stroke-dasharray="5 4"' : '';
    const midY = (y1 + y2) / 2;
    const path = 'M' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + midY + ', ' + x2 + ' ' + midY + ', ' + x2 + ' ' + y2;
    parts.push('<path d="' + path + '" fill="none" stroke="' + line + '" stroke-width="1.4"' + dash + ' marker-end="url(#mlArrow)"/>');
    if (e.label !== undefined && e.label !== '') {
      parts.push(
        '<text x="' + (x1 + x2) / 2 + '" y="' + (midY - 4) + '" fill="' + line + '" text-anchor="middle" font-size="11">' + esc(e.label) + '</text>'
      );
    }
  }

  for (const n of diagram.nodes) {
    const p = at.get(n.id);
    if (p === undefined) continue;
    if (n.shape === 'diamond') {
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2;
      parts.push(
        '<polygon points="' + cx + ',' + p.y + ' ' + (p.x + p.w) + ',' + cy + ' ' + cx + ',' + (p.y + p.h) + ' ' + p.x + ',' + cy + '" fill="' + fill + '" stroke="' + line + '" stroke-width="1.4"/>'
      );
    } else if (n.shape === 'circle') {
      parts.push('<ellipse cx="' + (p.x + p.w / 2) + '" cy="' + (p.y + p.h / 2) + '" rx="' + p.w / 2 + '" ry="' + p.h / 2 + '" fill="' + fill + '" stroke="' + line + '" stroke-width="1.4"/>');
    } else {
      const round = n.shape === 'round' ? 16 : 6;
      parts.push('<rect x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="' + p.h + '" rx="' + round + '" fill="' + fill + '" stroke="' + line + '" stroke-width="1.4"/>');
    }
    const hasFields = n.fields !== undefined && n.fields.length > 0;
    parts.push(
      '<text x="' + (p.x + p.w / 2) + '" y="' + (p.y + (hasFields ? 20 : p.h / 2 + 4)) + '" fill="' + ink + '" text-anchor="middle" font-weight="600">' + esc(n.label) + '</text>'
    );
    if (hasFields) {
      parts.push('<line x1="' + p.x + '" y1="' + (p.y + 28) + '" x2="' + (p.x + p.w) + '" y2="' + (p.y + 28) + '" stroke="' + line + '" stroke-width="1"/>');
      (n.fields ?? []).forEach((f, i) => {
        parts.push('<text x="' + (p.x + 10) + '" y="' + (p.y + 46 + i * 18) + '" fill="' + ink + '" font-size="12">' + esc(f) + '</text>');
      });
    }
  }

  parts.push('</svg>');
  return parts.join('\n');
}

export function check(diagram: Diagram): string {
  if (diagram.kind === 'unknown') return '첫 줄이 `flowchart TD` · `graph LR` · `erDiagram` 중 하나여야 합니다.';
  const rows = [
    (diagram.kind === 'er' ? '표 관계' : '흐름도 (' + diagram.dir + ')') + ' · 마디 ' + diagram.nodes.length + '개 · 이어짐 ' + diagram.edges.length + '개'
  ];
  if (diagram.unknown.length > 0) {
    rows.push('');
    rows.push('아직 못 읽는 줄 ' + diagram.unknown.length + '개 (그림에서 빠집니다):');
    for (const u of diagram.unknown.slice(0, 8)) rows.push('  ' + u);
  }
  return rows.join('\n');
}

export const run: ToolRunner = (op, args) => {
  const diagram = parse(String(args.text ?? ''));
  if (op === 'svg') return toSvg(diagram, { dark: args.dark === true });
  if (op === 'check') return check(diagram);
  throw new Error('mermaidlite: 모르는 연산 ' + op);
};
