/**
 * 「본」 — 고르기·끌기의 셈 (TASK-KL-254 · 2단계)
 *
 * 「어느 도형을 눌렀나」, 「손잡이를 이만큼 끌면 도형이 어떻게 되나」는 화면 없이도 답할 수 있는
 * 물음이다. 그래서 여기 모은다 — 브라우저를 모르고, 검사가 이 파일을 직접 찌른다.
 * 화면(`view.ts`)은 포인터 좌표를 문서 좌표로 옮겨 여기에 물어보기만 한다.
 *
 * 좌표는 전부 문서 좌표(px)다. 확대·이동은 화면 쪽 일이다.
 */

import type { Doc, Node } from './model';

export interface Box { x: number; y: number; w: number; h: number }

/** 도형이 차지하는 네모. 무리는 자식들을 감싼다. */
export function bounds(node: Node): Box {
  switch (node.kind) {
    case 'rect':
      return { x: node.x, y: node.y, w: node.w, h: node.h };
    case 'ellipse':
      return { x: node.cx - node.rx, y: node.cy - node.ry, w: node.rx * 2, h: node.ry * 2 };
    case 'path': {
      // 경로는 숫자만 훑어 대충 감싼다 — 곡선의 정확한 끝은 화면이 알려 주면 그때 좁힌다.
      const nums = (node.d.match(/-?\d+(\.\d+)?/g) || []).map(Number);
      if (nums.length < 2) return { x: 0, y: 0, w: 0, h: 0 };
      const xs: number[] = [];
      const ys: number[] = [];
      for (let i = 0; i + 1 < nums.length; i += 2) { xs.push(nums[i]); ys.push(nums[i + 1]); }
      const x = Math.min(...xs); const y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
    case 'group': {
      if (node.children.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
      const bs = node.children.map(bounds);
      const x = Math.min(...bs.map((b) => b.x));
      const y = Math.min(...bs.map((b) => b.y));
      const r = Math.max(...bs.map((b) => b.x + b.w));
      const bt = Math.max(...bs.map((b) => b.y + b.h));
      return { x, y, w: r - x, h: bt - y };
    }
  }
}

export const inBox = (b: Box, x: number, y: number): boolean =>
  x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

/** 어느 도형을 눌렀나. **위에 그려진 것이 먼저** — 뒤에서부터 훑는다. 없으면 null. */
export function hitTest(doc: Doc, x: number, y: number): { layer: number; index: number } | null {
  for (let li = doc.layers.length - 1; li >= 0; li -= 1) {
    const layer = doc.layers[li];
    if (!layer.visible) continue;
    for (let ni = layer.nodes.length - 1; ni >= 0; ni -= 1) {
      if (inBox(bounds(layer.nodes[ni]), x, y)) return { layer: li, index: ni };
    }
  }
  return null;
}

/** 크기 손잡이 여덟 + 옮기기. 이름이 곧 어느 쪽을 잡았는지다. */
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move';

export function handlePoints(b: Box): Record<Exclude<Handle, 'move'>, { x: number; y: number }> {
  const mx = b.x + b.w / 2;
  const my = b.y + b.h / 2;
  return {
    nw: { x: b.x, y: b.y }, n: { x: mx, y: b.y }, ne: { x: b.x + b.w, y: b.y },
    e: { x: b.x + b.w, y: my }, se: { x: b.x + b.w, y: b.y + b.h }, s: { x: mx, y: b.y + b.h },
    sw: { x: b.x, y: b.y + b.h }, w: { x: b.x, y: my }
  };
}

/** 손잡이를 잡았나. `slop` 은 손가락 굵기(문서 좌표) — 화면 확대율에 맞춰 넘긴다. */
export function handleAt(b: Box, x: number, y: number, slop: number): Handle | null {
  const pts = handlePoints(b);
  for (const [name, p] of Object.entries(pts)) {
    if (Math.abs(p.x - x) <= slop && Math.abs(p.y - y) <= slop) return name as Handle;
  }
  return null;
}

/**
 * 손잡이를 끌었을 때의 새 네모. **뒤집히지 않는다** — 왼쪽 손잡이를 오른쪽 끝 너머로 끌면
 * 크기가 음수가 되는데, 그러면 그린 것이 사라지거나 뒤집혀 보인다. 0 에서 멈춘다.
 * `snap` 을 주면 그 간격 격자에 붙는다(픽셀에 딱 맞는 부품을 만들 때).
 */
export function resizeBox(b: Box, handle: Handle, dx: number, dy: number, snap = 0): Box {
  const q = (v: number): number => (snap > 0 ? Math.round(v / snap) * snap : v);
  let { x, y, w, h } = b;
  if (handle === 'move') return { x: q(x + dx), y: q(y + dy), w, h };
  if (handle.includes('w')) { const nx = q(x + dx); w = Math.max(0, x + w - nx); x = nx; }
  if (handle.includes('e')) { w = Math.max(0, q(x + w + dx) - x); }
  if (handle.includes('n')) { const ny = q(y + dy); h = Math.max(0, y + h - ny); y = ny; }
  if (handle.includes('s')) { h = Math.max(0, q(y + h + dy) - y); }
  return { x, y, w, h };
}


/**
 * 경로·무리를 통째로 민다. 네모를 적어 넣는 `applyBox` 로는 못 옮기는 것들 —
 * 경로는 점이 여럿이고, 무리는 자식이 각자 자리를 들고 있다.
 * 「끌어서 옮기기」가 이 둘에서만 안 먹던 것을 여기서 닫는다.
 */
export function translate(node: Node, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  switch (node.kind) {
    case 'rect':
      node.x += dx; node.y += dy;
      break;
    case 'ellipse':
      node.cx += dx; node.cy += dy;
      break;
    case 'path':
      // 숫자쌍을 x·y 로 번갈아 읽어 민다. 명령 글자(M·L·C…)는 그대로 둔다.
      {
        let isX = true;
        node.d = node.d.replace(/-?\d+(\.\d+)?/g, (raw) => {
          const moved = Number(raw) + (isX ? dx : dy);
          isX = !isX;
          return String(Math.round(moved * 1000) / 1000);
        });
      }
      break;
    case 'group':
      for (const child of node.children) translate(child, dx, dy);
      break;
  }
}

/** 새 네모를 도형에 적는다 — 도형 종류마다 담는 자리가 다르다. */
export function applyBox(node: Node, box: Box): void {
  if (node.kind === 'rect') {
    node.x = box.x; node.y = box.y; node.w = box.w; node.h = box.h;
    node.radius = Math.min(node.radius, box.w / 2, box.h / 2);
  } else if (node.kind === 'ellipse') {
    node.rx = box.w / 2; node.ry = box.h / 2;
    node.cx = box.x + node.rx; node.cy = box.y + node.ry;
  } else {
    // 경로·무리는 늘이지 않고 **민다**. 점마다 배율을 먹이면 선 굵기·모서리가 같이 일그러진다.
    const b = bounds(node);
    translate(node, box.x - b.x, box.y - b.y);
  }
}
