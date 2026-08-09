/**
 * 초성 맞히기 낱말 뭉치 — **우리 도구 이름에서** 뽑는다 (해자③ 둘째 게임)
 *
 * 타자 데일리와 같은 원칙이다: 낱말을 손으로 적지 않는다. 사전을 들이면 무거워지고,
 * 손으로 적으면 낡는다.
 *
 * 여기서는 `data/tool-aliases.json` — 도구마다 「달리 부르는 이름」으로 우리가 이미 골라 둔
 * 한국어 낱말이다. 도구가 늘면 별칭도 늘고(그건 게이트가 강제한다), 그래서 뭉치가 저절로 자란다.
 *
 * 답마다 **그 낱말이 가리키는 도구**가 붙는다 — 힌트로 쓸 수 있고, 맞히고 나면 그 도구를
 * 눌러 볼 수도 있다. 놀이가 사이트를 가르치는 자리가 된다.
 *
 * 사용: node scripts/gen-word-pool.mjs   (build 사슬에서 자동)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const aliases = JSON.parse(fs.readFileSync(path.join(root, 'data/tool-aliases.json'), 'utf8')).aliases;
const seo = JSON.parse(fs.readFileSync(path.join(root, 'data/tools-seo.json'), 'utf8')).tools;

const found = new Map(); // 낱말 → 도구 id (먼저 나온 것을 쓴다)
for (const [id, raw] of Object.entries(aliases)) {
  /* 없어진 도구의 기록이 남아 있다 — 그 낱말을 내면 맞혀도 갈 곳이 없다. */
  if (seo[id] === undefined) continue;
  const list = Array.isArray(raw) ? raw : String(raw).split(/\s+/);
  for (const word of list) {
    if (/^[가-힣]{2,5}$/.test(word) === false) continue; // 한글 두~다섯 자만
    if (found.has(word)) continue;
    found.set(word, id);
  }
}

const pool = [...found].sort(([a], [b]) => a.localeCompare(b, 'ko'));

if (pool.length < 80) {
  console.error(`[gen-word-pool] 낱말이 ${pool.length}개뿐 — 데일리로 쓰기엔 적다 (기준 80)`);
  process.exit(1);
}

const ts = [
  '/* 자동 생성 — `node scripts/gen-word-pool.mjs`. 손으로 고치지 마라.',
  ' * 원본은 `data/tool-aliases.json` 이다 — 별칭을 고치면 여기도 따라 바뀐다. */',
  'export interface PoolWord {',
  '  word: string;',
  '  /** 이 낱말이 가리키는 도구 — 힌트이자, 맞힌 뒤 눌러 볼 곳. */',
  '  tool: string;',
  '}',
  '',
  'export const WORD_POOL: readonly PoolWord[] = [',
  ...pool.map(([word, tool]) => `  { word: ${JSON.stringify(word)}, tool: ${JSON.stringify(tool)} },`),
  '];',
  ''
].join('\n');

fs.writeFileSync(path.join(root, 'src/core/word-pool.generated.ts'), ts);
console.log(`[gen-word-pool] 낱말 ${pool.length}개 (도구 ${new Set(pool.map(([, t]) => t)).size}종) → src/core/word-pool.generated.ts`);
