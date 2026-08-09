/**
 * 해안선 데이터 만들기 — 「블루마블」 위젯이 쓸 땅의 윤곽 (TASK-KL-206)
 *
 * 왜 있나: 지구본을 그리려면 땅과 바다의 경계가 필요하다. 지도 타일을 받아오면
 * 요청이 수백 개 생기고(그것도 남의 서버로) 우리 색을 못 입힌다. 우리가 필요한 건
 * 「돌아가는 파란 구슬」이지 도로 이름이 아니다 — 그래서 **윤곽선만** 한 파일로 들고 온다.
 *
 * 원본 = Natural Earth 110m(가장 거친 축척) 의 land 를 TopoJSON 으로 묶어 둔
 * `world-atlas` 꾸러미. 공개 도메인이다. 55KB 를 받아서 우리 형식으로 줄인다.
 *
 * 우리 형식이 따로 있는 이유: TopoJSON 을 브라우저에서 풀려면 해독기(라이브러리)를
 * 하나 더 실어야 한다. 여기서 미리 풀어 **평평한 좌표 배열**로 내보내면 위젯은
 * `JSON.parse` 만 하면 된다. 좌표는 소수점 둘째 자리(≈1km)에서 자른다 — 지구본
 * 한 화면에서는 그보다 촘촘해도 같은 픽셀에 찍힌다.
 *
 * 사용: node scripts/gen-coastline.mjs   (결과는 커밋한다 — 빌드는 網 없이 돈다)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json';
const OUT = path.join(root, 'data/coastline-110m.json');

const topo = await (await fetch(SRC)).json();

/* TopoJSON 의 좌표는 「양자화된 정수 + 앞 점과의 차이」로 접혀 있다. 푸는 규칙은
 * 사양에 적힌 그대로다: 누적합을 낸 뒤 scale 을 곱하고 translate 를 더한다. */
const { scale: [sx, sy], translate: [tx, ty] } = topo.transform;
const arcs = topo.arcs.map((arc) => {
  let x = 0;
  let y = 0;
  const out = [];
  for (const [dx, dy] of arc) {
    x += dx;
    y += dy;
    out.push(Math.round((x * sx + tx) * 100) / 100, Math.round((y * sy + ty) * 100) / 100);
  }
  return out;
});

/* 땅 하나가 여러 호(arc)로 쪼개져 있고, 폴리곤은 그 호의 번호 목록이다. 음수는
 * 「그 호를 거꾸로」라는 뜻(~i 로 되읽는다). 우리는 채우기까지 하므로 고리 단위로 잇는다. */
const rings = [];
const walk = (ringIdxs) => {
  const pts = [];
  for (const idx of ringIdxs) {
    const a = arcs[idx < 0 ? ~idx : idx];
    const seq = idx < 0 ? reversed(a) : a;
    // 이어 붙일 때 앞 호의 끝점과 이번 호의 첫 점이 겹친다 — 한 점 건너뛴다.
    for (let i = pts.length ? 2 : 0; i < seq.length; i += 2) pts.push(seq[i], seq[i + 1]);
  }
  if (pts.length >= 6) rings.push(pts);
};
function reversed(flat) {
  const out = [];
  for (let i = flat.length - 2; i >= 0; i -= 2) out.push(flat[i], flat[i + 1]);
  return out;
}

for (const geom of topo.objects.land.geometries) {
  if (geom.type === 'Polygon') geom.arcs.forEach(walk);
  else if (geom.type === 'MultiPolygon') geom.arcs.forEach((poly) => poly.forEach(walk));
}

/* 큰 땅이 먼저 그려지도록 점 수로 정렬한다 — 작은 섬이 큰 대륙에 먹히지 않는다. */
rings.sort((a, b) => b.length - a.length);

const payload = { format: 'karmolab-coastline-v1', source: 'Natural Earth 110m (public domain) via world-atlas', rings };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(payload), 'utf8');

const pts = rings.reduce((n, r) => n + r.length / 2, 0);
console.log(`[coastline] 고리 ${rings.length}개 · 점 ${pts}개 · ${(fs.statSync(OUT).size / 1024).toFixed(1)}KB → data/coastline-110m.json`);
