/**
 * 논문 지도 알맹이 — 자리와 크기 (TASK-KL-253).
 *
 * 이 도구가 목록과 갈리는 지점은 **자리와 크기**뿐이다: 큰 것이 이 분야의 바닥이고,
 * 왼쪽이 옛것. 그 셈이 틀리면 그림은 예쁘지만 아무 말도 안 하는 그림이 된다.
 * 인용 수는 28 과 60,000 이 한 화면에 있으므로, 그대로 크기에 쓰면 하나만 거대해진다 —
 * 자릿수로 눌러 담는지도 여기서 지킨다.
 *
 * 사용: node scripts/test-papermap-core.mjs   (npm run test:papermap)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const failures = [];
const check = (ok, why) => {
  if (ok) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(why);
  }
};
const eq = (got, want, label) => check(got === want, `${label}: 「${got}」 (기대 「${want}」)`);

async function load() {
  const entry = path.join(os.tmpdir(), `pm-core-${Date.now()}.ts`);
  fs.writeFileSync(entry, `export * from ${JSON.stringify(path.join(root, 'src/lib/openalex.ts'))};\n`);
  const out = path.join(os.tmpdir(), `pm-core-${Date.now()}.mjs`);
  await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
  const mod = await import(pathToFileURL(out).href);
  fs.rmSync(entry, { force: true });
  fs.rmSync(out, { force: true });
  return mod;
}

const A = await load();

/* ── 이름 다듬기 ─────────────────────────────────────────────────── */
eq(A.shortId('https://openalex.org/W2626778328'), 'W2626778328', '긴 주소에서 짧은 이름만');
eq(A.shortId('W123'), 'W123', '이미 짧으면 그대로');
eq(A.shortId(''), '', '빈 것은 빈 것');

/* ── 응답 다듬기 ─────────────────────────────────────────────────── */
{
  const p = A.toPaper({
    id: 'https://openalex.org/W1',
    title: 'Attention Is All You Need',
    publication_year: 2017,
    cited_by_count: 6585,
    referenced_works: ['https://openalex.org/W2', 'https://openalex.org/W3'],
    authorships: [{ author: { display_name: 'Ashish Vaswani' } }, { author: { display_name: 'Noam Shazeer' } }],
    doi: 'https://doi.org/10.1/abc'
  });
  eq(p.id, 'W1', '짧은 이름');
  eq(p.year, 2017, '연도');
  eq(p.cited, 6585, '인용 수');
  eq(p.refs.length, 2, '참고문헌도 짧은 이름으로');
  eq(p.authors[0], 'Ashish Vaswani', '저자');
  eq(p.url, 'https://doi.org/10.1/abc', 'DOI 가 있으면 그쪽으로 보낸다');
}
check(A.toPaper({ id: 'https://openalex.org/W1' }) === null, '제목 없는 것은 버린다');
check(A.toPaper({ title: '이름 없음' }) === null, '이름 없는 것도 버린다');
{
  const p = A.toPaper({ id: 'https://openalex.org/W9', display_name: '제목만 다른 자리에' });
  eq(p.title, '제목만 다른 자리에', '제목이 다른 칸에 와도 찾는다');
  eq(p.cited, 0, '없는 숫자는 0');
  eq(p.refs.length, 0, '참고문헌이 없으면 빈 목록');
}

/* ── 지도 ────────────────────────────────────────────────────────── */
const P = (id, year, cited) => ({ id, title: `논문 ${id}`, year, cited, authors: [], refs: [], url: '' });

{
  const map = A.buildMap(P('root', 2017, 6585), [P('a', 1990, 100), P('b', 2010, 5000), P('c', 2016, 30)]);
  eq(map.nodes.length, 4, '가운데 하나 + 바닥 셋');
  eq(map.edges.length, 3, '가운데에서 셋으로 이어진다');
  check(map.nodes[0].root, '첫 칸이 가운데 논문');
  check(map.edges.every((e) => e.from === 'root'), '모든 줄이 가운데에서 나간다');
}

{
  /* **가로 자리 = 연도.** 옛것이 왼쪽에 있어야 「어디서 왔나」가 자리로 읽힌다. */
  const map = A.buildMap(P('root', 2020, 10), [P('old', 1980, 50), P('new', 2019, 50)]);
  const old = map.nodes.find((n) => n.paper.id === 'old');
  const neo = map.nodes.find((n) => n.paper.id === 'new');
  check(old.x < neo.x, `옛 논문이 왼쪽에 있어야 한다 (old=${old.x}, new=${neo.x})`);
}

{
  /* **크기 = 인용 수.** 다만 자릿수로 눌러 담는다 — 안 그러면 하나만 거대해지고 나머지는 점이다. */
  const map = A.buildMap(P('root', 2020, 10), [P('small', 2000, 10), P('huge', 2000, 60000)]);
  const s = map.nodes.find((n) => n.paper.id === 'small');
  const h = map.nodes.find((n) => n.paper.id === 'huge');
  check(h.w > s.w, '많이 인용된 것이 크다');
  check(h.w / s.w < 3, `6천 배 차이가 화면에서 세 배를 안 넘어야 한다 (지금 ${(h.w / s.w).toFixed(2)}배)`);
}

{
  /* 같은 해가 여럿이면 가로 자리가 겹친다 — 가로는 연도가 정하므로 **세로로** 쌓아야 한다. */
  const same = Array.from({ length: 4 }, (_, i) => P('s' + i, 2015, 10));
  const map = A.buildMap(P('root', 2020, 10), same);
  const ys = map.nodes.filter((n) => !n.root).map((n) => n.y);
  eq(new Set(ys).size, 4, '같은 해 넷이 서로 다른 줄에 앉는다');
}

{
  const map = A.buildMap(P('root', 2020, 10), []);
  eq(map.nodes.length, 1, '바닥이 없어도 가운데는 그린다');
  eq(map.edges.length, 0, '이을 것이 없다');
}

/* ── 캔버스로 ────────────────────────────────────────────────────── */
{
  const map = A.buildMap(P('root', 2017, 100), [P('a', 2000, 10)]);
  const c = A.toCanvas(map);
  eq(c.nodes.length, 2, '칸이 그대로 옮겨진다');
  eq(c.edges.length, 1, '줄도 그대로');
  check(c.nodes[0].text.includes('논문 root'), '제목이 들어간다');
  check(c.nodes[0].text.includes('2017'), '연도가 들어간다');
  check(!!c.nodes[0].color, '가운데 논문은 색이 다르다');
  check(!c.nodes[1].color, '나머지는 기본색');
  check(c.nodes.every((n) => n.width > 0 && n.height > 0), '크기가 함께 넘어간다');
  eq(c.edges[0].fromNode, 'root', '줄의 출발이 가운데');
}

process.stdout.write('\n');
if (failures.length) {
  console.error(`[test-papermap] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[test-papermap] 전부 통과');
