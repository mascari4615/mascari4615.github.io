/**
 * 오늘의 하나 맞히기 주제 명부 (change.arcade-absorbs-play 단계 4)
 *
 * `data/daily/*.json` 을 훑어 `index.json` 을 짓는다. 게임 첫 화면이 이걸 받아 주제 칩을 그림.
 * 표를 넣고 이걸 돌리면 그 주제가 생긴다. 옛 앱의 표를 넣으면 페이지가 생긴다 계약을 이어받은 자리
 *
 * 이름과 항목 수는 표에서 읽는다. 여기 손으로 안 적는다. 두 벌이면 그날부터 갈라짐
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const dir = join(root, 'data/daily');
const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json').sort();
const topics = [];
for (const f of files) {
  const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  if (!j.id || !Array.isArray(j.items) || !j.items.length) throw new Error(`${f}: id 나 items 가 없다`);
  topics.push({ id: j.id, title: j.title ?? j.id, emoji: j.emoji ?? '', items: j.items.length });
}
if (!topics.length) throw new Error('data/daily 에 주제 표가 하나도 없다');
/* 큰 표부터. 처음 온 사람이 아는 것이 위에 오게 */
topics.sort((a, b) => b.items - a.items);
const out = {
  $comment: '오늘의 하나 맞히기 주제 명부. 표를 넣고 npm run fetch:daily 를 돌리면 그 주제가 생긴다 (scripts/daily/gen-topics.mjs)',
  topics
};
writeFileSync(join(dir, 'index.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`[gen-topics] 주제 ${topics.length}개 → data/daily/index.json (${topics.map((t) => t.items).join(', ')})`);
