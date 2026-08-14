/**
 * 파일이 서로 무엇을 부르나 (TASK-KL-316 / 20)
 *
 * 남의 저장소를 처음 열면 「어디부터 읽나」가 막막하다. 답은 대개 **부르는 쪽이 많은 파일**이거나
 * **아무도 안 부르는 파일**(입구이거나 죽은 파일)이다. 그리고 고칠 때 제일 아픈 건 **고리**다 —
 * A 가 B 를 부르고 B 가 다시 A 를 부르면 어느 쪽을 먼저 읽어도 앞이 안 보인다.
 *
 * 그래서 여기서는 셋만 낸다: ① 누가 누구를 부르나 ② 고리 ③ 많이 불리는 것·아무도 안 부르는 것.
 * 진짜 파서를 들이지 않는다(무게) — `import`·`require`·`export from` 을 **글로** 찾는다.
 * 그 대신 **못 찾은 것을 숨기지 않는다**: 밖 꾸러미와 못 이어진 자리를 따로 돌려준다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'codegraph',
  ops: {
    graph: {
      desc:
        'Read a set of files (JSON object of path -> source) and report which file imports which,' +
        ' plus cycles, most-imported files and unreferenced files.',
      in: { files: 'string' },
      out: 'string'
    }
  }
};

export interface Edge {
  from: string;
  to: string;
}

export interface Graph {
  files: string[];
  edges: Edge[];
  /** 저장소 밖 꾸러미 — 이름 → 부른 파일 수 */
  externals: Record<string, number>;
  /** 상대 경로인데 못 이은 자리 (숨기지 않는다) */
  unresolved: Array<{ from: string; what: string }>;
}

const IMPORT_RE = [
  /\bimport\s+[^'"();]*from\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bexport\s+[^'"();]*from\s*['"]([^'"]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /@import\s+(?:url\()?['"]([^'"]+)['"]/g
];

const CODE = /\.(m?[jt]sx?|css|scss|vue|svelte)$/i;

/** 주석·글자 안의 것을 세지 않는다 — 「예시로 적어 둔 import」가 그래프를 더럽힌다. */
function strip(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

const norm = (path: string): string => path.replace(/\\/g, '/').replace(/^\.\//, '');

/** `./a` 를 진짜 파일로 잇는다 — 확장자와 `index` 를 우리가 붙여 본다. */
function resolve(from: string, what: string, files: Set<string>): string | undefined {
  const base = norm(from).split('/').slice(0, -1);
  const parts = norm(what).split('/');
  const stack = [...base];
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  const guess = stack.join('/');
  const candidates = [
    guess,
    guess + '.ts',
    guess + '.tsx',
    guess + '.js',
    guess + '.jsx',
    guess + '.mjs',
    guess + '.css',
    guess + '/index.ts',
    guess + '/index.js',
    guess + '/index.tsx'
  ];
  return candidates.find((c) => files.has(c));
}

export function build(input: Record<string, string>): Graph {
  const files = Object.keys(input).map(norm).filter((f) => CODE.test(f));
  const set = new Set(files);
  const edges: Edge[] = [];
  const externals: Record<string, number> = {};
  const unresolved: Array<{ from: string; what: string }> = [];
  const seen = new Set<string>();

  for (const [rawPath, rawSource] of Object.entries(input)) {
    const from = norm(rawPath);
    if (!set.has(from)) continue;
    const source = strip(rawSource);
    for (const re of IMPORT_RE) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(source)) !== null) {
        const what = m[1];
        /* CSS 의 `@import 'reset.css'` 는 **점이 없어도 상대 경로**다 — 이걸 밖 꾸러미로 세면
           같은 폴더 파일이 「없는 꾸러미」로 둔갑한다 (실측). */
        const cssRelative = /\.(css|scss)$/i.test(from) && !/^(https?:|\/|~|@)/.test(what);
        if (what.startsWith('.') || cssRelative) {
          const to = resolve(from, what, set);
          if (to === undefined) {
            unresolved.push({ from, what });
            continue;
          }
          const key = from + '>' + to;
          if (to !== from && !seen.has(key)) {
            seen.add(key);
            edges.push({ from, to });
          }
          continue;
        }
        /* 밖 꾸러미 — `@scope/name/deep` 은 `@scope/name` 으로 묶는다 */
        const parts = what.split('/');
        const pkg = what.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
        if (pkg.startsWith('node:') || pkg === '') continue;
        externals[pkg] = (externals[pkg] ?? 0) + 1;
      }
    }
  }
  return { files, edges, externals, unresolved };
}

/** 고리 찾기 (Tarjan) — 두 개 이상 묶인 덩이와 자기 자신을 부르는 것. */
export function cycles(graph: Graph): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const out: string[][] = [];
  let counter = 0;

  const next = new Map<string, string[]>();
  for (const f of graph.files) next.set(f, []);
  for (const e of graph.edges) next.get(e.from)?.push(e.to);

  /* 되돌이(재귀) 대신 손으로 쌓는다 — 파일이 수천 개면 재귀는 스택이 터진다. */
  const walk = (start: string): void => {
    const work: Array<{ node: string; at: number }> = [{ node: start, at: 0 }];
    index.set(start, counter);
    low.set(start, counter);
    counter++;
    stack.push(start);
    onStack.add(start);

    while (work.length > 0) {
      const top = work[work.length - 1];
      const kids = next.get(top.node) ?? [];
      if (top.at < kids.length) {
        const kid = kids[top.at++];
        if (!index.has(kid)) {
          index.set(kid, counter);
          low.set(kid, counter);
          counter++;
          stack.push(kid);
          onStack.add(kid);
          work.push({ node: kid, at: 0 });
        } else if (onStack.has(kid)) {
          low.set(top.node, Math.min(low.get(top.node) ?? 0, index.get(kid) ?? 0));
        }
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent !== undefined) low.set(parent.node, Math.min(low.get(parent.node) ?? 0, low.get(top.node) ?? 0));
      if ((low.get(top.node) ?? 0) === (index.get(top.node) ?? 0)) {
        const group: string[] = [];
        for (;;) {
          const popped = stack.pop();
          if (popped === undefined) break;
          onStack.delete(popped);
          group.push(popped);
          if (popped === top.node) break;
        }
        const selfLoop = group.length === 1 && (next.get(group[0]) ?? []).includes(group[0]);
        if (group.length > 1 || selfLoop) out.push(group.reverse());
      }
    }
  };

  for (const f of graph.files) if (!index.has(f)) walk(f);
  return out.sort((a, b) => b.length - a.length);
}

export interface Rank {
  file: string;
  /** 이 파일을 부르는 파일 수 */
  imported: number;
  /** 이 파일이 부르는 파일 수 */
  imports: number;
}

export function ranks(graph: Graph): Rank[] {
  const imported = new Map<string, number>();
  const imports = new Map<string, number>();
  for (const f of graph.files) {
    imported.set(f, 0);
    imports.set(f, 0);
  }
  for (const e of graph.edges) {
    imported.set(e.to, (imported.get(e.to) ?? 0) + 1);
    imports.set(e.from, (imports.get(e.from) ?? 0) + 1);
  }
  return graph.files
    .map((file) => ({ file, imported: imported.get(file) ?? 0, imports: imports.get(file) ?? 0 }))
    .sort((a, b) => b.imported - a.imported);
}

/** 아무도 안 부르는 파일 — 입구이거나 죽은 파일이다(둘을 우리가 못 가른다, 그래서 그냥 준다). */
export function unreferenced(graph: Graph): string[] {
  const called = new Set(graph.edges.map((e) => e.to));
  return graph.files.filter((f) => !called.has(f)).sort();
}

/** `core/mermaidlite` 가 그릴 수 있는 글로 — 그리기 엔진을 또 만들지 않는다. */
export function toMermaid(graph: Graph, limit = 60): string {
  const keep = new Set(ranks(graph).slice(0, limit).map((r) => r.file));
  const short = (f: string): string => f.split('/').slice(-2).join('/');
  const id = (f: string): string => f.replace(/[^\w]/g, '_');
  const rows = ['flowchart LR'];
  for (const e of graph.edges) {
    if (!keep.has(e.from) || !keep.has(e.to)) continue;
    rows.push('  ' + id(e.from) + '[' + short(e.from) + '] --> ' + id(e.to) + '[' + short(e.to) + ']');
  }
  return rows.join('\n');
}

export const run: ToolRunner = (op, args) => {
  if (op !== 'graph') throw new Error('codegraph: 모르는 연산 ' + op);
  const graph = build(JSON.parse(String(args.files ?? '{}')) as Record<string, string>);
  const loops = cycles(graph);
  const rows = [graph.files.length + ' files · ' + graph.edges.length + ' edges'];
  for (const loop of loops.slice(0, 10)) rows.push('cycle: ' + loop.join(' → '));
  for (const r of ranks(graph).slice(0, 10)) rows.push(r.imported + ' ← ' + r.file);
  const orphans = unreferenced(graph);
  if (orphans.length > 0) rows.push('unreferenced: ' + orphans.slice(0, 10).join(', '));
  return rows.join('\n');
};
