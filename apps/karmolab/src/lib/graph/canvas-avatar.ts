/**
 * lib/graph/canvas-avatar.ts — 노드의 **얼굴** (TASK-KL-202 방향① 해체 4조각).
 *
 * 관계도에서 「누구인지」는 글자보다 얼굴로 읽힌다. 얼굴은 셋 중 하나다: 이모지 · 색 원 · 사진.
 * 아무것도 안 정했으면 **이름 첫 글자**를 옅은 원에 넣는다 — 빈 자리보다 훨씬 빨리 읽힌다
 * (빈 상태도 설계 대상이다).
 *
 * 캔버스 본체에서 떼어 낸 이유: 이 조각은 `spec`·좌표·거르기를 **하나도 모른다**. 노드 하나와
 * 크기·색만 있으면 그려진다 — 그런 것이 남아 있으면 본체가 계속 부풀 뿐이다.
 */
import type { GraphNode } from './spec';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function buildNodeAvatar(
node: GraphNode,
effH: number,
kindColor: string,
centered: boolean,
theme: { nodeText: string },
/** 잘라내기 모양 id 앞머리 — 한 페이지에 캔버스가 둘이면 id 가 부딪힌다. */
uid = 'km',
): SVGGElement | null {
  const avatar = node.avatar;
  // 얼굴을 안 정했으면 **이름 첫 글자**를 옅은 원에 넣는다. 아무것도 없는 자리보다
  // 「누구인지」가 훨씬 빨리 읽힌다(빈 상태도 설계 대상이다).
  if (!avatar) {
    const initial = (node.label ?? '').trim().slice(0, 1);
    if (!initial) return null;
    const r0 = 11;
    const cx0 = centered ? node.w / 2 : 21;
    const cy0 = centered ? Math.max(r0 + 6, effH / 2 - 12) : effH / 2;
    const g0 = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    g0.setAttribute('pointer-events', 'none');
    const disc0 = document.createElementNS(SVG_NS, 'circle');
    disc0.setAttribute('cx', String(cx0));
    disc0.setAttribute('cy', String(cy0));
    disc0.setAttribute('r', String(r0));
    disc0.setAttribute('fill', kindColor + '22');
    disc0.setAttribute('stroke', kindColor + '55');
    disc0.setAttribute('stroke-width', '1');
    g0.appendChild(disc0);
    const t0 = document.createElementNS(SVG_NS, 'text');
    t0.setAttribute('x', String(cx0));
    t0.setAttribute('y', String(cy0 + 4));
    t0.setAttribute('text-anchor', 'middle');
    t0.setAttribute('font-size', '11');
    t0.setAttribute('font-weight', '600');
    // 글자는 종류 색을 그대로 쓴다 — 옅은 바탕 위라 대비가 충분하고, 색이 곧 종류 표시가 된다.
    t0.setAttribute('fill', kindColor);
    t0.setAttribute('font-family', 'var(--font-sans, system-ui, sans-serif)');
    t0.textContent = initial;
    g0.appendChild(t0);
    return g0;
  }
  const r = 12;
  const cx = centered ? node.w / 2 : 22;
  const cy = centered ? Math.max(r + 6, effH / 2 - 12) : effH / 2;

  const wrap = document.createElementNS(SVG_NS, 'g') as SVGGElement;
  wrap.setAttribute('pointer-events', 'none');

  if (avatar.kind === 'image') {
    const clipId = `ck-av-${uid}-${node.id}`;
    const defs = document.createElementNS(SVG_NS, 'defs');
    const clip = document.createElementNS(SVG_NS, 'clipPath');
    clip.setAttribute('id', clipId);
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', String(cx));
    circle.setAttribute('cy', String(cy));
    circle.setAttribute('r', String(r));
    clip.appendChild(circle);
    defs.appendChild(clip);
    wrap.appendChild(defs);

    const img = document.createElementNS(SVG_NS, 'image');
    img.setAttribute('x', String(cx - r));
    img.setAttribute('y', String(cy - r));
    img.setAttribute('width', String(r * 2));
    img.setAttribute('height', String(r * 2));
    img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    img.setAttribute('clip-path', `url(#${clipId})`);
    img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', avatar.value);
    img.setAttribute('href', avatar.value);
    wrap.appendChild(img);

    const ring = document.createElementNS(SVG_NS, 'circle');
    ring.setAttribute('cx', String(cx));
    ring.setAttribute('cy', String(cy));
    ring.setAttribute('r', String(r));
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', kindColor + '90');
    ring.setAttribute('stroke-width', '1.5');
    wrap.appendChild(ring);
    return wrap;
  }

  const disc = document.createElementNS(SVG_NS, 'circle');
  disc.setAttribute('cx', String(cx));
  disc.setAttribute('cy', String(cy));
  disc.setAttribute('r', String(r));
  disc.setAttribute('fill', avatar.kind === 'color' ? avatar.value : kindColor + '25');
  disc.setAttribute('stroke', kindColor + '70');
  disc.setAttribute('stroke-width', '1');
  wrap.appendChild(disc);

  if (avatar.kind === 'emoji') {
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', String(cx));
    t.setAttribute('y', String(cy + 5));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-size', '14');
    t.textContent = avatar.value;
    wrap.appendChild(t);
  }
  return wrap;
}
