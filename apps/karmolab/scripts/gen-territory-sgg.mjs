/**
 * 시군구별 영토 점유율 — 「우리 구는 누구 땅인가」 (TASK-KL-334)
 *
 * 화면 기준 통계는 「지금 보이는 만큼」이라 어제와 오늘이 다르다. 사람이 진짜 묻는 것은
 * **행정구역** 단위다 — 「강남구는 GS25 땅이고 관악구는 CU 땅」. 그건 화면과 무관한 고정된 답이라
 * 미리 재 두는 것이 맞다(방문자 계산 0, 정확도는 오히려 더 촘촘하게 잴 수 있다).
 *
 * ## 재는 법
 *
 * 구 하나의 경계 안을 **격자로 훑어** 칸마다 가장 가까운 가게의 브랜드를 묻고, 그 칸의 넓이를 더한다.
 * 칸 넓이는 위도마다 다르므로(경도 한 칸이 북쪽에서 짧다) 칸 수가 아니라 **넓이**를 더한다.
 * 폴리곤 안인지는 광선 교차(ray casting)로 본다 — 구멍(내부 링)은 짝수 번 교차로 저절로 빠진다.
 *
 * ## 경계는 왜 따로 단순화하나
 *
 * 원본 경계는 꼭짓점 44만 개 · 18MB 다. 계산에는 그대로 쓰지만(정확도가 공짜다),
 * **화면에 보낼 것은 단순화한 사본**이다 — 지도에서 구 경계선은 1px 짜리 실선이라
 * 원본 해상도가 아무 값도 하지 않는다. Douglas–Peucker 로 깎는다.
 *
 * ## 쓰는 법
 *
 *   node scripts/gen-territory-sgg.mjs --geo <시군구.geojson>
 *
 * 경계 원본 = southkorea-maps (kostat 2018) `skorea-municipalities-2018-geo.json`.
 * 내는 것:
 *   data/territory/sgg.json         단순화한 경계 + 이름·코드 (화면용)
 *   data/territory/sgg-<업종>.json  구별 브랜드 점유율 (미리 잰 값)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGrid, nearest, BRANDS } from '../src/core/territory.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIR = path.join(root, 'data/territory');

/** 격자 한 칸의 크기(도). 0.0025도 ≈ 280m — 구 하나가 수천~수만 칸이 된다. */
const CELL = 0.0025;
/** 「주인 없음」선 — 위젯과 같은 값이어야 화면과 표가 안 어긋난다. */
const MAX_KM = 20;
/** 화면용 경계 단순화 세기(도). 0.002 ≈ 200m — 실측: 1259KB→573KB(gzip 149KB), 꼭짓점 6.7만→3만.
    더 깎으면(0.004) 84KB 까지 가지만 시가지에서 선이 각져 보인다. */
const EPS = 0.002;

const KM_PER_DEG = 111.32;
const rad = (d) => (d * Math.PI) / 180;

/* ── 폴리곤 ── */

/** 광선 교차 — 링 하나 안인가. 구멍은 바깥 링과 함께 홀짝으로 처리한다. */
function inRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** MultiPolygon/Polygon 안인가 (구멍 포함). */
function inGeometry(geom, x, y) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys) {
    if (!inRing(poly[0], x, y)) continue;
    let hole = false;
    for (let h = 1; h < poly.length; h++) {
      if (inRing(poly[h], x, y)) {
        hole = true;
        break;
      }
    }
    if (!hole) return true;
  }
  return false;
}

function bboxOf(geom) {
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  const walk = (a) => {
    if (typeof a[0] === 'number') {
      if (a[1] < minLat) minLat = a[1];
      if (a[1] > maxLat) maxLat = a[1];
      if (a[0] < minLng) minLng = a[0];
      if (a[0] > maxLng) maxLng = a[0];
      return;
    }
    a.forEach(walk);
  };
  walk(geom.coordinates);
  return { minLat, minLng, maxLat, maxLng };
}

/* ── 단순화 (Douglas–Peucker) ── */

function perpDist(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const cx = a[0] + t * dx;
  const cy = a[1] + t * dy;
  return Math.hypot(p[0] - cx, p[1] - cy);
}

function simplify(points, eps) {
  if (points.length < 3) return points;
  let far = 0;
  let idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], points[0], points[points.length - 1]);
    if (d > far) {
      far = d;
      idx = i;
    }
  }
  if (far <= eps) return [points[0], points[points.length - 1]];
  const left = simplify(points.slice(0, idx + 1), eps);
  const right = simplify(points.slice(idx), eps);
  return left.slice(0, -1).concat(right);
}

/** 링을 깎되 최소 4점은 남긴다 — 삼각형보다 적으면 면이 아니다. */
function simplifyRing(ring, eps) {
  let out = simplify(ring, eps);
  if (out.length < 4) out = ring.filter((_, i) => i % Math.ceil(ring.length / 8) === 0).concat([ring[0]]);
  return out.map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]);
}

function simplifyGeom(geom, eps) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  const out = [];
  for (const poly of polys) {
    const rings = poly.map((r) => simplifyRing(r, eps)).filter((r) => r.length >= 4);
    if (rings.length > 0) out.push(rings);
  }
  return { type: 'MultiPolygon', coordinates: out };
}

/* ── 점 자료 ── */

function loadStores(industry) {
  const meta = JSON.parse(fs.readFileSync(path.join(DIR, industry + '.json'), 'utf8'));
  const stores = [];
  for (const [brand, flat] of Object.entries(meta.points)) {
    let lat = 0;
    let lng = 0;
    for (let i = 0; i < flat.length; i += 2) {
      lat += flat[i];
      lng += flat[i + 1];
      stores.push({ lat: lat / meta.scale, lng: lng / meta.scale, brand });
    }
  }
  return { meta, grid: buildGrid(stores) };
}

/* ── 본체 ── */

const geoArg = process.argv.indexOf('--geo');
if (geoArg < 0) {
  console.error('쓰기: node scripts/gen-territory-sgg.mjs --geo <시군구.geojson>');
  process.exit(1);
}
const geo = JSON.parse(fs.readFileSync(process.argv[geoArg + 1], 'utf8'));
console.log('시군구 ' + geo.features.length + '개 읽음');

/* 화면용 경계 — 한 번만 만든다. */
const before = JSON.stringify(geo).length;
const shapes = geo.features.map((f) => ({
  code: f.properties.code,
  name: f.properties.name,
  geometry: simplifyGeom(f.geometry, EPS)
}));
const shapePath = path.join(DIR, 'sgg.json');
fs.writeFileSync(shapePath, JSON.stringify({ eps: EPS, features: shapes }));
console.log(
  '경계 ' + (before / 1024 / 1024).toFixed(1) + 'MB → ' + (fs.statSync(shapePath).size / 1024).toFixed(0) + 'KB'
);

for (const industry of ['convenience', 'cafe', 'burger']) {
  const { meta, grid } = loadStores(industry);
  const rows = [];
  for (const f of geo.features) {
    const box = bboxOf(f.geometry);
    const area = new Map();
    const counts = new Map();
    let total = 0;
    for (let lat = box.minLat; lat <= box.maxLat; lat += CELL) {
      const cellKm2 = CELL * KM_PER_DEG * CELL * KM_PER_DEG * Math.cos(rad(lat));
      for (let lng = box.minLng; lng <= box.maxLng; lng += CELL) {
        if (!inGeometry(f.geometry, lng, lat)) continue;
        total += cellKm2;
        const owner = nearest(grid, lat, lng, MAX_KM);
        if (owner === null) continue;
        area.set(owner.brand, (area.get(owner.brand) ?? 0) + cellKm2);
      }
    }
    for (const s of grid.stores) {
      if (s.lat < box.minLat || s.lat > box.maxLat || s.lng < box.minLng || s.lng > box.maxLng) continue;
      if (!inGeometry(f.geometry, s.lng, s.lat)) continue;
      counts.set(s.brand, (counts.get(s.brand) ?? 0) + 1);
    }
    let owned = 0;
    for (const v of area.values()) owned += v;
    const share = {};
    for (const [brand, km2] of [...area.entries()].sort((a, b) => b[1] - a[1])) {
      share[brand] = Math.round((km2 / (owned || 1)) * 1000) / 10;
    }
    rows.push({
      code: f.properties.code,
      name: f.properties.name,
      areaKm2: Math.round(total),
      /** 주인 있는 땅이 이 구의 몇 %인가 — 낮으면 가게가 드문 곳이다 */
      covered: Math.round((owned / (total || 1)) * 1000) / 10,
      stores: Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1])),
      share
    });
  }
  const out = path.join(DIR, 'sgg-' + industry + '.json');
  fs.writeFileSync(
    out,
    JSON.stringify({
      industry,
      source: meta.source,
      sample: meta.sample,
      cell: CELL,
      brands: BRANDS[industry].map((b) => ({ id: b.id, label: b.label, color: b.color })),
      rows
    })
  );
  const top = [...rows].sort((a, b) => (b.share[Object.keys(b.share)[0]] ?? 0) - (a.share[Object.keys(a.share)[0]] ?? 0));
  console.log(
    industry.padEnd(12) +
      rows.length +
      '구 · ' +
      (fs.statSync(out).size / 1024).toFixed(0) +
      'KB · 예: ' +
      rows
        .slice(0, 3)
        .map((r) => r.name + ' ' + (Object.keys(r.share)[0] ?? '—') + ' ' + (Object.values(r.share)[0] ?? 0) + '%')
        .join(', ') +
      ' · 가장 확실한 곳: ' +
      (top[0] ? top[0].name + ' ' + Object.keys(top[0].share)[0] + ' ' + Object.values(top[0].share)[0] + '%' : '—')
  );
}
