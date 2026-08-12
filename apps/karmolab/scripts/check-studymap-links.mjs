/**
 * 스터디 맵의 바깥 링크가 살아 있는지 본다 (TASK-KL-233).
 *
 * 지도의 값어치는 「어디서 읽나」에 있는데, 그 주소가 404 면 그 칸은 빈 칸이다.
 * 내용 검사는 자동으로 못 해도 **주소가 죽었는지**는 기계가 볼 수 있다 — 그래서 여기서 본다.
 *
 * HEAD 를 막는 곳이 많아 GET 으로 한 번 더 확인한다. 403/405 는 「사람만 받는다」는 뜻이라
 * 죽은 것으로 치지 않는다(브라우저로는 열린다). 죽음으로 세는 것은 404/410 과 접속 불가.
 *
 * 사용: node scripts/check-studymap-links.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/studymap.json'), 'utf8'));

const targets = [];
for (const track of data.tracks) {
  for (const stage of track.stages) {
    for (const node of stage.nodes) {
      for (const link of node.links || []) targets.push({ node: node.id, ...link });
    }
  }
}

const OK_STATUS = new Set([200, 201, 202, 203, 204, 206, 301, 302, 303, 307, 308, 403, 405, 429, 999]);

async function probe(url, method) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      signal: ctl.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; karmolab-linkcheck/1.0)' },
    });
    return res.status;
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

const dead = [];
let done = 0;
const queue = [...targets];
const workers = Array.from({ length: 6 }, async () => {
  for (;;) {
    const item = queue.shift();
    if (!item) return;
    let status = await probe(item.url, 'HEAD');
    if (!OK_STATUS.has(status)) status = await probe(item.url, 'GET');
    done += 1;
    process.stdout.write(OK_STATUS.has(status) ? '.' : 'x');
    if (!OK_STATUS.has(status)) dead.push({ ...item, status });
  }
});
await Promise.all(workers);

process.stdout.write('\n');
if (dead.length > 0) {
  for (const d of dead) console.log(`  ${d.status || '접속불가'}  ${d.node} — ${d.label}\n         ${d.url}`);
  console.log(`[studymap-links] 죽은 주소 ${dead.length}개 / 전체 ${targets.length}개`);
  process.exit(1);
}
console.log(`[studymap-links] 링크 ${targets.length}개 전부 살아 있다`);
