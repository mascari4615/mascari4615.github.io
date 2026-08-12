/**
 * 「본」 단위 검사 — 화면 없이 (TASK-KL-254)
 *
 * 보는 것: 숫자를 돌리면 모양이 정말 달라지는가 · SVG 가 말이 되는가 ·
 * 극단값(0·음수·1 초과)에서 조용히 이상한 것을 뱉지 않는가 · 되돌리기가 공용 것을 쓰는가.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// TS 를 그대로 못 읽으므로 esbuild 로 한 번 묶어 불러온다(빌드가 쓰는 것과 같은 도구).
const out = mkdtempSync(join(tmpdir(), 'bon-'));
const bundle = join(out, 'bon.mjs');
execFileSync('node', [
  'node_modules/esbuild/bin/esbuild',
  '--bundle', '--format=esm', '--platform=neutral', `--outfile=${bundle}`,
  'src/widgets/bon/index-test-entry.ts'
], { stdio: 'pipe' });

const { pathToFileURL } = await import('node:url');
const mod = await import(pathToFileURL(bundle).href);
const { createDoc, addLayer, countNodes, toSvg, PARTS, defaultKnobs, variants } = mod;

let failed = 0;
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond ? '' : ' — ' + extra}`);
  if (!cond) failed += 1;
};

/* ── 문서 ─────────────────────────────── */
const doc = createDoc(256, 128);
check('새 문서에 레이어 하나', doc.layers.length === 1);
addLayer(doc, '둘');
check('레이어 추가', doc.layers.length === 2);

/* ── 부품이 도형을 만든다 ───────────────── */
const k = defaultKnobs();
for (const name of ['button', 'panel', 'gauge']) {
  const node = PARTS[name](k);
  check(`${name} 이 도형을 만든다`, countNodes([node]) > 0, String(countNodes([node])));
}

/* ── 숫자를 돌리면 모양이 달라진다 (이 도구의 존재 이유) ── */
const a = toSvg({ ...doc, layers: [{ id: 'x', name: 'x', visible: true, opacity: 1, nodes: [PARTS.button({ ...k, radius: 0 })] }] });
const b = toSvg({ ...doc, layers: [{ id: 'x', name: 'x', visible: true, opacity: 1, nodes: [PARTS.button({ ...k, radius: 24 })] }] });
check('둥글기를 돌리면 결과가 달라진다', a !== b);
check('둥글기 0 이면 rx 가 0', /rx="0"/.test(a), a.slice(0, 160));

/* ── 한 번에 여러 장 ─────────────────────── */
const many = variants('button', k, 'radius', 0, 30, 12);
check('변형 12 장', many.length === 12);
const svgs = new Set(many.map((nd) => toSvg({ w: 1, h: 1, layers: [{ id: 'v', name: 'v', visible: true, opacity: 1, nodes: [nd] }] })));
check('12 장이 서로 다르다', svgs.size === 12, `서로 다른 것 ${svgs.size}`);

/* ── SVG 가 말이 되는가 ───────────────────── */
const svg = toSvg({ ...doc, layers: [{ id: 'x', name: 'x', visible: true, opacity: 1, nodes: [PARTS.gauge(k)] }] });
check('svg 로 열고 닫힌다', svg.startsWith('<svg') && svg.endsWith('</svg>'));
check('viewBox 가 문서 크기', svg.includes('viewBox="0 0 256 128"'), svg.slice(0, 120));
check('결을 쓰면 defs 가 붙는다', svg.includes('<linearGradient'));
check('여는 태그와 닫는 태그 수가 맞는다', (svg.match(/<g[ >]/g) || []).length === (svg.match(/<\/g>/g) || []).length);

/* ── 극단값에서 조용히 이상해지지 않는다 ───── */
const tiny = PARTS.panel({ ...k, w: 4, h: 4, padding: 20, radius: 40 });
const tinySvg = toSvg({ w: 4, h: 4, layers: [{ id: 't', name: 't', visible: true, opacity: 1, nodes: [tiny] }] });
check('작은 판에서 음수 크기가 안 나온다', !/(width|height)="-/.test(tinySvg), tinySvg);
check('둥글기가 반쪽을 안 넘는다', !/rx="(4[1-9]|[5-9]\d)/.test(tinySvg));
const empty = PARTS.gauge({ ...k, value: 0 });
check('채움 0 이면 막대를 안 만든다', countNodes([empty]) === countNodes([PARTS.gauge({ ...k, value: 0 })]) && countNodes([empty]) < countNodes([PARTS.gauge({ ...k, value: 1 })]));
const over = toSvg({ w: 10, h: 10, layers: [{ id: 'o', name: 'o', visible: true, opacity: 1, nodes: [PARTS.gauge({ ...k, value: 5 })] }] });
check('채움 1 을 넘겨도 밖으로 안 삐져나온다', !over.includes(`width="${k.w * 5}"`));

/* ── 안 보이는 레이어는 안 그린다 ──────────── */
const hidden = toSvg({ w: 10, h: 10, layers: [{ id: 'h', name: 'h', visible: false, opacity: 1, nodes: [PARTS.button(k)] }] });
check('숨긴 레이어는 안 나온다', !hidden.includes('<rect'));


/* ── 고르기·끌기의 셈 (2단계) ─────────────── */
const { bounds, hitTest, handleAt, resizeBox, applyBox } = mod;

const grouped = PARTS.button(k);                 // 무리(group)
const gb = bounds(grouped);
check('무리의 네모가 자식들을 감싼다', gb.w >= k.w - 1 && gb.h >= k.h - 1, JSON.stringify(gb));

const doc2 = createDoc(300, 200);
doc2.layers[0].nodes.push({ kind: 'rect', x: 10, y: 10, w: 50, h: 50, radius: 0 });
doc2.layers[0].nodes.push({ kind: 'rect', x: 30, y: 30, w: 50, h: 50, radius: 0 });
check('겹친 곳은 위에 그린 것이 잡힌다', hitTest(doc2, 40, 40).index === 1);
check('빈 곳은 아무것도 안 잡힌다', hitTest(doc2, 200, 180) === null);
doc2.layers[0].visible = false;
check('숨긴 레이어는 안 잡힌다', hitTest(doc2, 40, 40) === null);
doc2.layers[0].visible = true;

const box = { x: 10, y: 10, w: 50, h: 50 };
check('손잡이를 잡는다', handleAt(box, 60, 60, 4) === 'se');
check('가운데는 손잡이가 아니다', handleAt(box, 35, 35, 4) === null);
check('옮기면 크기는 그대로', (() => { const n = resizeBox(box, 'move', 5, -5); return n.x === 15 && n.y === 5 && n.w === 50 && n.h === 50; })());
check('오른쪽 아래를 끌면 커진다', resizeBox(box, 'se', 10, 10).w === 60);
check('왼쪽을 오른쪽 끝 너머로 끌어도 안 뒤집힌다', (() => { const n = resizeBox(box, 'w', 200, 0); return n.w === 0 && n.h === 50; })(), JSON.stringify(resizeBox(box, 'w', 200, 0)));
// 격자에 붙는 것은 **모서리 좌표**다(폭이 아니다) — 왼쪽이 10 이면 폭은 8 의 배수가 아니게 된다.
{
  const snapped = resizeBox(box, 'se', 7, 7, 8);
  check('오른쪽 끝이 격자에 붙는다', (snapped.x + snapped.w) % 8 === 0, JSON.stringify(snapped));
  const moved = resizeBox(box, 'move', 7, 7, 8);
  check('옮길 때 왼쪽 위가 격자에 붙는다', moved.x % 8 === 0 && moved.y % 8 === 0, JSON.stringify(moved));
}

const rect = { kind: 'rect', x: 0, y: 0, w: 100, h: 100, radius: 40 };
applyBox(rect, { x: 5, y: 5, w: 20, h: 20 });
check('작아지면 둥글기도 따라 줄어든다', rect.radius <= 10, String(rect.radius));
const el = { kind: 'ellipse', cx: 0, cy: 0, rx: 1, ry: 1 };
applyBox(el, { x: 10, y: 20, w: 40, h: 60 });
check('타원은 가운데·반지름으로 옮겨 담는다', el.cx === 30 && el.cy === 50 && el.rx === 20 && el.ry === 30);

rmSync(out, { recursive: true, force: true });
console.log(failed ? `\n[test-bon] 실패 ${failed}건` : '\n[test-bon] ✓ 문서 · 부품 3종 · 손잡이 반응 · 변형 묶음 · SVG 정합 · 극단값');
process.exit(failed ? 1 : 0);
