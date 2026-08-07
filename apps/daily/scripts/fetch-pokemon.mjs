/**
 * 포켓몬 표 만들기 (TASK-KAR-202).
 * 출처 = PokéAPI (공개, 키 불요). 항목당 2번 호출이라 2000번 넘게 나간다 —
 * 그래서 캐시를 남기고, 한 번 받아 놓은 뒤에는 다시 안 부른다.
 *
 *   node scripts/fetch-pokemon.mjs
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '../data/pokemon.json');
const CACHE = join(here, '../.cache/pokeapi.json');
const LAST_ID = 1025; // 9세대 끝
const CONCURRENCY = 12;

const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
let fetched = 0;

async function getJson(url) {
  if (cache[url]) return cache[url];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await fetch(url);
    if (res.ok) {
      cache[url] = await res.json();
      fetched += 1;
      return cache[url];
    }
    if (res.status === 404) return null;
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  throw new Error(`못 받았다: ${url}`);
}

/** 여러 개를 조금씩 나눠 받는다 — 한꺼번에 2000개를 던지면 상대가 막는다. */
async function mapPool(list, worker) {
  const out = new Array(list.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (cursor < list.length) {
        const i = cursor;
        cursor += 1;
        out[i] = await worker(list[i], i);
        if (i % 100 === 0) process.stdout.write(`\r  ${i}/${list.length}`);
      }
    }),
  );
  process.stdout.write('\r');
  return out;
}

const ko = (names) => names.find((n) => n.language.name === 'ko')?.name ?? null;

console.log('타입 이름부터…');
const typeList = (await getJson('https://pokeapi.co/api/v2/type')).results;
const typeKo = {};
for (const t of typeList) {
  const detail = await getJson(t.url);
  typeKo[t.name] = ko(detail.names) ?? t.name;
}

const COLOR_KO = {
  black: '검정', blue: '파랑', brown: '갈색', gray: '회색', green: '초록',
  pink: '분홍', purple: '보라', red: '빨강', white: '하양', yellow: '노랑',
};

const ids = Array.from({ length: LAST_ID }, (_, i) => i + 1);

console.log('종(種) 정보…');
const species = await mapPool(ids, (id) => getJson(`https://pokeapi.co/api/v2/pokemon-species/${id}`));
console.log('개체 정보…');
const forms = await mapPool(ids, (id) => getJson(`https://pokeapi.co/api/v2/pokemon/${id}`));

// 진화 단계는 따로 부르지 않는다 — 「누구에게서 진화했나」만 알면 사슬을 거슬러 셀 수 있다.
const evolvesFrom = new Map();
for (const s of species) if (s) evolvesFrom.set(s.name, s.evolves_from_species?.name ?? null);
function stageOf(name, depth = 1) {
  const parent = evolvesFrom.get(name);
  if (!parent || depth > 5) return depth;
  return stageOf(parent, depth + 1);
}

const items = [];
for (let i = 0; i < ids.length; i += 1) {
  const s = species[i];
  const f = forms[i];
  if (!s || !f) continue;
  const name = ko(s.names);
  if (!name) continue;
  items.push({
    name,
    img: f.sprites?.other?.['official-artwork']?.front_default ?? f.sprites?.front_default ?? null,
    gen: romanToInt(s.generation.name),
    types: f.types.map((t) => typeKo[t.type.name] ?? t.type.name),
    color: COLOR_KO[s.color?.name] ?? s.color?.name ?? '?',
    stage: stageOf(s.name),
    height: Math.round(f.height) / 10, // 데시미터 → m
    weight: Math.round(f.weight) / 10, // 헥토그램 → kg
  });
}

function romanToInt(generationName) {
  const roman = generationName.replace(/^generation-/, '').toUpperCase();
  const value = { I: 1, V: 5, X: 10 };
  let total = 0;
  for (let i = 0; i < roman.length; i += 1) {
    const cur = value[roman[i]];
    const next = value[roman[i + 1]] ?? 0;
    total += cur < next ? -cur : cur;
  }
  return total;
}

const topic = {
  id: 'pokemon',
  title: '포켓몬',
  subtitle: '오늘의 포켓몬을 맞혀라',
  emoji: '🔴',
  source: 'PokéAPI',
  maxGuesses: 8,
  // 표가 언제 만들어졌는지 — 빌드가 이걸 보고 「너무 오래됐다」를 말한다.
  fetchedAt: new Date().toISOString().slice(0, 10),
  fields: [
    { key: 'gen', label: '세대', kind: 'number', near: 1 },
    { key: 'types', label: '타입', kind: 'set' },
    { key: 'color', label: '색', kind: 'category' },
    { key: 'stage', label: '진화', kind: 'number', unit: '단계' },
    { key: 'height', label: '키', kind: 'number', nearRatio: 0.25, unit: 'm' },
    { key: 'weight', label: '몸무게', kind: 'number', nearRatio: 0.25, unit: 'kg' },
  ],
  items,
};

mkdirSync(dirname(OUT), { recursive: true });
mkdirSync(dirname(CACHE), { recursive: true });
writeFileSync(CACHE, JSON.stringify(cache));
writeFileSync(OUT, `${JSON.stringify(topic)}\n`);
console.log(`포켓몬 ${items.length}마리 → data/pokemon.json (새로 받은 요청 ${fetched}개)`);
