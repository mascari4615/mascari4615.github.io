/**
 * tidy.ts — 가지런히 놓기 (TASK-KL-202 격차 T).
 *
 * 사람은 캔버스에 마구 던져 놓고 나중에 정리한다. 그런데 손으로 정리하는 건 지루하고,
 * 그렇다고 「자동 배치」로 통째로 흩어 놓으면 **사람이 잡아 둔 뜻**(왼쪽은 과거, 오른쪽은 현재
 * 같은 것)이 날아간다.
 *
 * 그래서 두 가지만 한다 — 둘 다 **결정적**이고, 사람이 잡아 둔 순서를 존중한다:
 *
 * 1. `snapToGrid` — 격자에 맞춰 살짝 당긴다. 위치의 뜻은 그대로 두고 줄만 맞춘다.
 * 2. `unoverlap` — 겹친 것만 민다. 겹치지 않은 것은 **손대지 않는다**.
 *
 * 일반 그래프 자동 배치(force-directed 등)는 여기 없다. 그건 매번 다른 그림을 내놓아
 * 「어제 본 그 자리」를 잃게 만든다.
 */

export interface Boxish {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 격자에 맞춰 당긴 좌표. 값이 안 바뀌는 것은 결과에 넣지 않는다. */
export function snapToGrid(boxes: Boxish[], grid: number): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  for (const b of boxes) {
    const x = Math.round(b.x / grid) * grid;
    const y = Math.round(b.y / grid) * grid;
    if (x !== b.x || y !== b.y) out.set(b.id, { x, y });
  }
  return out;
}

/**
 * 겹친 것만 민다. 위→아래, 왼→오른 순으로 훑으며 앞선 것과 겹치면 **오른쪽으로** 밀고,
 * 너무 밀리면 아랫줄로 내린다.
 *
 * 여러 번 돌려도 결과가 같아야 하므로(멱등), 이미 안 겹치는 배치에서는 아무것도 안 바뀐다.
 */
export function unoverlap(boxes: Boxish[], gap: number): Map<string, { x: number; y: number }> {
  const sorted = [...boxes].sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const placed: Boxish[] = [];
  const moved = new Map<string, { x: number; y: number }>();

  const hits = (a: Boxish, b: Boxish): boolean =>
    a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;

  for (const box of sorted) {
    const cur: Boxish = { ...box };
    let guard = 0;
    // 겹치는 동안 오른쪽으로 민다. 한 줄이 너무 길어지면 아랫줄 왼쪽으로 내린다.
    while (guard < 400) {
      const clash = placed.find((p) => hits(cur, p));
      if (!clash) break;
      cur.x = clash.x + clash.w + gap;
      if (cur.x - box.x > 2400) {
        cur.x = box.x;
        cur.y = clash.y + clash.h + gap;
      }
      guard += 1;
    }
    if (cur.x !== box.x || cur.y !== box.y) moved.set(box.id, { x: Math.round(cur.x), y: Math.round(cur.y) });
    placed.push(cur);
  }
  return moved;
}

/**
 * 원형 배치 — 관계 구조를 **한눈에** 보이게 (TASK-KL-202, yEd 계보).
 *
 * 「가지런히」는 있던 자리를 존중해 줄만 맞춘다. 그런데 자리가 이미 엉킨 그림에서는 그것으로
 * 안 풀린다 — 그럴 때 쓰는 것이 *구조를 살리는* 배치다. 원형은 그 중 가장 정직하다:
 * 누가 가운데인지 우기지 않고, **모두를 똑같이 두고 선만 보게** 한다.
 *
 * 이어진 것이 많은 노드부터 시계 방향으로 놓는다 — 그래야 이웃끼리 가까이 앉아 선이 덜 꼬인다.
 */
export function layoutCircle(
  boxes: Boxish[],
  degree: (id: string) => number,
  center: { x: number; y: number },
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  if (boxes.length === 0) return out;
  const sorted = [...boxes].sort((a, b) => degree(b.id) - degree(a.id) || a.id.localeCompare(b.id));
  const maxW = Math.max(...boxes.map((b) => b.w));
  const maxH = Math.max(...boxes.map((b) => b.h));
  // 카드가 서로 안 닿을 만큼의 반지름 — 개수가 적으면 최소값으로 받쳐 준다(둘이 붙어 버리지 않게).
  const r = Math.max(180, (Math.max(maxW, maxH) + 40) * sorted.length / (2 * Math.PI));
  sorted.forEach((b, i) => {
    const a = (i / sorted.length) * Math.PI * 2 - Math.PI / 2;
    out.set(b.id, {
      x: Math.round(center.x + Math.cos(a) * r - b.w / 2),
      y: Math.round(center.y + Math.sin(a) * r - b.h / 2),
    });
  });
  return out;
}

/**
 * 계층 배치 — **흐름이 있는 그림**(누가 누구에게서 나왔나)에 쓴다.
 *
 * 들어오는 선이 없는 노드를 맨 윗줄에 두고, 거기서 한 다리씩 내려간다(BFS). 고리가 있어
 * 아무도 첫 줄이 못 되면 이어진 것이 가장 많은 노드를 첫 줄로 삼는다 — 「배치가 아무것도
 * 안 했다」로 끝나는 것보다 낫다.
 */
export function layoutHierarchy(
  boxes: Boxish[],
  edges: { from: string; to: string }[],
  origin: { x: number; y: number },
  gap = { col: 220, row: 130 },
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  if (boxes.length === 0) return out;
  const ids = new Set(boxes.map((b) => b.id));
  const links = edges.filter((e) => ids.has(e.from) && ids.has(e.to));

  const indeg = new Map<string, number>();
  const nextOf = new Map<string, string[]>();
  for (const id of ids) { indeg.set(id, 0); nextOf.set(id, []); }
  for (const e of links) {
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
    nextOf.get(e.from)?.push(e.to);
  }

  let frontier = [...ids].filter((id) => (indeg.get(id) ?? 0) === 0).sort();
  if (frontier.length === 0) {
    const deg = new Map<string, number>();
    for (const e of links) {
      deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
      deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
    }
    frontier = [[...ids].sort((a, b) => (deg.get(b) ?? 0) - (deg.get(a) ?? 0) || a.localeCompare(b))[0]];
  }

  const level = new Map<string, number>();
  const seen = new Set<string>();
  let depth = 0;
  while (frontier.length > 0 && depth < 100) {
    for (const id of frontier) { level.set(id, depth); seen.add(id); }
    const next = new Set<string>();
    for (const id of frontier) for (const to of nextOf.get(id) ?? []) if (!seen.has(to)) next.add(to);
    frontier = [...next].sort();
    depth += 1;
  }
  // 어디에도 안 걸린 것(외딴 섬)은 맨 아랫줄에 모은다 — 사라지면 안 된다.
  for (const id of ids) if (!level.has(id)) level.set(id, depth);

  const byLevel = new Map<number, string[]>();
  for (const [id, lv] of level) {
    if (!byLevel.has(lv)) byLevel.set(lv, []);
    byLevel.get(lv)?.push(id);
  }
  for (const [lv, row] of byLevel) {
    row.sort();
    row.forEach((id, i) => {
      const b = boxes.find((x) => x.id === id);
      if (!b) return;
      out.set(id, {
        x: Math.round(origin.x + (i - (row.length - 1) / 2) * gap.col - b.w / 2),
        y: Math.round(origin.y + lv * gap.row),
      });
    });
  }
  return out;
}

/**
 * 연표 배치 — 「언제」가 적힌 칸을 시간축으로 삼아 **왼쪽에서 오른쪽으로** 늘어놓는다
 * (TASK-KL-202, Aeon Timeline 계보).
 *
 * 세계관에서 인물·사건은 관계만큼이나 **순서**로 읽힌다. 그런데 지금 칸 값은 전부 그냥 글자라
 * 「1024년」과 「3화」가 나란히 있어도 도구가 아무것도 못 한다. 여기서는 값에서 **첫 숫자 덩이**만
 * 뽑아 순서를 만든다 — 완전한 날짜 해석은 형식을 강요하게 되고, 사람은 형식을 안 지킨다.
 *
 * 같은 시점은 세로로 쌓는다(겹치면 「같은 때 일이 여럿」이라는 사실 자체가 안 보인다).
 */
export function layoutTimeline(
  boxes: Boxish[],
  keyOf: (id: string) => string | undefined,
  origin: { x: number; y: number },
  gap = { col: 200, row: 110 },
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  const scored = boxes
    .map((b) => {
      const raw = (keyOf(b.id) ?? '').trim();
      const m = /-?\d+(\.\d+)?/.exec(raw);
      return { b, at: m ? Number(m[0]) : null, raw };
    })
    .filter((x) => x.at !== null) as { b: Boxish; at: number; raw: string }[];
  if (scored.length === 0) return out;

  scored.sort((a, b) => a.at - b.at || a.b.id.localeCompare(b.b.id));
  let col = -1;
  let last: number | null = null;
  let stack = 0;
  for (const s of scored) {
    if (s.at !== last) { col += 1; stack = 0; last = s.at; } else { stack += 1; }
    out.set(s.b.id, {
      x: Math.round(origin.x + col * gap.col - s.b.w / 2),
      y: Math.round(origin.y + stack * gap.row),
    });
  }
  return out;
}

/** 어느 칸이 시간축으로 쓸 만한가 — **숫자로 읽히는 값이 가장 많은** 칸. 없으면 null. */
export function bestTimeField(
  nodes: { fields?: Record<string, string> }[],
): string | null {
  const score = new Map<string, number>();
  for (const n of nodes) {
    for (const [name, value] of Object.entries(n.fields ?? {})) {
      if (!/\d/.test(String(value))) continue;
      score.set(name, (score.get(name) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let top = 0;
  for (const [name, count] of score) if (count > top) { top = count; best = name; }
  return top >= 2 ? best : null;   // 하나뿐이면 축이 아니라 우연이다
}
