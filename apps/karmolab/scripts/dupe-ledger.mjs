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
 * ★ 실제로 빼 보면 어림이 **부풀어 있다**: 통계 칸은 어림 111줄이었는데 실측 34줄이었다
 *   (2026-08-16). 한 줄짜리 조각은 「선언 + 본문」 두 줄이 전부라 그렇다. 그날 이후 그 칸의
 *   값은 실측으로 바꿨다 — 빼 볼 때마다 여기 값을 고쳐야 다음 판단이 안 부푼다.
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
  ['통계 칸 (stat)', /const\s+stat\s*=/, 2, 26], // 실측 보정 2026-08-16: 32곳을 실제로 빼 보니 34줄이었다(어림 111줄)
  ['바깥 라이브러리 (ensureScript)', /ensureScript/, 4, 8],
  ['화면 통짜 (innerHTML)', /container\.innerHTML/, 30, 0], // ⚠ 이 수는 「뽑을 수 있는 줄」이 아니다 — 2026-08-16 실측: 같은 뼈대로 보이는 59곳 중 **바이트가 같은 꼴은 2곳뿐**이었다(같은 클래스를 쓰지만 안에 든 것이 제각각). 통짜 줄이기는 조각 뽑기로 거의 안 되고 선언형 조작 자리(KL-256)로만 된다.
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

/* ★ **이미 합쳐 둔 계열이 있다** — 그게 본보기다 (2026-08-16 발견).
   글은 일 18개가 `text-operations.ts` 안에 **데이터로**(`{id, controls, run}`) 들어 있다 — 224줄.
   나머지 계열은 일 하나가 파일 하나다. 그래서 「합치면 얼마나 주나」는 어림이 아니라 **견줌**으로 낸다:
   같은 껍데기 안에서 **일 하나당 몇 줄**인가. 글이 12줄, 나머지가 200~300줄이면 그 차이가 답이다. */
const SHELLS = [
  ['글', 'text.ts'],
  ['수·돈', 'calc.ts'],
  ['PDF', 'pdf.ts'],
  ['이미지', 'image.ts'],
  ['소리', 'sound.ts'],
  ['영상', 'videotool.ts'],
  ['때', 'time.ts'],
  ['데이터·코드', 'devtool.ts'],
];

function shellJobs(file) {
  const f = files.find((x) => x.name === file);
  if (!f) return [];
  const at = f.text.indexOf('const GROUPS');
  if (at < 0) return [];
  return [...f.text.slice(at).matchAll(/\[\s*'([a-z0-9-]+)'\s*,/g)].map((m) => m[1]);
}

const shellRows = SHELLS.map(([material, file]) => {
  const jobs = [...new Set(shellJobs(file))];
  const own = files.find((x) => x.name === file)?.lines ?? 0;
  const reg = files.find((x) => x.name === file.replace('.ts', '-operations.ts'));
  let standalone = 0;
  let matched = 0;
  for (const id of jobs) {
    const hit = files.find((x) => x.name === `${id}.ts`);
    if (!hit) continue;
    matched += 1;
    standalone += hit.lines;
  }
  const lines = own + (reg?.lines ?? 0) + standalone;
  return {
    material,
    jobs: jobs.length,
    lines,
    perJob: jobs.length ? Math.round(lines / jobs.length) : 0,
    shape: reg ? '데이터(합쳐짐)' : `파일 ${matched}개(흩어짐)`,
  };
}).sort((a, b) => b.perJob - a.perJob);

/* ★ **옮길 수 있는지부터 잰다** (2026-08-16). 「남은 28개」는 세어 봐야 하는 수가 아니다 —
   작업대의 조작 자리는 「글 넣고 → 칸 몇 개 → 글 받기」 한 모양뿐이라, 표·그림·색 목록을
   그리는 도구는 옮기면 **화면이 깎인다**(semver 가 그랬다: 범위 경계표와 버전별 통과 색깔).
   그래서 파일이 무엇을 그리는지 보고 셋으로 가른다. 짐작 대신 이 목록에서 고른다. */
const richMarks = [/tool-list/, /<svg/i, /canvas/i, /<table/i, /createObjectURL/, /type="file"/];
function movability(f) {
  if (SHELLS.some(([, name]) => name === f.name)) return '작업대 자체';
  let rich = richMarks.filter((re) => re.test(f.text)).length;
  /* 화면을 **여러 번** 새로 그리면 그 도구는 결과칸 하나로 안 접힌다 (2026-08-16 실측:
     jsonfmt 이 나무 보기를 그리는데 표·그림 표식이 없어 「옮길 수 있다」로 셌다).
     첫 innerHTML 은 판 짜기라 안 센다 — 그 뒤부터가 「따로 그리는 것」이다. */
  const draws = (f.text.match(/innerHTML\s*=/g) || []).length;
  if (draws > 1) rich += 1;
  /* 단추가 여럿이면 그중에 **일하는 단추**가 있다 — 작업대 조작에는 복사 말고 손이 하나뿐이다
     (2026-08-16 실측: curlkit 은 「보내기」로 진짜 요청을 보낸다. 그리기 표식만 봐서는 안 잡혔다).
     복사 단추 하나는 작업대가 이미 주므로 둘째부터 센다. */
  const hands = (f.text.match(/\.onclick\s*=/g) || []).length;
  if (hands > 1) rich += 1;
  const outputs = (f.text.match(/readonly/g) || []).length;
  if (rich === 0 && outputs > 0) return '옮길 수 있다';
  if (rich <= 1) return '아마도 (한 가지만 걸림)';
  return '아니다 (표·그림·파일)';
}

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
  console.log('껍데기별 — **일 하나당 몇 줄**인가 (글은 이미 데이터로 합쳐져 있다: 그게 본보기)');
  if (md) {
    console.log('');
    console.log('| 재료 | 일 | 줄 | 일당 | 모양 |');
    console.log('| --- | ---: | ---: | ---: | --- |');
    for (const r of shellRows) console.log(`| ${r.material} | ${r.jobs} | ${r.lines.toLocaleString()} | ${r.perJob} | ${r.shape} |`);
  } else {
    for (const r of shellRows) {
      console.log(`  ${String(r.perJob).padStart(4)}줄/일  ${r.material.padEnd(7)} 일 ${String(r.jobs).padStart(2)}개 · ${String(r.lines).padStart(5)}줄 · ${r.shape}`);
    }
  }
  console.log('');
  /* 개발 도구 계열만 본다 — 지금 옮기는 중인 자리다. */
  const devIds = new Set(shellJobs('devtool.ts'));
  const movable = files.filter((f) => devIds.has(f.name.replace(/\.ts$/, '')));
  const buckets = new Map();
  for (const f of movable) {
    const verdict = movability(f);
    if (!buckets.has(verdict)) buckets.set(verdict, []);
    buckets.get(verdict).push(`${f.name.replace(/\.ts$/, '')}(${f.lines})`);
  }
  console.log('개발 도구 — 작업대로 옮길 수 있나 (그리는 것으로 가름)');
  for (const [verdict, names] of [...buckets].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(names.length).padStart(2)}개  ${verdict.padEnd(18)} ${names.slice(0, 8).join(' · ')}${names.length > 8 ? ' …' : ''}`);
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
  /* 「글 모양으로 가면 얼마나 주나」 — 약속이 아니라 **견줌**이다. 글은 글 넣고 글 받는 일이라
     제일 쉬운 축이고, PDF·이미지는 이진 자료를 다뤄 30줄/일까지는 못 간다. 그래서 **절반만
     따라간다고 보고** 낸다. 이 수의 쓸모는 크기 감각뿐이다(수백이냐 수천이냐). */
  const base = shellRows.find((r) => r.shape.startsWith('데이터'))?.perJob ?? 0;
  const halfway = shellRows
    .filter((r) => !r.shape.startsWith('데이터'))
    .reduce((a, r) => a + Math.max(0, Math.round(((r.perJob - base) / 2) * r.jobs)), 0);
  console.log(`글 모양(일당 ${base}줄)을 나머지가 **절반만** 따라가도 대략 ${halfway.toLocaleString()}줄 — 어림이다.`);
  const save = snippetRows.reduce((a, r) => a + r.save, 0);
  console.log('');
  console.log(`합치면 대략 ${save.toLocaleString()}줄 — 전체 ${totalLines.toLocaleString()}줄의 ${((save / totalLines) * 100).toFixed(0)}%.`);
  console.log('어림값이다: 조각 길이는 표본에서 잡은 대푯값이고, 공용 한 벌 값을 뺐다. 고르는 데 쓰라고 만든 수다.');
}
