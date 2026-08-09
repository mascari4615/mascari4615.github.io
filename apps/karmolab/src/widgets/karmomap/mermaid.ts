/**
 * mermaid.ts — 관계도를 **문서에 붙일 수 있는 글**로 (TASK-KL-202, Mermaid 계보).
 *
 * 그림 파일은 문서에 넣는 순간 죽는다 — 고치려면 원본 도구로 돌아가야 하고, 보통 안 돌아간다.
 * Mermaid 는 코드블록 안 **글이 곧 그림**이라 깃허브·이 저장소 memo 에서 그대로 렌더되고,
 * 나중에 한 줄만 고쳐도 그림이 따라 바뀐다.
 *
 * 담을 수 없는 것(자리·색·꼬리표·칸)은 버린다 — Mermaid 의 값은 **관계의 뼈대**를 옮기는 것이지
 * 그림을 그대로 베끼는 것이 아니다(그건 SVG 내보내기가 한다).
 */
import type { GraphSpec } from '../../lib/graph/spec';

/** Mermaid 는 id 에 한글·공백·기호를 못 받는다 — 순서대로 짧은 딱지를 붙인다. */
function idMapOf(spec: GraphSpec): Map<string, string> {
  const out = new Map<string, string>();
  spec.nodes.forEach((n, i) => out.set(n.id, `n${i}`));
  return out;
}

/** 큰따옴표만 막으면 된다 — Mermaid 라벨은 `"..."` 안에서 대부분의 글자를 그대로 받는다. */
function label(text: string): string {
  return `"${(text || '(이름 없음)').replace(/"/g, "'")}"`;
}

export function toMermaid(spec: GraphSpec): string {
  const ids = idMapOf(spec);
  const lines = ['flowchart LR'];

  // 묶음 = subgraph. 소속이 있는 인물을 그 안에 적어 두면 문서에서도 진영이 읽힌다.
  const memberOf = (nodeId: string): string | undefined => {
    const n = spec.nodes.find((x) => x.id === nodeId);
    const gs = n?.groups ?? (n?.group ? [n.group] : []);
    return gs[0] || undefined;
  };
  const placed = new Set<string>();
  for (const g of spec.groups) {
    const members = spec.nodes.filter((n) => memberOf(n.id) === g.id);
    if (members.length === 0) continue;
    lines.push(`  subgraph ${label(g.label)}`);
    for (const n of members) {
      lines.push(`    ${ids.get(n.id)}[${label(n.label)}]`);
      placed.add(n.id);
    }
    lines.push('  end');
  }
  for (const n of spec.nodes) {
    if (placed.has(n.id)) continue;
    lines.push(`  ${ids.get(n.id)}[${label(n.label)}]`);
  }

  for (const e of spec.edges) {
    const from = ids.get(e.from.split(':')[0]);
    const to = ids.get(e.to.split(':')[0]);
    if (!from || !to) continue;
    const text = (e.label ?? '').trim();
    // 양쪽 화살표는 Mermaid 에 없다 — 화살표 없는 선(`---`)으로 두고 말만 남긴다.
    const link = e.arrowStart ? '---' : '-->';
    lines.push(text ? `  ${from} ${link}|${label(text)}| ${to}` : `  ${from} ${link} ${to}`);
  }

  return lines.join('\n');
}

/** 문서에 그대로 붙여 넣을 수 있게 코드블록까지 씌운 글. */
export function toMermaidBlock(spec: GraphSpec): string {
  return ['```mermaid', toMermaid(spec), '```', ''].join('\n');
}
