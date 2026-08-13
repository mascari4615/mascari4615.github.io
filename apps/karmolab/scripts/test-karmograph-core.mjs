/**
 * KarmoGraph 알맹이 — 브라우저 없이 도는 규칙들 (TASK-KL-202).
 *
 * 왜 있나: 지금까지 이 위젯을 지켜 온 것은 **화면검사 60항목 하나뿐**이었다. 그건 한 번 도는 데
 * 100초가 걸리고, 「글 안의 고리를 끊는가」·「연표가 작은 값을 왼쪽에 두는가」 같은 **순수한 셈법**까지
 * 브라우저를 띄워 확인해 왔다. 셈법이 깨졌는데 화면 어딘가가 가려 초록으로 보일 위험도 함께다.
 *
 * 그래서 순수 모듈(`lib/graph/notes` · `tidy` · `from-text` · `json-canvas` · `mermaid` · `sna`)만
 * esbuild 로 묶어 Node 에서 직접 돌린다. 1초 안에 끝나므로 canvas 해체 같은 큰 수술의 **안전망**이 된다.
 *
 * 사용: node scripts/test-karmograph-core.mjs   (npm run test:karmograph)
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
    export * as tidy from ${JSON.stringify(path.join(root, 'src/widgets/karmograph/tidy.ts'))};
    export * as fromText from ${JSON.stringify(path.join(root, 'src/widgets/karmograph/from-text.ts'))};
    export * as jsonCanvas from ${JSON.stringify(path.join(root, 'src/widgets/karmograph/json-canvas.ts'))};
    export * as mermaid from ${JSON.stringify(path.join(root, 'src/widgets/karmograph/mermaid.ts'))};
    export * as save from ${JSON.stringify(path.join(root, 'src/lib/graph/canvas-save.ts'))};
    export * as filter from ${JSON.stringify(path.join(root, 'src/lib/graph/canvas-filter.ts'))};
    export * as decor from ${JSON.stringify(path.join(root, 'src/lib/graph/canvas-decor.ts'))};
    export * as cmath from ${JSON.stringify(path.join(root, 'src/lib/graph/canvas-math.ts'))};
    export * as camera from ${JSON.stringify(path.join(root, 'src/lib/graph/canvas-camera.ts'))};
    export * as press from ${JSON.stringify(path.join(root, 'src/lib/graph/canvas-press.ts'))};
    export * as release from ${JSON.stringify(path.join(root, 'src/lib/graph/canvas-release.ts'))};
    export * as edgedrag from ${JSON.stringify(path.join(root, 'src/lib/graph/canvas-edgedrag.ts'))};
    export * as edgeViews from ${JSON.stringify(path.join(root, 'src/lib/graph/edge-views.ts'))};
    export * as table from ${JSON.stringify(path.join(root, 'src/widgets/karmograph/table-view.ts'))};
    export * as ripe from ${JSON.stringify(path.join(root, 'src/widgets/karmograph/ripeness.ts'))};
    export * as printSheet from ${JSON.stringify(path.join(root, 'src/widgets/karmograph/print-sheet.ts'))};
    export * as times from ${JSON.stringify(path.join(root, 'src/widgets/karmograph/times.ts'))};
    export * as poster from ${JSON.stringify(path.join(root, 'src/widgets/karmograph/poster-legend.ts'))};
    export * as posterDraw from ${JSON.stringify(path.join(root, 'src/widgets/karmograph/poster.ts'))};
    export * as fieldGaps from ${JSON.stringify(path.join(root, 'src/widgets/karmograph/field-gaps.ts'))};
    export * as clusters from ${JSON.stringify(path.join(root, 'src/widgets/karmograph/clusters.ts'))};
    export * as paste from ${JSON.stringify(path.join(root, 'src/widgets/karmograph/paste-intent.ts'))};
    export * as bigBoard from ${JSON.stringify(path.join(root, 'src/widgets/karmograph/big-board.ts'))};
    export * as views from ${JSON.stringify(path.join(root, 'src/widgets/karmograph/views.ts'))};
    export * as drag from ${JSON.stringify(path.join(root, 'src/lib/graph/canvas-drag.ts'))};
    export * as guides from ${JSON.stringify(path.join(root, 'src/lib/graph/canvas-guides.ts'))};
    export * as minimap from ${JSON.stringify(path.join(root, 'src/lib/graph/canvas-minimap.ts'))};
    export * as pick from ${JSON.stringify(path.join(root, 'src/lib/graph/canvas-pick.ts'))};
    export * as eph from ${JSON.stringify(path.join(root, 'src/lib/graph/canvas-ephemeral.ts'))};
    export * as share from ${JSON.stringify(path.join(root, 'src/widgets/karmograph/share.ts'))};
    export * as snaWords from ${JSON.stringify(path.join(root, 'src/widgets/karmograph/sna-words.ts'))};
    export * as between from ${JSON.stringify(path.join(root, 'src/widgets/karmograph/between.ts'))};
    export * as history from ${JSON.stringify(path.join(root, 'src/widgets/karmograph/history.ts'))};
    export * as sna from ${JSON.stringify(path.join(root, 'src/widgets/karmograph/sna.ts'))};
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
  const widget = fs.readFileSync(path.join(root, 'src/widgets/karmograph/karmograph.ts'), 'utf8');
  const wrong = widget.includes(String.fromCharCode(0x232B) + ' 로 되돌');
  check(!wrong, '「⌫ 로 되돌립니다」 안내가 남아 있다 — ⌫ 는 지우기다(되돌리기는 Ctrl+Z)');
}
// 도움말이 **낡지 않게**: 기능은 느는데 도움말은 그대로면 발견성이 그만큼 준다.
// 정확한 개수를 박으면 매번 고쳐야 하니 **하한**만 잠근다(줄어들면 누가 지운 것이다).
{
  const help = fs.readFileSync(path.join(root, 'src/widgets/karmograph/help.ts'), 'utf8');
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
  const r2 = resizedBox(200, 100, { dx: 33.4, dy: 10.6 }, 1);
  check(r2.w === 233 && r2.h === 111, 'Alt(격자 없음)면 1px 단위로 정수로 떨어진다');
  const r3 = resizedBox(200, 100, { dx: 33.4, dy: 10.6 });
  check(r3.w === 232 && r3.h === 112, '크기가 8px 격자에 붙는다 — 자리와 같은 격자');
  const r4 = resizedBox(203, 100, { dx: 0, dy: 0 });
  check(r4.w % 8 === 0, '격자 밖에 있던 카드도 손대는 순간 줄에 붙는다');
  check(MIN_NODE_W % 8 === 0 && MIN_NODE_H % 8 === 0,
    '최소 크기도 격자의 배수 — 제일 작은 카드만 줄이 어긋나면 안 된다');
}

/* 이웃 줄에 맞추기 (canvas-guides) — 격자가 못 맞추는 것을 맞춘다. */
{
  const { alignGuides, neighborBoxes } = M.guides;
  const other = { id: 'b', x: 100, y: 300, w: 120, h: 40 };
  const near = alignGuides({ id: 'a', x: 96, y: 0, w: 80, h: 40 }, [other], 7);
  check(near.x === 100, '왼쪽 줄이 4px 안이면 이웃의 왼쪽 줄에 붙는다');
  check(near.lines.some((l) => l.axis === 'v' && l.at === 100), '붙은 줄을 그어 보여 준다');
  check(near.lines[0].from <= 0 && near.lines[0].to >= 340, '선이 두 카드를 함께 지나간다(어디에 맞췄는지 읽힌다)');

  const far = alignGuides({ id: 'a', x: 40, y: 0, w: 30, h: 40 }, [other], 7);
  check(far.x === 40 && far.lines.length === 0, '멀면 안 붙고 줄도 안 뜬다(격자 결과를 안 건드린다)');

  // 폭이 제각각이면 가운데는 **격자 위에 없다** — 격자만으로는 영원히 못 맞추는 자리.
  const mid = alignGuides({ id: 'a', x: 121, y: 0, w: 78, h: 40 }, [other], 7);
  check(mid.x + 39 === 160, '가운데 줄에도 붙는다 (160 = 이웃의 가운데)');

  const two = alignGuides({ id: 'a', x: 96, y: 296, w: 80, h: 40 }, [other], 7);
  check(two.lines.length === 2, '가로·세로 각각 한 줄씩 — 축마다 하나만 잡는다');

  const self = alignGuides({ id: 'b', x: 102, y: 300, w: 120, h: 40 }, [other], 7);
  check(self.x === 102, '자기 자신에게는 안 붙는다');

  const boxes = neighborBoxes([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'a',
    (id) => (id === 'c' ? null : { x: 0, y: 0, w: 10, h: 10 }));
  check(boxes.length === 1 && boxes[0].id === 'b', '끄는 자기 자신과 자리 없는 카드는 상대에서 빠진다');
}

// ---- 손바닥만 한 판 (canvas-minimap)
{
  /* 나란히 놓기 · 고르게 벌리기 (2026-08-12) — 셈만 여기서 못 박는다. */
  {
    const { alignBoxes, spreadBoxes } = M.tidy;
    const boxes = [
      { id: 'a', x: 10, y: 0, w: 100, h: 40 },
      { id: 'b', x: 50, y: 100, w: 60, h: 40 },
      { id: 'c', x: 200, y: 200, w: 80, h: 40 },
    ];
    const left = alignBoxes(boxes, 'left');
    check(left.get('b').x === 10 && left.get('c').x === 10, '왼쪽 맞춤 — 가장 왼쪽에 선다');
    check(left.has('a') === false, '이미 맞은 것은 결과에 안 넣는다');
    const right = alignBoxes(boxes, 'right');
    check(right.get('a').x === 280 - 100, '오른쪽 맞춤 — 오른끝이 같아진다');
    const mid = alignBoxes(boxes, 'hcenter');
    check(mid.get('c').x === Math.round((10 + 280) / 2 - 40), '가로 가운데 맞춤');
    check(alignBoxes([boxes[0]], 'left').size === 0, '한 장만 골랐으면 아무것도 안 한다');

    const spread = spreadBoxes(boxes, 'x');
    const xs = [10, spread.get('b') ? spread.get('b').x : 50, 200];
    check(xs[1] > 10 && xs[1] < 200, '고르게 벌리기 — 가운데 것이 사이로 간다');
    check(spread.has('c') === false || spread.get('c').x === 200, '양끝은 그대로 둔다');
    check(spreadBoxes(boxes.slice(0, 2), 'x').size === 0, '두 장은 벌릴 사이가 없다');
  }

  const { minimapWorthIt, minimapRects, MINIMAP_MIN_PX, EPHEMERAL_FILL } = M.minimap;
  const { fitProjection } = M.cmath;
  check(minimapWorthIt(0) === false && minimapWorthIt(3) === false, '카드가 서넛뿐이면 미니맵은 안 띄운다(검은 상자로 보인다)');
  check(minimapWorthIt(4) === true, '길을 잃을 만큼 커지면 띄운다');
  check(minimapWorthIt(40, true) === false, '판 전체가 화면에 다 들어와 있으면 안 띄운다(길잡이가 할 일이 없다)');
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

// ---- 겹친 선 중에서 고르기 (canvas-pick)
{
  const { nextOverlapping } = M.pick;
  check(nextOverlapping([], null) === null, '아무것도 없으면 고를 것도 없다');
  check(nextOverlapping(['e1', 'e2', 'e3'], null) === 'e1', '처음 누르면 맨 위 선');
  check(nextOverlapping(['e1', 'e2', 'e3'], 'e1') === 'e2', 'Shift 를 누를 때마다 아래로 내려간다');
  // 끝에서 멈추면 사람은 그게 끝인지 고장인지 모른다 — 돌아온다.
  check(nextOverlapping(['e1', 'e2', 'e3'], 'e3') === 'e1', '마지막 다음은 처음으로 돌아온다');
  check(nextOverlapping(['e1', 'e2'], 'e9') === 'e1', '직전에 고른 선이 이 자리에 없으면 맨 위부터');
  check(nextOverlapping(['e1', 'e1', 'e2'], 'e1') === 'e2', '같은 선이 두 번 잡혀도 한 번으로 센다');
  check(nextOverlapping(['e1'], 'e1') === 'e1', '한 개뿐이면 그대로');
}

// ---- 흘러가는 카드의 이름 접기 (canvas-ephemeral)
{
  const { foldEphemeralLabel } = M.eph;
  check(foldEphemeralLabel('짧음', 200) === '짧음', '들어가면 그대로 둔다');
  const cut = foldEphemeralLabel('가나다라마바사아자차카타파하', 60);
  check(cut.endsWith('…'), '넘치면 잘리고 …가 붙는다(안 붙이면 이름이 저게 전부인 줄 안다)');
  check(cut.length < '가나다라마바사아자차카타파하'.length, '잘린 이름이 원래보다 짧다');
  check(foldEphemeralLabel('가나다라마바사', 0).length >= 4, '상자가 아무리 좁아도 네 글자는 남긴다');
}

// ---- 링크에서 사진만 덜어 내기 (share.stripImages)
{
  const { stripImages } = M.share;
  const spec0 = { nodes: [
    { id: 'a', avatar: { kind: 'image', value: 'data:image/webp;base64,AAAA' }, shape: 'photo' },
    { id: 'b', avatar: { kind: 'emoji', value: '🙂' }, shape: 'rect' },
    { id: 'c' },
  ] };
  const out = stripImages(spec0);
  check(out.removed === 1, '사진을 붙인 카드 수를 센다');
  check(out.spec.nodes[0].avatar === undefined, '사진은 빠진다(첫 글자 얼굴로 뜬다)');
  // 사진 없는 「사진 카드」는 빈 상자로 보인다 — 보통 카드로 되돌려 보낸다.
  check(out.spec.nodes[0].shape === 'rect', '사진 카드는 보통 카드로 되돌린다');
  check(out.spec.nodes[1].avatar.kind === 'emoji', '이모지 얼굴은 그대로(무게가 없다)');
  check(spec0.nodes[0].avatar.kind === 'image', '원본은 안 건드린다(사본을 만든다)');
}

// 되돌아가지 않게: **캔버스 크기 자물쇠**.
{
  const target = M.camera.cameraForRect({ x: 100, y: 50, w: 400, h: 200 }, 800, 600);
  eq(target.scale, 2, '장면 카메라는 화면에 맞는 배율을 고른다');
  eq(target.tx, -200, '장면 카메라는 world 중심을 화면 중심에 둔다(x)');
  eq(target.ty, 0, '장면 카메라는 world 중심을 화면 중심에 둔다(y)');
  eq(M.camera.cameraForRect({ x: 0, y: 0, w: 10000, h: 10000 }, 100, 100).scale, 0.1, '카메라 최소 배율');
  // 「전체 보기」는 1 을 넘겨 키우지 않는다 — 작은 판을 2배로 부풀리면 확대경이 된다.
  eq(M.camera.cameraForRect({ x: 0, y: 0, w: 100, h: 100 }, 800, 800, 0, 1).scale, 1, '맞춤은 100% 를 안 넘는다');
  check(M.camera.cameraForRect({ x: 0, y: 0, w: 100, h: 100 }, 800, 800).scale === 2, '발표 카메라는 그대로 당긴다');
  /* 「전체 보기」는 곧 **가운데 놓기**다. 옆으로 넓은 판(가로에 배율이 걸려 세로가 남는 판)에서
     남는 자리를 한쪽에 몰아 두면 그림이 화면 위쪽에만 붙는다 — 실측 2026-08-12, 40장짜리 판에서
     아래 636px 이 텅 비었다. 셈이 여기 있으므로 여기서 못 박는다(TASK-KL-234 계열). */
  {
    const wide = M.camera.cameraForRect({ x: 0, y: 0, w: 3000, h: 200 }, 900, 800, 60);
    const top = wide.ty;                       // 화면 위끝 ~ 그림 위끝
    const bottom = 800 - (wide.ty + 200 * wide.scale);
    check(Math.abs(top - bottom) < 1, `옆으로 넓은 판도 위아래 가운데 (위 ${Math.round(top)} · 아래 ${Math.round(bottom)})`);
    const left = wide.tx;
    const right = 900 - (wide.tx + 3000 * wide.scale);
    check(Math.abs(left - right) < 1, `좌우도 가운데 (왼 ${Math.round(left)} · 오른 ${Math.round(right)})`);
  }
}

// 되돌아가지 않게: **캔버스 크기 자물쇠**.
// 2865 줄짜리 한 덩이를 조각내는 중이다. 자물쇠가 없으면 기능 두어 개면 도로 부푼다 —
// 지금 크기 + 조금을 상한으로 박아 두고, 줄어들면 상한도 같이 내린다(비율 아니라 실측).
{
  const CAP = 1900;
  const file = path.join(root, 'src/lib/graph/canvas.ts');
  const lines = fs.readFileSync(file, 'utf8').split(String.fromCharCode(10)).length;
  check(lines <= CAP, `canvas.ts 가 ${lines}줄 — 상한 ${CAP}줄을 넘었다(새 기능은 조각 파일로 빼라)`);
}
// ── 할 수 있는 일 등록부 ⟷ 실제 손잡이 (TASK-KL-271 R4 / C5) ────────────────
// 「새 기능은 여기 한 줄 늘려라」 같은 **사람 규율에 기댄 목록은 반드시 드리프트한다** —
// 실제로 판 이름 바꾸기가 두 자리에 살아 있었다. 등록만 하고 안 이은 것, 손으로 적은 HTML 로
// 되돌아간 것을 기계가 잡는다.
{
  const reg = fs.readFileSync(path.join(root, 'src/widgets/karmograph/commands.ts'), 'utf8');
  const listed = [...reg.matchAll(/key: '([\w-]+)'/g)].map((m) => m[1]);
  const wid = fs.readFileSync(path.join(root, 'src/widgets/karmograph/karmograph.ts'), 'utf8');
  const wired = new Set([...wid.matchAll(/q<HTML\w+Element>\('([\w-]+)'\)\.onclick/g)].map((m) => m[1]));
  check(listed.length > 0, '등록부가 비었다 — commands.ts 를 못 읽었다');
  const dead = listed.filter((k) => !wired.has(k));
  check(dead.length === 0, `등록만 되고 손잡이가 없는 것: ${dead.join(', ')}`);
  const dupes = listed.filter((k, i) => listed.indexOf(k) !== i);
  check(dupes.length === 0, `등록부에 같은 손잡이가 두 번: ${dupes.join(', ')}`);
  check(/\$\{drawerHtml\(\)\}/.test(wid), '서랍이 등록부에서 안 그려진다(손으로 적은 HTML 로 되돌아갔다)');
}

// ── 손잡이를 놓은 자리 (TASK-KL-271 R1) ──────────────────────────────────────
// 「빈 곳에 놓으면 새 카드」가 붙으면서 규칙이 셋이 됐다 — 규칙이 느는 자리는 눈으로 볼 수 있는
// 순수 함수여야 검사로 잠근다(캔버스 본체 안 if 세 겹이면 손으로 끌어 보는 수밖에 없다).
{
  const fake = (id) => ({ closest: () => (id ? { dataset: { id } } : null) });
  eq(JSON.stringify(M.edgedrag.linkDropTarget(fake('node-2'), 'node-1')), '{"toId":"node-2"}',
    '다른 카드 위에 놓으면 그 카드로 잇는다');
  eq(M.edgedrag.linkDropTarget(fake(''), 'node-1'), 'empty', '빈 곳에 놓으면 새 카드 자리다');
  eq(M.edgedrag.linkDropTarget(null, 'node-1'), 'empty', '아무것도 없는 자리도 빈 곳이다');
  eq(M.edgedrag.linkDropTarget(fake('node-1'), 'node-1'), null, '자기 자신 위에 놓으면 아무 일도 없다');
}

// ── 되돌리기 더미의 무게 (TASK-KL-271 M4) ───────────────────────────────────
// 판 하나가 커지면 그대로 예순 배다 — 사진이 붙는 순간 탭이 죽는다. 수가 아니라 무게로 자른다.
{
  const { dropFromFront, HISTORY_MAX_STEPS, HISTORY_MAX_BYTES } = M.history;
  eq(dropFromFront([100, 100, 100]), 0, '가벼우면 아무것도 안 버린다');
  eq(dropFromFront(new Array(HISTORY_MAX_STEPS + 3).fill(10)), 3, '수가 넘치면 넘친 만큼만 버린다');
  const heavy = new Array(6).fill(HISTORY_MAX_BYTES / 2);
  check(dropFromFront(heavy) >= 4, `무거운 판은 앞에서 버린다 (버린 수 ${dropFromFront(heavy)})`);
  eq(dropFromFront([HISTORY_MAX_BYTES * 3]), 0, '한 판뿐이면 그 판은 안 버린다 — 방금 한 일은 되돌아가야 한다');
  const after = (sizes) => sizes.slice(dropFromFront(sizes)).reduce((a, b) => a + b, 0);
  check(after(new Array(60).fill(HISTORY_MAX_BYTES / 4)) <= HISTORY_MAX_BYTES,
    '버리고 나면 더미 전체가 상한 아래다');
}

// ── 같은 말이 두 열쇠에 (TASK-KL-271) ────────────────────────────────────────
// 이 작업의 발원 병이 그것이었다: 「이름 바꾸기」를 새로 만들면서 옛 자리를 못 지웠고, 같은 말이
// 두 곳에 살아 있다는 것을 **아무도 몰랐다**. 사람 눈 대신 기계가 본다.
// 짧은 말(이름·종류·메모)은 자리마다 같아도 되고, 도움말 목록과 어휘 팩은 이름을 그대로 비추는
// 것이 일이라 뺀다 — 걸러 낼 것은 **문장급으로 긴 말이 두 번 적힌 것**이다.
{
  const cat = JSON.parse(fs.readFileSync(path.join(root, 'i18n/ko/karmograph.json'), 'utf8'));
  const seen = new Map();
  const dups = [];
  for (const [k, v] of Object.entries(cat)) {
    if (typeof v !== 'string') continue;
    const t = v.trim();
    if (t.length < 12) continue;
    if (k.includes('.help.') || k.includes('.pack.')) continue;
    if (seen.has(t)) dups.push(`${seen.get(t)} = ${k}`);
    else seen.set(t, k);
  }
  check(dups.length === 0, `같은 말이 두 열쇠에 있다(문 둘이 될 자리): ${dups.join(' · ')}`);
}

// ── 두 카드 사이 (TASK-KL-271 X6) ───────────────────────────────────────────
// 관계도 앞에서 가장 자주 나오는 질문. 길찾기는 눈으로 못 보는 셈법이라(고리·끊긴 그래프) 여기서 잠근다.
{
  const E = [
    { from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd' },
    { from: 'a', to: 'x' }, { from: 'x', to: 'c' },
    { from: 'lone', to: 'lone' },
  ];
  const ad = M.between.between(E, 'a', 'd').path;
  eq(ad.length, 4, '가장 짧은 길의 길이(둘 다 3다리라 어느 쪽이든 4장)');
  eq(`${ad[0]}>${ad[ad.length - 1]}`, 'a>d', '길은 고른 두 장에서 시작해 끝난다');
  eq(M.between.between(E, 'a', 'd').path.join('>'), ad.join('>'), '같은 판에서 두 번 물으면 같은 답');
  eq(M.between.between(E, 'a', 'c').shared.join(','), 'b,x', '둘 다와 이어진 카드를 이름순으로');
  eq(M.between.between(E, 'a', 'zz').path.length, 0, '길이 없으면 빈 길');
  eq(M.between.between(E, 'a', 'a').path.join('>'), 'a', '같은 카드 둘이면 제자리');
  eq(M.between.between([{ from: 'p', to: 'q' }, { from: 'q', to: 'p' }], 'p', 'q').path.join('>'), 'p>q',
    '오가는 선이 있어도 고리에 안 빠진다');
}

// ── 관계망을 말로 (TASK-KL-271 L2) ──────────────────────────────────────────
// 숫자만 주면 「그래서 뭐?」로 끝난다. 무슨 말을 할지는 여기서 정하고, 여기서 잠근다.
{
  const { snaLines, islandCount } = M.snaWords;
  const kinds = (f) => snaLines(f).map((l) => l.kind).join(',');
  eq(kinds({ nodes: 0, edges: 0, lonely: [], islands: 0 }), 'empty', '아무것도 없으면 그렇게 말한다');
  eq(kinds({ nodes: 5, edges: 0, lonely: [], islands: 5 }), 'empty', '선이 없으면 순위 말은 뜻이 없다');
  eq(kinds({ nodes: 6, edges: 4, lonely: ['가'], islands: 2, hub: { name: 'ㄱ', count: 3 } }),
    'islands,lonely,hub', '놀라운 것 먼저 — 끊긴 조각 · 혼자 · 중심');
  eq(kinds({ nodes: 3, edges: 2, lonely: [], islands: 1, bridge: { name: 'ㄴ', score: 0.5 }, hub: { name: 'ㄱ', count: 2 } }),
    'hub', '셋 이하에서는 누구나 다리라 다리 말을 안 한다');
  eq(kinds({ nodes: 4, edges: 6, lonely: [], islands: 1, hub: { name: 'ㄱ', count: 1 } }),
    'dense', '할 말이 없으면 「고르게 이어져 있다」도 말이다');
  check(snaLines({ nodes: 9, edges: 9, lonely: ['a', 'b'], islands: 3, bridge: { name: 'x', score: 1 }, hub: { name: 'y', count: 4 } }).length <= 3,
    '말은 많아야 셋 — 넉 줄부터는 아무도 안 읽는다');

  eq(islandCount(['a', 'b', 'c'], [{ from: 'a', to: 'b' }]), 2, '안 이어진 카드는 제 조각이 된다');
  eq(islandCount(['a', 'b', 'c'], [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }]), 1, '다 이어지면 한 조각');
  eq(islandCount([], []), 0, '빈 판은 0 조각');
}

// -- 양쪽의 마음이 선 위 어디에 앉나 (TASK-KL-271 X1) -------------------------
{
  const { edgeViewChips, isAsymmetric } = M.edgeViews;
  eq(edgeViewChips({}).length, 0, '아무것도 안 적혔으면 안 그린다');
  eq(edgeViewChips({ viewFrom: '  ' }).length, 0, '공백만 적힌 것은 안 적은 것이다');
  const one = edgeViewChips({ viewFrom: '동생처럼' });
  eq(one.length, 1, '한쪽만 적히면 한 조각');
  eq(one[0].side, 'from', '적은 쪽이 출발이면 출발 것');
  check(one[0].at < 0.5, '출발의 마음은 출발 쪽(가운데보다 앞)에 앉는다');
  const onlyTo = edgeViewChips({ viewTo: '원망함' });
  check(onlyTo[0].at > 0.5, '도착의 마음은 도착 쪽에 앉는다');
  const named = edgeViewChips({ viewFrom: 'a', viewTo: 'b', label: '라이벌' });
  eq(named.length, 2, '둘 다 적히면 두 조각');
  const bare = edgeViewChips({ viewFrom: 'a', viewTo: 'b' });
  check(named[0].at < bare[0].at, '가운데에 관계 이름이 있으면 마음은 더 바깥으로 비켜 앉는다');
  check(bare[0].at < bare[1].at, '두 조각은 출발 -> 도착 순서로 앉는다');
  check(isAsymmetric({ viewFrom: '좋아함', viewTo: '싫어함' }), '서로 다르게 보면 비대칭이다');
  check(!isAsymmetric({ viewFrom: '같음', viewTo: '같음' }), '같은 말이면 비대칭이 아니다');
  check(!isAsymmetric({ viewFrom: '한쪽만' }), '한쪽만 적힌 것은 비대칭이라 못 부른다');
}

// -- 한 장으로 뽑을 때 붙일 범례 (TASK-KL-271 O1) ------------------------------
{
  const { posterLegend, legendWorthShowing } = M.poster;
  const L = (k) => ({ person: '인물', place: '장소', thing: '물건' })[k] ?? k;
  const E = (k) => ({ rel: '관련', foe: '적대' })[k] ?? k;
  const spec = {
    nodes: [{ kind: 'person' }, { kind: 'person' }, { kind: 'place' }, { kind: 'thing' }],
    edges: [{ kind: 'rel' }, { kind: 'rel' }, { kind: 'foe' }],
  };
  const r = posterLegend(spec, L, E);
  eq(r.nodes.length, 3, '판에 쓰인 카드 종류만 센다');
  eq(r.nodes[0].label, '인물', '많이 쓰인 종류가 앞에 선다');
  eq(r.nodes[0].count, 2, '몇 개인지도 같이 준다');
  eq(r.nodes[1].label + r.nodes[2].label, '물건장소', '수가 같으면 이름순 — 두 번 뽑아도 같은 그림');
  eq(r.edges[0].label, '관련', '관계도 같은 규칙');
  eq(r.edges[0].of, 'edge', '카드 줄과 관계 줄을 나눠 세운다');
  eq(posterLegend({ nodes: [{ kind: 'x' }], edges: [] }, L, E).edges.length, 0, '없는 것은 안 적는다');
  const many = { nodes: Array.from({ length: 12 }, (_, n) => ({ kind: `k${n}` })), edges: [] };
  const cut = posterLegend(many, L, E, 3);
  eq(cut.nodes.length, 3, '상한을 넘으면 자른다 — 범례가 그림을 잡아먹으면 안 된다');
  eq(cut.moreNodes, 9, '접힌 가짓수를 알려 준다');
  check(!legendWorthShowing(posterLegend({ nodes: [{ kind: 'person' }], edges: [] }, L, E)),
    '종류가 하나뿐이면 범례가 설명할 것이 없다');
  check(legendWorthShowing(r), '종류가 여럿이면 범례가 쓸모 있다');
}

// -- 자랑할 한 장 (TASK-KL-271 O1) --------------------------------------------
{
  const { wrapPoster, readSize, legendRows, HEAD_H } = M.posterDraw;
  const skin = { bg: '#111', text: '#fff', dim: '#aaa', line: '#333' };
  const art = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><g/></svg>';
  eq(readSize(art).w, 400, '그림 크기를 읽는다');
  eq(readSize('<div/>'), null, '그림이 아니면 크기가 없다');
  const L = [{ kind: 'person', label: '인물', count: 12, of: 'node' }];
  const out = wrapPoster(art, { title: '나의 세계관', stamp: '2026', legend: L, skin });
  check(out.includes('나의 세계관'), '제목이 그림에 박힌다');
  check(out.includes('2026'), '날짜도 박힌다');
  check(out.includes('인물 12'), '범례가 몇 개인지까지 적는다');
  const h = Number(/height="(\d+)"/.exec(out)[1]);
  check(h > 300 + HEAD_H, '제목줄과 범례줄만큼 세로가 는다');
  check(out.includes(`<svg x="0" y="${HEAD_H}"`), '그림은 그대로 안쪽에 앉는다(안 건드린다)');
  eq(wrapPoster('<div/>', { title: 'x', legend: [], skin }), '<div/>',
    '크기를 못 읽으면 틀을 안 씌운다 — 잘못 씌우느니 안 씌운다');
  const bare = wrapPoster(art, { title: 'x', legend: [], skin });
  eq(Number(/height="(\d+)"/.exec(bare)[1]), 300 + HEAD_H, '범례가 없으면 아래 틀도 없다');
  const many = Array.from({ length: 9 }, (_, n) => ({ kind: `k${n}`, label: `종류${n}`, count: 1, of: 'node' }));
  check(legendRows(many, 400, false).length > 1, '폭을 넘으면 다음 줄로 접는다');
  eq(legendRows(many, 4000, false).length, 1, '넓으면 한 줄로 선다');
  check(wrapPoster(art, { title: '<b>&', legend: [], skin }).includes('&lt;b&gt;&amp;'),
    '제목에 꺾쇠가 있어도 그림이 안 깨진다');
}

// -- 아직 안 적은 칸 (TASK-KL-271 L6) ------------------------------------------
{
  const { fieldGaps } = M.fieldGaps;
  const card = (kind, fields) => ({ kind, fields });
  const board = [
    card('person', { '출신': '마계', '첫 등장': '' }),
    card('person', { '출신': '', '첫 등장': '' }),
    card('person', { '출신': '  ', '첫 등장': '' }),
    card('place', { '넓이': '' }),
  ];
  const g = fieldGaps(board);
  eq(g[0].field, '첫 등장', '아무도 안 적은 칸이 먼저 — 놀랍고, 대개 그 칸이 쓸모없다는 신호');
  check(g[0].none, '다 비었으면 none');
  eq(g[0].missing, 3, '세 장 다 안 적었다');
  eq(g[0].total, 3, '그 종류가 몇 장인지도 같이 준다');
  eq(g[1].field, '출신', '그다음은 많이 빈 것');
  eq(g[1].missing, 2, '공백만 적은 것도 안 적은 것이다');
  check(!g.some((x) => x.kind === 'place'), '한 장뿐인 종류는 재촉하지 않는다');
  eq(fieldGaps([card('person', { '출신': 'a' }), card('person', { '출신': 'b' })]).length, 0,
    '다 적었으면 할 말이 없다');
  eq(fieldGaps([]).length, 0, '빈 판은 할 말이 없다');
  const many = Array.from({ length: 9 }, (_, n) => card('person', { [`칸${n}`]: '' }));
  eq(fieldGaps(many).length, 3, '많아야 셋 — 넉 줄부터는 안 읽는다');
  // 같은 판은 두 번 봐도 같은 순서여야 한다(이름순 되풀이 확인).
  const tie = [card('p', { 'ㄴ': '', 'ㄱ': '' }), card('p', { 'ㄴ': '', 'ㄱ': '' })];
  eq(fieldGaps(tie).map((x) => x.field).join(''), 'ㄱㄴ', '수가 같으면 이름순');
}

// -- 무리 찾기 (TASK-KL-271 L3) ------------------------------------------------
{
  const { findClusters, clustersWorthTelling } = M.clusters;
  const E = (a, b) => ({ from: a, to: b });
  eq(findClusters([], []).length, 0, '빈 판은 무리가 없다');
  eq(findClusters(['a'], []).length, 1, '혼자인 카드도 한 무리로 센다');
  // 삼각형 둘이 다리 하나로 이어진 판 — 눈으로는 두 패인데 다 이어져 있다.
  const ids = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'];
  const es = [E('a1', 'a2'), E('a2', 'a3'), E('a3', 'a1'), E('b1', 'b2'), E('b2', 'b3'), E('b3', 'b1'), E('a1', 'b1')];
  const cs = findClusters(ids, es);
  eq(cs.length, 2, '다 이어져 있어도 두 패로 나뉜다');
  eq(cs[0].members.length + cs[1].members.length, 6, '아무도 빠지지 않는다');
  check(cs.every((c) => c.members.length === 3), '삼각형 둘이니 셋씩');
  const same = ['a1', 'a2', 'a3'].every((x) => cs.some((c) => c.members.includes(x) && c.members.includes('a2')));
  check(same, '같은 삼각형은 한 무리에 든다');
  // 같은 판을 두 번 돌려도 같은 답 — 이게 안 되면 「어제 본 무리」와 달라져 아무도 안 믿는다.
  const a = JSON.stringify(findClusters(ids, es));
  const b2 = JSON.stringify(findClusters([...ids].reverse(), [...es].reverse()));
  eq(a, b2, '카드·선 순서를 뒤집어도 같은 답');
  check(cs[0].members.join('') < cs[1].members.join('') || cs[0].members.length >= cs[1].members.length,
    '큰 무리부터, 같으면 이름 순');
  eq(findClusters(['x', 'y'], [E('x', 'x')]).length, 2, '제자리 선은 아무도 안 잇는다');
  eq(findClusters(['x'], [E('x', 'zz')]).length, 1, '판에 없는 카드로 가는 선은 안 센다');
  check(!clustersWorthTelling(findClusters(['a', 'b'], [E('a', 'b')])), '다 한 패면 할 말이 없다');
  check(!clustersWorthTelling(findClusters(['a', 'b'], [])), '전부 혼자면 그건 무리 이야기가 아니다');
  check(clustersWorthTelling(cs), '두 패로 갈리면 말할 만하다');
}

// -- 붙여넣으면 무슨 뜻인가 (TASK-KL-271 X5) -----------------------------------
{
  const { pasteIntent } = M.paste;
  const base = { hasImage: true, selectedId: 'n1', typing: false, visible: true };
  eq(pasteIntent(base), 'avatar', '카드를 골라 두고 그림을 붙이면 그 카드의 얼굴');
  eq(pasteIntent({ ...base, selectedId: null }), 'need-card', '고른 카드가 없으면 먼저 고르라고 한다');
  // 이 한 줄이 이 조각의 존재 이유다 — 이름 칸에 글을 붙이다 얼굴이 바뀌면 「내가 뭘 눌렀지」가 된다.
  eq(pasteIntent({ ...base, typing: true }), 'ignore', '글을 치는 중이면 절대 안 가로챈다');
  eq(pasteIntent({ ...base, hasImage: false }), 'ignore', '그림이 아니면 우리 일이 아니다');
  eq(pasteIntent({ ...base, visible: false }), 'ignore', '다른 도구를 보는 중이면 남의 붙여넣기다');
  eq(pasteIntent({ hasImage: false, selectedId: null, typing: true, visible: false }), 'ignore',
    '아무 조건도 안 맞으면 가만히 있는다');
}

// -- 판이 커지면 둘레만 보자고 권한다 (TASK-KL-271 L1) --------------------------
{
  const { shouldOfferFocus, CROWD_AT } = M.bigBoard;
  check(!shouldOfferFocus(10, false, true), '작은 판에서는 안 권한다 — 다 보이는데 덜 보라는 건 잔소리');
  check(shouldOfferFocus(CROWD_AT + 1, false, true), '넘으면 권한다');
  check(!shouldOfferFocus(CROWD_AT, false, true), '경계값에서는 아직 안 권한다');
  check(!shouldOfferFocus(999, true, true), '이미 둘레만 보는 중이면 또 안 권한다');
  check(!shouldOfferFocus(999, false, false), '고른 카드가 없으면 「무엇의 둘레」인지가 없다');
}

// -- 보기를 이름 붙여 저장 (TASK-KL-271 O2) ------------------------------------
{
  const { captureView, applyView, upsertView, isNameUsable } = M.views;
  const live = () => ({
    nodeKinds: new Set(['place']), edgeKinds: new Set(), tags: new Set(['비밀']),
    hideOrphans: true, minDegree: 2, fieldName: '출신', fieldValue: '마계',
  });
  const v = captureView('  1부 시점  ', live(), '2', 'v1');
  eq(v.name, '1부 시점', '이름 앞뒤 공백은 떼고 적는다');
  eq(v.offNodeKinds.join(','), 'place', '뺀 종류를 글로 적을 수 있는 꼴로 담는다');
  eq(v.focus, '2', '둘레 몇 다리까지 보는지도 함께');
  const target = { nodeKinds: new Set(['x']), edgeKinds: new Set(['y']), tags: new Set(),
    hideOrphans: false, minDegree: 0, fieldName: '', fieldValue: '' };
  const focus = applyView(v, target);
  eq(focus, '2', '되살리면 둘레도 같이 돌아온다');
  eq([...target.nodeKinds].join(','), 'place', '옛 거르기는 지우고 저장본으로 갈아 끼운다');
  eq([...target.edgeKinds].length, 0, '저장본에 없던 것은 남기지 않는다');
  eq(target.minDegree, 2, '숫자도 그대로');
  // 옛 저장본(없는 값)을 「참」으로 읽으면 카드가 말없이 사라진다 — 안 거른 상태로 되살린다.
  const bare = applyView({ id: 'x', name: 'x' }, target);
  eq(bare, '', '없는 값은 전부 보기로');
  eq(target.hideOrphans, false, '없는 값은 거짓으로');
  eq(target.minDegree, 0, '없는 숫자는 0 으로');
  const one = upsertView([], v);
  eq(one.length, 1, '새 이름은 뒤에 붙는다');
  const same = upsertView(one, captureView('1부 시점', live(), '', 'v2'));
  eq(same.length, 1, '같은 이름은 덮어쓴다 — 둘이면 고를 때 구분이 안 된다');
  eq(same[0].id, 'v1', '덮어써도 그 자리의 id 는 지킨다');
  eq(same[0].focus, '', '덮어쓴 내용은 새것');
  check(!isNameUsable('   '), '이름이 비면 저장하지 않는다');
  check(isNameUsable('적대만'), '이름이 있으면 저장한다');
}

// -- 같은 자료를 표로 (TASK-KL-271 L4) -----------------------------------------
{
  const { tableColumns, tableRows, sortRows, nextSort } = M.table;
  const KL = (k) => ({ person: '인물', place: '장소' })[k] ?? k;
  const ns = [
    { id: 'n1', label: '나중', kind: 'person', fields: { '출신': '마계', '첫 등장': '' } },
    { id: 'n2', label: '가운데', kind: 'place', fields: { '출신': '' } },
    { id: 'n3', label: '가장먼저', kind: 'person', fields: { '출신': '천계', '넓이': '3' } },
  ];
  const cols = tableColumns(ns);
  eq(cols[0], '출신', '많이 쓰인 칸이 앞 열');
  check(cols.includes('첫 등장'), '아무도 안 적은 칸도 열로 세운다 — 비어 있다는 것이 곧 보여 줄 것이다');
  eq(tableColumns(ns, 1).length, 1, '열은 상한까지만 — 표가 옆으로 새면 못 읽는다');
  const rows = tableRows(ns, cols);
  eq(rows.length, 3, '카드마다 한 줄');
  eq(rows[0].cells['출신'], '마계', '칸 값을 담는다');
  const narrow = tableRows(ns, ['출신']);
  eq(narrow[0].cells['넓이'] ?? 'x', 'x', '열에 없는 칸은 안 담는다 — 표가 옆으로 새는 것을 막는다');
  const byName = sortRows(rows, { by: '', dir: 'up' }, KL);
  eq(byName.map((r) => r.label).join(','), '가운데,가장먼저,나중', '이름순');
  const down = sortRows(rows, { by: '', dir: 'down' }, KL);
  eq(down[0].label, '나중', '거꾸로도 된다');
  const byField = sortRows(rows, { by: '출신', dir: 'up' }, KL);
  eq(byField[byField.length - 1].label, '가운데', '빈 칸은 언제나 뒤 — 오름차순');
  const byFieldDown = sortRows(rows, { by: '출신', dir: 'down' }, KL);
  eq(byFieldDown[byFieldDown.length - 1].label, '가운데', '빈 칸은 언제나 뒤 — 내림차순에서도');
  const byKind = sortRows(rows, { by: 'kind', dir: 'up' }, KL);
  eq(byKind[0].kind, 'person', '종류는 사람이 읽는 이름으로 줄 세운다');
  // 같은 판을 두 번 열면 같은 표여야 한다.
  eq(JSON.stringify(sortRows(rows, { by: '출신', dir: 'up' }, KL)),
    JSON.stringify(sortRows([...rows].reverse(), { by: '출신', dir: 'up' }, KL)), '들어온 순서와 무관');
  eq(nextSort({ by: '', dir: 'up' }, '출신').dir, 'up', '다른 열을 누르면 오름차순으로 시작');
  eq(nextSort({ by: '출신', dir: 'up' }, '출신').dir, 'down', '같은 열을 다시 누르면 뒤집힌다');
}

// -- 이 카드가 얼마나 익었나 (TASK-KL-271 L5) ----------------------------------
{
  const { ripenessOf, worthNudging } = M.ripe;
  eq(ripenessOf({}).ripe, 'none', '칸이 없는 카드는 말할 것이 없다');
  eq(ripenessOf({ fields: { a: '', b: '' } }).ripe, 'seed', '칸은 있는데 하나도 안 적으면 씨앗');
  eq(ripenessOf({ fields: { a: '값', b: '' } }).ripe, 'growing', '얼마쯤 적으면 자라는 중');
  eq(ripenessOf({ fields: { a: '값' } }).ripe, 'firm', '있는 칸을 다 적으면 굳음');
  eq(ripenessOf({ fields: { a: '  ', b: '값' } }).filled, 1, '공백만 적은 것은 안 적은 것이다');
  eq(ripenessOf({ fields: { a: '값', b: '' } }).total, 2, '이 카드가 가진 칸 수도 함께');
  check(worthNudging(ripenessOf({ fields: { a: '' } })), '남은 것이 있으면 말을 건다');
  check(!worthNudging(ripenessOf({ fields: { a: '값' } })), '다 적은 카드에 잔소리하지 않는다');
  check(!worthNudging(ripenessOf({})), '칸 없는 카드에도 말 안 건다');
}

// -- 종이 한 장으로 (TASK-KL-271 O7) -------------------------------------------
{
  const { printSheetHtml, isWide } = M.printSheet;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="400"><g/></svg>';
  const tall = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="900"><g/></svg>';
  check(isWide(svg), '가로로 길면 눕혀 찍는다');
  check(!isWide(tall), '세로로 길면 세워 찍는다');
  check(!isWide('<div/>'), '그림이 아니면 세워 찍는다(모르면 안전한 쪽)');
  const html = printSheetHtml({ title: '나의 세계관', svg, landscape: isWide(svg) });
  check(html.includes('@page { size: A4 landscape'), 'A4 로 눕혀 찍는다');
  check(html.includes('<title>나의 세계관</title>'), '창 이름 = PDF 파일 이름');
  check(html.includes(svg), '뽑을 그림이 그대로 실린다');
  check(/background:#fff/.test(html), '종이는 흰 바탕 — 어두운 판 색을 실으면 잉크를 다 먹는다');
  check(/max-width:100%/.test(html), '넘치면 줄인다 — 자르면 오른쪽 인물이 통째로 사라진다');
  check(!/print\(\)/.test(html), '인쇄창을 여기서 띄우지 않는다(부르는 쪽 일)');
  const risky = printSheetHtml({ title: '<b>&', svg });
  check(risky.includes('&lt;b&gt;&amp;'), '제목에 꺾쇠가 있어도 문서가 안 깨진다');
  check(risky.includes('@page { size: A4 portrait'), '기본은 세워 찍기');
}

// -- 시점에 따라 관계가 변한다 (TASK-KL-271 X2 골격) ---------------------------
{
  const { edgeAt, isTimed, stepTime, nextTimeName, forgetTime } = M.times;
  const plain = { label: '소꿉친구', kind: 'rel' };
  // 1. 원본이 기본값 — 시점을 안 쓰는 판은 아무것도 안 달라진다(옛 판을 건드리면 그건 고장이다).
  eq(edgeAt(plain, '').label, '소꿉친구', '시점이 없으면 원래 모습');
  eq(edgeAt(plain, 't2').label, '소꿉친구', '적어 둔 것이 없는 시점도 원래 모습');
  const timed = { label: '소꿉친구', kind: 'rel', at: { t2: { label: '라이벌', kind: 'foe' } } };
  eq(edgeAt(timed, 't1').label, '소꿉친구', '1부에서는 원래대로');
  eq(edgeAt(timed, 't2').label, '라이벌', '2부에서는 다른 이름');
  eq(edgeAt(timed, 't2').kind, 'foe', '2부에서는 다른 색');
  // 2. 덮어쓰기는 부분 — 이름만 바뀌었으면 색은 원본을 따른다.
  const partial = { label: '동료', kind: 'rel', at: { t2: { label: '앙숙' } } };
  eq(edgeAt(partial, 't2').kind, 'rel', '이름만 바꿨으면 색은 그대로');
  eq(edgeAt(partial, 't2').label, '앙숙', '바꾼 이름은 바뀐다');
  // 3. 사라짐도 하나의 상태 — 빈 이름으로 두면 이름 없는 선이 그려진다.
  const later = { label: '연인', kind: 'rel', at: { t1: { gone: true } } };
  eq(edgeAt(later, 't1'), null, '아직 안 만난 사이는 그리지 않는다');
  check(edgeAt(later, 't2') !== null, '그 뒤에는 그린다');
  check(isTimed(timed) && !isTimed(plain), '시점 이야기를 하는 선만 골라낼 수 있다');
  // 시점 옮기기 — 끝에서 더 가면 제자리(돌아 나오면 「처음으로 왔나」를 못 읽는다).
  const ts = [{ id: 'a', name: '1부' }, { id: 'b', name: '2부' }, { id: 'c', name: '3부' }];
  eq(stepTime(ts, 'a', 1), 'b', '다음 시점');
  eq(stepTime(ts, 'c', 1), 'c', '마지막에서 더 가도 제자리');
  eq(stepTime(ts, 'a', -1), 'a', '처음에서 뒤로 가도 제자리');
  eq(stepTime(ts, '', 1), 'b', '지금 시점을 모르면 첫 시점에서 센다');
  eq(stepTime([], 'a', 1), '', '시점이 없으면 갈 데도 없다');
  eq(nextTimeName(ts, (n) => `${n}부`), '4부', '새 시점은 번호를 달고 나온다');
  // 시점을 지우면 그 시점 얼굴도 함께 — 안 지우면 아무도 못 보는 자료가 남는다.
  const cleaned = forgetTime([timed, partial, plain], 't2');
  eq(cleaned[0].at, undefined, '마지막 얼굴을 지우면 자리도 없앤다');
  eq(cleaned[2].label, '소꿉친구', '상관없는 선은 안 건드린다');
  eq(forgetTime([timed], 't9')[0].at.t2.label, '라이벌', '없는 시점을 지워도 남은 것은 그대로');
}

// -- 이 시점의 얼굴 고치기 (TASK-KL-271 X2) ------------------------------------
{
  const { setFace, edgeAt, isTimed } = M.times;
  const base = { label: '소꿉친구', kind: 'rel' };
  const named = setFace(base, 't2', { label: '라이벌' });
  eq(edgeAt(named, 't2').label, '라이벌', '이 시점의 이름을 적는다');
  eq(edgeAt(named, 't1').label, '소꿉친구', '다른 시점은 그대로');
  const back = setFace(named, 't2', { label: '   ' });
  check(!isTimed(back), '이름을 비우면 자리째 지운다 — 빈 껍데기가 쌓이면 표시가 거짓이 된다');
  eq(edgeAt(back, 't2').label, '소꿉친구', '지우면 원래대로');
  const gone = setFace(base, 't1', { gone: true });
  eq(edgeAt(gone, 't1'), null, '이 시점에는 없음');
  const kindOnly = setFace(base, 't2', { kind: 'foe' });
  eq(edgeAt(kindOnly, 't2').kind, 'foe', '색만 바꾸기');
  eq(edgeAt(kindOnly, 't2').label, '소꿉친구', '이름은 원본을 따른다');
  eq(setFace(base, '', { label: 'x' }).at, undefined, '시점이 없으면 아무 데도 안 적는다');
  const two = setFace(setFace(base, 't1', { gone: true }), 't2', { label: '라이벌' });
  eq(Object.keys(two.at).length, 2, '시점마다 따로 쌓인다');
  eq(Object.keys(setFace(two, 't1', {}).at).length, 1, '한 시점만 지워도 나머지는 남는다');
}

// -- 지금 시점의 선들 (TASK-KL-271 X2 — 읽어 세는 곳도 시점을 따른다) -----------
{
  const { resolveEdges } = M.times;
  const es = [
    { id: 'e1', label: '소꿉친구', kind: 'rel', at: { t2: { label: '라이벌', kind: 'foe' } } },
    { id: 'e2', label: '연인', kind: 'rel', at: { t2: { gone: true } } },
    { id: 'e3', label: '이웃', kind: 'rel' },
  ];
  eq(resolveEdges(es, '').length, 3, '시점을 안 쓰면 원본 그대로');
  eq(resolveEdges(es, 't1').map((e) => e.label).join(','), '소꿉친구,연인,이웃', '적어 둔 것 없는 시점도 원본');
  const t2 = resolveEdges(es, 't2');
  eq(t2.length, 2, '이 시점에 없는 선은 빠진다');
  eq(t2[0].label, '라이벌', '이름이 그 시점 것으로 바뀐다');
  eq(t2[0].kind, 'foe', '색도');
  eq(es[0].label, '소꿉친구', '원본은 안 건드린다(사본을 준다)');
  check(t2[1] === es[2], '안 바뀐 선은 사본을 안 만든다(쓸데없이 새 물건을 찍지 않는다)');
}

// -- 보기에 「언제를 보고 있었나」까지 (TASK-KL-271 X2) -------------------------
{
  const { captureView, applyView } = M.views;
  const live = { nodeKinds: new Set(), edgeKinds: new Set(), tags: new Set(),
    hideOrphans: false, minDegree: 0, fieldName: '', fieldValue: '' };
  eq(captureView('1부만', live, '', 'v1', 't2').time, 't2', '보고 있던 시점도 담는다');
  eq(captureView('지금', live, '', 'v2').time, '', '시점을 안 쓰는 판이면 빈 값');
  // 옛 저장본(시점이 없던 시절)을 되살려도 아무 일도 안 일어나야 한다.
  const target = { nodeKinds: new Set(), edgeKinds: new Set(), tags: new Set(),
    hideOrphans: true, minDegree: 3, fieldName: 'x', fieldValue: 'y' };
  applyView({ id: 'old', name: '옛것', focus: '' }, target);
  eq(target.minDegree, 0, '옛 저장본도 탈 없이 되살아난다');
}

// -- 새로 넣은 기능이 도움말에도 있나 (TASK-KL-271 C5) --------------------------
// 「못 찾는 기능은 없는 것과 같다」 — 사람 규율 대신 짝을 기계가 지킨다.
{
  const help = fs.readFileSync(path.join(root, 'src/widgets/karmograph/help.ts'), 'utf8');
  const ko = JSON.parse(fs.readFileSync(path.join(root, 'i18n/ko/karmograph.json'), 'utf8'));
  const said = Object.entries(ko)
    .filter(([k]) => k.startsWith('karmograph.help.'))
    .map(([, v]) => String(v)).join(' ');
  const must = ['시점', '저장한 보기', '인쇄', '블로그', '두 사람 사이', '안 적은 칸', 'Ctrl+V'];
  for (const word of must) {
    check(said.includes(word), `도움말에 「${word}」 이야기가 없다 — 넣고 안 적으면 숨은 기능이다`);
  }
  const items = (help.match(/what:/g) ?? []).length;
  check(items >= 55, `도움말 항목이 ${items}개 — 55개 밑으로 줄었다(기능은 느는데 도움말이 낡는 중)`);
}

process.stdout.write('\n');
if (failures.length > 0) {
  console.error(`\nRESULT: FAIL (${failures.length})\n - ` + failures.join('\n - '));
  process.exit(1);
}
console.log('RESULT: PASS — KarmoGraph 알맹이가 브라우저 없이 돈다');
