/**
 * lib/graph/canvas-group.ts — 묶음 그리기 (TASK-KL-202 방향① 해체 7조각).
 *
 * 묶음은 「누가 한편인가」를 눈으로 말하는 자리다. 캔버스 본체에서 떼어 내며 **그리는 순서 규약**을
 * 파일 머리에 못 박았다 — 이 규약이 깨지면 「만들었는데 안 보이는 묶음」이 생긴다.
 */
import type { GroupDef } from './spec';

const SVG_NS = 'http://www.w3.org/2000/svg';
const GROUP_HEADER_H = 20;

export interface GroupRenderCtx {
/** 그릴 자리. */
layer: SVGGElement;
/** 이 캔버스 고유 딱지 — 한 페이지에 캔버스가 둘이면 clipPath id 가 부딪힌다. */
uid: string;
/** 묶음의 상자(멤버를 감싼 자리). */
boxOf: (g: GroupDef) => { x: number; y: number; w: number; h: number };
/** 윤곽 모양일 때의 경로(멤버 2 이하면 null → 네모로 그린다). */
hullOf: (g: GroupDef) => string | null;
}

/**
 * 묶음(진영·장소·팀)을 그린다. 규약 둘을 파일에 박아 둔다:
 *  1. **큰 묶음부터** 그린다 — SVG 는 먼저 그린 것이 아래에 깔린다. 반대로 하면 작은 묶음이
 *     통째로 가려져 「분명 만들었는데 안 보인다」가 된다(겹치는 묶음은 흔하다).
 *  2. 이름표가 겹치면 **아래로 한 칸씩** 내린다 — 겹친 묶음들의 머리는 같은 높이에 몰린다.
 */
export function renderGroups(groups: GroupDef[], ctx: GroupRenderCtx): void {
  // ★ 큰 묶음부터 그린다. SVG 는 먼저 그린 것이 아래에 깔리므로, 큰 것을 먼저 깔아야
  //   작은 묶음이 큰 묶음 안에 얹힌 것처럼 보인다 — 반대로 하면 작은 묶음이 통째로 가려져
  //   「분명 만들었는데 안 보인다」가 된다(노드가 여러 묶음에 들면 겹침은 흔한 일이다).
  const boxes = groups
    .filter((g) => !g.hidden)
    .map((g) => ({ g, box: ctx.boxOf(g) }))
    .sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h);

  // 이름표가 서로 겹치면 아래로 한 칸씩 내린다 — 겹친 묶음들의 머리는 같은 높이에 몰린다.
  const labelRows: { x1: number; x2: number; y: number }[] = [];

  for (const { g, box } of boxes) {

    // ── 바디 — 네모 또는 멤버를 감싸는 윤곽 ──────────────────────────────
    const hullD = (g.shape ?? 'box') === 'hull' ? ctx.hullOf(g) : null;
    const body = document.createElementNS(SVG_NS, hullD ? 'path' : 'rect');
    body.setAttribute('class', 'ck-group');
    body.dataset.groupId = g.id;
    if (hullD) {
      body.setAttribute('d', hullD);
    } else {
      body.setAttribute('x', String(box.x));
      body.setAttribute('y', String(box.y));
      body.setAttribute('width', String(box.w));
      body.setAttribute('height', String(box.h));
      body.setAttribute('rx', '6');
    }
    body.setAttribute('fill', g.color + '10');
    body.setAttribute('stroke', g.color + '38');
    body.setAttribute('stroke-width', '1.4');
    body.setAttribute('stroke-linejoin', 'round');
    (body as SVGElement & { style: CSSStyleDeclaration }).style.cursor = 'grab';
    ctx.layer.appendChild(body);

    // ── 헤더 바 (Unity 스타일) — 네모 묶음일 때만. 윤곽 위에 네모 띠를 얹으면 어색하다.
    if (!hullD) {

    // clipPath 로 상단 rx 살리면서 헤더만 클리핑.
    // id 에 인스턴스 uid 를 섞는다 — 캔버스 2개가 같은 group id 를 쓰면 충돌.
    const clipId = `ck-clip-${ctx.uid}-${g.id}`;
    const clipPath = document.createElementNS(SVG_NS, 'clipPath');
    clipPath.setAttribute('id', clipId);
    const clipRect = document.createElementNS(SVG_NS, 'rect');
    clipRect.setAttribute('x', String(box.x));
    clipRect.setAttribute('y', String(box.y));
    clipRect.setAttribute('width', String(box.w));
    clipRect.setAttribute('height', String(GROUP_HEADER_H));
    clipRect.setAttribute('rx', '6');
    clipPath.appendChild(clipRect);
    ctx.layer.appendChild(clipPath);

    const headerRect = document.createElementNS(SVG_NS, 'rect');
    headerRect.setAttribute('class', 'ck-group');
    headerRect.dataset.groupId = g.id;
    headerRect.setAttribute('x', String(box.x));
    headerRect.setAttribute('y', String(box.y));
    headerRect.setAttribute('width', String(box.w));
    headerRect.setAttribute('height', String(GROUP_HEADER_H));
    headerRect.setAttribute('fill', g.color + '28');
    headerRect.setAttribute('clip-path', `url(#${clipId})`);
    headerRect.style.cursor = 'grab';
    ctx.layer.appendChild(headerRect);

    }

    // ── 헤더 레이블 ───────────────────────────────────────────────────────
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('class', 'ck-group-label');
    text.dataset.groupId = g.id;
    let labelY = box.y + GROUP_HEADER_H - 6;
    while (labelRows.some((r) => Math.abs(r.y - labelY) < 12 && r.x1 < box.x + box.w && box.x < r.x2)) {
      labelY += 14;
    }
    labelRows.push({ x1: box.x, x2: box.x + box.w, y: labelY });
    // 이름표는 손으로 옮길 수 있다 — 겹친 묶음에서 자동 회피만으로는 늘 부족하다.
    text.setAttribute('x', String(box.x + 8 + (g.labelDx ?? 0)));
    text.setAttribute('y', String(labelY + (g.labelDy ?? 0)));
    text.style.cursor = 'grab';
    text.setAttribute('pointer-events', 'all');
    text.setAttribute('fill', g.color + 'cc');
    text.setAttribute('font-size', '11');
    text.setAttribute('font-weight', '600');
    text.setAttribute('font-family', 'var(--font-sans, system-ui, sans-serif)');
    text.textContent = g.locked ? `🔒 ${g.label}` : g.label;
    ctx.layer.appendChild(text);
  }
}
