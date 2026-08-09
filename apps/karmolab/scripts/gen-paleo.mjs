/**
 * 옛 지구의 해안선 만들기 — 「블루마블」 지질 모드가 쓸 대륙 윤곽 (TASK-KL-206)
 *
 * 위성 사진은 2000년까지밖에 없다. 그보다 뒤로 가려면 사진이 아니라 **재구성**이다:
 * 판이 어떻게 움직였는지를 되감아 그 시대의 대륙을 다시 그린 것.
 *
 * GPlates Web Service (gws.gplates.org) 가 시대를 주면 그때의 해안선을 GeoJSON 으로 준다.
 * 다만 한 시대가 1.2MB 다 — 슬라이더를 움직일 때마다 받으면 회선이 그걸로 찬다.
 * 그래서 **몇 시대를 미리 받아 줄여서 담는다**: 좌표를 0.1° 로 자르고(지구본 한 화면에서
 * 그보다 촘촘해도 같은 픽셀), 작은 조각(섬)은 버린다.
 *
 * 사용: node scripts/gen-paleo.mjs   (결과는 커밋한다 — 빌드는 網 없이 돈다)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(root, 'data/paleo');

/** 보여 줄 시대 (백만 년 전) — 대륙 배치가 확 달라지는 지점만 골랐다. */
/* 기본 모델이 되돌릴 수 있는 데까지만 — 420·540Ma 는 400 을 돌려준다(실측). */
const AGES = [0, 60, 120, 180, 240, 300];

/** 폴리곤 하나가 이보다 작으면 버린다 (도²) — 지구본에서는 점으로도 안 보인다. */
const MIN_AREA = 25;

function ringArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    a += (pts[j] + pts[i]) * (pts[j + 1] - pts[i + 1]);
  }
  return Math.abs(a / 2);
}

function flatten(coords, out) {
  // GeoJSON Polygon = [ring, hole...]. 바깥 고리만 쓴다(구멍은 이 축척에서 안 보인다).
  const ring = coords[0];
  if (!ring || ring.length < 4) return;
  const flat = [];
  let lastLon = null;
  for (const [lon, lat] of ring) {
    // 날짜변경선을 넘는 고리는 그리면 지구를 가로지르는 줄이 생긴다 — 그 자리에서 끊는다
    if (lastLon !== null && Math.abs(lon - lastLon) > 180) {
      if (flat.length >= 8 && ringArea(flat) >= MIN_AREA) out.push(flat.slice());
      flat.length = 0;
    }
    /* 0.5° 로 자른다. 1.4MB → 200KB 대. 지구본 한 화면에서 0.5° 는 2~3px 이라,
       더 촘촘히 들고 있어 봐야 회선만 쓴다(실측: 0.1° 로 뒀을 때 시대당 390KB). */
    const qx = Math.round(lon * 2) / 2;
    const qy = Math.round(lat * 2) / 2;
    if (flat.length >= 2 && flat[flat.length - 2] === qx && flat[flat.length - 1] === qy) {
      lastLon = lon;
      continue;
    }
    flat.push(qx, qy);
    lastLon = lon;
  }
  if (flat.length >= 8 && ringArea(flat) >= MIN_AREA) out.push(flat);
}

const index = [];
fs.mkdirSync(OUT, { recursive: true });

for (const ma of AGES) {
  const url = `https://gws.gplates.org/reconstruct/coastlines/?time=${ma}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`[paleo] ${ma}Ma 실패 ${res.status}`);
    continue;
  }
  const gj = await res.json();
  const rings = [];
  for (const f of gj.features || []) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'Polygon') flatten(g.coordinates, rings);
    else if (g.type === 'MultiPolygon') for (const poly of g.coordinates) flatten(poly, rings);
  }
  rings.sort((a, b) => b.length - a.length);
  const file = path.join(OUT, `${ma}.json`);
  fs.writeFileSync(file, JSON.stringify({ ma, rings }), 'utf8');
  const kb = fs.statSync(file).size / 1024;
  index.push({ ma, rings: rings.length, kb: Math.round(kb) });
  console.log(`[paleo] ${String(ma).padStart(3)}Ma · 고리 ${rings.length} · ${kb.toFixed(0)}KB`);
}

fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ ages: AGES, files: index }), 'utf8');
console.log(`[paleo] 시대 ${index.length}개`);
