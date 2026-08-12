/**
 * lib/graph/canvas-dom.ts — 캔버스 **뼈대 만들기** (TASK-KL-202 방향① 해체 13조각).
 *
 * 여기서 정해지는 것은 「무엇을 그리나」가 아니라 **어디에 그리나**다: svg 한 장, 그 안의 층 셋,
 * 배경 무늬, 미니맵. 층 순서가 곧 가려짐 순서라 이 파일이 그림의 앞뒤를 결정한다.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const MINIMAP_W = 200;
const MINIMAP_H = 150;
const BG_CELL = 32;

export interface CanvasDom {
  svg: SVGSVGElement;
  world: SVGGElement;
  groupLayer: SVGGElement;
  edgeLayer: SVGGElement;
  nodeLayer: SVGGElement;
  bgRect: SVGRectElement;
  minimapSvg: SVGSVGElement;
  minimapViewport: SVGRectElement;
}

/**
 * 캔버스 뼈대를 만든다 — svg · 층 셋(묶음/선/노드) · 배경 무늬 · 미니맵.
 * 층 순서가 곧 **가려짐 순서**다: 묶음이 맨 아래, 그 위에 선, 맨 위에 노드.
 */
export function buildCanvasDom(
  container: HTMLElement,
  uid: string,
  theme: { minimapBg: string; minimapBorder: string; edgeDefaultColor: string },
): CanvasDom {
    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.style.width = '100%';
    container.style.height = '100%';
    // 배경 = 부모(KarmoLab) 상속. --ck-canvas-bg 로 커스텀 가능.
    container.style.background = 'var(--ck-canvas-bg, transparent)';

    // 메인 SVG
    const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    // touch-action:none — 안 주면 브라우저가 손가락 끌기를 「페이지 스크롤」로 먼저 먹어서
    // 터치 기기에서 노드가 안 끌린다(마우스로만 되니 개발 중엔 안 보인다).
    // color — 배경 무늬가 currentColor 를 쓴다. 테마 글자색을 따라가야 밝은/어두운 판 둘 다 산다.
    // ★ absolute inset:0 — `height:100%` 는 부모가 **높이를 지정했을 때만** 먹는다.
    //   부모가 flex 나 min-height 로 커진 경우엔 % 기준이 없어 svg 가 내용 높이(작게)로 남고,
    //   아랫부분을 눌러도 클릭이 svg 에 안 닿는다 — 화면은 멀쩡해 보이는데 아래쪽만 죽는다
    //   (실측 2026-08-09: 캔버스 420px 인데 svg 는 그보다 짧아 하단 더블클릭이 무시됐다).
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;cursor:grab;touch-action:none;color:var(--text-primary,#cbd5e1);';
    svg.setAttribute('xmlns', SVG_NS);

    // defs (마커·필터) — id 는 전역 고정. 캔버스가 여러 개여도 정의가 동일하므로
    // url(#ck-glow) 가 어느 쪽을 잡아도 결과가 같다 (CSS 가 이 id 를 참조한다).
    const defs = document.createElementNS(SVG_NS, 'defs');
    defs.innerHTML = `
      <marker id="ck-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <path d="M0,0 L0,6 L6,3 z" fill="${theme.edgeDefaultColor}"/>
      </marker>
      <!-- 출발 쪽 화살표. SVG2 의 orient="auto-start-reverse" 로 마커 하나를 돌려 쓸 수도 있지만,
           그 값을 안 받는 렌더러에선 화살표가 뒤집힌 채 조용히 나온다. 마커 하나 더가 싸다. -->
      <marker id="ck-arrow-start" markerWidth="6" markerHeight="6" refX="1" refY="3" orient="auto">
        <path d="M6,0 L6,6 L0,3 z" fill="${theme.edgeDefaultColor}"/>
      </marker>
      <filter id="ck-glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="3" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    `;
    // 배경 무늬 (TASK-KL-202 격차 I) — world 안이 아니라 화면에 깔고 patternTransform 으로
    // 같이 움직인다. world 안에 두면 무한 캔버스를 덮을 만큼 큰 사각형이 필요해진다.
    const pat = document.createElementNS(SVG_NS, 'g');
    pat.innerHTML = `
      <pattern id="ck-bg-dots-${uid}" width="${BG_CELL}" height="${BG_CELL}" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="1" fill="currentColor" opacity="0.30"/>
      </pattern>
      <pattern id="ck-bg-grid-${uid}" width="${BG_CELL}" height="${BG_CELL}" patternUnits="userSpaceOnUse">
        <path d="M ${BG_CELL} 0 L 0 0 0 ${BG_CELL}" fill="none" stroke="currentColor" stroke-width="1" opacity="0.16"/>
      </pattern>
      <pattern id="ck-bg-cross-${uid}" width="${BG_CELL}" height="${BG_CELL}" patternUnits="userSpaceOnUse">
        <path d="M ${BG_CELL / 2} ${BG_CELL / 2 - 3} v6 M ${BG_CELL / 2 - 3} ${BG_CELL / 2} h6" fill="none" stroke="currentColor" stroke-width="1" opacity="0.22"/>
      </pattern>
    `;
    while (pat.firstChild) defs.appendChild(pat.firstChild);
    svg.appendChild(defs);

    const bgRect = document.createElementNS(SVG_NS, 'rect') as SVGRectElement;
    bgRect.setAttribute('class', 'ck-bg');
    bgRect.setAttribute('x', '0');
    bgRect.setAttribute('y', '0');
    bgRect.setAttribute('width', '100%');
    bgRect.setAttribute('height', '100%');
    bgRect.setAttribute('pointer-events', 'none');
    bgRect.setAttribute('fill', `url(#ck-bg-dots-${uid})`);
    svg.appendChild(bgRect);

    // world group (pan/zoom matrix)
    const world = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    world.setAttribute('class', 'ck-world');
    svg.appendChild(world);

    const groupLayer = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    groupLayer.setAttribute('class', 'ck-groups');
    world.appendChild(groupLayer);

    const edgeLayer = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    edgeLayer.setAttribute('class', 'ck-edges');
    world.appendChild(edgeLayer);

    const nodeLayer = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    nodeLayer.setAttribute('class', 'ck-nodes');
    world.appendChild(nodeLayer);

    container.appendChild(svg);

    // 미니맵
    const minimapSvg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    /* 작은 판은 **판 위에 얹힌 물건**처럼 보여야 한다. 예전엔 모서리 4px 에 그림자도 없어서
       구석에 박힌 남의 창처럼 떠 있었다(실측 2026-08-12). 둥글게 깎고 살짝 띄우고 뒤를 흐려
       — 판이 비쳐 보이면 「이건 판의 축소판」이 눈으로 읽힌다. */
    minimapSvg.style.cssText = `
      /* 오른쪽 아래는 **배율 줄과 함께 쓰는 자리**다 — 그 줄(높이 ~34px) 위로 올라앉는다. */
      position:absolute; bottom:58px; right:16px;
      width:${MINIMAP_W}px; height:${MINIMAP_H}px;
      background:${theme.minimapBg}; border:1px solid ${theme.minimapBorder};
      border-radius:12px; overflow:hidden; pointer-events:all; cursor:pointer;
      box-shadow:0 8px 24px rgba(0,0,0,.32); backdrop-filter:blur(10px);
      -webkit-backdrop-filter:blur(10px);
    `;
    container.appendChild(minimapSvg);
    const minimapViewport = document.createElementNS(SVG_NS, 'rect') as SVGRectElement;
    // 「지금 보는 곳」 — 파랑을 못 박으면 테마를 갈아도 혼자 파랗다. 판의 강조색을 따라간다.
    // ★ 색은 **style 로** 준다. `fill="var(--x)"` 처럼 속성에 적으면 변수가 안 풀린다
    //   (표현 속성은 var() 를 안 받는다) — 그러면 상자가 통째로 검게 칠해진다.
    minimapViewport.style.fill = 'var(--accent-dim, rgba(169,155,245,0.15))';
    minimapViewport.style.stroke = 'var(--accent, rgba(169,155,245,0.65))';
    minimapViewport.setAttribute('stroke-width', '1.5');
    minimapViewport.setAttribute('rx', '3');
    minimapSvg.appendChild(minimapViewport);
    return { svg, world, groupLayer, edgeLayer, nodeLayer, bgRect, minimapSvg, minimapViewport };
}
