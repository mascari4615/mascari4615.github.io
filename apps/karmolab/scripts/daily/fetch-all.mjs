/**
 * 오늘의 하나 맞히기 표 받기 (change.arcade-absorbs-play 단계 5)
 *
 * 이 폴더의 `fetch-*.mjs` 를 이름순으로 하나씩 돌리고, 끝에 주제 명부를 다시 지음
 * 받기 스크립트를 하나 넣으면 그날부터 같이 돈다. 여기 손으로 안 적음
 */
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const jobs = readdirSync(here).filter((f) => /^fetch-.+\.mjs$/.test(f) && f !== 'fetch-all.mjs').sort();
if (!jobs.length) throw new Error('scripts/daily 에 받기 스크립트가 하나도 없다');
console.log(`[fetch:daily] 받기 ${jobs.length}건`);
for (const job of [...jobs, 'gen-topics.mjs']) {
  await import(pathToFileURL(join(here, job)).href);
}
