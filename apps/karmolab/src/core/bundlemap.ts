/**
 * 번들 어디가 무거운가 (TASK-KL-316 / 19)
 *
 * 번들이 커졌을 때 필요한 건 총합이 아니라 **누가 먹었나**다. 그런데 `stats.json` 은
 * 수만 줄짜리라 눈으로 못 본다 — 그래서 폴더 나무로 접어 넓이로 보여 준다.
 *
 * 두 형식을 받는다: webpack `stats.json`(`modules[]`)과 esbuild `metafile`(`inputs`/`outputs`).
 * 둘 다 「이름 + 바이트」로 줄여서 같은 나무로 만든다 — 뒤쪽 셈은 하나면 된다.
 *
 * 하나 더 본다: **같은 꾸러미가 두 번 들어간 자리**. 번들이 갑자기 커지는 흔한 이유다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'bundlemap',
  ops: {
    summary: {
      desc: 'Summarise a webpack stats.json or esbuild metafile: total size, heaviest paths, duplicated packages.',
      in: { stats: 'string' },
      out: 'string'
    }
  }
};

export interface Item {
  name: string;
  bytes: number;
}

export interface Node {
  name: string;
  bytes: number;
  children: Node[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 두 형식을 「이름 + 바이트」로 줄인다. 못 알아보면 그렇다고 던진다. */
export function readStats(text: string): Item[] {
  const doc: unknown = JSON.parse(text);
  if (!isObj(doc)) throw new Error('JSON 물체가 아닙니다');

  /* esbuild metafile */
  if (isObj(doc.inputs)) {
    return Object.entries(doc.inputs)
      .map(([name, value]) => ({ name, bytes: isObj(value) && typeof value.bytes === 'number' ? value.bytes : 0 }))
      .filter((i) => i.bytes > 0);
  }

  /* webpack stats */
  if (Array.isArray(doc.modules)) {
    const out: Item[] = [];
    const walk = (list: unknown[]): void => {
      for (const m of list) {
        if (!isObj(m)) continue;
        if (Array.isArray(m.modules)) {
          walk(m.modules); // 합쳐진 덩이는 속을 본다 (concatenated modules)
          continue;
        }
        const name = typeof m.name === 'string' ? m.name : typeof m.identifier === 'string' ? m.identifier : '';
        const bytes = typeof m.size === 'number' ? m.size : 0;
        if (name !== '' && bytes > 0) out.push({ name, bytes });
      }
    };
    walk(doc.modules);
    return out;
  }

  /* rollup·vite 의 요약 형태도 흔하다: { "output": { "파일": { "code": "..." } } } */
  if (isObj(doc.output)) {
    return Object.entries(doc.output)
      .map(([name, value]) => ({ name, bytes: isObj(value) && typeof value.code === 'string' ? value.code.length : 0 }))
      .filter((i) => i.bytes > 0);
  }

  throw new Error('webpack stats.json 이나 esbuild metafile 이 아닙니다');
}

/** `./node_modules/lodash/map.js` 같은 이름을 보기 좋게 자른다. */
export function tidy(name: string): string {
  /* 자르는 **차례가 중요하다** — 로더 접두사를 먼저 떼야 그 뒤의 `./` 도 떨어진다. */
  return name
    .replace(/^.*!/, '') // 로더 접두사(`babel-loader!./a.js`)
    .replace(/^webpack:\/\/\//, '')
    .replace(/\?.*$/, '')
    .replace(/\\/g, '/')
    .replace(/^[.]\//, '');
}

/** 폴더 나무로 접는다. */
export function tree(items: Item[]): Node {
  const root: Node = { name: '', bytes: 0, children: [] };
  for (const item of items) {
    const parts = tidy(item.name).split('/').filter((p) => p !== '');
    let cur = root;
    cur.bytes += item.bytes;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      let next = cur.children.find((c) => c.name === part);
      if (next === undefined) {
        next = { name: part, bytes: 0, children: [] };
        cur.children.push(next);
      }
      next.bytes += item.bytes;
      cur = next;
    }
  }
  const sort = (node: Node): void => {
    node.children.sort((a, b) => b.bytes - a.bytes);
    for (const child of node.children) sort(child);
  };
  sort(root);
  return root;
}

/** 나무를 한 겹으로 눌러 큰 것부터 — 「어디가 무거운가」의 답. */
export function heaviest(node: Node, depth = 1, prefix = ''): Array<{ path: string; bytes: number }> {
  const out: Array<{ path: string; bytes: number }> = [];
  for (const child of node.children) {
    const path = prefix === '' ? child.name : prefix + '/' + child.name;
    out.push({ path, bytes: child.bytes });
    if (depth > 1) out.push(...heaviest(child, depth - 1, path));
  }
  return out.sort((a, b) => b.bytes - a.bytes);
}

/** 같은 꾸러미가 여러 자리에 들어갔나 (번들이 갑자기 커지는 흔한 이유). */
export function duplicates(items: Item[]): Array<{ name: string; places: string[]; bytes: number }> {
  const packages = new Map<string, Map<string, number>>();
  for (const item of items) {
    const name = tidy(item.name);
    const at = name.lastIndexOf('node_modules/');
    if (at < 0) continue;
    const rest = name.slice(at + 'node_modules/'.length);
    const parts = rest.split('/');
    const pkg = parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
    const where = name.slice(0, at + 'node_modules/'.length) + pkg;
    const places = packages.get(pkg) ?? new Map<string, number>();
    places.set(where, (places.get(where) ?? 0) + item.bytes);
    packages.set(pkg, places);
  }
  const out: Array<{ name: string; places: string[]; bytes: number }> = [];
  for (const [pkg, places] of packages) {
    if (places.size < 2) continue;
    out.push({ name: pkg, places: [...places.keys()], bytes: [...places.values()].reduce((a, b) => a + b, 0) });
  }
  return out.sort((a, b) => b.bytes - a.bytes);
}

/* ── 넓이로 그리기 (squarified treemap) ────────────────────────────── */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  bytes: number;
  depth: number;
}

/** 칸을 넓이 비율대로 나눈다. 정사각형에 가깝게 — 길쭉하면 이름이 안 보인다. */
export function layout(node: Node, x: number, y: number, w: number, h: number, depth = 0, max = 2): Rect[] {
  const out: Rect[] = [];
  if (depth >= max || node.children.length === 0 || w < 8 || h < 8) return out;
  const total = node.children.reduce((sum, c) => sum + c.bytes, 0);
  if (total <= 0) return out;

  let cx = x;
  let cy = y;
  let cw = w;
  let ch = h;
  const rest = [...node.children];

  while (rest.length > 0) {
    const horizontal = cw >= ch;
    const side = horizontal ? ch : cw;
    const area = cw * ch;
    const left = rest.reduce((sum, c) => sum + c.bytes, 0);
    if (left <= 0) break;

    /* 한 줄에 몇 개를 담을지 — 담을수록 납작해지고, 적을수록 길쭉해진다. 나빠지기 직전에 멈춘다. */
    const row: Node[] = [];
    let worst = Infinity;
    while (rest.length > 0) {
      const candidate = [...row, rest[0]];
      const sum = candidate.reduce((s, c) => s + c.bytes, 0);
      const rowArea = (sum / left) * area;
      const thickness = rowArea / side;
      const ratios = candidate.map((c) => {
        const cell = ((c.bytes / sum) * rowArea) / Math.max(thickness, 0.001);
        return Math.max(cell / Math.max(thickness, 0.001), Math.max(thickness, 0.001) / Math.max(cell, 0.001));
      });
      const nextWorst = Math.max(...ratios);
      if (row.length > 0 && nextWorst > worst) break;
      worst = nextWorst;
      row.push(rest.shift() as Node);
    }

    const sum = row.reduce((s, c) => s + c.bytes, 0);
    const rowArea = (sum / left) * area;
    const thickness = Math.min(horizontal ? cw : ch, rowArea / Math.max(side, 0.001));
    let along = horizontal ? cy : cx;
    for (const child of row) {
      const size = (child.bytes / sum) * side;
      const rect: Rect = horizontal
        ? { x: cx, y: along, w: thickness, h: size, name: child.name, bytes: child.bytes, depth }
        : { x: along, y: cy, w: size, h: thickness, name: child.name, bytes: child.bytes, depth };
      out.push(rect);
      out.push(...layout(child, rect.x + 2, rect.y + 14, rect.w - 4, rect.h - 16, depth + 1, max));
      along += size;
    }
    if (horizontal) {
      cx += thickness;
      cw -= thickness;
    } else {
      cy += thickness;
      ch -= thickness;
    }
    if (cw < 8 || ch < 8) break;
  }
  return out;
}

export function human(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

export const run: ToolRunner = (op, args) => {
  if (op !== 'summary') throw new Error('bundlemap: 모르는 연산 ' + op);
  const items = readStats(String(args.stats ?? ''));
  const root = tree(items);
  const rows = [human(root.bytes) + '  (' + items.length + ' modules)'];
  for (const h of heaviest(root, 2).slice(0, 20)) rows.push(human(h.bytes).padStart(10, ' ') + '  ' + h.path);
  const dup = duplicates(items);
  if (dup.length > 0) {
    rows.push('');
    for (const d of dup.slice(0, 10)) rows.push('duplicated: ' + d.name + '  ' + d.places.length + ' places  ' + human(d.bytes));
  }
  return rows.join('\n');
};
