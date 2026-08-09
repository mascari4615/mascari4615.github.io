/**
 * KarmoMap 알맹이 — 브라우저 없이 도는 규칙들 (TASK-KL-202).
 *
 * 왜 있나: 지금까지 이 위젯을 지켜 온 것은 **화면검사 60항목 하나뿐**이었다. 그건 한 번 도는 데
 * 100초가 걸리고, 「글 안의 고리를 끊는가」·「연표가 작은 값을 왼쪽에 두는가」 같은 **순수한 셈법**까지
 * 브라우저를 띄워 확인해 왔다. 셈법이 깨졌는데 화면 어딘가가 가려 초록으로 보일 위험도 함께다.
 *
 * 그래서 순수 모듈(`lib/graph/notes` · `tidy` · `from-text` · `json-canvas` · `mermaid` · `sna`)만
 * esbuild 로 묶어 Node 에서 직접 돌린다. 1초 안에 끝나므로 canvas 해체 같은 큰 수술의 **안전망**이 된다.
 *
 * 사용: node scripts/test-karmomap-core.mjs   (npm run test:karmomap)
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

/** 여러 모듈을 한 번에 묶어 불러온다 — 각각 따로 묶으면 시작 비용이 검사 시간을 먹는다. */
async function loadModules() {
  const entry = path.join(os.tmpdir(), `km-core-${Date.now()}.ts`);
  fs.writeFileSync(entry, `
    export * as notes from ${JSON.stringify(path.join(root, 'src/lib/graph/notes.ts'))};
    export * as tidy from ${JSON.stringify(path.join(root, 'src/widgets/karmomap/tidy.ts'))};
    export * as fromText from ${JSON.stringify(path.join(root, 'src/widgets/karmomap/from-text.ts'))};
    export * as jsonCanvas from ${JSON.stringify(path.join(root, 'src/widgets/karmomap/json-canvas.ts'))};
    export * as mermaid from ${JSON.stringify(path.join(root, 'src/widgets/karmomap/mermaid.ts'))};
    export * as cmath from ${JSON.stringify(path.join(root, 'src/lib/graph/canvas-math.ts'))};
    export * as sna from ${JSON.stringify(path.join(root, 'src/widgets/karmomap/sna.ts'))};
  `);
  const out = path.join(os.tmpdir(), `km-core-${Date.now()}.mjs`);
  await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', outfile: out, logLevel: 'error' });
  const mod = await import(pathToFileURL(out).href);
  fs.rmSync(entry, { force: true });
  fs.rmSync(out, { force: true });
  return mod;
}

const specOf = (over = {}) => ({
  version: 1, _meta: {}, groups: [], nodes: [], edges: [], ephemeral_anchors: [], _edge_kinds: {}, ...over,
});
const nodeOf = (id, over = {}) => ({
  id, kind: 'person', label: id, group: '', x: 0, y: 0, w: 120, h: 44, ports: [], ...over,
});

const M = await loadModules();

// ── 공용 글 ──────────────────────────────────────────────────────────────────
{
  const { notes } = M;
  const a = nodeOf('a', { doc: '마법은 대가를 요구한다' });
  const b = nodeOf('b');
  const spec = specOf({ nodes: [a, b] });

  const id = notes.shareDoc(spec, a);
  check(a.doc === undefined && a.docRef === id, '승격하면 제자리 글은 비고 참조만 남아야 한다');
  notes.useNote(spec, b, id);
  eq(notes.noteUsers(spec, id), 2, '두 자리가 쓰면 2');

  notes.setDocText(spec, b, '고쳐 쓴 글');
  eq(notes.resolveDoc(spec, a), '고쳐 쓴 글', '한쪽에서 고치면 다른 자리도 바뀐다');

  notes.unlinkNote(spec, b);
  check(b.docRef === undefined && b.doc === '고쳐 쓴 글', '떼어 내면 사본이 그 자리에 남는다');

  // 없애기 — 기본은 「자리마다 사본으로」. 빈칸이 되면 글이 증발한 것처럼 보인다.
  notes.deleteNote(spec, id, true);
  eq(notes.resolveDoc(spec, a), '고쳐 쓴 글', '흩어도 글자는 남는다');
  eq(notes.notesOf(spec).length, 0, '창고에서는 빠진다');
}

// ── 글 안에 글 끼워 넣기(고리 차단) ─────────────────────────────────────────
{
  const { notes } = M;
  const spec = specOf({ nodes: [nodeOf('a')] });
  spec.notes = [
    { id: 'n1', title: '규칙', text: '대가를 치른다' },
    { id: 'n2', title: '겹', text: '앞: {{note:n1}}' },
    { id: 'loop', title: '고리', text: '나: {{note:loop}}' },
  ];
  eq(M.notes.expandNoteText(spec, '{{note:n2}}'), '앞: 대가를 치른다', '끼운 글이 두 겹까지 펴진다');
  check(notes.expandNoteText(spec, '{{note:loop}}').includes('(고리)'), '자기를 부르는 고리는 끊긴다');
  check(notes.expandNoteText(spec, '{{note:없음}}').includes('(없는 글)'), '없는 글은 그렇게 적힌다');
}

// ── 배치 ────────────────────────────────────────────────────────────────────
{
  const { tidy } = M;
  const boxes = [
    { id: 'a', x: 0, y: 0, w: 100, h: 40 },
    { id: 'b', x: 0, y: 0, w: 100, h: 40 },
    { id: 'c', x: 0, y: 0, w: 100, h: 40 },
  ];
  const circle = tidy.layoutCircle(boxes, () => 1, { x: 0, y: 0 });
  eq(circle.size, 3, '원형 배치는 모두를 놓는다');
  const xs = [...circle.values()].map((p) => p.x);
  check(new Set(xs).size > 1, '원형인데 x 가 전부 같으면 한 줄로 선 것이다');

  const tree = tidy.layoutHierarchy(boxes, [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }], { x: 0, y: 0 });
  check(tree.get('a').y < tree.get('b').y && tree.get('b').y < tree.get('c').y, '계층은 흐름대로 내려간다');

  // 고리뿐이면 첫 줄이 없다 — 그래도 「아무것도 안 함」으로 끝나면 안 된다.
  const cyc = tidy.layoutHierarchy(boxes, [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }], { x: 0, y: 0 });
  eq(cyc.size, 3, '고리만 있어도 전부 놓는다');

  const time = tidy.layoutTimeline(boxes, (id) => ({ a: '9화', b: '2화', c: '' })[id], { x: 0, y: 0 });
  check(time.get('b').x < time.get('a').x, '연표는 작은 값이 왼쪽');
  check(!time.has('c'), '시점이 없는 것은 안 옮긴다');
  eq(tidy.bestTimeField([{ fields: { 첫등장: '3화' } }, { fields: { 첫등장: '9화' } }]), '첫등장', '숫자가 많은 칸이 시간축');
  eq(tidy.bestTimeField([{ fields: { 메모: '3' } }]), null, '한 곳뿐이면 축이 아니다');

  // 멱등 — 이미 안 겹치는 배치에서는 아무것도 안 바뀌어야 한다.
  const spread = [{ id: 'a', x: 0, y: 0, w: 50, h: 20 }, { id: 'b', x: 400, y: 400, w: 50, h: 20 }];
  eq(tidy.unoverlap(spread, 24).size, 0, '안 겹치면 손대지 않는다');
}

// ── 글로 만들기 ─────────────────────────────────────────────────────────────
{
  const { fromText } = M;
  const doc = fromText.parseOutline(['욘', '  링 : 부하', '욘 -> 마을 : 지킨다'].join('\n'));
  eq(doc.nodes.length, 2, '화살표 줄은 노드가 아니다');
  eq(doc.nodes[1].parent, doc.nodes[0].id, '들여쓰면 위 줄에 붙는다');
  eq(doc.links.length, 1, '화살표 줄이 관계로 잡힌다');
  eq(doc.links[0].label, '지킨다', '콜론 뒤는 선에 붙는 말');
  eq(fromText.parseOutline('갑 → 을').links[0].to, '을', '유니코드 화살표도 받는다');
}

// ── 남의 도구와 주고받기 ────────────────────────────────────────────────────
{
  const { jsonCanvas, mermaid } = M;
  const spec = specOf({
    nodes: [
      nodeOf('a', { label: '욘', fields: { 출신: '마계' }, tags: ['주인공'], doc: '마도서를 든다' }),
      nodeOf('b', { label: '링' }),
    ],
    edges: [{ id: 'e1', from: 'a', to: 'b', kind: 'rel', label: '부하' }],
  });
  const canvas = jsonCanvas.toJsonCanvas(spec);
  eq(canvas.nodes.length, 2, '노드가 그대로 나간다');
  check(canvas.nodes.every((n) => typeof n.type === 'string'), 'JSON Canvas 는 type 이 있어야 한다');
  check(canvas.nodes[0].text.includes('출신: 마계'), '칸은 글로 접힌다');

  const back = jsonCanvas.fromJsonCanvas(canvas, specOf({ _edge_kinds: { rel: {} } }));
  eq(back.nodes.length, 2, '되읽으면 개수가 같다');
  eq(back.nodes[0].label, '욘', '첫 줄이 이름으로 돌아온다');
  eq(back.nodes[0].fields?.출신, '마계', '칸이 되살아난다');
  check((back.nodes[0].tags ?? []).includes('주인공'), '꼬리표가 되살아난다');
  eq(back.edges.length, 1, '선도 돌아온다');

  const mm = mermaid.toMermaid(spec);
  check(mm.startsWith('flowchart'), 'Mermaid 는 flowchart 로 시작');
  check(mm.includes('-->'), '선이 적힌다');
  check(mm.includes('"부하"'), '선 이름표가 적힌다');
}

// ── 캔버스 셈법 (해체 1조각) ────────────────────────────────────────────────
{
  const { cmath } = M;
  eq(cmath.colorForTag('주인공'), cmath.colorForTag('주인공'), '같은 말이면 늘 같은 색');
  check(cmath.TAG_COLORS.includes(cmath.colorForTag('아무거나')), '팔레트 안에서 고른다');
  eq(cmath.snapTo(13, 8), 16, '격자에 당긴다');
  eq(cmath.snapTo(13, 0), 13, '격자가 0 이면 그대로');

  const g = { p1: { x: 0, y: 0 }, c1: { x: 0, y: 0 }, c2: { x: 10, y: 0 }, p2: { x: 10, y: 0 } };
  eq(cmath.pointOnCubic(g, 0).x, 0, 't=0 은 시작점');
  eq(cmath.pointOnCubic(g, 1).x, 10, 't=1 은 끝점');
  check(Math.abs(cmath.pointOnCubic(g, 0.5).x - 5) < 0.001, '가운데는 절반');

  const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 5, y: 5 }];
  eq(cmath.convexHull(sq).length, 4, '안쪽 점은 껍질에서 빠진다');
  eq(cmath.convexHull([{ x: 0, y: 0 }, { x: 1, y: 1 }]).length, 0, '점이 둘이면 껍질이 없다');
  check((cmath.roundedHullPath(cmath.convexHull(sq)) ?? '').endsWith('Z'), '껍질 경로는 닫힌다');
  eq(cmath.roundedHullPath([{ x: 0, y: 0 }]), null, '점 하나로는 경로가 없다');
  eq(cmath.boxCorners({ x: 0, y: 0, w: 10, h: 10 }, 2).length, 4, '모서리는 넷');
  check(cmath.boxCorners({ x: 0, y: 0, w: 10, h: 10 }, 2)[0].x === -2, '부풀림이 먹는다');

  const wav = cmath.wobblePath(g, 'wavy', { steps: 8 });
  check(wav.startsWith('M ') && wav.split(' L ').length === 9, '물결선은 steps 등분 = 점 steps+1 개');
  const first = wav.slice(2).split(' L ')[0].split(',').map(Number);
  check(Math.abs(first[1]) < 0.001, '시작점은 안 흔들린다(노드에 딱 붙어야 한다)');
}

// ── 관계망 셈법 ─────────────────────────────────────────────────────────────
{
  const { sna } = M;
  const r = sna.computeSna({
    nodes: [nodeOf('a'), nodeOf('b'), nodeOf('c')],
    edges: [{ id: 'e1', from: 'a', to: 'b', kind: 'r' }, { id: 'e2', from: 'b', to: 'c', kind: 'r' }],
  });
  const top = sna.topBy(r.betweenness, 1)[0];
  eq(top.id, 'b', '가운데 낀 쪽이 다리 역할 1위');
}

process.stdout.write('\n');
if (failures.length > 0) {
  console.error(`\nRESULT: FAIL (${failures.length})\n - ` + failures.join('\n - '));
  process.exit(1);
}
console.log('RESULT: PASS — KarmoMap 알맹이가 브라우저 없이 돈다');
