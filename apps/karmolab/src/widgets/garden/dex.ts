/**
 * 도감 — 격자에서 **개체**를 찾아내 정체를 밝힌다 (TASK-KL-211)
 *
 * 「무언가 흘러갔다」까지는 무게중심으로 말할 수 있었다. 하지만 「그게 무엇이었나」는 다른 문제다.
 * 화면만 보고 짐작하지 않는다 — **떼어내서 따로 굴려 본다.**
 *
 *   ① 서로 붙어 있는 칸들을 하나의 덩어리로 묶는다 (연결 성분).
 *   ② 그 덩어리가 **혼자 있는지** 본다. 옆에 다른 것이 있으면 곧 부딪혀서, 그 덩어리만의
 *      성질을 말할 수 없다.
 *   ③ 혼자면 빈 판에 옮겨 심고 같은 규칙으로 스무 세대쯤 굴린다.
 *      - 처음 모습으로 **제자리에** 돌아오면 → 주기 1이면 정물, 아니면 진동자
 *      - 처음 모습으로 **옮겨져** 돌아오면 → 우주선 (그 칸수만큼 흘러간다)
 *      - 그 안에 안 돌아오면 → 아직 이름 붙일 수 없는 것 (넘어간다)
 *
 * 이게 Life 를 오래 굴려 온 사람들이 개체를 분류해 온 방식 그대로다. 화면 인식이 아니라
 * **실험**이라서, 「글라이더인 것 같다」가 아니라 「주기 4에 대각선으로 한 칸 간다」라고 말할 수 있다.
 *
 * 같은 것을 두 번 세지 않으려고 **여덟 방향(회전·거울)을 다 만들어 가장 작은 지문**을 쓴다.
 * 돌아앉은 글라이더도 같은 글라이더다. 여기에 하나 더 — 움직이는 것은 **모습이 주기마다 바뀐다**.
 * 그래서 한 주기 동안의 모든 모습 중 가장 작은 지문을 쓴다. 안 그러면 같은 글라이더가 네 종류로
 * 세어진다(실측으로 그랬다).
 */
import { Life } from './life';

export type Kind = 'still' | 'oscillator' | 'ship';

export interface Found {
  /** 여덟 방향 중 가장 작은 지문 — 같은 것이면 같은 값 */
  fp: string;
  kind: Kind;
  /** 몇 세대마다 제 모습으로 돌아오나 (정물은 1) */
  period: number;
  /** 한 주기에 몇 칸 움직이나 (우주선만) */
  dx: number;
  dy: number;
  /** 칸 수 */
  size: number;
  /** 그림 그리기용 — 정규화된 좌표와 크기 */
  w: number;
  h: number;
  cells: number[];
}

const MAX_SIZE = 40; // 이보다 크면 「개체」가 아니라 무리다
const MARGIN = 18; // 따로 굴릴 때 둘레에 두는 빈 자리
const TEST_GENS = 24;

/** 좌표 묶음을 왼쪽 위로 붙이고 정렬해 문자열 하나로. */
function normalize(pts: Array<[number, number]>): { key: string; w: number; h: number; cells: number[] } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const cells = pts.map(([x, y]) => (y - minY) * w + (x - minX)).sort((a, b) => a - b);
  return { key: `${w}x${h}:${cells.join(',')}`, w, h, cells };
}

/** 여덟 방향(회전 4 × 거울 2) 중 사전순으로 가장 작은 지문. */
function canonical(pts: Array<[number, number]>): { key: string; w: number; h: number; cells: number[] } {
  let best: ReturnType<typeof normalize> | null = null;
  for (let t = 0; t < 8; t++) {
    const moved = pts.map(([x, y]) => {
      let a = x;
      let b = y;
      if (t & 4) a = -a; // 거울
      for (let r = 0; r < (t & 3); r++) {
        const na = -b;
        b = a;
        a = na;
      }
      return [a, b] as [number, number];
    });
    const n = normalize(moved);
    if (!best || n.key < best.key) best = n;
  }
  return best!;
}

/** 붙어 있는 칸들을 덩어리로 묶는다 (8방향, 가장자리는 안 잇는다 — 개체 판정이 흐려진다). */
function components(life: Life): Array<Array<[number, number]>> {
  const { w, h, cells } = life;
  const seen = new Uint8Array(w * h);
  const out: Array<Array<[number, number]>> = [];
  const stack: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i] || seen[i]) continue;
    const group: Array<[number, number]> = [];
    stack.length = 0;
    stack.push(i);
    seen[i] = 1;
    let tooBig = false;
    while (stack.length) {
      const p = stack.pop()!;
      const px = p % w;
      const py = (p / w) | 0;
      group.push([px, py]);
      if (group.length > MAX_SIZE) {
        tooBig = true;
        break;
      }
      for (let dy = -1; dy <= 1; dy++) {
        const ny = py + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx;
          if (nx < 0 || nx >= w) continue;
          const q = ny * w + nx;
          if (cells[q] && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
    }
    if (!tooBig && group.length >= 3) out.push(group);
  }
  return out;
}

/** 둘레 두 칸 안에 남의 칸이 있으면 혼자가 아니다. */
function isolated(life: Life, group: Array<[number, number]>): boolean {
  const { w, h, cells } = life;
  const own = new Set(group.map(([x, y]) => y * w + x));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of group) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  for (let y = minY - 2; y <= maxY + 2; y++) {
    if (y < 0 || y >= h) continue;
    for (let x = minX - 2; x <= maxX + 2; x++) {
      if (x < 0 || x >= w) continue;
      const i = y * w + x;
      if (cells[i] && !own.has(i)) return false;
    }
  }
  return true;
}

/** 빈 판에 옮겨 심고 굴려서 정체를 본다. */
function classify(
  group: Array<[number, number]>,
  born: Uint8Array,
  stay: Uint8Array
): { kind: Kind; period: number; dx: number; dy: number; fp: string; shape: { w: number; h: number; cells: number[] } } | null {
  const n0 = normalize(group);
  const w = n0.w + MARGIN * 2;
  const h = n0.h + MARGIN * 2;
  const test = new Life(w, h);
  for (const c of n0.cells) {
    const x = MARGIN + (c % n0.w);
    const y = MARGIN + ((c / n0.w) | 0);
    test.cells[y * w + x] = 1;
    test.age[y * w + x] = 1;
  }

  // 한 주기 동안의 모습을 모아 두었다가, 그중 가장 작은 지문을 이 개체의 이름표로 쓴다
  let bestC = canonical(group);
  for (let g = 1; g <= TEST_GENS; g++) {
    const st = test.step(born, stay);
    if (st.pop === 0 || st.pop > MAX_SIZE * 2) return null;
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < test.cells.length; i++) {
      if (test.cells[i]) pts.push([i % w, (i / w) | 0]);
    }
    const cg = canonical(pts);
    if (cg.key < bestC.key) bestC = cg;
    const n1 = normalize(pts);
    if (n1.key !== n0.key) continue;
    // 같은 모습이 돌아왔다 — 제자리인가 옮겨졌나
    let minX0 = Infinity;
    let minY0 = Infinity;
    for (const [x, y] of pts) {
      if (x < minX0) minX0 = x;
      if (y < minY0) minY0 = y;
    }
    const dx = minX0 - MARGIN;
    const dy = minY0 - MARGIN;
    const shape = { w: bestC.w, h: bestC.h, cells: bestC.cells };
    if (dx === 0 && dy === 0) {
      return { kind: g === 1 ? 'still' : 'oscillator', period: g, dx: 0, dy: 0, fp: bestC.key, shape };
    }
    return { kind: 'ship', period: g, dx, dy, fp: bestC.key, shape };
  }
  return null;
}

/** 지금 판에서 이름 붙일 수 있는 것들. */
export function findObjects(life: Life, born: Uint8Array, stay: Uint8Array, limit = 6): Found[] {
  const out: Found[] = [];
  for (const group of components(life)) {
    if (out.length >= limit) break;
    if (!isolated(life, group)) continue;
    const what = classify(group, born, stay);
    if (!what) continue;
    out.push({
      fp: what.fp,
      kind: what.kind,
      period: what.period,
      dx: what.dx,
      dy: what.dy,
      size: group.length,
      w: what.shape.w,
      h: what.shape.h,
      cells: what.shape.cells
    });
  }
  return out;
}
