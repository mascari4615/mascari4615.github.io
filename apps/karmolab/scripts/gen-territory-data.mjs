/**
 * 영토 지도의 원자료 만들기. 전국 브랜드 점포 위치 (TASK-KL-334)
 *
 * 왜 스크립트인가: 이 자료는 **하루에 몇 번 바뀌는 것이 아니라 분기에 한 번** 바뀐다.
 * 방문자가 열 때마다 OSM 에 물으면 남의 서버를 때리고, 느리고, 오프라인에서 죽는다.
 * 그래서 여기서 한 번 받아 `data/territory/*.json` 으로 굳혀 둔다.
 *
 * ## 지금 자료는 OSM 이다. 그리고 그건 표본이다 (중요)
 *
 * OSM 한국 편의점은 **16,310곳**인데 실제는 5만 곳이 넘는다(CU 3,194 ↔ 실제 1만7천).
 * 브랜드 **비율**은 실제와 얼추 맞지만(CU≈GS25 > 세븐 > 이마트24), **내 동네의 진짜 최근접
 * 가게가 빠져 있을 수 있다.** 그러니 화면에 표본이라고 적는다. 안 적으면 지도가 거짓말을 한다.
 *
 * 정본으로 갈아탈 자리는 공공데이터포털 소상공인시장진흥공단_상가(상권)정보 CSV 다
 * (전국 상가 전수, 상호명, 업종, 위경도, 분기 갱신). 받으려면 **로그인이 필요해서** AI 가 못 받는다 . 
 * 사람이 한 번 받아 `--csv <경로>` 로 물려 주면 그때부터 같은 파이프라인이다.
 *
 * ## 쓰는 법
 *
 *   node scripts/gen-territory-data.mjs            # OSM 에서 받아 세 업종 다 만든다
 *   node scripts/gen-territory-data.mjs --csv 상가정보.csv   # 상가정보 CSV 로 만든다 (전수)
 *   node scripts/gen-territory-data.mjs --dump <폴더>       # 미리 받아 둔 Overpass 응답으로 만든다
 *
 * `--dump` 는 `<폴더>/<업종>.osm.json` 을 읽는다. Overpass 한 번 긁는 데 몇 분이 걸리고 실패도 잦아서,
 * 받아 둔 것으로 다시 짓는 길을 열어 둔다 (사전을 고쳐 다시 돌릴 때 여기가 없으면 매번 몇 분을 버린다).
 *
 * ## 파일 모양. 왜 좌표를 정수로 접나
 *
 * 소수점 5자리(≈1m)면 충분한데 `37.4979123456` 을 그대로 쓰면 한 점이 20바이트다. 5자리 정수로
 * 접고(3749791) **정렬한 뒤 앞 점과의 차이만** 적으면 대부분 서너 자리로 줄어든다 . 
 * 같은 자료가 3분의 1 크기가 되고, gzip 이 한 번 더 줄인다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brandOf, BRANDS } from '../src/core/territory.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = path.join(root, 'data/territory');

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.osm.jp/api/interpreter'
];

/** 업종마다 OSM 에서 무엇을 긁는가. */
const QUERIES = {
  convenience: ['node["shop"="convenience"](area.kr);', 'way["shop"="convenience"](area.kr);'],
  cafe: ['node["amenity"="cafe"](area.kr);', 'way["amenity"="cafe"](area.kr);'],
  burger: ['node["amenity"="fast_food"](area.kr);', 'way["amenity"="fast_food"](area.kr);']
};

/** 상가정보 CSV 의 업종중분류 → 우리 업종. 한 줄에 하나만 걸린다. */
const CSV_INDUSTRY = {
  convenience: ['편의점'],
  cafe: ['커피점/카페', '커피전문점', '카페'],
  burger: ['패스트푸드', '햄버거']
};

async function overpass(body) {
  let lastErr;
  for (const url of MIRRORS) {
    try {
      const res = await fetch(url, { method: 'POST', body });
      const text = await res.text();
      if (!text.startsWith('{')) throw new Error(text.slice(0, 120));
      return JSON.parse(text);
    } catch (e) {
      lastErr = e;
      console.error('  [overpass] ' + url + ' 실패. ' + String(e).slice(0, 100));
    }
  }
  throw lastErr;
}

async function fromOsm(industry, dumpDir) {
  if (dumpDir !== null) {
    const file = path.join(dumpDir, industry + '.osm.json');
    if (!fs.existsSync(file)) throw new Error('받아 둔 응답이 없다: ' + file);
    return shapeOsm(JSON.parse(fs.readFileSync(file, 'utf8')), industry);
  }
  const body =
    '[out:json][timeout:300];\narea["ISO3166-1"="KR"][admin_level=2]->.kr;\n(' +
    QUERIES[industry].join('') +
    ');\nout tags center;';
  return shapeOsm(await overpass(body), industry);
}

function shapeOsm(data, industry) {
  const out = [];
  for (const el of data.elements) {
    const tags = el.tags ?? {};
    const name = tags.name ?? tags['name:ko'] ?? tags.brand ?? tags.operator ?? '';
    if (name === '') continue;
    const brand = brandOf(name, industry);
    if (brand === '?') continue;
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;
    out.push({ lat, lng: lon, brand });
  }
  return { stores: out, source: 'OpenStreetMap (ODbL). 표본', sample: true, scanned: data.elements.length };
}

/**
 * 상가정보 CSV. 칸 이름이 판마다 조금씩 달라서 **머리글에서 찾아 쓴다**. 자리(index)로 읽으면
 * 다음 분기에 조용히 어긋난다.
 */
function fromCsv(file, industry) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const head = splitCsv(lines[0]);
  const col = (...names) => {
    for (const n of names) {
      const i = head.findIndex((h) => h.replace(/\s/g, '') === n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iName = col('상호명', '사업장명');
  const iCat = col('상권업종중분류명', '상권업종소분류명');
  const iLat = col('위도');
  const iLng = col('경도');
  if (iName < 0 || iLat < 0 || iLng < 0) throw new Error('CSV 에 상호명/위도/경도 칸이 없다: ' + head.slice(0, 12).join(','));

  const want = CSV_INDUSTRY[industry];
  const out = [];
  let scanned = 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '') continue;
    const c = splitCsv(lines[i]);
    scanned++;
    if (iCat >= 0 && !want.some((w) => (c[iCat] ?? '').includes(w))) continue;
    const brand = brandOf(c[iName] ?? '', industry);
    if (brand === '?') continue;
    const lat = Number(c[iLat]);
    const lng = Number(c[iLng]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({ lat, lng, brand });
  }
  return { stores: out, source: '소상공인시장진흥공단 상가(상권)정보. 전수', sample: false, scanned };
}

/** 따옴표 안의 쉼표를 지키는 최소 CSV 쪼개기. */
function splitCsv(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** 정렬 → 5자리 정수 → 앞 점과의 차이. 되돌리는 코드는 위젯에 있다. */
function pack(stores) {
  const byBrand = {};
  for (const s of stores) {
    (byBrand[s.brand] ??= []).push(s);
  }
  const packed = {};
  for (const [brand, list] of Object.entries(byBrand)) {
    list.sort((a, b) => a.lat - b.lat || a.lng - b.lng);
    const flat = [];
    let pLat = 0;
    let pLng = 0;
    for (const s of list) {
      const lat = Math.round(s.lat * 1e5);
      const lng = Math.round(s.lng * 1e5);
      flat.push(lat - pLat, lng - pLng);
      pLat = lat;
      pLng = lng;
    }
    packed[brand] = flat;
  }
  return packed;
}

async function build(industry, csv, dumpDir) {
  const got = csv !== null ? fromCsv(csv, industry) : await fromOsm(industry, dumpDir);
  const counts = {};
  for (const s of got.stores) counts[s.brand] = (counts[s.brand] ?? 0) + 1;
  const file = {
    industry,
    source: got.source,
    sample: got.sample,
    scale: 1e5,
    brands: BRANDS[industry].filter((b) => counts[b.id] > 0).map((b) => ({ id: b.id, label: b.label, color: b.color })),
    counts,
    points: pack(got.stores)
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, industry + '.json');
  fs.writeFileSync(out, JSON.stringify(file));
  const kb = (fs.statSync(out).size / 1024).toFixed(0);
  console.log(
    industry.padEnd(12) + got.stores.length + '곳 / ' + got.scanned + '건 훑음, ' + kb + 'KB, ' +
      Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(', ')
  );
}

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
};
const csv = arg('--csv');
const dumpDir = arg('--dump');
for (const industry of Object.keys(QUERIES)) {
  await build(industry, csv, dumpDir);
}
