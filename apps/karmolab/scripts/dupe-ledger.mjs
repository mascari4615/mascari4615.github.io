#!/usr/bin/env node
/**
 * 합칠 수 있는 것 — **다시 셀 수 있는** 원장 (TASK-KL-257)
 *
 * 왜 도구인가: 이 표를 한 번 손으로 셌더니(2026-08-12) 그날로 낡기 시작했다. 도구는 계속
 * 늘어나는데 표는 안 늘어난다 — 그러면 「어디를 손대면 몇 줄이 줄어드나」를 **추측**으로 고르게 된다.
 * 이 저장소가 그걸 싫어한다. 그래서 세는 일을 코드로 옮긴다.
 *
 * 세는 것 둘:
 *   ① 되풀이 조각 — 같은 서너 줄이 몇 파일에서 다시 쓰이나. 「공용으로 빼면 몇 줄 주나」까지.
 *   ② 재료 축 — 글·이미지·PDF… 재료마다 도구 수와 줄 수. 합치기의 1차 축은 재료다(사용자 교정).
 *
 * 아끼는 줄 수는 **어림값**이다. `파일수 × 조각길이 − 공용 한 벌`로 잡고, 그 전제를 같이 낸다.
 * 정확한 척하지 않는 것이 이 표의 쓸모다 — 크기 차이(200줄이냐 20줄이냐)만 맞으면 고를 수 있다.
 *
 * 쓰기: node scripts/dupe-ledger.mjs [--json] [--md]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '..', 'src', 'widgets', 'tools');

/** 되풀이 조각 — [이름, 찾는 것, 한 군데당 대략 줄 수, 공용으로 뺐을 때 남는 한 벌] */
const SNIPPETS = [
  ['꺾쇠 막기 (esc)', /const\s+esc\s*=/, 2, 3],
  ['찾기 도우미 ($)', /const\s+\$\s*=/, 1, 2],
  ['상태 줄 (tool-status)', /class="tool-status"/, 6, 12],
  ['파일 받기 (input file)', /type="file"|\.files\s*\[\s*0\s*\]/, 14, 25],
  ['파일 내보내기 (download)', /createObjectURL|a\.download|\.download\s*=/, 10, 20],
  ['통계 칸 (stat)', /const\s+stat\s*=/, 3, 6],
  ['바깥 라이브러리 (ensureScript)', /ensureScript/, 4, 8],
  ['화면 통짜 (innerHTML)', /container\.innerHTML/, 30, 0],
];

/* ★ **재료 축은 이 도구가 못 잰다** — 그리고 그게 결과다 (2026-08-16).
   두 번 시도했다: ① 파일 이름으로 가르기 → 46개(32%)가 「그 밖」. ② 껍데기(`GROUPS`)가 적어 둔
   일 목록으로 가르기 → 「글 1개」. 껍데기의 job id 와 도구 파일 이름이 **1:1이 아니기 때문**이다.
   즉 이 저장소에는 「이 도구는 어느 재료냐」를 **기계가 읽을 자리가 없다**(`widgets-lazy-meta` 의
   `category` 는 tool/game 수준이다). 짐작으로 채운 표는 고르는 데 못 쓰므로, 여기서는 안 낸다 —
   대신 그 사실을 [[TASK-KL-256]] 의 할 일로 남긴다: **등록부에 재료를 적는 자리부터**.
   당장 고를 수 있는 것은 아래 「가장 큰 파일」이고, 그건 이름 없이도 정확하다. */

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'shared') continue; // 이미 빠져 있는 공용 부품은 세지 않는다
      walk(p);
      continue;
    }
    if (!name.endsWith('.ts')) continue;
    files.push({ name, path: p, text: readFileSync(p, 'utf8') });
  }
};
walk(SRC);
for (const f of files) f.lines = f.text.split('\n').length;

const totalLines = files.reduce((a, f) => a + f.lines, 0);

const snippetRows = SNIPPETS.map(([label, re, per, shared]) => {
  const hits = files.filter((f) => re.test(f.text)).length;
  const save = hits > 1 ? Math.max(0, hits * per - shared) : 0;
  return { label, hits, per, save };
}).sort((a, b) => b.save - a.save);

const biggest = [...files].sort((a, b) => b.lines - a.lines).slice(0, 12);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ files: files.length, totalLines, snippetRows, biggest: biggest.map((f) => ({ name: f.name, lines: f.lines })) }, null, 1));
} else {
  const md = process.argv.includes('--md');
  const bar = (n, max) => '█'.repeat(Math.max(1, Math.round((n / max) * 24)));
  console.log(`[dupe-ledger] 도구 ${files.length}개 · ${totalLines.toLocaleString()}줄 (평균 ${Math.round(totalLines / files.length)}줄)`);
  console.log('');
  console.log('되풀이 조각 — 공용으로 빼면 대략 몇 줄이 주나 (어림: 파일수 × 조각길이 − 공용 한 벌)');
  if (md) {
    console.log('\n| 조각 | 파일 | 한 군데 | 아끼는 줄(어림) |');
    console.log('| --- | ---: | ---: | ---: |');
    for (const r of snippetRows) console.log(`| ${r.label} | ${r.hits} | ${r.per} | ${r.save.toLocaleString()} |`);
  } else {
    const max = Math.max(...snippetRows.map((r) => r.save), 1);
    for (const r of snippetRows) {
      console.log(`  ${String(r.save).padStart(5)}줄  ${bar(r.save, max).padEnd(24)} ${r.label} (${r.hits}파일 × ${r.per}줄)`);
    }
  }
  console.log('');
  console.log('가장 큰 파일 열둘 — 합치기든 쪼개기든 여기부터 (재료 축은 위 주석 참고: 기계가 못 잰다)');
  if (md) {
    console.log('');
    console.log('| 파일 | 줄 |');
    console.log('| --- | ---: |');
    for (const f of biggest) console.log(`| \`${f.name}\` | ${f.lines.toLocaleString()} |`);
  } else {
    const max = biggest[0]?.lines ?? 1;
    for (const f of biggest) console.log(`  ${String(f.lines).padStart(5)}줄  ${bar(f.lines, max).padEnd(24)} ${f.name}`);
  }
  console.log('');
  const save = snippetRows.reduce((a, r) => a + r.save, 0);
  console.log('');
  console.log(`합치면 대략 ${save.toLocaleString()}줄 — 전체 ${totalLines.toLocaleString()}줄의 ${((save / totalLines) * 100).toFixed(0)}%.`);
  console.log('어림값이다: 조각 길이는 표본에서 잡은 대푯값이고, 공용 한 벌 값을 뺐다. 고르는 데 쓰라고 만든 수다.');
}
