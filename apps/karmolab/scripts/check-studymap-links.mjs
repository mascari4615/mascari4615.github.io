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

/* ★ **한 번 못 닿았다고 315개를 통째로 버리지 않는다** (2026-08-16, 실측). 아예 못 닿은 것이
   하나라도 있으면 이 검사는 `2`(못 잼)로 끝난다 — 그러면 멀쩡히 확인한 나머지 314개도 같이
   버려진다. 실제로 CI 에서 여러 판 그렇게 끝났고, 그동안 죽은 링크를 막을 사람이 없었다.
   게다가 못 닿음의 상당수는 **우리가 만든 것**이다: 일꾼 6명이 동시에 두드리면 상대가 잠깐
   끊는다. 그래서 못 닿은 것만 **잠깐 쉬었다가 하나씩** 다시 두드린다 — 그래도 안 되면
   그때가 진짜 「못 닿음」이다. 이건 재우고 넘어가는 것이 아니라 **다시 물어보는** 것이다. */
const 못닿은것 = dead.filter((d) => d.status === 0);
/* 다만 **한꺼번에 많이** 못 닿았으면 그건 상대가 아니라 이쪽 그물이 끊긴 것이다 —
   그때 하나씩 다시 두드리면 몇 분을 버린다. 스무 개가 넘으면 다시 안 묻고 바로 「못 잼」. */
if (못닿은것.length > 20) {
  console.log(`
[studymap-links] 못 닿은 것이 ${못닿은것.length}개 — 그물이 끊긴 판이다. 하나씩 다시 묻지 않는다`);
} else if (못닿은것.length > 0) {
  console.log(`
[studymap-links] 못 닿은 ${못닿은것.length}개를 잠깐 쉬었다가 하나씩 다시 본다`);
  await new Promise((r) => setTimeout(r, 3000));
  for (const d of 못닿은것) {
    let status = await probe(d.url, 'GET');
    if (!OK_STATUS.has(status)) {
      await new Promise((r) => setTimeout(r, 1500));
      status = await probe(d.url, 'GET');
    }
    if (OK_STATUS.has(status)) {
      dead.splice(dead.indexOf(d), 1);
      console.log(`  살아 있었다 — ${d.node} (${d.url})`);
    }
  }
}

process.stdout.write('\n');

/* ★ **「여기서 못 닿았다」와 「링크가 죽었다」는 다른 말이다** (2026-08-14).
   이 검사를 묶음(gates)에 넣었더니 CI 에서만 빨갰다. 못 닿은 둘은 `privacy.go.kr` 과
   `nts.go.kr` — **한국 정부 사이트**다. 미국 러너에서 안 열린 것이지 링크가 죽은 게 아니다.
   그걸 빨강으로 읽으면 사람은 멀쩡한 링크를 지우거나, 더 나쁘게는 이 검사를 무시한다.
   갈라 적는다: **답이 온 4xx 만 죽은 것**, 아예 못 닿은 것(0)은 **못 잼**(2)이다. */
const 죽음 = dead.filter((d) => d.status !== 0);
const 못닿음 = dead.filter((d) => d.status === 0);
for (const d of 죽음) console.log(`  ${d.status}  ${d.node} — ${d.label}`);
for (const d of 못닿음) console.log(`  못 닿음  ${d.node} — ${d.label}`);
if (죽음.length > 0) {
  console.log(`[studymap-links] 죽은 주소 ${죽음.length}개 / 전체 ${targets.length}개`);
  process.exit(1);
}
if (못닿음.length > 0) {
  /* 2 = 「못 돌렸다」 — 이 저장소 규약. 죽은 것이 아니다. */
  console.log(`[studymap-links] 여기서 못 닿은 주소 ${못닿음.length}개 — 이 자리에서는 판정 못 한다`);
  process.exit(2);
}
console.log(`[studymap-links] 링크 ${targets.length}개 전부 살아 있다`);
