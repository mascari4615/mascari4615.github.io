/**
 * 표의 그림이 **전부** 살아 있는지 본다 (TASK-KAR-202).
 *
 *   npm run check:images
 *
 * 왜 따로 있나: 평소 검사는 주제당 세 장만 표본으로 본다. 그런데 깨진 그림이 하나라도 있으면
 * **그게 정답인 날 실루엣 판이 통째로 안 풀린다** — 그날 하루가 조용히 망가지고 아무 신호도 없다.
 * 1300장 넘게 두드리는 일이라 배포에는 안 붙인다. 표를 갱신한 뒤 한 번 돌릴 것.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONCURRENCY = 24;

const targets = [];
for (const file of readdirSync(join(app, 'data')).filter((f) => f.endsWith('.json'))) {
  const topic = JSON.parse(readFileSync(join(app, 'data', file), 'utf8'));
  for (const item of topic.items) {
    if (item.img) targets.push({ topic: topic.id, name: item.name, url: item.img });
  }
}

console.log(`그림 ${targets.length}장 확인…`);
const broken = [];
let cursor = 0;
let done = 0;

await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < targets.length) {
      const t = targets[cursor];
      cursor += 1;
      try {
        const res = await fetch(t.url, { method: 'HEAD' });
        if (!res.ok) broken.push(`${t.topic}/${t.name} — ${res.status}`);
        else if (!/^image\//.test(res.headers.get('content-type') ?? '')) {
          broken.push(`${t.topic}/${t.name} — 그림이 아니다 (${res.headers.get('content-type')})`);
        }
      } catch (err) {
        broken.push(`${t.topic}/${t.name} — ${err.message}`);
      }
      done += 1;
      if (done % 300 === 0) process.stdout.write(`\r  ${done}/${targets.length}`);
    }
  }),
);
process.stdout.write('\r');

if (!broken.length) {
  console.log(`OK — ${targets.length}장 전부 살아 있다.`);
  process.exit(0);
}

console.log(`⚠ 깨진 그림 ${broken.length}장:`);
for (const b of broken.slice(0, 30)) console.log('  ', b);
if (broken.length > 30) console.log(`   … 그 외 ${broken.length - 30}장`);
console.log('\n그게 정답인 날 실루엣 판이 안 풀린다 — 표를 다시 받거나 그 항목을 빼라.');
process.exit(1);
