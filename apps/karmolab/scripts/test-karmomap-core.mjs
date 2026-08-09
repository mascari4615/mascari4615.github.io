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
    export * as save from ${JSON.stringify(path.join(root, 'src/lib/graph/canvas-save.ts'))};
    export * as filter from ${JSON.stringify(path.join(root, 'src/lib/graph/canvas-filter.ts'))};
    export * as decor from ${JSON.stringify(path.join(root, 'src/lib/graph/canvas-decor.ts'))};
    export * as cmath from ${JSON.stringify(path.join(root, 'src/lib/graph/canvas-math.ts'))};
    export * as press from ${JSON.stringify(path.join(root, 'src/lib/graph/canvas-press.ts'))};
    export * as release from ${JSON.stringify(path.join(root, 'src/lib/graph/canvas-release.ts'))};
    export * as edgedrag from ${JSON.stringify(path.join(root, 'src/lib/graph/canvas-edgedrag.ts'))};
    export * as drag from ${JSON.stringify(path.join(root, 'src/lib/graph/canvas-drag.ts'))};
    export * as minimap from ${JSON.stringify(path.join(root, 'src/lib/graph/canvas-minimap.ts'))};
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

// ── 글의 **한 대목만** 참조 (Obsidian 블록) ─────────────────────────────────
{
  const { notes } = M;
  const spec = specOf({ nodes: [nodeOf('a')] });
  spec.notes = [{ id: 'rule', title: '규칙', text: ['대가를 치른다 ^대가', '', '이름을 잃는다 ^이름'].join(String.fromCharCode(10) + String.fromCharCode(10)) }];
  const blocks = notes.noteBlocks(spec.notes[0].text);
  eq(blocks.length, 2, '표식이 붙은 덩이만 잡힌다');
  eq(blocks[0].id, '대가', '표식 이름이 곧 덩이 id');
  eq(notes.expandNoteText(spec, '{{note:rule#이름}}'), '이름을 잃는다', '그 대목만 실린다');
  check(notes.expandNoteText(spec, '{{note:rule#없음}}').includes('(없는 대목)'), '없는 대목은 그렇게 적힌다');
  check(!notes.expandNoteText(spec, '{{note:rule}}').includes('^'), '글 전체를 실을 땐 표식을 걷어 낸다');
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

// ── 선이 어느 면에서 나가나 ─────────────────────────────────────────────────
{
  const { cmath } = M;
  const left = { x: 0, y: 0, w: 100, h: 40 };
  const right = { x: 400, y: 0, w: 100, h: 40 };
  const a1 = cmath.chooseAnchors(left, right);
  eq(a1.side1, 'right', '오른쪽에 있는 상대에게는 오른 면에서 나간다');
  eq(a1.side2, 'left', '상대는 왼 면으로 받는다');
  eq(a1.p1.x, 100, '나가는 점은 면 한가운데');
  const below = { x: 0, y: 400, w: 100, h: 40 };
  const a2 = cmath.chooseAnchors(left, below);
  eq(a2.side1, 'bottom', '아래에 있으면 아래 면');
  eq(a2.side2, 'top', '상대는 윗 면으로 받는다');
}

// ── 선의 휨 ────────────────────────────────────────────────────────────────
{
  const { cmath } = M;
  const a = { x: 0, y: 0, w: 100, h: 40 };
  const b = { x: 400, y: 0, w: 100, h: 40 };
  const g = cmath.edgeCurve(a, b, 0);
  check(g.c1.x > g.p1.x, '제어점은 나가는 면 **바깥쪽**으로 밀린다');
  check(g.c2.x < g.p2.x, '받는 쪽도 바깥쪽으로');
  eq(Math.round(g.p1.y), Math.round(g.p2.y), '나란한 두 상자는 같은 높이에서 잇는다');
  const bent = cmath.edgeCurve(a, b, 0.3);
  check(Math.abs(bent.c1.y - g.c1.y) > 1, '휨을 주면 제어점이 옆으로 밀린다');
  const back = cmath.edgeCurve(a, b, -0.3);
  check((bent.c1.y - g.c1.y) * (back.c1.y - g.c1.y) < 0, '부호를 바꾸면 반대쪽으로 휜다');
}

// ── 가리킨 자리를 붙잡은 확대 ───────────────────────────────────────────────
{
  const { cmath } = M;
  const v = { tx: 0, ty: 0, scale: 1 };
  const at = { x: 100, y: 50 };
  const z = cmath.zoomAt(v, 2, at);
  eq(z.scale, 2, '배율이 곱해진다');
  // 그 자리의 **세계 좌표**가 확대 전후로 같아야 한다 — 아니면 보던 것이 옆으로 흐른다.
  const before = (at.x - v.tx) / v.scale;
  const after = (at.x - z.tx) / z.scale;
  check(Math.abs(before - after) < 0.001, '가리킨 자리는 제자리에 남는다');
  eq(cmath.zoomAt({ tx: 0, ty: 0, scale: 0.1 }, 0.5, at).scale, 0.1, '더 못 줄인다(점만 남는 것 방지)');
  eq(cmath.zoomAt({ tx: 0, ty: 0, scale: 5 }, 2, at).scale, 5, '더 못 키운다(한 카드가 화면을 덮는 것 방지)');
}

// ── 범위 고르기 ────────────────────────────────────────────────────────────
{
  const { cmath } = M;
  const r = cmath.rectFromPoints({ x: 100, y: 80 }, { x: 20, y: 10 });
  eq(r.x, 20, '거꾸로 끌어도 왼쪽이 x');
  eq(r.w, 80, '폭은 양수');
  check(cmath.rectHits(r, { x: 15, y: 5, w: 10, h: 10 }), '모서리만 걸쳐도 고른 것');
  check(!cmath.rectHits(r, { x: 200, y: 200, w: 10, h: 10 }), '떨어져 있으면 아니다');
}

// ── 세계 범위 ──────────────────────────────────────────────────────────────
{
  const { cmath } = M;
  const b = cmath.boundsOf([{ x: 10, y: 20, w: 100, h: 40 }, { x: -30, y: 0, w: 50, h: 50 }]);
  eq(b.minX, -30, '가장 왼쪽');
  eq(b.minY, 0, '가장 위');
  eq(b.w, 140, '폭은 오른끝 - 왼끝');
  const empty = cmath.boundsOf([]);
  check(empty.w > 0 && empty.h > 0, '빈 세계는 **기본 크기** — 0 을 주면 맞춤 보기가 배율을 무한대로 잡아 화면이 날아간다');
}

// ── 미니맵 투영 ─────────────────────────────────────────────────────────────
{
  const { cmath } = M;
  const bounds = { minX: 0, minY: 0, w: 1000, h: 500 };
  const size = { w: 200, h: 150 };
  const proj = cmath.fitProjection(bounds, size);
  check(proj.scale > 0 && proj.scale <= 0.2, '넓은 세계는 줄여 담는다');
  const tl = cmath.projectPoint(bounds, proj, 0, 0);
  const br = cmath.projectPoint(bounds, proj, 1000, 500);
  check(tl.x >= 0 && br.x <= size.w + 0.001, '가로가 판 안에 들어온다');
  check(tl.y >= 0 && br.y <= size.h + 0.001, '세로가 판 안에 들어온다');
  check(Math.abs((tl.x + br.x) / 2 - size.w / 2) < 0.001, '가운데 맞춰진다');
  eq(cmath.fitProjection({ minX: 0, minY: 0, w: 0, h: 0 }, size).scale, 0, '빈 세계는 배율 0');

  // 「지금 보는 곳」 상자는 판 밖으로 안 나간다.
  const vp = cmath.viewportRectOnMap(bounds, proj,
    { tx: 400, ty: 300, scale: 0.5, w: 4000, h: 3000 }, size);
  check(vp.x >= 0 && vp.y >= 0, '판 왼쪽·위로 안 삐져나간다');
  check(vp.x + vp.w <= size.w + 0.001 && vp.y + vp.h <= size.h + 0.001, '판 오른쪽·아래로도 안 나간다');
}

// ── 관계망 셈법 ─────────────────────────────────────────────────────────────
{
  const { sna } = M;
  const r = sna.computeSna({
    nodes: [nodeOf('a'), nodeOf('b'), nodeOf('c')],
    edges: [{ id: 'e1', from: 'a', to: 'b', kind: 'r' }, { id: 'e2', from: 'b', to: 'c', kind: 'r' }],
  });
  const top = sna.topBy(r.betweenness, 1)[0];

  // 「이어질 법한데 안 이어진 자리」 — 공통 이웃이 둘 이상인데 서로는 안 이어진 쌍.
  const gaps = sna.structuralGaps({
    nodes: [nodeOf('a'), nodeOf('b'), nodeOf('c'), nodeOf('d')],
    edges: [
      { from: 'a', to: 'c' }, { from: 'b', to: 'c' },
      { from: 'a', to: 'd' }, { from: 'b', to: 'd' },
    ],
  });
  // a-b 도 c-d 도 서로 안 이어졌고 겹치는 이웃이 둘씩이다 — **둘 다** 자리다(한쪽만 세면 놓친다).
  eq(gaps.length, 2, '안 이어진 쌍 둘 다 잡힌다');
  eq(gaps[0].shared, 2, '겹치는 사이 수를 센다');
  const pairs = gaps.map((g0) => [g0.a, g0.b].sort().join('')).sort().join('/');
  eq(pairs, 'ab/cd', '잡힌 쌍이 맞다');
  eq(sna.structuralGaps({ nodes: [nodeOf('a'), nodeOf('b')], edges: [{ from: 'a', to: 'b' }] }).length, 0,
    '이미 이어진 쌍은 자리가 아니다');
  eq(top.id, 'b', '가운데 낀 쪽이 다리 역할 1위');
}

// ── 꾸미기: 이기는 순서 ─────────────────────────────────────────────────────
{
  const { decor } = M;
  const flags = { sizeByDegree: false, colorByTag: true, colorByField: '진영' };
  const node = nodeOf('a', { tags: ['주인공'], fields: { 진영: '마왕성' } });
  const kindColor = () => '#kind';
  const ruled = decor.nodeColor(node, [{ id: 'r', on: 'field', key: '진영', value: '마왕성', color: '#rule' }], flags, kindColor);
  eq(ruled, '#rule', '규칙이 가장 세다');
  const byField = decor.nodeColor(node, [], flags, kindColor);
  check(byField !== '#kind', '칸 색이 종류 색을 이긴다');
  eq(decor.nodeColor(nodeOf('b'), [], flags, kindColor), '#kind', '아무 근거 없으면 종류 색');
  // 뒤 규칙이 앞 규칙을 덮는다 — 목록을 위에서 아래로 읽는 것이 사람에게 익숙하다.
  eq(decor.nodeColor(node, [
    { id: '1', on: 'tag', value: '주인공', color: '#one' },
    { id: '2', on: 'tag', value: '주인공', color: '#two' },
  ], flags, kindColor), '#two', '아래 규칙이 이긴다');
  eq(decor.nodeScale(node, [{ id: 's', on: 'tag', value: '주인공', scale: 2 }], flags, 5), 2, '연결수 끄면 규칙 배율만');
  const both = decor.nodeScale(node, [{ id: 's', on: 'tag', value: '주인공', scale: 2 }], { ...flags, sizeByDegree: true }, 5);
  check(both > 2, '둘 다 켜면 곱해진다');
  check(decor.nodeScale(nodeOf('c'), [], { ...flags, sizeByDegree: true }, 100) <= 1.6, '연결수 배율은 1.6 에서 멈춘다');
}
// ── 거르기: 무엇이 남나 ────────────────────────────────────────────────────
{
  const { filter } = M;
  const base = { nodeKinds: new Set(), edgeKinds: new Set(), tags: new Set(), hideOrphans: false, minDegree: 0, fieldName: '', fieldValue: '' };
  const nodes = [nodeOf('a', { tags: ['주인공'] }), nodeOf('b', { fields: { 출신: '마계' } }), nodeOf('c')];
  const edges = [{ id: 'e1', from: 'a', to: 'b', kind: 'r' }];
  const refOf = (r) => r.split(':')[0];
  eq(filter.visibleNodes(nodes, edges, base, refOf).length, 3, '아무것도 안 끄면 다 남는다');
  eq(filter.visibleNodes(nodes, edges, { ...base, tags: new Set(['주인공']) }, refOf).length, 2, '꺼 둔 꼬리표는 빠진다');
  eq(filter.visibleNodes(nodes, edges, { ...base, fieldName: '출신' }, refOf).length, 1, '그 칸이 있는 것만');
  eq(filter.visibleNodes(nodes, edges, { ...base, fieldName: '출신', fieldValue: '천계' }, refOf).length, 0, '값까지 맞아야');
  eq(filter.visibleNodes(nodes, edges, { ...base, hideOrphans: true }, refOf).length, 2, '아무 선도 안 닿은 것은 빠진다');
  // 되풀이 확인: a-b-c 사슬에서 「선 2개 이상」이면 **전부** 빠진다(한 번만 걸러내면 b 가 남는다).
  const chain = [nodeOf('a'), nodeOf('b'), nodeOf('c')];
  const chainEdges = [{ id: 'e1', from: 'a', to: 'b', kind: 'r' }, { id: 'e2', from: 'b', to: 'c', kind: 'r' }];
  eq(filter.visibleNodes(chain, chainEdges, { ...base, minDegree: 2 }, refOf).length, 0, '이웃이 빠지면 그 여파로 또 빠진다');
  const deg = filter.degreeMap(chainEdges, refOf);
  eq(deg.get('b'), 2, '가운데는 둘과 이어져 있다');
  eq(deg.get('a'), 1, '끝은 하나');
}
// ── 좌표 저장 미루기 ───────────────────────────────────────────────────────
{
  const { save } = M;
  const pending = new Map();
  save.queueSave(pending, 'n1', 10, 20, 'node');
  save.queueSave(pending, 'n1', 30, 40, 'node');   // 끄는 동안 여러 번
  save.queueSave(pending, 'g1', 5, 5, 'group');
  const out = save.drainSaves(pending);
  eq(out.length, 2, '같은 대상은 하나로 모인다');
  const n1 = out.find((u) => u.id === 'n1');
  eq(n1.x, 30, '마지막 좌표만 남는다(중간 자리를 다 보내면 지나간 자리를 다시 그린다)');
  eq(pending.size, 0, '보낸 뒤 대기열은 빈다');
}
// 안내가 **거짓말하지 않게**: ⌫(Backspace)는 고른 카드를 *지운다*. 되돌리기는 Ctrl+Z 다.
// 토스트가 「⌫ 로 되돌립니다」라고 하면 사람은 그걸 눌러 카드를 지운다 — 가장 나쁜 안내다.
{
  const widget = fs.readFileSync(path.join(root, 'src/widgets/karmomap/karmomap.ts'), 'utf8');
  const wrong = widget.includes(String.fromCharCode(0x232B) + ' 로 되돌');
  check(!wrong, '「⌫ 로 되돌립니다」 안내가 남아 있다 — ⌫ 는 지우기다(되돌리기는 Ctrl+Z)');
}
// 도움말이 **낡지 않게**: 기능은 느는데 도움말은 그대로면 발견성이 그만큼 준다.
// 정확한 개수를 박으면 매번 고쳐야 하니 **하한**만 잠근다(줄어들면 누가 지운 것이다).
{
  const help = fs.readFileSync(path.join(root, 'src/widgets/karmomap/help.ts'), 'utf8');
  const items = (help.match(/what:/g) ?? []).length;
  check(items >= 40, `도움말 항목이 ${items}개 — 40개 밑으로 줄었다(기능은 느는데 도움말이 낡는 중)`);
}
// ---- 누르면 무슨 뜻인가 (canvas-press) — 우선순위가 곧 규칙이라 여기서 잠근다
{
  const { pressIntent } = M.press;
  const all = { canRewire: true, canMoveGroup: true, canEditEdge: true, canLink: true, canSelectMany: true };
  check(pressIntent({}, all).kind === 'pan', '배경을 그냥 누르면 화면 밀기');
  check(pressIntent({}, all, { shiftKey: true }).kind === 'marquee', 'Shift+배경 = 범위 고르기');
  check(pressIntent({}, { ...all, canSelectMany: false }, { shiftKey: true }).kind === 'pan',
    '범위 고르기를 안 받는 캔버스면 Shift 를 쥐어도 밀기');
  check(pressIntent({ node: 'n1' }, all).kind === 'node-drag', '카드를 누르면 카드 끌기');
  // 이 한 줄이 이 파일의 존재 이유다 — 손잡이가 카드보다 먼저 이겨야 선을 뽑을 수 있다.
  check(pressIntent({ node: 'n1', linkHandle: 'n1' }, all).kind === 'link',
    '손잡이가 카드보다 먼저다(뒤집히면 선을 영영 못 뽑는다)');
  check(pressIntent({ node: 'n1', linkHandle: 'n1' }, { ...all, canLink: false }).kind === 'node-drag',
    '선 잇기를 안 받는 캔버스면 손잡이는 없는 셈');
  check(pressIntent({ node: 'n1', sizeHandle: 'n1' }, all).kind === 'resize', '크기 손잡이가 카드보다 먼저');
  check(pressIntent({ group: 'g1', node: 'n1' }, all).kind === 'node-drag', '묶음 위 카드는 카드가 먼저');
  check(pressIntent({ group: 'g1' }, all).kind === 'group-drag', '묶음 바탕을 누르면 묶음 끌기');
  const locked = pressIntent({ group: 'g1' }, { ...all, groupLocked: true }, { shiftKey: true });
  check(locked.kind === 'marquee', '잠긴 묶음은 아예 안 잡히고 배경 동작으로 떨어진다');
  check(pressIntent({ edgeGrip: 'e1' }, all).mode === 'curve', '선 가운데 손잡이 = 휘기');
  check(pressIntent({ edgeLabel: 'e1' }, all).mode === 'label', '선 이름표 = 이름표 옮기기');
  check(pressIntent({ edgeGrip: 'e1', edgeEnd: { edgeId: 'e1', end: 'to' } }, all).kind === 'rewire',
    '선 끝이 가운데 손잡이보다 먼저(끝을 잡으면 다시 잇기)');
  check(pressIntent({ groupLabel: 'g1', group: 'g1' }, all).kind === 'label-drag', '묶음 이름표가 묶음보다 먼저');
}

// ---- 손을 떼면 무슨 뜻인가 (canvas-release)
{
  const { releaseIntent, canRewireTo, isDropOnNode, clickSlopFor } = M.release;
  const o = { x: 100, y: 100, nodeId: null };
  check(releaseIntent(o, { x: 101, y: 100 }, { panning: true }).kind === 'click-background', '거의 안 움직였으면 배경 클릭');
  check(releaseIntent(o, { x: 140, y: 100 }, { panning: true }).kind === 'drag-end', '멀리 끌었으면 클릭이 아니다');
  check(releaseIntent(o, { x: 101, y: 100 }, {}).kind === 'drag-end', '밀기로 잡고 있던 게 아니면 배경 클릭 아님(고른 게 안 풀린다)');
  check(releaseIntent({ ...o, nodeId: 'n1' }, { x: 101, y: 100 }, { pressEdgeId: 'e1' }).kind === 'click-node',
    '카드가 그 밑을 지나는 선보다 먼저');
  check(releaseIntent(o, { x: 101, y: 100 }, { pressEdgeId: 'e1' }).kind === 'click-edge', '카드가 없으면 선 클릭');
  // 손가락은 마우스보다 훨씬 흔들린다 — 같은 8px 이 마우스면 「끌기」, 손가락이면 「눌렀다 뗌」.
  check(releaseIntent(o, { x: 108, y: 100 }, { panning: true }).kind === 'drag-end', '마우스 8px = 끌기');
  check(releaseIntent(o, { x: 108, y: 100, pointerType: 'touch' }, { panning: true }).kind === 'click-background',
    '손가락 8px 은 그냥 누른 것(안 그러면 폰에서 탭이 자꾸 씹힌다)');
  check(clickSlopFor('touch') > clickSlopFor('mouse'), '손가락 허용 흔들림이 마우스보다 크다');
  check(canRewireTo('n2', 'n1') === true, '다른 카드로 선 끝 옮기기 OK');
  check(canRewireTo('', 'n1') === false, '빈 자리에 놓으면 되돌린다');
  check(canRewireTo('n1', 'n1') === false, '반대편과 같은 카드면 되돌린다(선이 증발해 보인다)');
  check(isDropOnNode('n1', 'n2', 40) === true, '카드를 다른 카드 위에 떨어뜨리면 잇는다');
  check(isDropOnNode('n1', 'n1', 40) === false, '자기 자신 위는 아니다');
  check(isDropOnNode('n1', 'n2', 2) === false, '누른 것뿐이면 떨어뜨린 게 아니다');
}

// ---- 선 휘기 · 이름표 옮기기 (canvas-edgedrag)
{
  const { curveFromPointer, labelPosFromPointer, CURVE_LIMIT } = M.edgedrag;
  const a = { x: 0, y: 0 }, b = { x: 100, y: 0 };
  check(curveFromPointer(a, b, { x: 50, y: 0 }) === undefined, '한가운데 = 곧은 선(0 을 저장하지 않는다)');
  check(curveFromPointer(a, b, { x: 50, y: 0.5 }) === undefined, '손이 조금 떨린 정도는 곧은 선으로 되돌린다');
  const up = curveFromPointer(a, b, { x: 50, y: 20 });
  const down = curveFromPointer(a, b, { x: 50, y: -20 });
  check(up > 0 && down < 0 && Math.abs(up + down) < 1e-9, '위로 끌면 위로, 아래로 끌면 아래로 같은 크기');
  check(Math.abs(curveFromPointer(a, b, { x: 50, y: 9999 })) <= CURVE_LIMIT, '아무리 끌어도 한계에서 멈춘다');
  // 선 길이가 달라도 손을 「같은 비율」로 움직이면 같은 만큼 휜다 — 안 그러면 짧은 선이 미쳐 날뛴다.
  const long = curveFromPointer({ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 200, y: 80 });
  check(Math.abs(long - curveFromPointer(a, b, { x: 50, y: 20 })) < 1e-9, '선 길이가 달라도 휘는 비율은 같다');
  check(labelPosFromPointer(a, b, { x: 50, y: 30 }) === 0.5, '가운데로 끌면 이름표도 가운데');
  check(labelPosFromPointer(a, b, { x: -500, y: 0 }) === 0.05, '끝을 넘어가도 카드 뒤로 숨지 않는다');
  check(labelPosFromPointer(a, b, { x: 900, y: 0 }) === 0.95, '반대쪽 끝도 마찬가지');
}

// ---- 끌면 어디로 가나 (canvas-drag)
{
  const { worldDelta, snappedPoint, groupDelta, resizedBox, MIN_NODE_W, MIN_NODE_H } = M.drag;
  const snap = (v) => Math.round(v / 10) * 10;
  const d1 = worldDelta({ x: 0, y: 0 }, { x: 100, y: 50 }, 1);
  check(d1.dx === 100 && d1.dy === 50, '배율 1 이면 화면 거리 그대로');
  const d2 = worldDelta({ x: 0, y: 0 }, { x: 100, y: 50 }, 2);
  check(d2.dx === 50 && d2.dy === 25, '두 배로 확대돼 있으면 판 위에서는 절반만 움직인다');
  const p1 = snappedPoint(3, 7, { dx: 4, dy: 1 }, snap);
  check(p1.x === 10 && p1.y === 10, '카드 하나는 새 자리를 격자에 붙인다');
  // 이 파일의 핵심: 묶음은 **기준점만** 붙이고 그 이동량을 멤버 전원에게 얹는다.
  const g = groupDelta(0, 0, { dx: 13, dy: 27 }, snap);
  check(g.origin.x === 10 && g.origin.y === 30, '묶음 기준점이 격자에 붙는다');
  check(g.d.dx === 10 && g.d.dy === 30, '멤버에게 얹을 이동량 = 붙은 기준점과의 차이');
  const members = [{ x: 0, y: 0 }, { x: 7, y: 3 }, { x: 21, y: 44 }];
  const moved = members.map((m) => ({ x: m.x + g.d.dx, y: m.y + g.d.dy }));
  const gapBefore = members[2].x - members[1].x;
  const gapAfter = moved[2].x - moved[1].x;
  check(gapBefore === gapAfter, '끄는 내내 멤버끼리 간격이 한 픽셀도 안 변한다(모양이 안 뭉개진다)');
  const r = resizedBox(200, 100, { dx: -500, dy: -500 });
  check(r.w === MIN_NODE_W && r.h === MIN_NODE_H, '아무리 줄여도 최소 크기에서 멈춘다(지운 것처럼 보이지 않게)');
  const r2 = resizedBox(200, 100, { dx: 33.4, dy: 10.6 });
  check(r2.w === 233 && r2.h === 111, '크기는 정수로 떨어진다');
}

// ---- 손바닥만 한 판 (canvas-minimap)
{
  const { minimapWorthIt, minimapRects, MINIMAP_MIN_PX, EPHEMERAL_FILL } = M.minimap;
  const { fitProjection } = M.cmath;
  check(minimapWorthIt(0) === false && minimapWorthIt(3) === false, '카드가 서넛뿐이면 미니맵은 안 띄운다(검은 상자로 보인다)');
  check(minimapWorthIt(4) === true, '길을 잃을 만큼 커지면 띄운다');
  const bounds = { minX: 0, minY: 0, w: 4000, h: 3000 };
  const proj = fitProjection(bounds, { w: 160, h: 100 });
  const rects = minimapRects({
    groups: [{ bbox: { x: 0, y: 0, w: 1000, h: 800 }, color: '#ff0000' }],
    nodes: [{ x: 0, y: 0, w: 180, h: 60, color: '#00ff00' }, { x: 3800, y: 2900, w: 180, h: 60, color: '#00ff00' }],
    ephemeral: [{ x: 100, y: 100, w: 120, h: 40 }],
  }, bounds, proj);
  check(rects.length === 4, '묶음·카드·임시 카드가 모두 그려진다');
  check(rects[0].stroke === '#ff000030', '묶음이 맨 밑에 깔린다(그리는 순서 = 겹치는 순서)');
  check(rects[3].fill === EPHEMERAL_FILL, '흘러가는 카드는 늘 같은 물색');
  // 4000px 판을 160px 로 줄이면 카드는 7px 이 된다 — 더 큰 판에서도 점이 사라지면 안 된다.
  const tiny = minimapRects({ groups: [], nodes: [{ x: 0, y: 0, w: 4, h: 4, color: '#000000' }], ephemeral: [] }, bounds, proj);
  check(tiny[0].w >= MINIMAP_MIN_PX && tiny[0].h >= MINIMAP_MIN_PX, '아무리 줄여도 안 보일 만큼 작아지지 않는다');
  const far = rects[2];
  check(far.x > rects[1].x && far.y > rects[1].y, '판 반대편 카드는 미니맵에서도 반대편에 있다');
}

// 되돌아가지 않게: **캔버스 크기 자물쇠**.
// 2865 줄짜리 한 덩이를 조각내는 중이다. 자물쇠가 없으면 기능 두어 개면 도로 부푼다 —
// 지금 크기 + 조금을 상한으로 박아 두고, 줄어들면 상한도 같이 내린다(비율 아니라 실측).
{
  const CAP = 1950;
  const file = path.join(root, 'src/lib/graph/canvas.ts');
  const lines = fs.readFileSync(file, 'utf8').split(String.fromCharCode(10)).length;
  check(lines <= CAP, `canvas.ts 가 ${lines}줄 — 상한 ${CAP}줄을 넘었다(새 기능은 조각 파일로 빼라)`);
}
process.stdout.write('\n');
if (failures.length > 0) {
  console.error(`\nRESULT: FAIL (${failures.length})\n - ` + failures.join('\n - '));
  process.exit(1);
}
console.log('RESULT: PASS — KarmoMap 알맹이가 브라우저 없이 돈다');
