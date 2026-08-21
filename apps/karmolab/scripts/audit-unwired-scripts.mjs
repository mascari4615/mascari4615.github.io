#!/usr/bin/env node
/**
 * **부를 자리가 아예 없는 검사 파일**을 찾는다 (2026-08-16)
 *
 * `audit-orphan-tests` 는 **npm 이름**을 센다 — 「이름은 있는데 어느 묶음에도 안 들어간 것」.
 * 그런데 그 앞 단계가 있다: **npm 항목 자체가 없는 파일.** 그건 이름이 없으니 그 감사의 눈 밖이고,
 * 파일은 멀쩡히 있어서 사람 눈에도 「있는 검사」로 보인다.
 *
 * 실제로 그렇게 살던 것: `audit-page-scripts.mjs` — 2026-08-07 에 **실서비스 로그인이 통째로
 * 죽은** 사고에서 만든 검사인데, 저장소 어디에서도 안 불렸다(grep 하면 자기 파일 하나뿐).
 * 바닥까지 넣어 뒀지만 도는 자리가 없으니 아무 소용이 없었다.
 *
 * 보는 법: `scripts/*.mjs` 의 **파일 이름**이 어디엔가 한 번이라도 나오는가.
 *   찾는 자리 = package.json 의 scripts · 다른 스크립트 · scripts/lib · build.mjs · 워크플로.
 *   (이름이 나오면 부르든 import 하든 「연결돼 있다」로 본다 — 여기서 더 따지면 오탐이 는다.)
 *
 * 톱니다: 지금 것은 기준선에 담고 **늘어날 때만** 빨갛다. 갚으면 저절로 줄어든다.
 *
 * 씀: node scripts/audit-unwired-scripts.mjs [--write-baseline]
 * 나감값: 0 = 안 늘었다 · 1 = 늘었다 · 2 = 못 쟀다(CANNOT-RUN)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, '..');
const repo = path.resolve(app, '..', '..');
const BASELINE = path.join(app, 'data/unwired-scripts.json');

const read = (p) => {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
};

const scripts2 = fs
  .readdirSync(here)
  .filter((f) => f.endsWith('.mjs'))
  .sort();

/* 파일을 하나도 못 찾으면 「전부 연결돼 있다」가 아니라 못 쟀다 — 자리가 옮겨진 것이다. */
if (scripts2.length === 0) {
  console.error(`[unwired] CANNOT-RUN: 볼 스크립트를 한 개도 못 찾았다 — ${here}`);
  process.exit(2);
}

let haystack = JSON.stringify(JSON.parse(read(path.join(app, 'package.json')) || '{}').scripts ?? {});
/* 별 **제 이름을 제가 적은 것은 「부른다」가 아니다** (2026-08-17 실측). 검사 파일은 머리주석에
   「사용: node scripts/test-meok-ops.mjs」처럼 제 이름을 적어 둔다 — 그 글자까지 한 건초에 넣으면
   아무도 안 부르는 파일이 **스스로를 불러 준 셈**이 된다. 그래서 이 감사는 3개만 세고 있었고
   옆 감사(audit:orphans)는 같은 자리를 10개로 세고 있었다. 수가 둘이면 사람은 둘 다 안 믿는다.
   스크립트 글은 파일별로 따로 들고, 볼 때 **자기 글만 뺀다**(옆 감사가 이미 그렇게 한다). */
const foreignText = new Map();
for (const f of scripts2) foreignText.set(f, read(path.join(here, f)));
const libDir = path.join(here, 'lib');
if (fs.existsSync(libDir)) for (const f of fs.readdirSync(libDir)) haystack += read(path.join(libDir, f));
haystack += read(path.join(app, 'build.mjs'));
const wfDir = path.join(repo, '.github', 'workflows');
if (fs.existsSync(wfDir)) for (const f of fs.readdirSync(wfDir)) haystack += read(path.join(wfDir, f));

/* 건초가 package.json 하나뿐이면 읽기가 깨진 것이다 — 그 상태의 「0건」은 통과가 아니다. */
if (haystack.length < 10_000) {
  console.error(`[unwired] CANNOT-RUN: 찾을 자리를 제대로 못 읽었다 (${haystack.length}자)`);
  process.exit(2);
}

const neverCalled = scripts2.filter((f) => {
  const re = new RegExp(f.replace(/[.]/g, '\.'), 'g');
  if ((haystack.match(re) ?? []).length > 0) return false;
  /* 다른 스크립트가 부르면 불린 것 — 단, **제 파일은 뺀다**(위 § 참고). */
  for (const [name, text] of foreignText) {
    if (name === f) continue;
    if (text.includes(f)) return false;
  }
  return true;
});

/* 별 **왜 안 묶었는지를 기준선이 스스로 적게 한다** (2026-08-17). 이름만 늘어놓은 목록은
   반년 뒤 아무도 못 읽고, 「언젠가 묶자」로 굳는다. 손으로 적은 사유는 다시 쓸 때도 지킨다
   (오늘 옆 감사에서 자동 문구가 실측 사유를 덮어써 재 본 값이 통째로 사라졌다). */
const previous = JSON.parse(read(BASELINE) || '{"목록":[]}');
const baseline = new Set(previous.목록 ?? []);
const previousReason = previous.사유 ?? {};
const grown = neverCalled.filter((f) => !baseline.has(f));
const repaid = [...baseline].filter((f) => !neverCalled.includes(f));

if (repaid.length > 0 || process.argv.includes('--write-baseline')) {
  fs.writeFileSync(
    BASELINE,
    `${JSON.stringify(
      {
        note: '부를 자리가 아예 없는 검사 파일 — 늘면 빨강, 연결하면 저절로 줄어든다',
        why: 'npm 항목이 없으면 audit-orphan-tests 의 눈 밖이다. 로그인이 죽은 사고에서 만든 검사가 그렇게 살아 있었다 (2026-08-16).',
        list: neverCalled,
        사유: Object.fromEntries(neverCalled.map((f) => [f, previousReason[f] ?? '아직 사유를 안 적었다 — 재 보고 여기 적어라'])),
        updated: new Date().toISOString().slice(0, 10),
      },
      null,
      2,
    )}\n`,
  );
  if (repaid.length > 0) console.log(`[unwired] ${repaid.length}개를 연결했다 — 기준선을 ${baseline.size} → ${neverCalled.length} 로 조인다: ${repaid.join(', ')}`);
}

if (grown.length > 0) {
  console.error(`[unwired] 부를 자리가 없는 검사 파일이 늘었다 — ${grown.length}개:`);
  for (const f of grown) console.error(`  scripts/${f}`);
  console.error('  → package.json 에 이름을 주고 묶음(gates·live-checks·build)에 넣어라.');
  console.error('  → 안 부르는 검사는 없는 검사다. 정말 버릴 거면 파일을 지워라.');
  process.exit(1);
}

console.log(`[unwired] 스크립트 ${scripts2.length}개 · 부를 자리 없는 것 ${neverCalled.length}개 (기준선과 같음 — 늘지 않았다)`);
