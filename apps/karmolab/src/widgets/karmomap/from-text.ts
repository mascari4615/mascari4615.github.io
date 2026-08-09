/**
 * from-text.ts — 글로 관계도 만들기 (TASK-KL-202 격차 O).
 *
 * 사람은 관계를 **먼저 글로** 적어 둔다 — 메모장의 인물 목록, 위키의 개요. 그걸 손으로
 * 하나씩 다시 놓게 하는 건 도구가 할 일을 사람에게 미루는 것이다. Markmap 계열이 증명한 대로
 * **들여쓰기 하나면 계층이 다 들어간다**.
 *
 * 문법 (일부러 작게):
 *   욘                     ← 뿌리
 *     링 : 부하            ← 들여쓰면 위 줄에 이어진다. 콜론 뒤는 그 선에 붙는 말
 *     알리사 : 부하
 *   마을                   ← 다시 뿌리
 *   욘 -> 마을 : 지킨다    ← 화살표 줄 = **옆으로 난 관계**(트리로는 못 적는 것)
 *
 * 목록 기호(-, *, •)와 마크다운 제목(#)은 벗겨 낸다.
 *
 * 좌표는 **계층 트리**로 잡는다. 일반 그래프 자동 배치와 달리 트리 배치는 결정적이라
 * 「어디에 놓일지」가 예측 가능하다.
 */

export interface TextNode {
  id: string;
  label: string;
  depth: number;
  parent: string | null;
  /** 부모와 이어지는 선에 붙일 말. */
  edgeLabel?: string;
}

/** 줄 앞 공백 폭. 탭은 2칸으로 센다. */
function indentOf(line: string): number {
  const m = /^[\t ]*/.exec(line)?.[0] ?? '';
  return m.replace(/\t/g, '  ').length;
}

function stripBullet(s: string): string {
  return s.replace(/^\s*(?:[-*•]|#{1,6})\s*/, '').trim();
}

/**
 * 글 → 노드 목록. 부모는 **자기보다 들여쓰기가 적은 가장 가까운 윗줄**이다.
 * 빈 줄은 흐름을 끊지 않는다(사람이 문단을 나누는 방식을 막지 않으려고).
 */
export interface TextLink {
  /** 이름으로 가리킨다 — 글에서는 사람이 id 를 모른다. */
  from: string;
  to: string;
  label?: string;
}

export interface OutlineDoc {
  nodes: TextNode[];
  /** 트리 밖 관계 — `욘 -> 링 : 라이벌` 처럼 **옆으로 난** 선 (Graphviz dot 계보). */
  links: TextLink[];
}

/** `A -> B : 라벨` / `A → B` — 화살표 줄인가? 아니면 null. */
function parseArrowLine(body: string): TextLink | null {
  const m = /^(.+?)\s*(?:->|→|=>)\s*(.+)$/.exec(body);
  if (!m) return null;
  const from = m[1].trim();
  const rest = m[2];
  const [toRaw, ...labelRest] = rest.split(':');
  const to = toRaw.trim();
  if (!from || !to) return null;
  return { from, to, label: labelRest.join(':').trim() || undefined };
}

export function parseOutline(text: string): OutlineDoc {
  const out: TextNode[] = [];
  const links: TextLink[] = [];
  const stack: { indent: number; id: string }[] = [];
  let n = 0;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim()) continue;
    const indent = indentOf(line);
    const body = stripBullet(line);
    if (!body) continue;
    // 화살표 줄은 **계층이 아니라 관계**다 — 들여쓰기 트리로는 옆으로 난 선을 못 적는다.
    const arrow = parseArrowLine(body);
    if (arrow) { links.push(arrow); continue; }
    const [labelRaw, ...rest] = body.split(':');
    const label = labelRaw.trim();
    if (!label) continue;
    const edgeLabel = rest.join(':').trim() || undefined;

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack.length > 0 ? stack[stack.length - 1].id : null;
    n += 1;
    const id = `t${n}`;
    out.push({ id, label, depth: stack.length, parent, edgeLabel });
    stack.push({ indent, id });
  }
  return { nodes: out, links };
}

/**
 * 계층 트리 좌표. 깊이 → x, 잎 순서 → y. 부모는 자식들의 한가운데로 올린다
 * (그래야 「누가 누구 밑인지」가 선을 따라가지 않아도 읽힌다).
 */
export function layoutTree(
  nodes: TextNode[],
  opts: { colW: number; rowH: number; originX: number; originY: number }
): Map<string, { x: number; y: number }> {
  const childrenOf = new Map<string, string[]>();
  for (const n of nodes) {
    if (!n.parent) continue;
    const list = childrenOf.get(n.parent) ?? [];
    list.push(n.id);
    childrenOf.set(n.parent, list);
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const pos = new Map<string, { x: number; y: number }>();
  let row = 0;

  const place = (id: string): number => {
    const kids = childrenOf.get(id) ?? [];
    const node = byId.get(id);
    const x = opts.originX + (node?.depth ?? 0) * opts.colW;
    if (kids.length === 0) {
      const y = opts.originY + row * opts.rowH;
      row += 1;
      pos.set(id, { x, y });
      return y;
    }
    const ys = kids.map((k) => place(k));
    const y = (ys[0] + ys[ys.length - 1]) / 2;
    pos.set(id, { x, y });
    return y;
  };

  for (const n of nodes) if (!n.parent) place(n.id);
  return pos;
}
