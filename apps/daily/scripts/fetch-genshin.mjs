/**
 * 원신 캐릭터 표 만들기 (TASK-KAR-202).
 * 출처 = yatta.moe(=ambr) 공개 API 의 **한국어** 자료. 호출 한 번이면 끝난다.
 *
 *   node scripts/fetch-genshin.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../data/genshin.json');

import { ELEMENT, WEAPON, REGION, BODY, playableGenshin, fetchGenshinList } from './rules-genshin.mjs';

const list = await fetchGenshinList();

const items = playableGenshin(list)
  .map((c) => ({
    name: c.name,
    img: `https://gi.yatta.moe/assets/UI/${c.icon}.png`,
    element: ELEMENT[c.element],
    weapon: WEAPON[c.weaponType],
    // 표에 없는 소속(파투스 분파 등)은 「기타」로 모은다 — 힌트가 뜻을 잃지 않게.
    region: REGION[c.region] ?? '기타',
    rank: c.rank,
    body: BODY[c.bodyType] ?? '기타',
    year: new Date(c.release * 1000).getUTCFullYear(),
  }))
  .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

const topic = {
  id: 'genshin',
  title: '원신 캐릭터',
  subtitle: '오늘의 캐릭터는 누구?',
  emoji: '🌠',
  source: 'yatta.moe (ambr)',
  maxGuesses: 8,
  // 표가 언제 만들어졌는지 — 빌드가 이걸 보고 「너무 오래됐다」를 말한다.
  fetchedAt: new Date().toISOString().slice(0, 10),
  fields: [
    { key: 'element', label: '원소', kind: 'category' },
    { key: 'weapon', label: '무기', kind: 'category' },
    { key: 'region', label: '소속', kind: 'category' },
    { key: 'rank', label: '등급', kind: 'number' },
    { key: 'body', label: '체형', kind: 'category' },
    { key: 'year', label: '출시', kind: 'number', near: 1 },
  ],
  items,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(topic)}\n`);
console.log(`원신 캐릭터 ${items.length}명 → data/genshin.json`);
