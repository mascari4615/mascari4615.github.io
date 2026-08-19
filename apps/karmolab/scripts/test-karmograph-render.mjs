/**
 * 판을 **편집기 없이** 그릴 수 있는가 (TASK-KL-326).
 *
 * 이 검사가 있는 이유: 문서 안 도해는 브라우저 DOM 없이 만들어져야 한다. 여기서 `document`
 * 를 한 번이라도 만지면 서버·MCP 에서 터진다 — 그래서 **전역에 `document` 를 안 두고** 돌린다.
 * 그림이 나왔나만 보지 않고 **문서 도구가 실제로 내주는 그림**을 그린다 —
 * `js/widgets/docs/karmolab-ai.md` (`DOCS_BASE` 가 가리키는 폴더. `docs/ROADMAP.md` 는
 * 깃허브에서 읽히는 다른 파일이라 이 도구가 안 연다).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const ok = [];

const entry = `
  export { specFromMermaid } from ${JSON.stringify(path.join(ROOT, 'src/lib/karmograph/from-mermaid.ts'))};
  export { renderGraphSvg } from ${JSON.stringify(path.join(ROOT, 'src/lib/karmograph/render.ts'))};
`;

const bundled = await build({
  stdin: { contents: entry, resolveDir: ROOT, loader: 'ts' },
  bundle: true, format: 'esm', write: false, platform: 'neutral', target: 'es2020',
});
const code = bundled.outputFiles[0].text;
const mod = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

/* ── ① 브라우저 없이 도는가 ─────────────────────────────────────────────────
   `document` 가 전역에 없는 채로 돌린다. 캔버스를 실수로 끌어오면 여기서 바로 터진다. */
if (typeof globalThis.document !== 'undefined') {
  problems.push('이 검사는 document 가 없는 자리에서 돌아야 뜻이 있다');
}

/* ── ② 문서에 실제로 들어 있는 그림 ─────────────────────────────────────── */
const served = path.join(ROOT, 'js/widgets/docs/karmolab-ai.md');
const md = fs.readFileSync(served, 'utf8');
const block = /```mermaid\r?\n([\s\S]*?)\r?\n```/.exec(md);
if (block === null) {
  problems.push('karmolab-ai.md 에 mermaid 블록이 없다 — 검사가 잴 것을 잃었다');
} else {
  const { spec, diagram } = mod.specFromMermaid(block[1]);
  if (diagram.kind !== 'flowchart') problems.push(`서빙되는 그림을 흐름도로 못 읽었다 (kind=${diagram.kind})`);
  if (diagram.unknown.length > 0) problems.push(`못 읽은 줄 ${diagram.unknown.length}개: ${diagram.unknown[0]}`);
  const at = (id) => spec.nodes.find((node) => node.id === id);
  if (spec.nodes.length !== 4) problems.push(`마디가 4개여야 하는데 ${spec.nodes.length}개다`);
  if (spec.edges.length !== 3) problems.push(`화살이 3개여야 하는데 ${spec.edges.length}개다`);
  // subgraph 두 개(브라우저 KarmoLab·Node) — 이게 빠지면 「누가 어느 쪽인가」가 통째로 사라진다.
  if (spec.groups.length !== 2) problems.push(`묶음이 2개여야 하는데 ${spec.groups.length}개다`);
  if (spec.groups.find((g) => g.label === '브라우저 KarmoLab') === undefined) {
    problems.push('묶음 이름 「브라우저 KarmoLab」 을 못 읽었다');
  }
  if (at('GT') && at('GT').group !== 'kl') problems.push('GT 가 kl 묶음에 안 들어갔다');

  // 층 쌓기 — 셋 다 `PKG` 를 가리키므로 GT·YB·KAK 이 같은 층, PKG 가 그 다음이어야 한다.
  const dirAxis = (node) => (diagram.dir === 'LR' ? node.x : node.y);
  if (at('GT') && at('YB') && dirAxis(at('GT')) !== dirAxis(at('YB'))) {
    problems.push('들어오는 화살이 없는 둘(GT·YB)이 같은 층에 안 섰다');
  }
  if (at('PKG') && at('GT') && dirAxis(at('PKG')) <= dirAxis(at('GT'))) {
    problems.push('PKG 는 GT 보다 뒤 층이어야 한다 (GT --> PKG)');
  }
  if (problems.length === 0) ok.push(`서빙 흐름도 — 마디 ${spec.nodes.length} · 화살 ${spec.edges.length} · 묶음 ${spec.groups.length} · 층 쌓기 정상`);

  const svg = mod.renderGraphSvg(spec, { title: 'ROADMAP' });
  if (!svg.startsWith('<svg ')) problems.push('SVG 가 <svg 로 시작하지 않는다');
  if (!svg.includes('</svg>')) problems.push('SVG 가 안 닫혔다');
  if (!svg.includes('viewBox=')) problems.push('viewBox 가 없다 — 문서에서 크기가 안 맞는다');
  for (const node of spec.nodes) {
    if (!svg.includes(node.label.slice(0, 8))) problems.push(`마디 "${node.label}" 가 그림에 없다`);
  }
  if (svg.split('<path').length - 1 < spec.edges.length) problems.push('화살 수보다 그려진 선이 적다');
  if (problems.length === 0) ok.push(`SVG ${svg.length}자 — 마디·화살·viewBox 다 있다`);
}

/* ── ③ 사람이 쓴 글이 그림을 깨뜨리지 않는가 ───────────────────────────── */
const nasty = mod.specFromMermaid('flowchart TD\n  A["<script>&오"] --> B["따\'옴"]');
const nastySvg = mod.renderGraphSvg(nasty.spec);
if (nastySvg.includes('<script>')) problems.push('라벨 안 태그가 그대로 나갔다 — 문서에 넣으면 그게 실행된다');
if (!nastySvg.includes('&amp;')) problems.push('& 가 안 감싸졌다 — SVG 가 깨진다');
if (problems.length === 0) ok.push('라벨 속 태그·기호가 안전하게 감싸졌다');

/* ── ④ 빈 글 ───────────────────────────────────────────────────────────── */
const empty = mod.specFromMermaid('');
if (empty.diagram.kind !== 'unknown') problems.push('빈 글을 그림으로 읽었다');
if (empty.spec.nodes.length !== 0) problems.push('빈 글에서 마디가 나왔다');
if (!mod.renderGraphSvg(empty.spec).includes('</svg>')) problems.push('빈 판에서 SVG 가 안 나왔다');
if (problems.length === 0) ok.push('빈 글 — 안 터지고 빈 판을 낸다');

for (const line of ok) console.log('   ' + line);
if (problems.length > 0) {
  console.error('❌ 편집기 없이 그리기:');
  for (const problem of problems) console.error('   - ' + problem);
  process.exit(1);
}
console.log('RESULT: PASS — 판이 브라우저 없이 그려진다');
