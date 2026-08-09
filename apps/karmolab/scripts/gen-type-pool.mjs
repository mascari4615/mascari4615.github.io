/**
 * 데일리 타자 문장 뭉치를 **우리 글에서 뽑는다** (해자③ / TASK-KL-205 후속)
 *
 * 데일리 타자에는 매일 다른 문장이 필요하다. 그런데 문장을 손으로 적기 시작하면 그날부터
 * 그건 **콘텐츠 일**이 되고, 손으로 적은 표는 반드시 낡거나 샌다(오늘만 네 번 겪었다).
 *
 * 그래서 **이미 우리가 쓴 글**에서 뽑는다 — `data/tools-seo.json` 의 도구 설명이다.
 * 부수 효과가 좋다: 치다 보면 우리 도구가 뭘 하는지 알게 된다. 「우리 문장으로 연습한다」는
 * 것 자체가 남이 못 베끼는 자리다(Monkeytype 은 영어 무작위 낱말이다).
 *
 * 사용: node scripts/gen-type-pool.mjs   (build 사슬에서 자동)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const seo = JSON.parse(fs.readFileSync(path.join(root, 'data/tools-seo.json'), 'utf8')).tools;

/* 칠 만한 글이 아닌 것들 — 괄호·기호·주소가 섞이면 타자 연습이 아니라 기호 찾기가 된다. */
const BAD = new RegExp('[<>{}\[\]()·|@#/\\]|https?:');

const MIN = 20; // 너무 짧으면 속도가 안 재진다
const MAX = 60; // 너무 길면 한 판이 지겹다

const found = [];
for (const tool of Object.values(seo)) {
  for (const raw of [tool.lead, tool.description]) {
    if (typeof raw !== 'string') continue;
    for (const piece of raw.split(/(?<=다[.])\s+/)) {
      const s = piece.trim();
      if (s.length < MIN || s.length > MAX) continue;
      if (BAD.test(s)) continue;
      if (/[가-힣]/.test(s) === false) continue;
      if (/다[.]$/.test(s) === false) continue; // 문장 조각이 아니라 온전한 문장만
      found.push(s);
    }
  }
}

const pool = [...new Set(found)].sort(); // 정렬 = 같은 입력이면 같은 순서(시드가 안 흔들린다)

if (pool.length < 100) {
  console.error(`[gen-type-pool] 문장이 ${pool.length}개뿐 — 데일리로 쓰기엔 적다 (기준 100)`);
  process.exit(1);
}

const ts = [
  '/* 자동 생성 — `node scripts/gen-type-pool.mjs`. 손으로 고치지 마라.',
  ' * 원본은 `data/tools-seo.json` 의 도구 설명이다 — 도구 설명을 고치면 여기도 따라 바뀐다. */',
  'export const TYPE_POOL: readonly string[] = [',
  ...pool.map((s) => `  ${JSON.stringify(s)},`),
  '];',
  ''
].join('\n');

fs.writeFileSync(path.join(root, 'src/core/type-pool.generated.ts'), ts);
console.log(`[gen-type-pool] 문장 ${pool.length}개 → src/core/type-pool.generated.ts`);
